import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// JWT_SECRET is read when authMiddleware loads, so set it before the imports run.
const SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret';
  return 'unit-test-secret';
});

// Replace the database, pricing, Stripe and email with fakes: no real data, money or mail.
vi.mock('../lib/database', () => {
  class SlotAlreadyBookedError extends Error {}
  class SlotConfigurationMissingError extends Error {}
  class FacilityUnavailableError extends Error {}
  class BookingNotManageableError extends Error {}
  class PaymentAlreadyUsedError extends Error {}
  return {
    PaymentAlreadyUsedError,
    saveBooking: vi.fn(),
    cancelBooking: vi.fn(),
    rescheduleBooking: vi.fn(),
    listBookingsByCustomer: vi.fn(),
    listAllBookingsForAdmin: vi.fn(),
    SlotAlreadyBookedError,
    SlotConfigurationMissingError,
    FacilityUnavailableError,
    BookingNotManageableError,
  };
});
vi.mock('../lib/bookingPricing', () => ({ calculateBookingPricing: vi.fn() }));
vi.mock('../lib/email', () => ({
  sendBookingConfirmationEmail: vi.fn(),
  sendBookingUpdateEmail: vi.fn(),
}));
vi.mock('../lib/stripe', () => ({
  isStripeConfigured: vi.fn(),
  getStripeClient: vi.fn(),
  toMinorCurrencyUnits: (amount: number) => Math.round(amount * 100),
}));

import { PaymentAlreadyUsedError, saveBooking } from '../lib/database';
import { calculateBookingPricing } from '../lib/bookingPricing';
import { sendBookingConfirmationEmail } from '../lib/email';
import { getStripeClient, isStripeConfigured } from '../lib/stripe';
import bookingsRoutes from './bookings';

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingsRoutes);

const CUSTOMER = 'user@example.com';
const TOKEN = jwt.sign({ email: CUSTOMER, role: 'public' }, SECRET, { expiresIn: '1h' });
const PRICING = { priceSubtotal: 60, tax: 2.15, platformFee: 1.5, grandTotal: 63.65 };

const BOOKING = {
  bookingType: 'court',
  sportId: 'cricket',
  facilityCode: 'net-2',
  selectedDate: '2026-12-01',
  selectedTime: '16:00',
  durationMins: 60,
  packageOption: null,
  payMethod: 'STRIPE',
  grandTotal: 63.65,
  receiptId: 'SGO-26ABC123',
  stripePaymentIntentId: 'pi_test_123',
  lockToken: 'lock-1',
};

const retrieveIntent = vi.fn();

function paidIntent(overrides: Record<string, unknown> = {}) {
  return {
    status: 'succeeded',
    amount: 6365,
    amount_received: 6365,
    receipt_email: CUSTOMER,
    // The checkout creates each payment with the booking's receipt id (CheckoutScreen.tsx).
    metadata: { receiptId: 'SGO-26ABC123' },
    payment_method: { card: { brand: 'visa', last4: '4242' } },
    ...overrides,
  };
}

