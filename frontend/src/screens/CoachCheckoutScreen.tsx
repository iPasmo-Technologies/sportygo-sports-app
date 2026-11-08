import { useState } from 'react';
import { ArrowRight, FlaskConical, GraduationCap, Lock, RotateCcw, Zap } from 'lucide-react';
import { CardNumberElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { useApp } from '@/context/AppContext';
import ScreenHeader from '@/components/ScreenHeader';
import CoachStepBar from '@/components/CoachStepBar';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import StripeCardFields from '@/components/StripeCardFields';
import pageBackground from '@/assets/select_sport_bk.png';
import { ApiError, confirmCoachingPurchase, createCoachingPaymentIntent, createMockCoachingPurchase } from '@/lib/api';
import { retryWhenUnreachable, sessionsLabel, sportLabel, validityLabel } from '@/lib/coaching';
import { sgd } from '@/lib/pricing';
import { mockPaymentEnabled, stripePromise, stripePublishableKey } from '@/lib/stripe';
import { announce } from '@/lib/utils';

function money(amount: number): string {
  return sgd(amount).replace('SGD', 'S$');
}

// A charged payment that has not been turned into sessions yet. Kept so "Retry" only repeats the
// confirm call (the server returns the same purchase for the same payment) and never charges again.
type ChargedPayment = { paymentIntentId: string; receiptId: string };

function CoachCheckoutContent() {
  const { state, dispatch, navigate } = useApp();
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [charged, setCharged] = useState<ChargedPayment | null>(null);
  const stripeConfigured = stripePublishableKey.length > 0;
  const pkg = state.selectedCoachPackage;

  if (!pkg) return null;
  const selectedPackage = pkg;

  async function finishPurchase(payment: ChargedPayment, token: string) {
    try {
      const { purchase } = await retryWhenUnreachable(() => confirmCoachingPurchase(payment.paymentIntentId, token));
      setCharged(null);
      dispatch({ type: 'SET_COACH_PURCHASE', payload: purchase });
      // SET_SCREEN directly: navigate() was created before the purchase was stored, so its guard would block.
      dispatch({ type: 'SET_SCREEN', payload: 'coach-success' });
      announce('Payment successful! Your coaching sessions are ready.');
    } catch (caught) {
      setCharged(payment);
      const reason = caught instanceof ApiError && caught.status < 500 ? `${caught.message} ` : '';
      setError(`${reason}Your card was charged but we could not add your sessions yet. Tap "Retry" (you will not be charged again). If it keeps failing, contact support with receipt ${payment.receiptId}.`);
      announce('Payment received, but sessions were not added yet.');
    }
  }

  // The server refuses a purchase until the profile has a real name and mobile; send the user to fix it.
  function redirectIfProfileIncomplete(caught: unknown): boolean {
    if (!(caught instanceof ApiError) || caught.code !== 'profile-incomplete') return false;
    dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: 'coach-checkout' });
    navigate('profile');
    announce('Please add your full name and mobile number to continue.');
    return true;
  }

  // Test only (VITE_MOCK_PAYMENT_ENABLED): credits the package without Stripe, like court Mock Pay.
  async function handleMockPay() {
    if (paying || !state.authToken) return;
    setPaying(true);
    setError(null);
    try {
      const { purchase } = await createMockCoachingPurchase(selectedPackage.id, state.authToken);
      dispatch({ type: 'SET_COACH_PURCHASE', payload: purchase });
      dispatch({ type: 'SET_SCREEN', payload: 'coach-success' });
      announce('Mock payment successful. Your coaching sessions are ready.');
    } catch (caught) {
      if (redirectIfProfileIncomplete(caught)) return;
      setError(caught instanceof Error ? caught.message : 'Mock purchase failed.');
    } finally {
      setPaying(false);
    }
  }

  async function handlePay() {
    if (paying) return;
    if (!state.isLoggedIn || !state.authToken) {
      navigate('coach-checkout');
      return;
    }
    const token = state.authToken;
    setPaying(true);
    setError(null);

    try {
      if (charged) {
        await finishPurchase(charged, token);
        return;
      }

      if (!stripeConfigured) {
        throw new Error('Card payment is not available at the moment.');
      }
      if (!stripe || !elements) {
        throw new Error('Stripe is still loading. Please try again in a moment.');
      }
      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) {
        throw new Error('Enter your card details before paying.');
      }

      let intent;
      try {
        intent = await createCoachingPaymentIntent(selectedPackage.id, token);
      } catch (caught) {
        if (redirectIfProfileIncomplete(caught)) return;
        throw caught;
      }

      const confirmation = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: { email: state.customerEmail },
        },
      });
      if (confirmation.error) {
        throw new Error(confirmation.error.message ?? 'Card payment failed. Please try another card.');
      }
      if (!confirmation.paymentIntent || confirmation.paymentIntent.status !== 'succeeded') {
        throw new Error('Card payment was not completed.');
      }

      await finishPurchase({ paymentIntentId: confirmation.paymentIntent.id, receiptId: intent.receiptId }, token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment failed. Please try again.');
      announce('Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  const canPay = !paying && (charged !== null || stripeConfigured);

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="checkout-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <ScreenHeader
          onBack={() => navigate('coach-terms')}
          backAriaLabel="Back to coaching terms"
        />

        {mockPaymentEnabled && (
          <div className="checkout-mock-banner">
            <FlaskConical size={14} strokeWidth={2} />
            <span>Test Mode Active — Mock Pay enabled</span>
          </div>
        )}

        <h1 className="checkout-title">Checkout</h1>

        <CoachStepBar currentStep={3} />

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <section className="checkout-panel-v2 coaching-panel-v2">
          <h2>Package</h2>
          <div className="coach-checkout-package">
            <span className="coach-checkout-package-icon" aria-hidden="true"><GraduationCap size={22} strokeWidth={2.1} /></span>
            <div>
              <strong>{selectedPackage.title}</strong>
              <small>{sportLabel(selectedPackage.sportId)} · {sessionsLabel(selectedPackage.sessionCount)} · {validityLabel(selectedPackage.validityWeeks)}</small>
            </div>
          </div>
        </section>

        {!charged && (
          <section className="checkout-panel-v2 checkout-card-details-panel-v2">
            <h2>Card Details</h2>
            <StripeCardFields stripeConfigured={stripeConfigured} cardError={cardError} onCardErrorChange={setCardError} />
          </section>
        )}

        <section className="checkout-panel-v2">
          <h2>Total Amount</h2>
          <div className="checkout-total-breakdown">
            <div className="checkout-total-breakdown-row">
              <span>Package Price</span>
              <span>{money(selectedPackage.pricing.priceSubtotal)}</span>
            </div>
            <div className="checkout-total-breakdown-row">
              <span>Platform Fee</span>
              <span>{money(selectedPackage.pricing.platformFee)}</span>
            </div>
            {selectedPackage.pricing.tax > 0 && (
              <div className="checkout-total-breakdown-row">
                <span>Card Processing Fee</span>
                <span>{money(selectedPackage.pricing.tax)}</span>
              </div>
            )}
            <div className="checkout-total-breakdown-row total">
              <span>Total Payable</span>
              <span>{money(selectedPackage.pricing.grandTotal)}</span>
            </div>
          </div>
        </section>

        <div className="checkout-secure-note-v2">
          <Lock size={16} strokeWidth={2.2} />
          <span>Your payment information is secure and encrypted. We do not store your card details.</span>
        </div>

        {mockPaymentEnabled && !charged && (
          <button
            type="button"
            className="checkout-mock-pay-btn"
            disabled={paying}
            onClick={handleMockPay}
          >
            <Zap size={18} strokeWidth={2.3} />
            <span>Mock Pay — Skip Stripe</span>
          </button>
        )}

        <button type="button" className="checkout-pay-btn-v2" disabled={!canPay} onClick={handlePay}>
          {paying ? (
            <>
              <Spinner />
              <span>Processing payment...</span>
            </>
          ) : charged ? (
            <>
              <RotateCcw size={20} strokeWidth={2.1} />
              <span>Retry adding my sessions</span>
            </>
          ) : (
            <>
              <Lock size={20} strokeWidth={2.1} />
              <span>{stripeConfigured ? `Pay ${money(selectedPackage.pricing.grandTotal)} Securely` : 'Card payment unavailable'}</span>
              <ArrowRight size={22} strokeWidth={2.3} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function CoachCheckoutScreen() {
  return (
    <Elements stripe={stripePromise}>
      <CoachCheckoutContent />
    </Elements>
  );
}
