import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackageRow, SportFacilityRow } from './database';

// Pricing reads facilities and packages from the database layer; replace those two
// calls with in-memory data so these tests need no database.
vi.mock('./database', () => ({
  listPackages: vi.fn(),
  listSportFacilities: vi.fn(),
}));

import { listPackages, listSportFacilities } from './database';
import { calculateBookingPricing } from './bookingPricing';

const PACKAGES: PackageRow[] = [
  { id: 'single', label: 'Single Session', price: 120, per: 'SGD 120.00 / session' },
  { id: 'pack3', label: '3-Session Pack', price: 88, per: 'SGD 29.33 / session' },
  { id: 'pack10', label: '10-Session Pack', price: 250, per: 'SGD 25.00 / session' },
  { id: 'pack15', label: '15-Session Pack', price: 350, per: 'SGD 23.33 / session' },
  { id: 'pack20', label: '20-Session Pack', price: 450, per: 'SGD 22.50 / session' },
];

function facility(code: string, price: string, enabled = true): SportFacilityRow {
  return {
    id: `cricket-${code}`,
    sportId: 'cricket',
    code,
    title: code,
    price,
    tag: 'Book Now',
    address: 'Test address',
    mapLocationUrl: 'https://example.com',
    imageKey: 'nets-2',
    icon: 'net',
    actionTarget: 'schedule',
    enabled,
    sortOrder: 1,
  };
}

const FACILITIES: SportFacilityRow[] = [
  facility('rate-25', 'S$25'),
  facility('rate-30', 'S$30'),
  facility('rate-60', 'S$60'),
  facility('rate-100', 'S$100'),
  facility('rate-140', 'S$140'),
  facility('rate-33', 'S$33.33'),
  facility('rate-99.5', 'S$99.50'),
  facility('label-sgd', 'SGD 40.00 / hr'),
  facility('label-two-numbers', 'S$40 / 1 hr'),
  facility('disabled', 'S$50', false),
  facility('free', 'Free'),
  facility('zero', 'S$0'),
];

function court(facilityCode: string, durationMins: number, payMethod?: string | null) {
  return calculateBookingPricing({
    bookingType: 'court',
    sportId: 'cricket',
    facilityCode,
    durationMins,
    packageOption: null,
    payMethod,
  });
}

beforeEach(() => {
  vi.mocked(listPackages).mockResolvedValue(PACKAGES);
  vi.mocked(listSportFacilities).mockResolvedValue(FACILITIES);
});

describe('calculateBookingPricing - court bookings', () => {
  // [facility, durationMins, subtotal, cash/other grand total, card fee, card grand total]
  // Expected values match frontend/src/lib/pricing.test.ts so the two sides cannot drift apart.
  it.each([
    ['rate-25', 30, 12.5, 14, 0.49, 14.49],
    ['rate-25', 60, 25, 26.5, 0.93, 27.43],
    ['rate-25', 90, 37.5, 39, 1.37, 40.37],
    ['rate-25', 120, 50, 51.5, 1.8, 53.3],
    ['rate-30', 60, 30, 31.5, 1.1, 32.6],
    ['rate-30', 90, 45, 46.5, 1.63, 48.13],
    ['rate-60', 60, 60, 61.5, 2.15, 63.65],
    ['rate-60', 90, 90, 91.5, 3.2, 94.7],
    ['rate-60', 120, 120, 121.5, 4.25, 125.75],
    ['rate-100', 60, 100, 101.5, 3.55, 105.05],
    ['rate-100', 120, 200, 201.5, 7.05, 208.55],
    ['rate-140', 30, 70, 71.5, 2.5, 74],
    ['rate-140', 60, 140, 141.5, 4.95, 146.45],
    ['rate-140', 90, 210, 211.5, 7.4, 218.9],
    ['rate-140', 120, 280, 281.5, 9.85, 291.35],
  ])('%s for %i mins', async (code, mins, subtotal, cashTotal, cardFee, cardTotal) => {
    await expect(court(code, mins, 'PAYNOW')).resolves.toEqual({
      priceSubtotal: subtotal, tax: 0, platformFee: 1.5, grandTotal: cashTotal,
    });
    await expect(court(code, mins, 'STRIPE')).resolves.toEqual({
      priceSubtotal: subtotal, tax: cardFee, platformFee: 1.5, grandTotal: cardTotal,
    });
  });

  // Money is calculated in whole cents and half a cent rounds up.
  it.each([
    [90, 50, 51.5, 1.8, 53.3], // 49.995 -> 50.00
    [30, 16.67, 18.17, 0.64, 18.81], // 16.665 -> 16.67
  ])('rounds half a cent up: 33.33/hr for %i mins', async (mins, subtotal, cashTotal, cardFee, cardTotal) => {
    await expect(court('rate-33', mins, null)).resolves.toEqual({
      priceSubtotal: subtotal, tax: 0, platformFee: 1.5, grandTotal: cashTotal,
    });
    await expect(court('rate-33', mins, 'STRIPE')).resolves.toEqual({
      priceSubtotal: subtotal, tax: cardFee, platformFee: 1.5, grandTotal: cardTotal,
    });
  });

  it('rounds a card fee of exactly half a cent up (3.535 -> 3.54)', async () => {
    await expect(court('rate-99.5', 60, 'STRIPE')).resolves.toEqual({
      priceSubtotal: 99.5, tax: 3.54, platformFee: 1.5, grandTotal: 104.54,
    });
  });

  it.each([
    ['label-sgd', 'SGD 40.00 / hr'],
    ['label-two-numbers', 'S$40 / 1 hr'],
  ])('reads only the price from the label "%s"', async (code) => {
    const pricing = await court(code, 60, null);
    expect(pricing.priceSubtotal).toBe(40);
  });

  it('only adds the card fee for exactly "STRIPE"', async () => {
    for (const payMethod of [undefined, null, '', 'GPAY', 'PAYNOW', 'GRABPAY', 'stripe', 'Stripe']) {
      const pricing = await court('rate-60', 60, payMethod);
      expect(pricing.tax, `payMethod=${String(payMethod)}`).toBe(0);
      expect(pricing.grandTotal).toBe(61.5);
    }
  });

  it('always charges the fixed 1.50 platform fee', async () => {
    const pricing = await court('rate-60', 60, 'STRIPE');
    expect(pricing.platformFee).toBe(1.5);
  });

  it('looks up facilities for the requested sport', async () => {
    await court('rate-60', 60);
    expect(listSportFacilities).toHaveBeenCalledWith('cricket');
  });

  // A disabled facility must be rejected before a Stripe payment is created for it.
  it('rejects a disabled facility', async () => {
    await expect(court('disabled', 60, 'STRIPE')).rejects.toThrow('Selected facility is not available.');
  });

  // Current behaviour: the routes reject durationMins <= 0 before pricing is called.
  it('returns only the platform fee for a 0-minute duration', async () => {
    await expect(court('rate-60', 0)).resolves.toMatchObject({ priceSubtotal: 0, grandTotal: 1.5 });
  });
});

