import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// JWT_SECRET is read when authMiddleware loads, so set it before the imports run.
const SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-secret';
  return 'unit-test-secret';
});

// Replace the database and Stripe with fakes: no real data or money.
vi.mock('../lib/database', () => {
  class CoachingBookingError extends Error {
    constructor(readonly reason: string) { super(reason); }
  }
  class CoachingPackageUnavailableError extends Error {}
  class PaymentAlreadyUsedError extends Error {}
  return {
    CoachingBookingError,
    CoachingPackageUnavailableError,
    PaymentAlreadyUsedError,
    bookCoachingSession: vi.fn(),
    cancelCoachingSessionAsAdmin: vi.fn(),
    createCoachingPurchase: vi.fn(),
    findCoachingPackage: vi.fn(),
    findUserByEmail: vi.fn(),
    getCoachingBalance: vi.fn(),
    listCoachingPackages: vi.fn(),
    listMyCoachingBookings: vi.fn(),
    listUpcomingCoachingSessions: vi.fn(),
  };
});
// The payment checks (verifyStripeIntent) are the real ones; only the Stripe connection is faked.
vi.mock('../lib/stripe', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/stripe')>(),
  isStripeConfigured: vi.fn(),
  getStripeClient: vi.fn(),
}));

import {
  bookCoachingSession,
  cancelCoachingSessionAsAdmin,
  CoachingBookingError,
  CoachingPackageUnavailableError,
  createCoachingPurchase,
  findCoachingPackage,
  findUserByEmail,
  getCoachingBalance,
  listCoachingPackages,
  listMyCoachingBookings,
  listUpcomingCoachingSessions,
  PaymentAlreadyUsedError,
  type CoachingBookingFailure,
  type CoachingPackageRow,
  type UserAuthRow,
} from '../lib/database';
import { getStripeClient, isStripeConfigured } from '../lib/stripe';
import coachingRoutes from './coaching';
import paymentsRoutes from './payments';

const app = express();
app.use(express.json());
app.use('/api/coaching', coachingRoutes);
app.use('/api/payments', paymentsRoutes);

const CUSTOMER = 'user@example.com';
const TOKEN = jwt.sign({ email: CUSTOMER, role: 'public' }, SECRET, { expiresIn: '1h' });
const ADMIN_TOKEN = jwt.sign({ email: 'admin@example.com', role: 'admin' }, SECRET, { expiresIn: '1h' });
const SESSION_ID = '3f2b6c1e-8a4d-4c2b-9e1f-0a1b2c3d4e5f';
const INTENT_ID = 'pi_test_123';

const PACKAGE: CoachingPackageRow = {
  id: 'pickleball-3-sessions',
  sportId: 'pickleball',
  title: 'Pickleball 3 Sessions Package',
  sessionCount: 3,
  price: 88,
  validityWeeks: 5,
  description: 'Starter pack',
  enabled: true,
  sortOrder: 1,
};
// 88 + 1.50 platform fee + 3.13 card fee
const PACKAGE_TOTAL_CENTS = 9263;

const USER = { email: CUSTOMER, fullName: 'Tan Wei Ming', mobileNumber: '+6591234567' } as UserAuthRow;

const PURCHASE = {
  id: 'purchase-1', sportId: 'pickleball', packageId: PACKAGE.id, packageTitle: PACKAGE.title,
  totalSessions: 3, remainingSessions: 3, amountPaid: 92.63, receiptId: 'SGO-C1A2B3C4',
  purchasedAt: '2026-11-07T00:00:00.000Z', expiresAt: '2026-12-12T15:59:59.999Z',
};

const createIntent = vi.fn();
const retrieveIntent = vi.fn();

