import { useRef, useState } from 'react';
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  type StripeCardCvcElement,
  type StripeCardCvcElementChangeEvent,
  type StripeCardExpiryElement,
  type StripeCardExpiryElementChangeEvent,
  type StripeCardNumberElement,
  type StripeCardNumberElementChangeEvent,
} from '@stripe/stripe-js';
import { Check, FlaskConical, Lock } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { createStripeTestPaymentIntent } from '@/lib/api';
import { makeReceiptId, announce } from '@/lib/utils';
import { sgd } from '@/lib/pricing';
import ScreenHeader from '@/components/ScreenHeader';
import { CardBrandIcons, type SupportedCardBrand } from '@/components/CardBrandIcons';
import pageBackground from '@/assets/select_sport_bk.png';
import { stripePromise, stripePublishableKey } from '@/lib/stripe';

const PAYMENT_TEST_PAGE_ENABLED = (import.meta.env.VITE_PAYMENT_TEST_PAGE_ENABLED ?? 'false').trim() === 'true';

const STRIPE_ELEMENT_STYLE = {
  style: {
    base: {
      color: '#edf2fa',
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '15px',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#9ca6b7' },
    },
    invalid: { color: '#ff7d87' },
  },
};

const CARD_NUMBER_ELEMENT_OPTIONS = { ...STRIPE_ELEMENT_STYLE, placeholder: '1234 1234 1234 1234', showIcon: false };
const CARD_EXPIRY_ELEMENT_OPTIONS = {
  ...STRIPE_ELEMENT_STYLE,
  style: { ...STRIPE_ELEMENT_STYLE.style, base: { ...STRIPE_ELEMENT_STYLE.style.base, fontSize: '14px' } },
  placeholder: 'mm/yy',
};
const CARD_CVC_ELEMENT_OPTIONS = {
  ...STRIPE_ELEMENT_STYLE,
  style: { ...STRIPE_ELEMENT_STYLE.style, base: { ...STRIPE_ELEMENT_STYLE.style.base, fontSize: '14px' } },
  placeholder: 'CVC',
};

type CardFieldKey = 'number' | 'expiry' | 'cvc';
type CardFieldState = Record<CardFieldKey, boolean>;

