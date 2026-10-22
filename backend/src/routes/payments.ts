import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { getStripeClient, isStripeConfigured, toMinorCurrencyUnits } from '../lib/stripe';
import { calculateBookingPricing } from '../lib/bookingPricing';
import { getConfigBoolean, reservePromoCode, releasePromoReservation, type SportRow } from '../lib/database';

const router = Router();
const DEFAULT_CURRENCY = (process.env.STRIPE_CURRENCY ?? 'sgd').trim().toLowerCase();

// POST /api/payments/stripe/payment-intent (requires Bearer token)
router.post('/stripe/payment-intent', authMiddleware, async (req: AuthenticatedRequest, res) => {
  if (!isStripeConfigured()) {
    res.status(503).json({
      error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY on backend.',
    });
    return;
  }

  const customerEmail = req.user?.email?.trim().toLowerCase();
  if (!customerEmail) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  const { bookingType, sportId, facilityCode, durationMins, packageOption, currency, receiptId, promoCode } = req.body as {
    bookingType?: string;
    sportId?: SportRow['id'] | null;
    facilityCode?: string | null;
    durationMins?: number;
    packageOption?: string | null;
    currency?: string;
    receiptId?: string;
    promoCode?: string;
  };

  if (!bookingType) {
    res.status(400).json({ error: 'bookingType is required.' });
    return;
  }

  if (!Number.isFinite(durationMins) || (durationMins as number) <= 0) {
    res.status(400).json({ error: 'durationMins must be a positive number.' });
    return;
  }

  if (!receiptId?.trim()) {
    res.status(400).json({ error: 'receiptId is required.' });
    return;
  }

  const pricing = await calculateBookingPricing({
    bookingType,
    sportId,
    facilityCode,
    durationMins: durationMins as number,
    packageOption: packageOption ?? null,
    payMethod: 'STRIPE',
  }).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unable to calculate booking amount.';
    res.status(400).json({ error: message });
    return null;
  });

  if (!pricing) {
    return;
  }

  let discountAmount = 0;
  if (promoCode?.trim()) {
    const reservation = await reservePromoCode({
      code: promoCode,
      userEmail: customerEmail,
      receiptId,
      bookingAmount: pricing.grandTotal,
      sportId: sportId ?? undefined,
      facilityCode: facilityCode ?? undefined,
      bookingType,
    });
    if (!reservation.valid || reservation.discountAmount === undefined) {
      res.status(400).json({ error: reservation.error ?? 'Promo code is not valid for this booking.' });
      return;
    }
    discountAmount = reservation.discountAmount;
  }

  const amountInMinor = toMinorCurrencyUnits(Math.max(0, pricing.grandTotal - discountAmount));
  if (amountInMinor <= 0) {
    res.status(400).json({ error: 'Amount must be at least 0.01.' });
    return;
  }

  const normalizedCurrency = (currency ?? DEFAULT_CURRENCY).trim().toLowerCase();

  try {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: amountInMinor,
      currency: normalizedCurrency,
      receipt_email: customerEmail,
      automatic_payment_methods: { enabled: true },
      metadata: {
        receiptId: receiptId?.trim() ?? '',
        customerEmail,
        bookingType,
        sportId: sportId ?? '',
        facilityCode: facilityCode ?? '',
        durationMins: String(durationMins),
        packageOption: packageOption ?? '',
        promoCode: promoCode?.trim().toUpperCase() ?? '',
        discountAmount: String(discountAmount),
      },
    });

    if (!intent.client_secret) {
      if (promoCode?.trim()) await releasePromoReservation(receiptId, customerEmail);
      res.status(500).json({ error: 'Unable to initialize Stripe payment.' });
      return;
    }

    res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
    });
  } catch (error) {
    if (promoCode?.trim()) await releasePromoReservation(receiptId, customerEmail);
    console.error('[payments] Stripe payment initialization failed:', error);
    res.status(502).json({ error: 'Unable to start card payment. Please try again later.' });
  }
});

// POST /api/payments/stripe/test-payment-intent (development/test environments only)
router.post('/stripe/test-payment-intent', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const testModeEnabled = process.env.NODE_ENV !== 'production'
    && await getConfigBoolean('PAYMENTS', 'PAYMENT_TEST_MODE_ENABLED', false);
  if (!testModeEnabled) {
    res.status(404).json({ error: 'Payment test mode is disabled.' });
    return;
  }

  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Stripe is not configured.' });
    return;
  }

  const customerEmail = req.user?.email?.trim().toLowerCase();
  const { amount, currency, receiptId } = req.body as {
    amount?: number;
    currency?: string;
    receiptId?: string;
  };

  if (!customerEmail) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  if (!Number.isFinite(amount) || (amount as number) < 0.5) {
    res.status(400).json({ error: 'Test amount must be at least S$0.50.' });
    return;
  }

  try {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: toMinorCurrencyUnits(Number(amount)),
      currency: (currency ?? DEFAULT_CURRENCY).trim().toLowerCase(),
      receipt_email: customerEmail,
      automatic_payment_methods: { enabled: true },
      metadata: { receiptId: receiptId?.trim() ?? '', customerEmail, purpose: 'payment-integration-test' },
    });

    if (!intent.client_secret) {
      res.status(500).json({ error: 'Unable to initialize Stripe test payment.' });
      return;
    }

    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount: intent.amount, currency: intent.currency });
  } catch (error) {
    console.error('[payments] Stripe test payment initialization failed:', error);
    res.status(502).json({ error: 'Unable to start card payment test. Please try again later.' });
  }
});

export default router;
