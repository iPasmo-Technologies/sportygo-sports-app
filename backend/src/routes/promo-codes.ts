import { Router } from 'express';
import {
  applyPromoCode,
  createPromoCode,
  getPromoCodeByCode,
  listPromoCodes,
  validatePromoCode,
  getPromoCodeUsage,
  getUserPromoCodeUsage,
} from '../lib/database';
import { authMiddleware, requireAdminRole, type AuthenticatedRequest } from '../middleware/authMiddleware';

const router = Router();

// GET /api/promo-codes — fetch all promo codes (admin only)
router.get('/', authMiddleware, requireAdminRole, async (_req, res) => {
  try {
    const promoCodes = await listPromoCodes();
    res.json({ promoCodes });
  } catch (error) {
    console.error('[promo-codes:list] Unable to list promo codes.', error);
    res.status(500).json({ error: 'Unable to load promo codes.' });
  }
});

// GET /api/promo-codes/:code — fetch a specific promo code by code
router.get('/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const promoCode = await getPromoCodeByCode(code);

    if (!promoCode) {
      res.status(404).json({ error: 'Promo code not found.' });
      return;
    }

    res.json({ promoCode });
  } catch (error) {
    console.error('[promo-codes:get] Unable to fetch promo code.', error);
    res.status(500).json({ error: 'Unable to load promo code.' });
  }
});

// POST /api/promo-codes — create a new promo code (admin only)
router.post('/', authMiddleware, requireAdminRole, async (req: AuthenticatedRequest, res) => {
  const {
    code,
    name,
    description,
    discountType,
    discountValue,
    maxDiscountAmount,
    minBookingAmount,
    maxUsesTotal,
    maxUsesPerUser,
    applicableSports,
    applicableFacilities,
    applicableBookingTypes,
    validFrom,
    validUntil,
    isActive,
  } = req.body as {
    code?: string;
    name?: string;
    description?: string;
    discountType?: 'percentage' | 'fixed_amount';
    discountValue?: number;
    maxDiscountAmount?: number;
    minBookingAmount?: number;
    maxUsesTotal?: number;
    maxUsesPerUser?: number;
    applicableSports?: string[];
    applicableFacilities?: string[];
    applicableBookingTypes?: string[];
    validFrom?: string;
    validUntil?: string;
    isActive?: boolean;
  };

  if (!code || !code.trim()) {
    res.status(400).json({ error: 'Promo code is required.' });
    return;
  }

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Promo code name is required.' });
    return;
  }

  if (!discountType || !['percentage', 'fixed_amount'].includes(discountType)) {
    res.status(400).json({ error: 'Discount type must be "percentage" or "fixed_amount".' });
    return;
  }

  if (typeof discountValue !== 'number' || discountValue <= 0) {
    res.status(400).json({ error: 'Discount value must be a positive number.' });
    return;
  }

  if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
    res.status(400).json({ error: 'Percentage discount must be between 1 and 100.' });
    return;
  }

  if (!validFrom || !validUntil) {
    res.status(400).json({ error: 'Valid from and valid until dates are required.' });
    return;
  }

  const validFromDate = new Date(validFrom);
  const validUntilDate = new Date(validUntil);

  if (isNaN(validFromDate.getTime()) || isNaN(validUntilDate.getTime())) {
    res.status(400).json({ error: 'Invalid date format.' });
    return;
  }

  if (validFromDate >= validUntilDate) {
    res.status(400).json({ error: 'Valid until must be after valid from.' });
    return;
  }

  try {
    const promoCode = await createPromoCode({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description?.trim() ?? '',
      discountType,
      discountValue,
      maxDiscountAmount,
      minBookingAmount: minBookingAmount ?? 0,
      maxUsesTotal,
      maxUsesPerUser: maxUsesPerUser ?? 1,
      applicableSports: applicableSports ?? [],
      applicableFacilities: applicableFacilities ?? [],
      applicableBookingTypes: applicableBookingTypes ?? [],
      validFrom: validFromDate.toISOString(),
      validUntil: validUntilDate.toISOString(),
      isActive: isActive ?? true,
      createdBy: req.user?.email ?? 'admin',
    });

    res.status(201).json({ promoCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create promo code.';
    if (/already exists/i.test(message)) {
      res.status(409).json({ error: 'A promo code with this code already exists.' });
      return;
    }
    console.error('[promo-codes:create] Unable to create promo code.', error);
    res.status(500).json({ error: 'Unable to create promo code. Please try again.' });
  }
});

