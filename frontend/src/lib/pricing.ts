import { PACKAGES, PLATFORM_FEE, STRIPE_FEE_RATE } from './constants';

// Money is calculated in whole cents: floating-point dollars round 49.995 down to 49.99.
// Must stay identical to backend/src/lib/bookingPricing.ts, which charges the real amount.
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function courtSubtotalCents(ratePerHour: number, durationMins: number): number {
  return Math.round((toCents(ratePerHour) * durationMins) / 60);
}

export function courtSubtotal(ratePerHour: number, durationMins: number): number {
  return courtSubtotalCents(ratePerHour, durationMins) / 100;
}

export function calcPricing(
  bookingType: string,
  durationMins: number,
  packageOption: string | null,
  ratePerHour = 0,
  payMethod?: string | null
) {
  let subtotalCents = 0;

  if (bookingType === 'court') {
    subtotalCents = courtSubtotalCents(ratePerHour, durationMins);
  } else {
    const pkg = PACKAGES.find(p => p.id === packageOption);
    subtotalCents = pkg ? toCents(pkg.price) : 0;
  }

  const platformFee = PLATFORM_FEE;
  const chargeableCents = subtotalCents + toCents(platformFee);
  const isCard = payMethod === 'STRIPE';
  const basisPoints = Math.round(STRIPE_FEE_RATE * 10000);
  const taxCents = isCard ? Math.round((chargeableCents * basisPoints) / 10000) : 0;

  return {
    priceSubtotal: subtotalCents / 100,
    tax: taxCents / 100,
    platformFee,
    grandTotal: (chargeableCents + taxCents) / 100,
  };
}

export function sgd(n: number): string {
  return `SGD ${Number(n).toFixed(2)}`;
}

export function parseRate(price: string | number | null | undefined): number {
  if (typeof price === 'number') {
    return Number.isFinite(price) && price > 0 ? price : 0;
  }

  if (!price) {
    return 0;
  }

  // Reads only the first number, so "S$40 / 1 hr" is 40 rather than 401.
  const match = String(price).match(/\d[\d,]*(?:\.\d+)?/);
  const parsed = match ? Number(match[0].replace(/,/g, '')) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
