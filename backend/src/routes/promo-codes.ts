import { Router } from 'express';
import {
  createPromoCode,
  listPromoCodes,
  validatePromoCode,
  getPromoCodeUsage,
  getUserPromoCodeUsage,
} from '../lib/database';
import { authMiddleware, requireAdminRole, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { calculateBookingPricing } from '../lib/bookingPricing';
import type { SportRow } from '../lib/database';

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

// POST /api/promo-codes/validate — validate a promo code for the authenticated user's booking
router.post('/validate', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const {
    code,
    sportId,
    facilityCode,
    bookingType,
    durationMins,
    packageOption,
    payMethod,
  } = req.body as {
    code?: string;
    sportId?: string;
    facilityCode?: string;
    bookingType?: string;
    durationMins?: number;
    packageOption?: string | null;
    payMethod?: string;
  };

  if (!code || !code.trim()) {
    res.status(400).json({ error: 'Promo code is required.' });
    return;
  }

  const userEmail = req.user?.email?.trim().toLowerCase();
  if (!userEmail) {
    res.status(401).json({ error: 'Authorization token is required.' });
    return;
  }

  if (!bookingType || !sportId || !facilityCode || !Number.isFinite(durationMins) || (durationMins as number) <= 0) {
    res.status(400).json({ error: 'Complete booking details are required to validate a promo code.' });
    return;
  }

  try {
    const pricing = await calculateBookingPricing({
      bookingType,
      sportId: sportId as SportRow['id'],
      facilityCode,
      durationMins: durationMins as number,
      packageOption: packageOption ?? null,
      payMethod: payMethod ?? 'STRIPE',
    });
    const result = await validatePromoCode({
      code: code.trim().toUpperCase(),
      userEmail,
      bookingAmount: pricing.grandTotal,
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

// GET /api/promo-codes/usage — fetch the authenticated user's promo code usage
router.get('/usage', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ error: 'Authorization token is required.' });
      return;
    }
    const usage = await getUserPromoCodeUsage(email);
    res.json({ usage });
  } catch (error) {
    console.error('[promo-codes:user-usage] Unable to fetch user promo code usage.', error);
    res.status(500).json({ error: 'Unable to load user promo code usage.' });
  }
});

export default router;