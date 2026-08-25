import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { FacilityUnavailableError, listBookingsByCustomer, saveBooking, SlotAlreadyBookedError, SlotConfigurationMissingError, type SportFacilityRow } from '../lib/database';
import { getStripeClient, isStripeConfigured, toMinorCurrencyUnits } from '../lib/stripe';
import { calculateBookingPricing } from '../lib/bookingPricing';
import { type SportRow } from '../lib/database';
import { sendBookingConfirmationEmail } from '../lib/email';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FACILITY_IMAGE_KEYS = new Set<SportFacilityRow['imageKey']>([
  'bowling-lane',
  'nets-2',
  'nets-3',
  'nets-4',
  'indoor-court',
  'outdoor-field',
  'pb-indoor-court',
  'pb-outdoor-court',
]);

function toFacilityImageKey(value: string | null | undefined): SportFacilityRow['imageKey'] | null {
  const normalized = value?.trim();
  if (!normalized || !FACILITY_IMAGE_KEYS.has(normalized as SportFacilityRow['imageKey'])) {
    return null;
  }

  return normalized as SportFacilityRow['imageKey'];
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function notifyBookingConfirmation(input: Parameters<typeof sendBookingConfirmationEmail>[0]): void {
  void sendBookingConfirmationEmail(input).catch((error) => {
    console.error('[booking:confirmation] Notification email failed:', error);
  });
}

// GET /api/bookings  (requires Bearer token)
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const email = req.user?.email;
  if (!email) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  const bookings = await listBookingsByCustomer(normalizeEmail(email));
  res.json({ bookings });
});

// POST /api/bookings/mock (requires Bearer token; development fallback only)
router.post('/mock', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const customerEmail = req.user?.email?.trim().toLowerCase();
  if (!customerEmail) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  const payload = req.body as {
    bookingType: string;
    sportId?: SportRow['id'] | null;
    facilityCode?: string | null;
    selectedDate: string;
    selectedTime: string;
    durationMins: number;
    packageOption: string | null;
    grandTotal: number;
    receiptId: string;
    facilityTitle?: string | null;
    facilityAddress?: string | null;
    facilityImageKey?: string | null;
    facilityTag?: string | null;
    lockToken?: string | null;
  };

  if (!payload.bookingType || !payload.sportId || !payload.facilityCode || !payload.selectedDate || !payload.selectedTime || !payload.receiptId
    || !Number.isFinite(payload.durationMins) || payload.durationMins <= 0) {
    res.status(400).json({ error: 'Incomplete mock booking details.' });
    return;
  }

  const pricing = await calculateBookingPricing({
    bookingType: payload.bookingType,
    sportId: payload.sportId ?? null,
    facilityCode: payload.facilityCode ?? null,
    durationMins: payload.durationMins,
    packageOption: payload.packageOption,
    payMethod: 'STRIPE',
  }).catch(() => null);

  if (!pricing) {
    res.status(400).json({ error: 'Unable to calculate the mock booking amount.' });
    return;
  }

  try {
    await saveBooking({
      bookingType: payload.bookingType,
      sportId: payload.sportId ?? null,
      facilityCode: payload.facilityCode ?? null,
      selectedDate: payload.selectedDate,
      selectedTime: payload.selectedTime,
      durationMins: payload.durationMins,
      packageOption: payload.packageOption,
      payMethod: 'STRIPE',
      grandTotal: pricing.grandTotal,
      receiptId: payload.receiptId,
      customerEmail,
      bookingStatus: 'confirmed',
      paymentMethod: 'ONLINE',
      facilityTitle: payload.facilityTitle ?? null,
      facilityAddress: payload.facilityAddress ?? null,
      facilityImageKey: toFacilityImageKey(payload.facilityImageKey),
      facilityTag: payload.facilityTag?.trim() || null,
      lockToken: payload.lockToken ?? null,
    });
  } catch (error) {
    if (error instanceof FacilityUnavailableError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof SlotAlreadyBookedError) {
      res.status(409).json({ error: 'This slot is no longer available.' });
      return;
    }
    res.status(500).json({ error: 'Unable to create mock booking.' });
    return;
  }

  notifyBookingConfirmation({
    email: customerEmail,
    receiptId: payload.receiptId,
    status: 'confirmed',
    paymentStatus: 'paid',
    facilityTitle: payload.facilityTitle ?? 'SportyGo Facility',
    facilityAddress: payload.facilityAddress ?? 'Location not available',
    slotDate: payload.selectedDate,
    slotTime: payload.selectedTime,
    durationMins: payload.durationMins,
    amount: pricing.grandTotal,
  });

  res.json({ receiptId: payload.receiptId, status: 'success', paymentMethod: 'ONLINE' });
});

