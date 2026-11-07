import { randomBytes } from 'crypto';
import { Router, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { authMiddleware, requireAdminRole, type AuthenticatedRequest } from '../middleware/authMiddleware';
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
  type SportRow,
} from '../lib/database';
import { calculateCoachingPackagePricing } from '../lib/bookingPricing';
import { hasContactDetailsForCoaching } from '../lib/coaching';
import { getStripeClient, isStripeConfigured, toMinorCurrencyUnits, verifyStripeIntent, type StripeIntentFailure } from '../lib/stripe';

const router = Router();
const DEFAULT_CURRENCY = (process.env.STRIPE_CURRENCY ?? 'sgd').trim().toLowerCase();
// Set on every coaching payment, so a court-booking payment can never be credited as a package.
const COACHING_PAYMENT_PURPOSE = 'coaching-package';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PACKAGE_ID_RE = /^[a-z0-9-]{1,64}$/;
const PAYMENT_INTENT_ID_RE = /^pi_[A-Za-z0-9_]{1,250}$/;
// Same list as routes/slots.ts.
const SPORT_IDS = new Set<SportRow['id']>([
  'cricket', 'indoor-cricket', 'pickleball', 'futsal', 'sepak-takraw', 'tennis',
  'table-tennis', 'soccer', 'volleyball', 'badminton', 'basketball', 'kabaddi',
]);

const BOOKING_FAILURE_RESPONSES: Record<CoachingBookingFailure, [number, string]> = {
  'not-found': [404, 'Coaching session not found.'],
  'not-available': [409, 'This session is no longer available.'],
  full: [409, 'This session is full. Please choose another session.'],
  'already-booked': [409, 'You have already booked this session.'],
  'no-credits': [409, 'You have no coaching sessions left that are valid for this date. Please buy a package.'],
};

const PAYMENT_FAILURE_RESPONSES: Record<StripeIntentFailure, [number, string]> = {
  'not-succeeded': [402, 'Card payment is not completed. Please complete the payment first.'],
  'amount-mismatch': [400, 'The amount paid does not match the package price.'],
  'wrong-customer': [403, 'This payment does not belong to your account.'],
  'wrong-purpose': [403, 'This payment is not for a coaching package.'],
};

function parseSportId(value: unknown): SportRow['id'] | null {
  return typeof value === 'string' && SPORT_IDS.has(value as SportRow['id'])
    ? value as SportRow['id']
    : null;
}

function parseString(value: unknown, pattern: RegExp): string | null {
  return typeof value === 'string' && pattern.test(value.trim()) ? value.trim() : null;
}

// The email always comes from the verified token, never from the request.
function customerEmailOf(req: AuthenticatedRequest): string {
  return (req.user?.email ?? '').trim().toLowerCase();
}

function newCoachingReceiptId(): string {
  return `SGO-C${randomBytes(4).toString('hex').toUpperCase()}`;
}

// The card was charged for a package that has since been disabled, so it can't be credited
// automatically. The payment id (no personal data) lets support find it for a refund.
function respondPaidPackageUnavailable(res: Response, paymentIntentId: string): void {
  console.error(`[coaching] Paid package is no longer available (payment ${paymentIntentId}).`);
  res.status(409).json({ error: 'This package is no longer available. Please contact support about your payment.' });
}

// GET /api/coaching/packages?sportId=  (public)
router.get('/packages', asyncHandler(async (req, res) => {
  const sportId = parseSportId(req.query.sportId);
  if (!sportId) {
    res.status(400).json({ error: 'Select a valid sport.' });
    return;
  }

  const packages = await listCoachingPackages(sportId);
  res.json({
    packages: packages.map((pkg) => ({ ...pkg, pricing: calculateCoachingPackagePricing(pkg.price) })),
  });
}));

// POST /api/coaching/purchases/payment-intent  { packageId }
router.post('/purchases/payment-intent', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerEmail = customerEmailOf(req);
  const packageId = parseString((req.body as { packageId?: unknown }).packageId, PACKAGE_ID_RE);
  if (!packageId) {
    res.status(400).json({ error: 'Select a valid coaching package.' });
    return;
  }

  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Card payment is not available at the moment.' });
    return;
  }

  const pkg = await findCoachingPackage(packageId);
  if (!pkg) {
    res.status(404).json({ error: 'This coaching package is not available.' });
    return;
  }

  const user = await findUserByEmail(customerEmail);
  if (!user || !hasContactDetailsForCoaching(user)) {
    res.status(422).json({
      error: 'Please add your full name and mobile number to your profile before buying a package.',
      code: 'profile-incomplete',
    });
    return;
  }

  const pricing = calculateCoachingPackagePricing(pkg.price);
  const receiptId = newCoachingReceiptId();

  try {
    const intent = await getStripeClient().paymentIntents.create({
      amount: toMinorCurrencyUnits(pricing.grandTotal),
      currency: DEFAULT_CURRENCY,
      receipt_email: customerEmail,
      automatic_payment_methods: { enabled: true },
      metadata: {
        purpose: COACHING_PAYMENT_PURPOSE,
        receiptId,
        customerEmail,
        packageId: pkg.id,
        sportId: pkg.sportId,
      },
    });

    if (!intent.client_secret) {
      res.status(502).json({ error: 'Unable to start card payment. Please try again later.' });
      return;
    }

    res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      receiptId,
      amount: intent.amount,
      currency: intent.currency,
      pricing,
    });
  } catch (error) {
    console.error('[coaching] Stripe payment initialization failed:', error);
    res.status(502).json({ error: 'Unable to start card payment. Please try again later.' });
  }
}));

