import assert from 'node:assert/strict';
import test from 'node:test';

import { calculatePromoDiscount, isPromoApplicableToBooking, type PromoCodeRow } from '../src/lib/database';

const percentagePromo: PromoCodeRow = {
  id: 'promo-1',
  code: 'SAVE10',
  name: '10% off',
  description: '10% off selected bookings',
  discountType: 'percentage',
  discountValue: 10,
  maxDiscountAmount: 25,
  minBookingAmount: 50,
  maxUsesTotal: 100,
  maxUsesPerUser: 2,
  usedCount: 0,
  applicableSports: ['cricket'],
  applicableFacilities: ['net-1'],
  applicableBookingTypes: ['single'],
  validFrom: '2024-01-01T00:00:00.000Z',
  validUntil: '2030-01-01T00:00:00.000Z',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
  createdBy: 'system',
  updatedBy: 'system',
};

const fixedPromo: PromoCodeRow = {
  ...percentagePromo,
  id: 'promo-2',
  code: 'FIXED15',
  name: 'Fixed SGD 15',
  description: 'Fixed discount for premium bookings',
  discountType: 'fixed_amount',
  discountValue: 15,
  maxDiscountAmount: null,
  minBookingAmount: 40,
  applicableSports: [],
  applicableFacilities: [],
  applicableBookingTypes: [],
};

test('percentage promo applies capped discount to an eligible booking', () => {
  assert.equal(isPromoApplicableToBooking(percentagePromo, 200, 'cricket', 'net-1', 'single'), true);
  assert.equal(calculatePromoDiscount(percentagePromo, 200), 20);
  assert.equal(calculatePromoDiscount(percentagePromo, 500), 25);
});

test('fixed amount promos are capped by the booking total', () => {
  assert.equal(isPromoApplicableToBooking(fixedPromo, 60), true);
  assert.equal(calculatePromoDiscount(fixedPromo, 60), 15);
  assert.equal(calculatePromoDiscount(fixedPromo, 10), 10);
});

test('promo applicability rejects ineligible sports, facilities, and booking types', () => {
  assert.equal(isPromoApplicableToBooking(percentagePromo, 200, 'tennis', 'net-1', 'single'), false);
  assert.equal(isPromoApplicableToBooking(percentagePromo, 200, 'cricket', 'net-2', 'single'), false);
  assert.equal(isPromoApplicableToBooking(percentagePromo, 200, 'cricket', 'net-1', 'team'), false);
});

test('minimum booking amount is enforced before any discount is calculated', () => {
  assert.equal(isPromoApplicableToBooking(percentagePromo, 40, 'cricket', 'net-1', 'single'), false);
  assert.equal(calculatePromoDiscount(percentagePromo, 40), 4);
});