describe('calculateBookingPricing - court booking errors', () => {
  it('rejects a missing sportId', async () => {
    await expect(calculateBookingPricing({
      bookingType: 'court', sportId: null, facilityCode: 'rate-60', durationMins: 60, packageOption: null,
    })).rejects.toThrow('sportId and facilityCode are required for court bookings.');
  });

  it('rejects a missing facilityCode', async () => {
    await expect(calculateBookingPricing({
      bookingType: 'court', sportId: 'cricket', facilityCode: '', durationMins: 60, packageOption: null,
    })).rejects.toThrow('sportId and facilityCode are required for court bookings.');
  });

  it('rejects an unknown facility', async () => {
    await expect(court('does-not-exist', 60)).rejects.toThrow('Selected facility could not be found.');
  });

  it('rejects a facility when no facilities exist', async () => {
    vi.mocked(listSportFacilities).mockResolvedValue([]);
    await expect(court('rate-60', 60)).rejects.toThrow('Selected facility could not be found.');
  });

  it.each([['free', 'Free'], ['zero', 'S$0']])('rejects an invalid price label (%s)', async (code, label) => {
    await expect(court(code, 60)).rejects.toThrow(`Invalid price label: ${label}`);
  });

  it('passes database errors through', async () => {
    vi.mocked(listSportFacilities).mockRejectedValue(new Error('connection lost'));
    await expect(court('rate-60', 60)).rejects.toThrow('connection lost');
  });
});

describe('calculateBookingPricing - package bookings', () => {
  // [package, subtotal, cash/other grand total, card fee, card grand total]
  it.each([
    ['single', 120, 121.5, 4.25, 125.75],
    ['pack3', 88, 89.5, 3.13, 92.63],
    ['pack10', 250, 251.5, 8.8, 260.3],
    ['pack15', 350, 351.5, 12.3, 363.8],
    ['pack20', 450, 451.5, 15.8, 467.3],
  ])('%s', async (packageOption, subtotal, cashTotal, cardFee, cardTotal) => {
    const input = { bookingType: 'coaching', durationMins: 60, packageOption };
    await expect(calculateBookingPricing({ ...input, payMethod: 'PAYNOW' })).resolves.toEqual({
      priceSubtotal: subtotal, tax: 0, platformFee: 1.5, grandTotal: cashTotal,
    });
    await expect(calculateBookingPricing({ ...input, payMethod: 'STRIPE' })).resolves.toEqual({
      priceSubtotal: subtotal, tax: cardFee, platformFee: 1.5, grandTotal: cardTotal,
    });
  });

  it('ignores duration for packages', async () => {
    const short = await calculateBookingPricing({ bookingType: 'coaching', durationMins: 30, packageOption: 'single' });
    const long = await calculateBookingPricing({ bookingType: 'coaching', durationMins: 120, packageOption: 'single' });
    expect(short).toEqual(long);
  });

  it('treats any bookingType other than "court" as a package booking', async () => {
    const pricing = await calculateBookingPricing({ bookingType: 'anything', durationMins: 60, packageOption: 'pack3' });
    expect(pricing.priceSubtotal).toBe(88);
    expect(listSportFacilities).not.toHaveBeenCalled();
  });

  it.each([['unknown', 'nope'], ['null', null]])('rejects a %s package', async (_label, packageOption) => {
    await expect(calculateBookingPricing({ bookingType: 'coaching', durationMins: 60, packageOption }))
      .rejects.toThrow('Selected package could not be found.');
  });
});