// POST /api/bookings  (requires Bearer token)
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const {
    bookingType, sportId, facilityCode, selectedDate, selectedTime, durationMins,
    packageOption, payMethod, grandTotal, receiptId, customerEmail: bodyCustomerEmail,
    stripePaymentIntentId, lockToken,
    facilityTitle, facilityAddress, facilityImageKey, facilityTag,
  } = req.body as {
    bookingType: string;
    sportId?: SportRow['id'] | null;
    facilityCode?: string | null;
    selectedDate: string;
    selectedTime: string;
    durationMins: number;
    packageOption: string | null;
    payMethod: string;
    grandTotal: number;
    receiptId: string;
    stripePaymentIntentId?: string;
    lockToken?: string | null;
    customerEmail?: string;
    facilityTitle?: string | null;
    facilityAddress?: string | null;
    facilityImageKey?: string | null;
    facilityTag?: string | null;
  };

  const customerEmail = req.user?.email
    ? normalizeEmail(req.user.email)
    : bodyCustomerEmail
      ? normalizeEmail(bodyCustomerEmail)
      : undefined;

  // Validate required fields and return exact missing keys for easier client troubleshooting.
  const missingFields: string[] = [];
  if (!bookingType) missingFields.push('bookingType');
  if (!selectedDate) missingFields.push('selectedDate');
  if (!selectedTime) missingFields.push('selectedTime');
  if (!payMethod) missingFields.push('payMethod');
  if (!receiptId) missingFields.push('receiptId');
  if (payMethod === 'STRIPE' && !stripePaymentIntentId) missingFields.push('stripePaymentIntentId');
  if (!customerEmail) missingFields.push('customerEmail');
  if (!Number.isFinite(durationMins) || durationMins <= 0) missingFields.push('durationMins');
  if (!Number.isFinite(grandTotal) || grandTotal < 0) missingFields.push('grandTotal');
  if (customerEmail && !EMAIL_RE.test(customerEmail)) missingFields.push('customerEmail(valid format)');
  if (!sportId || !facilityCode) missingFields.push('sportId', 'facilityCode');

  if (missingFields.length > 0) {
    res.status(400).json({
      error: `Missing or invalid booking fields: ${missingFields.join(', ')}.`,
    });
    return;
  }

  const resolvedCustomerEmail = customerEmail as string;

  const pricing = await calculateBookingPricing({
    bookingType,
    sportId: sportId ?? null,
    facilityCode: facilityCode ?? null,
    durationMins,
    packageOption,
    payMethod,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unable to calculate booking total.';
    res.status(400).json({ error: message });
    return null;
  });

  if (!pricing) {
    return;
  }

  let responseStatus: 'success' | 'cash' = 'cash';
  let bookingStatus = 'cash_pending';
  let paymentMethod: 'ONLINE' | 'CASH' = 'CASH';

  if (payMethod === 'STRIPE') {
    if (!isStripeConfigured()) {
      res.status(503).json({
        error: 'Stripe payment is not configured on backend. Please set STRIPE_SECRET_KEY.',
      });
      return;
    }

    try {
      const stripe = getStripeClient();
      const intent = await stripe.paymentIntents.retrieve((stripePaymentIntentId as string).trim());

      if (intent.status !== 'succeeded') {
        res.status(402).json({
          error: 'Stripe payment is not completed. Please complete card payment first.',
        });
        return;
      }

      const expectedAmount = toMinorCurrencyUnits(pricing.grandTotal);
      const paidAmount = intent.amount_received || intent.amount || 0;
      if (paidAmount !== expectedAmount) {
        res.status(400).json({
          error: 'Stripe paid amount does not match booking total.',
        });
        return;
      }

      const intentEmail = intent.receipt_email?.trim().toLowerCase() || intent.metadata.customerEmail?.trim().toLowerCase() || '';
      if (intentEmail && intentEmail !== resolvedCustomerEmail) {
        res.status(403).json({
          error: 'Stripe payment does not belong to the authenticated customer.',
        });
        return;
      }

      responseStatus = 'success';
      bookingStatus = 'confirmed';
      paymentMethod = 'ONLINE';
    } catch (error) {
      console.error('[bookings] Stripe payment verification failed:', error);
      res.status(502).json({ error: 'Unable to verify card payment. Please contact support if the charge was completed.' });
      return;
    }
  } else {
    const paymentSuccessful = Math.random() < 0.9;
    responseStatus = paymentSuccessful ? 'success' : 'cash';
    bookingStatus = paymentSuccessful ? 'confirmed' : 'cash_pending';
    paymentMethod = paymentSuccessful ? 'ONLINE' : 'CASH';
  }

  try {
    await saveBooking({
      bookingType,
      sportId: sportId ?? null,
      facilityCode: facilityCode ?? null,
      selectedDate,
      selectedTime,
      durationMins,
      packageOption,
      payMethod,
      grandTotal: pricing.grandTotal,
      receiptId,
      customerEmail: resolvedCustomerEmail,
      bookingStatus,
      paymentMethod,
      facilityTitle: facilityTitle?.trim() || null,
      facilityAddress: facilityAddress?.trim() || null,
      facilityImageKey: toFacilityImageKey(facilityImageKey),
      facilityTag: facilityTag?.trim() || null,
      lockToken: lockToken ?? null,
    });
  } catch (error) {
    if (error instanceof FacilityUnavailableError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof SlotAlreadyBookedError) {
      res.status(409).json({
        error: 'This slot is already booked. Please select a different time slot.',
      });
      return;
    }

    if (error instanceof SlotConfigurationMissingError) {
      res.status(422).json({
        error: 'No weekday slot configuration found. Please contact admin to configure this weekday.',
      });
      return;
    }

    res.status(500).json({
      error: 'Unable to create booking at the moment. Please try again.',
    });
    return;
  }

  notifyBookingConfirmation({
    email: resolvedCustomerEmail,
    receiptId,
    status: bookingStatus as 'confirmed' | 'cash_pending',
    paymentStatus: responseStatus === 'success' ? 'paid' : 'pending',
    facilityTitle: facilityTitle?.trim() || 'SportyGo Facility',
    facilityAddress: facilityAddress?.trim() || 'Location not available',
    slotDate: selectedDate,
    slotTime: selectedTime,
    durationMins,
    amount: pricing.grandTotal,
  });

  res.json({
    receiptId,
    status: responseStatus,
    paymentMethod,
  });
});

export default router;