// POST /api/promo-codes/validate — validate a promo code for a booking
router.post('/validate', async (req, res) => {
  const {
    code,
    userEmail,
    bookingAmount,
    sportId,
    facilityCode,
    bookingType,
  } = req.body as {
    code?: string;
    userEmail?: string;
    bookingAmount?: number;
    sportId?: string;
    facilityCode?: string;
    bookingType?: string;
  };

  if (!code || !code.trim()) {
    res.status(400).json({ error: 'Promo code is required.' });
    return;
  }

  if (!userEmail || !userEmail.trim()) {
    res.status(400).json({ error: 'User email is required.' });
    return;
  }

  if (typeof bookingAmount !== 'number' || bookingAmount <= 0) {
    res.status(400).json({ error: 'Valid booking amount is required.' });
    return;
  }

  try {
    const result = await validatePromoCode({
      code: code.trim().toUpperCase(),
      userEmail: userEmail.trim().toLowerCase(),
      bookingAmount,
      sportId,
      facilityCode,
      bookingType,
    });

    res.json(result);
  } catch (error) {
    console.error('[promo-codes:validate] Unable to validate promo code.', error);
    res.status(500).json({ error: 'Unable to validate promo code.' });
  }
});

// POST /api/promo-codes/apply — apply a promo code to a booking
router.post('/apply', async (req, res) => {
  const {
    promoCodeId,
    userEmail,
    bookingId,
    discountAmount,
  } = req.body as {
    promoCodeId?: string;
    userEmail?: string;
    bookingId?: string;
    discountAmount?: number;
  };

  if (!promoCodeId || !promoCodeId.trim()) {
    res.status(400).json({ error: 'Promo code ID is required.' });
    return;
  }

  if (!userEmail || !userEmail.trim()) {
    res.status(400).json({ error: 'User email is required.' });
    return;
  }

  if (!bookingId || !bookingId.trim()) {
    res.status(400).json({ error: 'Booking ID is required.' });
    return;
  }

  if (typeof discountAmount !== 'number' || discountAmount <= 0) {
    res.status(400).json({ error: 'Valid discount amount is required.' });
    return;
  }

  try {
    const usage = await applyPromoCode({
      promoCodeId: promoCodeId.trim(),
      userEmail: userEmail.trim().toLowerCase(),
      bookingId: bookingId.trim(),
      discountAmount,
    });

    if (!usage) {
      res.status(400).json({ error: 'Failed to apply promo code.' });
      return;
    }

    res.status(201).json({ usage });
  } catch (error) {
    console.error('[promo-codes:apply] Unable to apply promo code.', error);
    res.status(500).json({ error: 'Unable to apply promo code.' });
  }
});

// GET /api/promo-codes/:id/usage — fetch usage history for a promo code (admin only)
router.get('/:id/usage', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const id = req.params.id;
    const usage = await getPromoCodeUsage(id);
    res.json({ usage });
  } catch (error) {
    console.error('[promo-codes:usage] Unable to fetch promo code usage.', error);
    res.status(500).json({ error: 'Unable to load promo code usage.' });
  }
});

// GET /api/promo-codes/usage/:email — fetch user's promo code usage
router.get('/usage/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const usage = await getUserPromoCodeUsage(email);
    res.json({ usage });
  } catch (error) {
    console.error('[promo-codes:user-usage] Unable to fetch user promo code usage.', error);
    res.status(500).json({ error: 'Unable to load user promo code usage.' });
  }
});

export default router;