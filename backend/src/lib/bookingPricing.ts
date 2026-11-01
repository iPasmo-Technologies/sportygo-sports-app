import { listPackages, listSportFacilities, type SportRow } from './database';

const PLATFORM_FEE = 1.50;
// Stripe charges 3.5% of (booking fee + platform fee)
const STRIPE_FEE_RATE = 0.035;

export type BookingPricingInput = {
  bookingType: string;
  durationMins: number;
  packageOption: string | null;
  sportId?: SportRow['id'] | null;
  facilityCode?: string | null;
  payMethod?: string | null;
};

export type BookingPricing = {
  priceSubtotal: number;
  tax: number;
  platformFee: number;
  grandTotal: number;
};

// Reads only the first number, so "S$40 / 1 hr" is 40 rather than 401.
function parseMoneyLabel(value: string): number {
  const match = value.match(/\d[\d,]*(?:\.\d+)?/);
  const parsed = match ? Number(match[0].replace(/,/g, '')) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid price label: ${value}`);
  }

  return parsed;
}

// Money is calculated in whole cents: floating-point dollars round 49.995 down to 49.99.
// Must stay identical to frontend/src/lib/pricing.ts.
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function stripeFeeCents(chargeableCents: number): number {
  const basisPoints = Math.round(STRIPE_FEE_RATE * 10000);
  return Math.round((chargeableCents * basisPoints) / 10000);
}

export async function calculateBookingPricing(input: BookingPricingInput): Promise<BookingPricing> {
  let subtotalCents = 0;

  if (input.bookingType === 'court') {
    if (!input.sportId || !input.facilityCode) {
      throw new Error('sportId and facilityCode are required for court bookings.');
    }

    const facilities = await listSportFacilities(input.sportId);
    const facility = facilities.find((item) => item.code === input.facilityCode);
    if (!facility) {
      throw new Error('Selected facility could not be found.');
    }
    if (!facility.enabled) {
      throw new Error('Selected facility is not available.');
    }

    const rateCents = toCents(parseMoneyLabel(facility.price));
    subtotalCents = Math.round((rateCents * input.durationMins) / 60);
  } else {
    const packages = await listPackages();
    const pkg = packages.find((item) => item.id === input.packageOption);
    if (!pkg) {
      throw new Error('Selected package could not be found.');
    }

    subtotalCents = toCents(pkg.price);
  }

  const chargeableCents = subtotalCents + toCents(PLATFORM_FEE);
  const isCard = input.payMethod === 'STRIPE';
  const stripeFee = isCard ? stripeFeeCents(chargeableCents) : 0;

  return {
    priceSubtotal: subtotalCents / 100,
    tax: stripeFee / 100,
    platformFee: PLATFORM_FEE,
    grandTotal: (chargeableCents + stripeFee) / 100,
  };
}