function paidIntent(overrides: Record<string, unknown> = {}, metadata: Record<string, string> = {}) {
  return {
    id: INTENT_ID,
    status: 'succeeded',
    amount: PACKAGE_TOTAL_CENTS,
    amount_received: PACKAGE_TOTAL_CENTS,
    receipt_email: CUSTOMER,
    metadata: {
      purpose: 'coaching-package',
      receiptId: 'SGO-C1A2B3C4',
      customerEmail: CUSTOMER,
      packageId: PACKAGE.id,
      sportId: 'pickleball',
      ...metadata,
    },
    ...overrides,
  };
}

function withToken(req: request.Test, token: string | null) {
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(isStripeConfigured).mockReturnValue(true);
  vi.mocked(findCoachingPackage).mockResolvedValue(PACKAGE);
  vi.mocked(findUserByEmail).mockResolvedValue(USER);
  vi.mocked(createCoachingPurchase).mockResolvedValue({ purchase: PURCHASE as never, created: true });
  createIntent.mockResolvedValue({ id: INTENT_ID, client_secret: 'secret_123', amount: PACKAGE_TOTAL_CENTS, currency: 'sgd' });
  retrieveIntent.mockResolvedValue(paidIntent());
  vi.mocked(getStripeClient).mockReturnValue({
    paymentIntents: { create: createIntent, retrieve: retrieveIntent },
  } as unknown as ReturnType<typeof getStripeClient>);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('GET /api/coaching/packages', () => {
  it('lists packages with server-calculated prices, without a login', async () => {
    vi.mocked(listCoachingPackages).mockResolvedValue([PACKAGE]);
    const res = await request(app).get('/api/coaching/packages?sportId=pickleball');
    expect(res.status).toBe(200);
    expect(res.body.packages).toEqual([{
      ...PACKAGE,
      pricing: { priceSubtotal: 88, tax: 3.13, platformFee: 1.5, grandTotal: 92.63 },
    }]);
  });

  it('returns an empty list (not an error) for a sport with no packages', async () => {
    vi.mocked(listCoachingPackages).mockResolvedValue([]);
    const res = await request(app).get('/api/coaching/packages?sportId=cricket');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ packages: [] });
  });

  it.each(['', 'golf', 'pickleball;DROP', '__proto__'])('rejects sportId "%s"', async (sportId) => {
    const res = await request(app).get('/api/coaching/packages').query({ sportId });
    expect(res.status).toBe(400);
    expect(listCoachingPackages).not.toHaveBeenCalled();
  });
});

describe('POST /api/coaching/purchases/payment-intent', () => {
  const post = (body: Record<string, unknown>, token: string | null = TOKEN) =>
    withToken(request(app).post('/api/coaching/purchases/payment-intent').send(body), token);

  it('creates a payment priced by the server, tagged with the package and the logged-in user', async () => {
    const res = await post({ packageId: PACKAGE.id, amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ clientSecret: 'secret_123', paymentIntentId: INTENT_ID });
    expect(res.body.receiptId).toMatch(/^SGO-C[0-9A-F]{8}$/);
    expect(createIntent).toHaveBeenCalledWith(expect.objectContaining({
      amount: PACKAGE_TOTAL_CENTS,
      receipt_email: CUSTOMER,
      metadata: expect.objectContaining({
        purpose: 'coaching-package', packageId: PACKAGE.id, customerEmail: CUSTOMER, receiptId: res.body.receiptId,
      }),
    }));
  });

  it('requires a login', async () => {
    expect((await post({ packageId: PACKAGE.id }, null)).status).toBe(401);
    expect(createIntent).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'Bad Id!', 42, 'x'.repeat(65)])('rejects packageId %j', async (packageId) => {
    expect((await post({ packageId })).status).toBe(400);
    expect(createIntent).not.toHaveBeenCalled();
  });

  it('rejects an unknown or disabled package (404)', async () => {
    vi.mocked(findCoachingPackage).mockResolvedValue(null);
    expect((await post({ packageId: 'tennis-99-sessions' })).status).toBe(404);
    expect(createIntent).not.toHaveBeenCalled();
  });

  it.each([
    ['placeholder name', { fullName: 'User' }],
    ['placeholder mobile', { mobileNumber: '+6500000000' }],
  ])('asks for a complete profile when the user has a %s', async (_label, overrides) => {
    vi.mocked(findUserByEmail).mockResolvedValue({ ...USER, ...overrides });
    const res = await post({ packageId: PACKAGE.id });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('profile-incomplete');
    expect(createIntent).not.toHaveBeenCalled();
  });

  it('returns 503 when Stripe is not configured', async () => {
    vi.mocked(isStripeConfigured).mockReturnValue(false);
    expect((await post({ packageId: PACKAGE.id })).status).toBe(503);
  });

  it('returns a generic 502 when Stripe fails', async () => {
    createIntent.mockRejectedValue(new Error('stripe down'));
    const res = await post({ packageId: PACKAGE.id });
    expect(res.status).toBe(502);
    expect(res.body.error).not.toContain('stripe down');
  });
});