function postBooking(body: Record<string, unknown>, token: string | null = TOKEN) {
  const req = request(app).post('/api/bookings').send(body);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

function postMock(token: string | null = TOKEN) {
  const req = request(app).post('/api/bookings/mock').send({ ...BOOKING, stripePaymentIntentId: undefined });
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

beforeEach(() => {
  vi.mocked(saveBooking).mockResolvedValue(undefined);
  vi.mocked(calculateBookingPricing).mockResolvedValue(PRICING);
  vi.mocked(sendBookingConfirmationEmail).mockResolvedValue(undefined);
  vi.mocked(isStripeConfigured).mockReturnValue(true);
  retrieveIntent.mockResolvedValue(paidIntent());
  vi.mocked(getStripeClient).mockReturnValue({
    paymentIntents: { retrieve: retrieveIntent },
    paymentMethods: { retrieve: vi.fn() },
  } as unknown as ReturnType<typeof getStripeClient>);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/bookings - card payments (STRIPE)', () => {
  it('confirms a booking after a completed Stripe payment', async () => {
    const res = await postBooking(BOOKING);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      receiptId: 'SGO-26ABC123', status: 'success', paymentMethod: 'ONLINE', cardBrand: 'visa', cardLast4: '4242',
    });
    expect(saveBooking).toHaveBeenCalledWith(expect.objectContaining({
      bookingStatus: 'confirmed', paymentMethod: 'ONLINE', customerEmail: CUSTOMER, grandTotal: 63.65,
    }));
  });

  // Regression: the payment id was never stored, so one payment could confirm many bookings.
  it('stores the Stripe payment id with the booking', async () => {
    await postBooking({ ...BOOKING, stripePaymentIntentId: '  pi_test_123  ' });
    expect(saveBooking).toHaveBeenCalledWith(expect.objectContaining({ stripePaymentIntentId: 'pi_test_123' }));
  });

  it('rejects a payment that was already used for another booking (409)', async () => {
    vi.mocked(saveBooking).mockRejectedValue(new PaymentAlreadyUsedError());
    const res = await postBooking(BOOKING);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'This payment has already been used for another booking.' });
  });

  // A payment made for one booking (one receipt id) cannot pay for another, including payments
  // made before payment ids were stored.
  it.each([
    ['a different receipt id', { receiptId: 'SGO-26OTHER1' }],
    ['no receipt id', {}],
    ['an empty receipt id', { receiptId: '' }],
  ])('rejects a payment created for %s', async (_name, metadata) => {
    retrieveIntent.mockResolvedValue(paidIntent({ metadata }));
    const res = await postBooking(BOOKING);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Stripe payment does not belong to this booking.' });
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it('rejects a Stripe payment that is not completed', async () => {
    retrieveIntent.mockResolvedValue(paidIntent({ status: 'requires_payment_method' }));
    const res = await postBooking(BOOKING);
    expect(res.status).toBe(402);
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it('rejects a Stripe payment for a different amount', async () => {
    retrieveIntent.mockResolvedValue(paidIntent({ amount: 100, amount_received: 100 }));
    const res = await postBooking(BOOKING);
    expect(res.status).toBe(400);
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it('rejects a Stripe payment made by another customer', async () => {
    retrieveIntent.mockResolvedValue(paidIntent({ receipt_email: 'someone-else@example.com' }));
    const res = await postBooking(BOOKING);
    expect(res.status).toBe(403);
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it('requires a payment intent id', async () => {
    const res = await postBooking({ ...BOOKING, stripePaymentIntentId: undefined });
    expect(res.status).toBe(400);
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it('requires a login', async () => {
    const res = await postBooking(BOOKING, null);
    expect(res.status).toBe(401);
    expect(saveBooking).not.toHaveBeenCalled();
  });
});

describe('POST /api/bookings - other payment methods', () => {
  // Regression: any other payMethod used to be "paid" at random (90%) with no payment at all.
  it.each(['GPAY', 'PAYNOW', 'GRABPAY', 'CASH', 'stripe', 'Stripe', 'FREE'])(
    'rejects payMethod "%s" without saving or charging anything',
    async (payMethod) => {
      const res = await postBooking({ ...BOOKING, payMethod, stripePaymentIntentId: undefined });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Unsupported payment method.' });
      expect(saveBooking).not.toHaveBeenCalled();
      expect(retrieveIntent).not.toHaveBeenCalled();
    }
  );

  it('rejects the same request every time (no random outcome)', async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const res = await postBooking({ ...BOOKING, payMethod: 'PAYNOW', stripePaymentIntentId: undefined });
      expect(res.status).toBe(400);
    }
    expect(saveBooking).not.toHaveBeenCalled();
  });
});

describe('POST /api/bookings/mock', () => {
  // Regression: any logged-in user could create a confirmed, "paid" booking without paying.
  it('is hidden (404) when MOCK_PAYMENT_ENABLED is not set', async () => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', undefined);
    vi.stubEnv('NODE_ENV', 'development');
    const res = await postMock();
    expect(res.status).toBe(404);
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it.each(['false', '', '1', 'yes'])('is hidden when MOCK_PAYMENT_ENABLED is "%s"', async (value) => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', value);
    vi.stubEnv('NODE_ENV', 'development');
    expect((await postMock()).status).toBe(404);
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it('is hidden in production even when the flag is true', async () => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await postMock()).status).toBe(404);
    expect(saveBooking).not.toHaveBeenCalled();
  });

  it('hides itself before checking login, so it cannot be discovered', async () => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', undefined);
    expect((await postMock(null)).status).toBe(404);
  });

  it('works outside production when the flag is true', async () => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    const res = await postMock();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ receiptId: 'SGO-26ABC123', status: 'success', paymentMethod: 'ONLINE' });
    expect(saveBooking).toHaveBeenCalledWith(expect.objectContaining({
      bookingStatus: 'confirmed', customerEmail: CUSTOMER, stripePaymentIntentId: null,
    }));
  });

  it('accepts " TRUE " (spaces and capitals) as enabled', async () => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', ' TRUE ');
    vi.stubEnv('NODE_ENV', 'development');
    expect((await postMock()).status).toBe(200);
  });

  it('still requires a login when enabled', async () => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    expect((await postMock(null)).status).toBe(401);
    expect(saveBooking).not.toHaveBeenCalled();
  });
});