function PaymentTestContent() {
  const { state, dispatch, navigate } = useApp();
  const stripe = useStripe();
  const elements = useElements();
  const [amount, setAmount] = useState('0.50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeCardBrand, setActiveCardBrand] = useState<SupportedCardBrand>('unknown');
  const [focusedCardField, setFocusedCardField] = useState<CardFieldKey | null>(null);
  const [cardFieldFilled, setCardFieldFilled] = useState<CardFieldState>({ number: false, expiry: false, cvc: false });
  const cardNumberRef = useRef<StripeCardNumberElement | null>(null);
  const cardExpiryRef = useRef<StripeCardExpiryElement | null>(null);
  const cardCvcRef = useRef<StripeCardCvcElement | null>(null);

  function setFieldFocus(field: CardFieldKey, focused: boolean) {
    setFocusedCardField((current) => {
      if (focused) return field;
      return current === field ? null : current;
    });
  }

  function setFieldFilled(field: CardFieldKey, filled: boolean) {
    setCardFieldFilled((current) => (current[field] === filled ? current : { ...current, [field]: filled }));
  }

  function isFieldActive(field: CardFieldKey): boolean {
    return focusedCardField === field || cardFieldFilled[field];
  }

  function focusCardField(field: CardFieldKey) {
    setFieldFocus(field, true);

    const focusTarget = () => {
      if (field === 'number') {
        elements?.getElement(CardNumberElement)?.focus();
        cardNumberRef.current?.focus();
        return;
      }
      if (field === 'expiry') {
        elements?.getElement(CardExpiryElement)?.focus();
        cardExpiryRef.current?.focus();
        return;
      }
      elements?.getElement(CardCvcElement)?.focus();
      cardCvcRef.current?.focus();
    };

    focusTarget();
    setTimeout(focusTarget, 0);
  }

  function handleCardNumberChange(event: StripeCardNumberElementChangeEvent) {
    setError(event.error?.message ?? null);
    setFieldFilled('number', !event.empty);
    const brand = event.brand === 'visa' || event.brand === 'mastercard' || event.brand === 'amex' || event.brand === 'unionpay'
      ? event.brand
      : 'unknown';
    setActiveCardBrand(brand);
  }

  function handleCardFieldChange(field: Exclude<CardFieldKey, 'number'>, event: StripeCardExpiryElementChangeEvent | StripeCardCvcElementChangeEvent) {
    setError(event.error?.message ?? null);
    setFieldFilled(field, !event.empty);
  }

  function getAmount(): number | null {
    const parsed = Number(amount);
    return Number.isFinite(parsed) && parsed >= 0.5 ? Number(parsed.toFixed(2)) : null;
  }

  function completeSuccess(value: number, receiptId: string) {
    dispatch({ type: 'SET_BOOKING_TYPE', payload: 'court' });
    dispatch({ type: 'SET_PRICING', payload: { priceSubtotal: value, platformFee: 0, tax: 0, grandTotal: value } });
    dispatch({ type: 'SET_RECEIPT', payload: receiptId });
    dispatch({ type: 'SET_PAYMENT_STATUS', payload: 'success' });
    setSuccess(true);
    announce('Payment test succeeded.');
    setTimeout(() => navigate('booking-confirmation'), 500);
  }

  async function handleStripePayment() {
    const value = getAmount();
    if (value === null) {
      setError('Enter an amount of at least S$0.50.');
      return;
    }
    if (!stripe || !elements || !state.authToken) {
      setError('Stripe is unavailable or you are not logged in.');
      return;
    }
    const card = elements.getElement(CardNumberElement);
    if (!card) {
      setError('Enter card details before testing payment.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const receiptId = makeReceiptId();
      const intent = await createStripeTestPaymentIntent({ amount: value, currency: 'sgd', receiptId }, state.authToken);
      const result = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: { card, billing_details: { email: state.customerEmail } },
      });
      if (result.error) throw new Error(result.error.message ?? 'Payment failed.');
      if (result.paymentIntent?.status !== 'succeeded') throw new Error('Payment was not completed.');
      completeSuccess(value, receiptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!PAYMENT_TEST_PAGE_ENABLED) {
    return <div className="pt-disabled-notice"><FlaskConical size={40} /><h1>Test Page Disabled</h1><p>Set <code>VITE_PAYMENT_TEST_PAGE_ENABLED=true</code> and restart the frontend.</p></div>;
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="pt-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <ScreenHeader onBack={() => navigate('profile')} backAriaLabel="Back to profile" />
        <div className="pt-mode-badge"><FlaskConical size={14} /><span>Payment Test Mode</span></div>
        <h1 className="pt-title">Payment Integration Test</h1>
        <p className="pt-subtitle">Enter real card details to test a small Stripe charge. No booking details are required.</p>

        <section className="pt-panel">
          <h2>Payment Amount</h2>
          <label className="pt-label" htmlFor="pt-amount">Amount (SGD)</label>
          <input id="pt-amount" className="pt-input pt-amount-input" type="number" min="0.50" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <p className="pt-hint">Minimum test amount: S$0.50. The entered amount is sent directly to Stripe.</p>
          <p className="pt-pricing-row total"><span>Test amount</span><span>{sgd(Number(amount) || 0).replace('SGD', 'S$')}</span></p>
        </section>

        <section className="checkout-panel-v2 checkout-card-details-panel-v2">
          <h2>Card Details</h2>
          <div className="checkout-stripe-card-wrap">
            <div
              className={`checkout-card-input-shell checkout-card-input-shell--number${focusedCardField === 'number' ? ' is-focused' : ''}${isFieldActive('number') ? ' is-active' : ''}`}
              aria-label="Card number"
              onClick={() => focusCardField('number')}
            >
              <div className="checkout-card-input-copy">
                <span className="checkout-card-input-label">Card number</span>
                <div className="checkout-card-input-element">
                  <CardNumberElement
                    options={CARD_NUMBER_ELEMENT_OPTIONS}
                    onChange={handleCardNumberChange}
                    onReady={(element) => { cardNumberRef.current = element; }}
                    onFocus={() => setFieldFocus('number', true)}
                    onBlur={() => setFieldFocus('number', false)}
                  />
                </div>
              </div>
              <CardBrandIcons activeBrand={activeCardBrand} />
            </div>

            <div className="checkout-card-input-grid">
              <div
                className={`checkout-card-input-shell checkout-card-input-shell--half${focusedCardField === 'expiry' ? ' is-focused' : ''}${isFieldActive('expiry') ? ' is-active' : ''}`}
                aria-label="Card expiration"
                onClick={() => focusCardField('expiry')}
              >
                <span className="checkout-card-input-label">Expiration</span>
                <div className="checkout-card-input-element">
                  <CardExpiryElement
                    options={CARD_EXPIRY_ELEMENT_OPTIONS}
                    onChange={(event) => handleCardFieldChange('expiry', event)}
                    onReady={(element) => { cardExpiryRef.current = element; }}
                    onFocus={() => setFieldFocus('expiry', true)}
                    onBlur={() => setFieldFocus('expiry', false)}
                  />
                </div>
              </div>

              <div
                className={`checkout-card-input-shell checkout-card-input-shell--half${focusedCardField === 'cvc' ? ' is-focused' : ''}${isFieldActive('cvc') ? ' is-active' : ''}`}
                aria-label="Card security code"
                onClick={() => focusCardField('cvc')}
              >
                <span className="checkout-card-input-label">CVC</span>
                <div className="checkout-card-input-element">
                  <CardCvcElement
                    options={CARD_CVC_ELEMENT_OPTIONS}
                    onChange={(event) => handleCardFieldChange('cvc', event)}
                    onReady={(element) => { cardCvcRef.current = element; }}
                    onFocus={() => setFieldFocus('cvc', true)}
                    onBlur={() => setFieldFocus('cvc', false)}
                  />
                </div>
              </div>
            </div>
            {!stripePublishableKey && (
              <p className="checkout-stripe-card-hint error">Stripe is not configured for this frontend environment.</p>
            )}
            {error && <p className="checkout-stripe-card-hint error">{error}</p>}
          </div>
          {success && <p className="pt-result success"><Check size={16} /> Payment succeeded. Opening confirmation…</p>}
        </section>

        <button type="button" className="pt-real-btn" disabled={busy || !stripePublishableKey} onClick={handleStripePayment}><Lock size={17} /><span>{busy ? 'Processing…' : `Pay ${amount || '0.00'} with Stripe`}</span></button>
      </div>
    </div>
  );
}

export default function PaymentTestScreen() {
  return <Elements stripe={stripePromise}><PaymentTestContent /></Elements>;
}