describe('POST /api/coaching/purchases', () => {
  const post = (body: Record<string, unknown>, token: string | null = TOKEN) =>
    withToken(request(app).post('/api/coaching/purchases').send(body), token);

  it('credits a verified payment to the logged-in user (201)', async () => {
    const res = await post({ paymentIntentId: INTENT_ID, customerEmail: 'attacker@example.com' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ purchase: PURCHASE });
    expect(createCoachingPurchase).toHaveBeenCalledWith({
      customerEmail: CUSTOMER,
      packageId: PACKAGE.id,
      amountPaid: 92.63,
      receiptId: 'SGO-C1A2B3C4',
      stripePaymentIntentId: INTENT_ID,
    });
  });

  it('returns the existing purchase (200) when the same payment is sent again', async () => {
    vi.mocked(createCoachingPurchase).mockResolvedValue({ purchase: PURCHASE as never, created: false });
    const res = await post({ paymentIntentId: INTENT_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ purchase: PURCHASE });
  });

  it('requires a login', async () => {
    expect((await post({ paymentIntentId: INTENT_ID }, null)).status).toBe(401);
    expect(retrieveIntent).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'ch_123', 'pi_../../x', 7])('rejects paymentIntentId %j', async (paymentIntentId) => {
    expect((await post({ paymentIntentId })).status).toBe(400);
    expect(retrieveIntent).not.toHaveBeenCalled();
  });

  it.each([
    ['an unfinished payment', paidIntent({ status: 'processing' }), 402],
    ['a different amount', paidIntent({ amount: 100, amount_received: 100 }), 400],
    ['another customer\'s payment', paidIntent({ receipt_email: 'other@example.com' }, { customerEmail: 'other@example.com' }), 403],
    ['a court-booking payment', paidIntent({}, { purpose: '' }), 403],
    ['a payment without a package', paidIntent({}, { packageId: '' }), 403],
    ['a payment without a receipt', paidIntent({}, { receiptId: '' }), 403],
  ])('rejects %s without crediting it', async (_label, intent, status) => {
    retrieveIntent.mockResolvedValue(intent);
    expect((await post({ paymentIntentId: INTENT_ID })).status).toBe(status);
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });

  it('rejects a payment already credited to another user (409)', async () => {
    vi.mocked(createCoachingPurchase).mockRejectedValue(new PaymentAlreadyUsedError());
    expect((await post({ paymentIntentId: INTENT_ID })).status).toBe(409);
  });

  it.each([
    ['disabled before the check', () => vi.mocked(findCoachingPackage).mockResolvedValue(null)],
    ['disabled during the purchase', () => vi.mocked(createCoachingPurchase).mockRejectedValue(new CoachingPackageUnavailableError())],
  ])('asks the user to contact support when a paid package was %s', async (_label, arrange) => {
    arrange();
    const res = await post({ paymentIntentId: INTENT_ID });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('contact support');
  });

  it('returns a generic 502 when Stripe cannot be reached', async () => {
    retrieveIntent.mockRejectedValue(new Error('timeout'));
    expect((await post({ paymentIntentId: INTENT_ID })).status).toBe(502);
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });
});

