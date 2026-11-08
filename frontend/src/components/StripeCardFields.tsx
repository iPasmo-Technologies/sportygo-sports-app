import { useRef, useState } from 'react';
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  useElements,
} from '@stripe/react-stripe-js';
import {
  type StripeCardCvcElement,
  type StripeCardCvcElementChangeEvent,
  type StripeCardCvcElementOptions,
  type StripeCardExpiryElement,
  type StripeCardExpiryElementChangeEvent,
  type StripeCardExpiryElementOptions,
  type StripeCardNumberElement,
  type StripeCardNumberElementChangeEvent,
  type StripeCardNumberElementOptions,
} from '@stripe/stripe-js';
import { CardBrandIcons, type SupportedCardBrand } from '@/components/CardBrandIcons';

// Card number, expiry and CVC fields shared by court and coaching checkout.
// Must be rendered inside <Elements>; the parent reads the card with elements.getElement(CardNumberElement).

const STRIPE_ELEMENT_STYLE = {
  style: {
    base: {
      color: '#edf2fa',
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: '15px',
      fontSmoothing: 'antialiased',
      '::placeholder': {
        color: '#9ca6b7',
      },
    },
    invalid: {
      color: '#ff7d87',
    },
  },
};

const CARD_NUMBER_ELEMENT_OPTIONS: StripeCardNumberElementOptions = {
  ...STRIPE_ELEMENT_STYLE,
  placeholder: '1234 1234 1234 1234',
  showIcon: false,
};

const CARD_EXPIRY_ELEMENT_OPTIONS: StripeCardExpiryElementOptions = {
  ...STRIPE_ELEMENT_STYLE,
  style: {
    ...STRIPE_ELEMENT_STYLE.style,
    base: {
      ...STRIPE_ELEMENT_STYLE.style.base,
      fontSize: '14px',
    },
  },
  placeholder: 'mm/yy',
};

const CARD_CVC_ELEMENT_OPTIONS: StripeCardCvcElementOptions = {
  ...STRIPE_ELEMENT_STYLE,
  style: {
    ...STRIPE_ELEMENT_STYLE.style,
    base: {
      ...STRIPE_ELEMENT_STYLE.style.base,
      fontSize: '14px',
    },
  },
  placeholder: 'CVC',
};

type CardFieldKey = 'number' | 'expiry' | 'cvc';
type CardFieldState = Record<CardFieldKey, boolean>;

export default function StripeCardFields({
  stripeConfigured,
  cardError,
  onCardErrorChange,
}: {
  stripeConfigured: boolean;
  cardError: string | null;
  onCardErrorChange: (message: string | null) => void;
}) {
  const elements = useElements();
  const [activeCardBrand, setActiveCardBrand] = useState<SupportedCardBrand>('unknown');
  const [focusedCardField, setFocusedCardField] = useState<CardFieldKey | null>(null);
  const [cardFieldFilled, setCardFieldFilled] = useState<CardFieldState>({
    number: false,
    expiry: false,
    cvc: false,
  });
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
    setCardFieldFilled((current) => {
      if (current[field] === filled) return current;
      return {
        ...current,
        [field]: filled,
      };
    });
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

    // First focus happens in the user gesture; second pass runs after render
    // so the field is visible and reliably focusable in Stripe iframes.
    focusTarget();
    setTimeout(focusTarget, 0);
  }

  function handleCardNumberChange(event: StripeCardNumberElementChangeEvent) {
    onCardErrorChange(event.error?.message ?? null);
    setFieldFilled('number', !event.empty);

    const brand = event.brand === 'visa' || event.brand === 'mastercard' || event.brand === 'amex' || event.brand === 'unionpay'
      ? event.brand
      : 'unknown';
    setActiveCardBrand(brand);
  }

  function handleCardFieldChange(field: Exclude<CardFieldKey, 'number'>, event: StripeCardExpiryElementChangeEvent | StripeCardCvcElementChangeEvent) {
    onCardErrorChange(event.error?.message ?? null);
    setFieldFilled(field, !event.empty);
  }

  return (
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
              onReady={(element) => {
                cardNumberRef.current = element;
              }}
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
              onReady={(element) => {
                cardExpiryRef.current = element;
              }}
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
              onReady={(element) => {
                cardCvcRef.current = element;
              }}
              onFocus={() => setFieldFocus('cvc', true)}
              onBlur={() => setFieldFocus('cvc', false)}
            />
          </div>
        </div>
      </div>
      {!stripeConfigured && (
        <p className="checkout-stripe-card-hint error">
          Stripe is not configured for this frontend environment.
        </p>
      )}
      {cardError && <p className="checkout-stripe-card-hint error">{cardError}</p>}
    </div>
  );
}
