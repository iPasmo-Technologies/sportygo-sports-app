import { afterEach, describe, expect, it, vi } from 'vitest';
import { toMinorCurrencyUnits } from './stripe';

describe('toMinorCurrencyUnits', () => {
  it.each([
    [12.5, 1250],
    [0, 0],
    [0.01, 1],
    [19.99, 1999],
    [41.4, 4140],
    [1234.56, 123456],
    [125.75, 12575],
    [0.1 + 0.2, 30], // floating-point noise (0.30000000000000004) is rounded away
    [-5, -500],
  ])('converts %d to %d cents', (amount, cents) => {
    expect(toMinorCurrencyUnits(amount)).toBe(cents);
  });

  // Current behaviour: 1.005 * 100 is 100.49999... in floating point, so it rounds down.
  // Harmless today because every amount is rounded to 2 decimals before conversion.
  it('rounds a third decimal using floating-point maths (1.005 -> 100)', () => {
    expect(toMinorCurrencyUnits(1.005)).toBe(100);
  });
});

// The secret key is read once when the module loads, so each case reloads the module.
describe('Stripe configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadWithKey(key: string | undefined) {
    vi.resetModules();
    vi.stubEnv('STRIPE_SECRET_KEY', key);
    return import('./stripe');
  }

  it('is not configured without a key', async () => {
    const stripe = await loadWithKey(undefined);
    expect(stripe.isStripeConfigured()).toBe(false);
    expect(() => stripe.getStripeClient()).toThrow('Stripe is not configured');
  });

  it('is not configured with a whitespace-only key', async () => {
    const stripe = await loadWithKey('   ');
    expect(stripe.isStripeConfigured()).toBe(false);
  });

  it('creates the client once and reuses it', async () => {
    const stripe = await loadWithKey('sk_test_fake_key_for_unit_tests');
    expect(stripe.isStripeConfigured()).toBe(true);
    const first = stripe.getStripeClient();
    expect(stripe.getStripeClient()).toBe(first);
  });
});