describe('GET /api/coaching/balance, /sessions and /my-bookings', () => {
  it('reads the balance for the logged-in user only', async () => {
    vi.mocked(getCoachingBalance).mockResolvedValue({ remainingSessions: 2, purchases: [] });
    const res = await withToken(request(app).get('/api/coaching/balance?sportId=pickleball&email=other@example.com'), TOKEN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remainingSessions: 2, purchases: [] });
    expect(getCoachingBalance).toHaveBeenCalledWith(CUSTOMER, 'pickleball');
  });

  it('lists upcoming sessions for the sport', async () => {
    vi.mocked(listUpcomingCoachingSessions).mockResolvedValue([]);
    const res = await withToken(request(app).get('/api/coaching/sessions?sportId=pickleball'), TOKEN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sessions: [] });
    expect(listUpcomingCoachingSessions).toHaveBeenCalledWith('pickleball', CUSTOMER);
  });

  it('lists the logged-in user\'s bookings', async () => {
    vi.mocked(listMyCoachingBookings).mockResolvedValue([]);
    const res = await withToken(request(app).get('/api/coaching/my-bookings'), TOKEN);
    expect(res.status).toBe(200);
    expect(listMyCoachingBookings).toHaveBeenCalledWith(CUSTOMER);
  });

  it.each(['/api/coaching/balance', '/api/coaching/sessions'])('%s rejects a bad sportId', async (path) => {
    expect((await withToken(request(app).get(`${path}?sportId=golf`), TOKEN)).status).toBe(400);
  });

  it.each([
    '/api/coaching/balance?sportId=pickleball',
    '/api/coaching/sessions?sportId=pickleball',
    '/api/coaching/my-bookings',
  ])('%s requires a login', async (path) => {
    expect((await request(app).get(path)).status).toBe(401);
  });
});

describe('POST /api/coaching/sessions/:id/book', () => {
  const book = (id: string, token: string | null = TOKEN) =>
    withToken(request(app).post(`/api/coaching/sessions/${id}/book`), token);

  it('books a spot for the logged-in user', async () => {
    vi.mocked(bookCoachingSession).mockResolvedValue({ bookingId: 'booking-1', remainingSessions: 2 });
    const res = await book(SESSION_ID);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ bookingId: 'booking-1', remainingSessions: 2 });
    expect(bookCoachingSession).toHaveBeenCalledWith(SESSION_ID, CUSTOMER);
  });

  it('requires a login', async () => {
    expect((await book(SESSION_ID, null)).status).toBe(401);
  });

  it.each(['not-a-uuid', '1', `${SESSION_ID}x`])('rejects session id "%s"', async (id) => {
    expect((await book(id)).status).toBe(400);
    expect(bookCoachingSession).not.toHaveBeenCalled();
  });

  it.each<[CoachingBookingFailure, number]>([
    ['not-found', 404],
    ['not-available', 409],
    ['full', 409],
    ['already-booked', 409],
    ['no-credits', 409],
  ])('maps "%s" to %d with its reason code', async (reason, status) => {
    vi.mocked(bookCoachingSession).mockRejectedValue(new CoachingBookingError(reason));
    const res = await book(SESSION_ID);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(reason);
  });
});

