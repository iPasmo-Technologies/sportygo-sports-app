import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PUBLISHABLE_KEY = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '').trim();

const isLiveStripeKeyOverHttp =
  STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_') && window.location.protocol !== 'https:';

if (isLiveStripeKeyOverHttp) {
  console.warn('[stripe] A live publishable key requires HTTPS. Stripe card payments are disabled.');
}

export const stripePublishableKey = isLiveStripeKeyOverHttp ? '' : STRIPE_PUBLISHABLE_KEY;
export const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

// Shows the "Mock Pay" test button in court and coaching checkout. It only works when the backend
// also has MOCK_PAYMENT_ENABLED=true outside production; otherwise the server answers 404.
export const mockPaymentEnabled = (import.meta.env.VITE_MOCK_PAYMENT_ENABLED ?? 'false').trim() === 'true';