// POST /api/coaching/purchases  { paymentIntentId }
// Safe to retry: a payment that was already credited returns the same purchase.
router.post('/purchases', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerEmail = customerEmailOf(req);
  const paymentIntentId = parseString((req.body as { paymentIntentId?: unknown }).paymentIntentId, PAYMENT_INTENT_ID_RE);
  if (!paymentIntentId) {
    res.status(400).json({ error: 'A valid payment reference is required.' });
    return;
  }

  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Card payment is not available at the moment.' });
    return;
  }

  let intent;
  try {
    intent = await getStripeClient().paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error('[coaching] Stripe payment verification failed:', error);
    res.status(502).json({ error: 'Unable to verify card payment. Please contact support if the charge was completed.' });
    return;
  }

  // The package and receipt come from the payment's metadata, which only this backend can set.
  const packageId = (intent.metadata.packageId ?? '').trim();
  const receiptId = (intent.metadata.receiptId ?? '').trim();
  if (intent.metadata.purpose !== COACHING_PAYMENT_PURPOSE || !packageId || !receiptId) {
    const [status, error] = PAYMENT_FAILURE_RESPONSES['wrong-purpose'];
    res.status(status).json({ error });
    return;
  }

  const pkg = await findCoachingPackage(packageId);
  if (!pkg) {
    respondPaidPackageUnavailable(res, paymentIntentId);
    return;
  }

  const pricing = calculateCoachingPackagePricing(pkg.price);
  const failure = verifyStripeIntent(intent, {
    amountMajor: pricing.grandTotal,
    customerEmail,
    metadata: { purpose: COACHING_PAYMENT_PURPOSE, customerEmail },
  });
  if (failure) {
    const [status, error] = PAYMENT_FAILURE_RESPONSES[failure];
    res.status(status).json({ error });
    return;
  }

  try {
    const { purchase, created } = await createCoachingPurchase({
      customerEmail,
      packageId: pkg.id,
      amountPaid: pricing.grandTotal,
      receiptId,
      stripePaymentIntentId: paymentIntentId,
    });
    res.status(created ? 201 : 200).json({ purchase });
  } catch (error) {
    if (error instanceof PaymentAlreadyUsedError) {
      res.status(409).json({ error: 'This payment has already been used.' });
      return;
    }
    if (error instanceof CoachingPackageUnavailableError) {
      respondPaidPackageUnavailable(res, paymentIntentId);
      return;
    }
    throw error;
  }
}));

// GET /api/coaching/balance?sportId=
router.get('/balance', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const sportId = parseSportId(req.query.sportId);
  if (!sportId) {
    res.status(400).json({ error: 'Select a valid sport.' });
    return;
  }

  res.json(await getCoachingBalance(customerEmailOf(req), sportId));
}));

// GET /api/coaching/sessions?sportId=
router.get('/sessions', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const sportId = parseSportId(req.query.sportId);
  if (!sportId) {
    res.status(400).json({ error: 'Select a valid sport.' });
    return;
  }

  res.json({ sessions: await listUpcomingCoachingSessions(sportId, customerEmailOf(req)) });
}));

// POST /api/coaching/sessions/:id/book
router.post('/sessions/:id/book', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const sessionId = parseString(req.params.id, UUID_RE);
  if (!sessionId) {
    res.status(400).json({ error: 'Select a valid coaching session.' });
    return;
  }

  try {
    res.status(201).json(await bookCoachingSession(sessionId, customerEmailOf(req)));
  } catch (error) {
    if (error instanceof CoachingBookingError) {
      const [status, message] = BOOKING_FAILURE_RESPONSES[error.reason];
      res.status(status).json({ error: message, code: error.reason });
      return;
    }
    throw error;
  }
}));

// GET /api/coaching/my-bookings
router.get('/my-bookings', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({ bookings: await listMyCoachingBookings(customerEmailOf(req)) });
}));

// POST /api/coaching/sessions/:id/cancel  (admin): cancels the session and gives every player their session back.
router.post('/sessions/:id/cancel', authMiddleware, requireAdminRole, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const sessionId = parseString(req.params.id, UUID_RE);
  if (!sessionId) {
    res.status(400).json({ error: 'Select a valid coaching session.' });
    return;
  }

  const result = await cancelCoachingSessionAsAdmin(sessionId, customerEmailOf(req));
  if (!result) {
    res.status(404).json({ error: 'Coaching session not found.' });
    return;
  }
  res.json(result);
}));

export default router;