describe('POST /api/coaching/sessions/:id/cancel (admin)', () => {
  const cancel = (id: string, token: string | null) =>
    withToken(request(app).post(`/api/coaching/sessions/${id}/cancel`), token);

  it('cancels the session and reports the refunded bookings', async () => {
    vi.mocked(cancelCoachingSessionAsAdmin).mockResolvedValue({ alreadyCancelled: false, refundedBookings: 3 });
    const res = await cancel(SESSION_ID, ADMIN_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ alreadyCancelled: false, refundedBookings: 3 });
    expect(cancelCoachingSessionAsAdmin).toHaveBeenCalledWith(SESSION_ID, 'admin@example.com');
  });

  it('is forbidden for a non-admin (403)', async () => {
    expect((await cancel(SESSION_ID, TOKEN)).status).toBe(403);
    expect(cancelCoachingSessionAsAdmin).not.toHaveBeenCalled();
  });

  it('requires a login', async () => {
    expect((await cancel(SESSION_ID, null)).status).toBe(401);
  });

  it('returns 404 for an unknown session', async () => {
    vi.mocked(cancelCoachingSessionAsAdmin).mockResolvedValue(null);
    expect((await cancel(SESSION_ID, ADMIN_TOKEN)).status).toBe(404);
  });

  it('rejects a malformed id', async () => {
    expect((await cancel('abc', ADMIN_TOKEN)).status).toBe(400);
  });
});

describe('POST /api/payments/mock (coaching)', () => {
  function postMock(token: string | null = TOKEN, body: Record<string, unknown> = { packageId: PACKAGE.id }) {
    return withToken(request(app).post('/api/payments/mock'), token).send({ type: 'coaching', ...body });
  }

  function enableMock(nodeEnv = 'development') {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', nodeEnv);
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, 'false', '', '1', 'yes'])('is hidden (404) when MOCK_PAYMENT_ENABLED is %s', async (value) => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', value);
    vi.stubEnv('NODE_ENV', 'development');
    expect((await postMock()).status).toBe(404);
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });

  it('is hidden in production even when the flag is true', async () => {
    enableMock('production');
    expect((await postMock()).status).toBe(404);
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });

  it('hides itself before checking login, so it cannot be discovered', async () => {
    vi.stubEnv('MOCK_PAYMENT_ENABLED', undefined);
    expect((await postMock(null)).status).toBe(404);
  });

  it('still requires a login when enabled', async () => {
    enableMock();
    expect((await postMock(null)).status).toBe(401);
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });

  it('credits the package at the server price without calling Stripe', async () => {
    enableMock();
    const res = await postMock();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ purchase: PURCHASE });
    expect(createCoachingPurchase).toHaveBeenCalledWith(expect.objectContaining({
      customerEmail: CUSTOMER,
      packageId: PACKAGE.id,
      amountPaid: 92.63,
      receiptId: expect.stringMatching(/^SGO-C[0-9A-F]{8}$/),
      stripePaymentIntentId: expect.stringMatching(/^mock_[0-9a-f-]{36}$/),
    }));
    expect(getStripeClient).not.toHaveBeenCalled();
  });

  it('ignores a price or email sent by the client', async () => {
    enableMock();
    await postMock(TOKEN, { packageId: PACKAGE.id, amountPaid: 0.01, customerEmail: 'someone@else.com' });
    expect(createCoachingPurchase).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: CUSTOMER, amountPaid: 92.63 }));
  });

  it('rejects a bad or unknown package', async () => {
    enableMock();
    expect((await postMock(TOKEN, { packageId: 'DROP TABLE' })).status).toBe(400);
    vi.mocked(findCoachingPackage).mockResolvedValue(null);
    expect((await postMock()).status).toBe(404);
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });

  it('is no longer served at the old /api/coaching/purchases/mock URL', async () => {
    enableMock();
    const res = await withToken(request(app).post('/api/coaching/purchases/mock'), TOKEN).send({ packageId: PACKAGE.id });
    expect(res.status).not.toBe(201);
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });

  it('needs a real name and mobile, like a paid purchase', async () => {
    enableMock();
    vi.mocked(findUserByEmail).mockResolvedValue({ ...USER, fullName: 'User' });
    const res = await postMock();
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('profile-incomplete');
    expect(createCoachingPurchase).not.toHaveBeenCalled();
  });
});
