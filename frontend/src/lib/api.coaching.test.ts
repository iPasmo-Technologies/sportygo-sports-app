import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  bookCoachingSession,
  confirmCoachingPurchase,
  createCoachingPaymentIntent,
  createMockBooking,
  createMockCoachingPurchase,
  fetchCoachingBalance,
  fetchCoachingPackages,
  fetchCoachingSessions,
  fetchMyCoachingBookings,
} from '@/lib/api';

const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
}

// Compares path + query only, because VITE_API_BASE_URL (from a local .env) may prefix a host.
function lastCall(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [rawUrl, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const parsed = new URL(rawUrl, 'http://test.invalid');
  return { url: `${parsed.pathname}${parsed.search}`, init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('coaching API calls', () => {
  it('loads packages without a token and passes the sport as a query parameter', async () => {
    respond(200, { packages: [] });
    await expect(fetchCoachingPackages('indoor-cricket')).resolves.toEqual({ packages: [] });
    const { url, init } = lastCall();
    expect(url).toBe('/api/coaching/packages?sportId=indoor-cricket');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('sends only the package id when starting a payment', async () => {
    respond(200, { clientSecret: 's', paymentIntentId: 'pi_1', receiptId: 'SGO-C1', amount: 9263, currency: 'sgd' });
    await createCoachingPaymentIntent('pickleball-3-sessions', 'tok');
    const { url, init } = lastCall();
    expect(url).toBe('/api/coaching/purchases/payment-intent');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ packageId: 'pickleball-3-sessions' });
  });

  it('sends only the payment id when confirming a purchase', async () => {
    respond(201, { purchase: { id: 'p1' } });
    await confirmCoachingPurchase('pi_1', 'tok');
    const { url, init } = lastCall();
    expect(url).toBe('/api/coaching/purchases');
    expect(JSON.parse(init.body as string)).toEqual({ paymentIntentId: 'pi_1' });
  });

  it('sends a coaching mock purchase to the shared mock payment URL', async () => {
    respond(201, { purchase: { id: 'p1' } });
    await createMockCoachingPurchase('pickleball-3-sessions', 'tok');
    const { url, init } = lastCall();
    expect(url).toBe('/api/payments/mock');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ type: 'coaching', packageId: 'pickleball-3-sessions' });
  });

  it('sends a court mock booking to the same URL with type court', async () => {
    respond(200, { receiptId: 'SGO-26ABC123', status: 'success', paymentMethod: 'ONLINE' });
    await createMockBooking({
      bookingType: 'court', sportId: 'pickleball', facilityCode: 'indoor-court', selectedDate: '2026-11-20',
      selectedTime: '18:00', durationMins: 60, packageOption: null, payMethod: 'STRIPE', grandTotal: 32.6,
      receiptId: 'SGO-26ABC123', customerEmail: 'user@example.com', facilityTitle: null, facilityAddress: null,
      facilityImageKey: null, facilityTag: null,
    }, 'tok');
    const { url, init } = lastCall();
    expect(url).toBe('/api/payments/mock');
    expect(JSON.parse(init.body as string)).toMatchObject({ type: 'court', facilityCode: 'indoor-court', selectedTime: '18:00' });
  });

  it('reads balance, sessions and bookings with the token', async () => {
    respond(200, { remainingSessions: 2, purchases: [] });
    await fetchCoachingBalance('pickleball', 'tok');
    expect(lastCall().url).toBe('/api/coaching/balance?sportId=pickleball');
    expect(lastCall().init.headers.Authorization).toBe('Bearer tok');

    respond(200, { sessions: [] });
    await fetchCoachingSessions('pickleball', 'tok');
    expect(lastCall().url).toBe('/api/coaching/sessions?sportId=pickleball');

    respond(200, { bookings: [] });
    await fetchMyCoachingBookings('tok');
    expect(lastCall().url).toBe('/api/coaching/my-bookings');
    expect(lastCall().init.headers.Authorization).toBe('Bearer tok');
  });

  it('encodes the session id in the booking URL', async () => {
    respond(201, { bookingId: 'b1', remainingSessions: 2 });
    await bookCoachingSession('a/b', 'tok');
    expect(lastCall().url).toBe('/api/coaching/sessions/a%2Fb/book');
    expect(lastCall().init.method).toBe('POST');
  });
});

describe('ApiError code', () => {
  it('carries the backend reason code so screens can react to it', async () => {
    respond(409, { error: 'This session is full.', code: 'full' });
    const error = await bookCoachingSession('s1', 'tok').catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'full', message: 'This session is full.' });
  });

  it('leaves code empty when the backend sends none', async () => {
    respond(500, { error: 'Something went wrong.' });
    const error = await fetchMyCoachingBookings('tok').catch((caught) => caught);
    expect(error).toMatchObject({ status: 500, code: undefined });
  });
});
