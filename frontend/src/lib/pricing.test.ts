import { describe, expect, it } from 'vitest';
import { calcPricing, courtSubtotal, parseRate, sgd } from '@/lib/pricing';
import { PACKAGES, PLATFORM_FEE, STRIPE_FEE_RATE } from '@/lib/constants';

describe('pricing constants', () => {
  // The backend charges the same fee and rate (backend/src/lib/bookingPricing.ts).
  it('uses a 1.50 platform fee and a 3.5% card fee', () => {
    expect(PLATFORM_FEE).toBe(1.5);
    expect(STRIPE_FEE_RATE).toBe(0.035);
  });

  it('lists the same packages and prices as the backend seed data', () => {
    expect(PACKAGES.map(({ id, price }) => [id, price])).toEqual([
      ['single', 120], ['pack3', 88], ['pack10', 250], ['pack15', 350], ['pack20', 450],
    ]);
  });
});

describe('calcPricing - court bookings', () => {
  // [rate/hr, durationMins, subtotal, cash/other grand total, card fee, card grand total]
  // Expected values match backend/src/lib/bookingPricing.test.ts so the two sides cannot drift apart.
  it.each([
    [25, 30, 12.5, 14, 0.49, 14.49],
    [25, 60, 25, 26.5, 0.93, 27.43],
    [25, 90, 37.5, 39, 1.37, 40.37],
    [25, 120, 50, 51.5, 1.8, 53.3],
    [30, 60, 30, 31.5, 1.1, 32.6],
    [30, 90, 45, 46.5, 1.63, 48.13],
    [60, 60, 60, 61.5, 2.15, 63.65],
    [60, 90, 90, 91.5, 3.2, 94.7],
    [60, 120, 120, 121.5, 4.25, 125.75],
    [100, 60, 100, 101.5, 3.55, 105.05],
    [100, 120, 200, 201.5, 7.05, 208.55],
    [140, 30, 70, 71.5, 2.5, 74],
    [140, 60, 140, 141.5, 4.95, 146.45],
    [140, 90, 210, 211.5, 7.4, 218.9],
    [140, 120, 280, 281.5, 9.85, 291.35],
    // Whole-cent maths, half a cent rounds up.
    [33.33, 90, 50, 51.5, 1.8, 53.3], // 49.995 -> 50.00
    [33.33, 30, 16.67, 18.17, 0.64, 18.81], // 16.665 -> 16.67
    [99.5, 60, 99.5, 101, 3.54, 104.54], // card fee 3.535 -> 3.54
  ])('S$%d/hr for %i mins', (rate, mins, subtotal, cashTotal, cardFee, cardTotal) => {
    expect(calcPricing('court', mins, null, rate, 'PAYNOW')).toEqual({
      priceSubtotal: subtotal, tax: 0, platformFee: 1.5, grandTotal: cashTotal,
    });
    expect(calcPricing('court', mins, null, rate, 'STRIPE')).toEqual({
      priceSubtotal: subtotal, tax: cardFee, platformFee: 1.5, grandTotal: cardTotal,
    });
  });

  it('only adds the card fee for exactly "STRIPE"', () => {
    for (const payMethod of [undefined, null, '', 'GPAY', 'PAYNOW', 'GRABPAY', 'stripe']) {
      expect(calcPricing('court', 60, null, 60, payMethod).tax, `payMethod=${String(payMethod)}`).toBe(0);
    }
  });

  it('defaults to a rate of 0 when no rate is given', () => {
    expect(calcPricing('court', 60, null)).toEqual({ priceSubtotal: 0, tax: 0, platformFee: 1.5, grandTotal: 1.5 });
  });
});

describe('calcPricing - package bookings', () => {
  // [package, subtotal, cash/other grand total, card fee, card grand total]
  it.each([
    ['single', 120, 121.5, 4.25, 125.75],
    ['pack3', 88, 89.5, 3.13, 92.63],
    ['pack10', 250, 251.5, 8.8, 260.3],
    ['pack15', 350, 351.5, 12.3, 363.8],
    ['pack20', 450, 451.5, 15.8, 467.3],
  ])('%s', (packageOption, subtotal, cashTotal, cardFee, cardTotal) => {
    expect(calcPricing('coaching', 60, packageOption, 0, 'PAYNOW')).toEqual({
      priceSubtotal: subtotal, tax: 0, platformFee: 1.5, grandTotal: cashTotal,
    });
    expect(calcPricing('coaching', 60, packageOption, 0, 'STRIPE')).toEqual({
      priceSubtotal: subtotal, tax: cardFee, platformFee: 1.5, grandTotal: cardTotal,
    });
  });

  it('ignores duration and hourly rate for packages', () => {
    expect(calcPricing('coaching', 30, 'single', 999)).toEqual(calcPricing('coaching', 120, 'single', 0));
  });

  // Current behaviour: the frontend shows only the platform fee, while the backend rejects the booking.
  it.each([['unknown', 'nope'], ['null', null]])('uses a subtotal of 0 for a %s package', (_name, packageOption) => {
    expect(calcPricing('coaching', 60, packageOption)).toEqual({
      priceSubtotal: 0, tax: 0, platformFee: 1.5, grandTotal: 1.5,
    });
  });
});

describe('parseRate', () => {
  it.each([
    ['S$60', 60],
    ['S$140', 140],
    ['S$33.33', 33.33],
    ['SGD 40.00 / hr', 40],
    ['1,200.50', 1200.5],
    ['$40/1hr', 40],
    ['S$40 / 1 hr', 40],
    ['1.2.3', 1.2],
    [60, 60],
    [12.5, 12.5],
  ])('reads %s as %d', (input, expected) => {
    expect(parseRate(input)).toBe(expected);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['text with no number', 'Free'],
    ['zero label', 'S$0'],
    ['zero', 0],
    ['negative number', -5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('returns 0 for %s', (_name, input) => {
    expect(parseRate(input)).toBe(0);
  });
});

describe('courtSubtotal', () => {
  it.each([
    [60, 60, 60],
    [60, 90, 90],
    [140, 120, 280],
    [25, 30, 12.5],
    [33.33, 90, 50],
    [33.33, 30, 16.67],
    [0, 60, 0],
  ])('S$%d/hr for %i mins is %d', (rate, mins, expected) => {
    expect(courtSubtotal(rate, mins)).toBe(expected);
  });

  it('matches the subtotal used at checkout', () => {
    expect(courtSubtotal(33.33, 90)).toBe(calcPricing('court', 90, null, 33.33).priceSubtotal);
  });
});

describe('sgd', () => {
  it.each([
    [5, 'SGD 5.00'],
    [0, 'SGD 0.00'],
    [125.75, 'SGD 125.75'],
    [1234.5, 'SGD 1234.50'],
    [12.345, 'SGD 12.35'],
    [-3, 'SGD -3.00'],
  ])('formats %d as "%s"', (amount, expected) => {
    expect(sgd(amount)).toBe(expected);
  });

  // Floating-point: 1.005 is stored as 1.00499..., so toFixed rounds it down.
  it('formats 1.005 as "SGD 1.00"', () => {
    expect(sgd(1.005)).toBe('SGD 1.00');
  });
});
