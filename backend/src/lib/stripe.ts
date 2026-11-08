import Stripe from 'stripe';

const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY ?? '').trim();

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

export function getStripeClient(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in backend environment variables.');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

export function toMinorCurrencyUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export type StripeIntentFailure = 'not-succeeded' | 'amount-mismatch' | 'wrong-customer' | 'wrong-purpose';

type VerifiableIntent = Pick<Stripe.PaymentIntent, 'status' | 'amount' | 'amount_received' | 'receipt_email' | 'metadata'>;

// Checks a retrieved payment before anything is confirmed or credited. Every payment is created
// by this backend with metadata naming what it pays for (a receipt id, a package), and only our
// secret key can set metadata, so matching it ties one payment to one purchase.
export function verifyStripeIntent(
  intent: VerifiableIntent,
  expected: { amountMajor: number; customerEmail: string; metadata: Record<string, string> }
): StripeIntentFailure | null {
  if (intent.status !== 'succeeded') return 'not-succeeded';

  const paidAmount = intent.amount_received || intent.amount || 0;
  if (paidAmount !== toMinorCurrencyUnits(expected.amountMajor)) return 'amount-mismatch';

  const intentEmail = intent.receipt_email?.trim().toLowerCase() || intent.metadata.customerEmail?.trim().toLowerCase() || '';
  if (intentEmail && intentEmail !== expected.customerEmail.trim().toLowerCase()) return 'wrong-customer';

  for (const [key, value] of Object.entries(expected.metadata)) {
    if ((intent.metadata[key] ?? '').trim() !== value.trim()) return 'wrong-purpose';
  }

  return null;
}
