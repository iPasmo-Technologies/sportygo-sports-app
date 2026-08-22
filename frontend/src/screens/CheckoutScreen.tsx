import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, Clock3, FlaskConical, Lock, MapPin, Zap } from 'lucide-react';
import { useApp, useSelectPayMethod } from '@/context/AppContext';
import ScreenHeader from '@/components/ScreenHeader';
import BookingStepBar from '@/components/BookingStepBar';
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
  type StripeCardCvcElementOptions,
  type StripeCardExpiryElement,
  type StripeCardExpiryElementChangeEvent,
  type StripeCardExpiryElementOptions,
  type StripeCardNumberElement,
  type StripeCardNumberElementChangeEvent,
  type StripeCardNumberElementOptions,
} from '@stripe/stripe-js';
import { createBooking, createMockBooking, createStripePaymentIntent, reserveSlotForBooking, releaseSlotReservation } from '@/lib/api';
import { PACKAGES, PLATFORM_FEE } from '@/lib/constants';
import { calcPricing, parseRate, sgd } from '@/lib/pricing';
import { formatDateShort, makeReceiptId, announce } from '@/lib/utils';
import { stripePromise, stripePublishableKey } from '@/lib/stripe';
import type { PayMethod } from '@/types';
import ErrorBanner from '@/components/ErrorBanner';
import Spinner from '@/components/Spinner';
import { CardBrandIcons, type SupportedCardBrand } from '@/components/CardBrandIcons';
import pageBackground from '@/assets/select_sport_bk.png';
import indoorCricketCard from '@/assets/card_indoor_cricket.png';
import bowlingLaneCard from '@/assets/bowling_lane.png';
import cricketNetsCard from '@/assets/cricket_nets.png';
import indoorCourtCard from '@/assets/indoor_court.png';
import cricketFacility from '@/assets/cricket_facility.png';
import pickleballIndoorCourt from '@/assets/pb-indoor-court.png';
import pickleballOutdoorCourt from '@/assets/pb-outdoor-court.png';

const SPORT_LABELS = {
  cricket: 'Cricket',
  'indoor-cricket': 'Indoor Cricket',
  pickleball: 'Pickleball',
  soccer: 'Soccer',
  volleyball: 'Volleyball',
  badminton: 'Badminton',
  basketball: 'Basketball',
  kabaddi: 'Kabaddi',
} as const;

const FACILITY_IMAGES = {
  'bowling-lane': bowlingLaneCard,
  'nets-2': cricketNetsCard,
  'nets-3': cricketNetsCard,
  'nets-4': cricketNetsCard,
  'indoor-court': indoorCourtCard,
  'outdoor-field': cricketFacility,
  'pb-indoor-court': pickleballIndoorCourt,
  'pb-outdoor-court': pickleballOutdoorCourt,
} as const;

const PAY_METHODS: Array<{ id: PayMethod; title: string; subtitle: string; badge: string; disabled?: boolean }> = [
  { id: 'STRIPE', title: 'Credit / Debit Card', subtitle: 'Visa, Mastercard, AMEX', badge: 'CARD' },
  { id: 'GPAY', title: 'Google Pay', subtitle: 'Coming soon', badge: 'GPay', disabled: true },
  { id: 'PAYNOW', title: 'PayNow', subtitle: 'Coming soon', badge: 'PAYNOW', disabled: true },
  { id: 'GRABPAY', title: 'GrabPay', subtitle: 'Coming soon', badge: 'GrabPay', disabled: true },
];

const MOCK_PAYMENT_ENABLED = (import.meta.env.VITE_MOCK_PAYMENT_ENABLED ?? 'false').trim() === 'true';

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

function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const isPm = h >= 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const nextH = Math.floor(total / 60);
  const nextM = total % 60;
  return `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
}

function CheckoutScreenContent() {
  const { state, dispatch, navigate } = useApp();
  const selectPay = useSelectPayMethod();
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [totalExpanded, setTotalExpanded] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
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

  const isCoaching = state.bookingType === 'coaching';
  const stripeConfigured = stripePublishableKey.length > 0;

  // Compute pricing synchronously on every render — no async useEffect needed.
  // This guarantees the correct price is shown even when the user keeps the
  // default 60-min duration (i.e. SET_DURATION was never dispatched).
  const pricing = useMemo(() => {
    if (!state.bookingType) {
      return { priceSubtotal: 0, tax: 0, platformFee: PLATFORM_FEE, grandTotal: 0 };
    }
    const ratePerHour = parseRate(state.selectedFacility?.price);
    return calcPricing(state.bookingType, state.durationMins, state.packageOption, ratePerHour, state.payMethod);
  }, [state.bookingType, state.durationMins, state.packageOption, state.selectedFacility?.price, state.payMethod]);

  const selectedMethod = state.payMethod;
  const isStripeMethod = state.payMethod === 'STRIPE';
  const coachingReady = isCoaching ? !!state.packageOption : true;
  const canPay = !!state.payMethod && coachingReady && pricing.grandTotal > 0 && !paying && (!isStripeMethod || stripeConfigured);

  const selectedSportLabel = state.selectedSport ? SPORT_LABELS[state.selectedSport] : 'Cricket';
  const selectedFacilityTitle = state.selectedFacility?.title ?? `${selectedSportLabel} Facility`;
  const selectedFacilityAddress = state.selectedFacility?.address ?? 'Location not available';
  const selectedFacilityImage = state.selectedFacility ? FACILITY_IMAGES[state.selectedFacility.imageKey] : indoorCricketCard;
  const selectedDateText = state.selectedDate
    ? formatDateShort(state.selectedDate)
    : '—';
  const timeRange = state.selectedTime
    ? `${to12Hour(state.selectedTime)} - ${to12Hour(addMinutes(state.selectedTime, state.durationMins))} (${state.durationMins} min)`
    : '—';

  useEffect(() => {
    // Always open checkout with no preselected payment method.
    dispatch({ type: 'SET_PAY_METHOD', payload: null });
  }, [dispatch]);

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
    setCardError(event.error?.message ?? null);
    setFieldFilled('number', !event.empty);

    const brand = event.brand === 'visa' || event.brand === 'mastercard' || event.brand === 'amex' || event.brand === 'unionpay'
      ? event.brand
      : 'unknown';
    setActiveCardBrand(brand);
  }

  function handleCardFieldChange(field: Exclude<CardFieldKey, 'number'>, event: StripeCardExpiryElementChangeEvent | StripeCardCvcElementChangeEvent) {
    setCardError(event.error?.message ?? null);
    setFieldFilled(field, !event.empty);
  }

  function payBtnLabel(): string {
    if (paying) return 'Processing payment...';
    if (isCoaching && !state.packageOption) return 'Select a package to continue';
    if (!state.payMethod) return 'Select a payment method';
    if (isStripeMethod && !stripeConfigured) return 'Card payment unavailable';
    return `Pay ${sgd(pricing.grandTotal)} Securely`;
  }

  async function handlePayment() {
    if (!canPay || !state.bookingType || !state.selectedDate || !state.selectedTime || !state.payMethod) return;

    if (!state.isLoggedIn || !state.authToken) {
      dispatch({ type: 'SET_SCREEN', payload: 'login' });
      announce('Please log in to continue checkout.');
      return;
    }

    const receiptId = makeReceiptId();
    setPaying(true);
    dispatch({ type: 'SET_PAYMENT_ERROR', payload: null });
    setCardError(null);

    let lockToken: string | undefined;

    try {
      let stripePaymentIntentId: string | undefined;

      if (state.payMethod === 'STRIPE') {
        if (!stripeConfigured) {
          throw new Error('Stripe card payments are not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in frontend environment.');
        }

        if (!stripe || !elements) {
          throw new Error('Stripe is still loading. Please try again in a moment.');
        }

        const cardNumberElement = elements.getElement(CardNumberElement);
        if (!cardNumberElement) {
          throw new Error('Enter your card details before paying.');
        }

        // Lock the slot before charging the card so a brief time-pass after slot selection
        // does not prevent booking after a successful payment.
        const reservation = await reserveSlotForBooking(
          {
            selectedDate: state.selectedDate,
            selectedTime: state.selectedTime,
            durationMins: state.durationMins,
          },
          state.authToken
        );
        lockToken = reservation.lockToken;

        const intent = await createStripePaymentIntent(
          {
            bookingType: state.bookingType,
            sportId: state.selectedSport,
            facilityCode: state.selectedFacility?.code ?? null,
            durationMins: state.durationMins,
            packageOption: state.packageOption,
            currency: 'sgd',
            receiptId,
          },
          state.authToken
        );

        const confirmation = await stripe.confirmCardPayment(intent.clientSecret, {
          payment_method: {
            card: cardNumberElement,
            billing_details: {
              email: state.customerEmail,
            },
          },
        });

        if (confirmation.error) {
          throw new Error(confirmation.error.message ?? 'Card payment failed. Please try another card.');
        }

        const paymentIntent = confirmation.paymentIntent;
        if (!paymentIntent || paymentIntent.status !== 'succeeded') {
          throw new Error('Card payment was not completed.');
        }

        stripePaymentIntentId = paymentIntent.id;
      }

      const result = await createBooking(
        {
          bookingType:   state.bookingType,
          sportId:       state.selectedSport ?? 'cricket',
          facilityCode:  state.selectedFacility?.code ?? '',
          selectedDate:  state.selectedDate,
          selectedTime:  state.selectedTime,
          durationMins:  state.durationMins,
          packageOption: state.packageOption,
          payMethod:     state.payMethod,
          grandTotal:    pricing.grandTotal,
          receiptId,
          stripePaymentIntentId,
          lockToken,
          customerEmail: state.customerEmail,
          facilityTitle: state.selectedFacility?.title ?? null,
          facilityAddress: state.selectedFacility?.address ?? null,
          facilityImageKey: state.selectedFacility?.imageKey ?? null,
          facilityTag: state.selectedFacility?.tag ?? null,
        },
        state.authToken
      );

      // Persist derived pricing to state so BookingConfirmationScreen receipt shows correct amount
      dispatch({ type: 'SET_PRICING', payload: pricing });
      dispatch({ type: 'SET_RECEIPT', payload: receiptId });
      dispatch({ type: 'SET_PAYMENT_STATUS', payload: result.status });
      navigate('booking-confirmation');
      if (result.status === 'success') {
        announce('Payment successful! Booking confirmed.');
      } else {
        announce('Online payment could not be completed. Proceed with cash payment.');
      }
    } catch (err) {
      // Release the slot reservation so it doesn't block others during the TTL window
      if (lockToken && state.authToken) {
        releaseSlotReservation(lockToken, state.authToken);
      }
      const msg = err instanceof Error ? err.message : 'Payment failed. Please try again.';
      dispatch({ type: 'SET_PAYMENT_ERROR', payload: msg });
      announce('Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  const selectedPackageLabel = PACKAGES.find(p => p.id === state.packageOption)?.label ?? 'No package selected';

  async function handleMockPay() {
    if (!state.bookingType || !state.selectedDate || !state.selectedTime || !state.authToken) return;
    setPaying(true);
    dispatch({ type: 'SET_PAYMENT_ERROR', payload: null });
    let mockLockToken: string | undefined;

    try {
      const reservation = await reserveSlotForBooking(
        {
          selectedDate: state.selectedDate,
          selectedTime: state.selectedTime,
          durationMins: state.durationMins,
        },
        state.authToken
      );
      mockLockToken = reservation.lockToken;
    const receiptId = makeReceiptId();
      const mockPricing = calcPricing(
        state.bookingType,
        state.durationMins,
        state.packageOption,
        parseRate(state.selectedFacility?.price),
        'STRIPE'
      );
      const result = await createMockBooking({
        bookingType: state.bookingType,
        sportId: state.selectedSport ?? 'cricket',
        facilityCode: state.selectedFacility?.code ?? '',
        selectedDate: state.selectedDate,
        selectedTime: state.selectedTime,
        durationMins: state.durationMins,
        packageOption: state.packageOption,
        payMethod: 'STRIPE',
        grandTotal: mockPricing.grandTotal,
        receiptId,
        stripePaymentIntentId: undefined,
        lockToken: mockLockToken,
        customerEmail: state.customerEmail,
        facilityTitle: state.selectedFacility?.title ?? null,
        facilityAddress: state.selectedFacility?.address ?? null,
        facilityImageKey: state.selectedFacility?.imageKey ?? null,
        facilityTag: state.selectedFacility?.tag ?? null,
      }, state.authToken);
      dispatch({ type: 'SET_PRICING', payload: mockPricing });
      dispatch({ type: 'SET_RECEIPT', payload: receiptId });
      dispatch({ type: 'SET_PAYMENT_STATUS', payload: result.status });
      announce('Mock payment successful. Booking confirmed.');
      navigate('booking-confirmation');
    } catch (err) {
      if (mockLockToken) releaseSlotReservation(mockLockToken, state.authToken);
      dispatch({ type: 'SET_PAYMENT_ERROR', payload: err instanceof Error ? err.message : 'Mock booking failed.' });
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="page-container page-container--immersive screen-fade-enter">
      <div className="checkout-phone" style={{ backgroundImage: `url(${pageBackground})` }}>
        <ScreenHeader onBack={() => navigate('terms')} backAriaLabel="Back to terms" />

        {MOCK_PAYMENT_ENABLED && (
          <div className="checkout-mock-banner">
            <FlaskConical size={14} strokeWidth={2} />
            <span>Test Mode Active — Mock Pay enabled</span>
          </div>
        )}

        <h1 className="checkout-title">Checkout</h1>

        <BookingStepBar currentStep={4} />

        <ErrorBanner
          message={state.paymentError}
          onDismiss={() => dispatch({ type: 'SET_PAYMENT_ERROR', payload: null })}
        />

        <section className="checkout-summary-card-v2">
          <h2>Booking Summary</h2>
          <div className="checkout-summary-body-v2">
            <img src={selectedFacilityImage} alt={selectedFacilityTitle} className="checkout-summary-image-v2" />
            <div className="checkout-summary-info-v2">
              <h3>{selectedFacilityTitle}</h3>
              <p>
                {state.selectedFacility?.mapLocationUrl ? (
                  <a
                    className="checkout-summary-icon-pill-v2"
                    href={state.selectedFacility.mapLocationUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open map for ${selectedFacilityTitle}`}
                  >
                    <MapPin size={15} strokeWidth={2.3} />
                  </a>
                ) : (
                  <span className="checkout-summary-icon-pill-v2" aria-hidden="true">
                    <MapPin size={15} strokeWidth={2.3} />
                  </span>
                )}
                {selectedFacilityAddress}
              </p>
              <p>
                <span className="checkout-summary-icon-pill-v2" aria-hidden="true">
                  <CalendarDays size={15} strokeWidth={2.3} />
                </span>
                {selectedDateText}
              </p>
              <p>
                <span className="checkout-summary-icon-pill-v2" aria-hidden="true">
                  <Clock3 size={15} strokeWidth={2.3} />
                </span>
                {timeRange}
              </p>
              <div className="checkout-summary-price-v2">
                <strong>{sgd(pricing.grandTotal).replace('SGD', 'S$')} <span>(Incl. all fees)</span></strong>
              </div>
            </div>
          </div>
        </section>

        {isCoaching && (
          <section className="checkout-panel-v2 coaching-panel-v2">
            <h2>Package</h2>
            <div className="coaching-selected-package">{selectedPackageLabel}</div>
          </section>
        )}

        <section className="checkout-panel-v2">
          <h2>Payment Method</h2>
          <div className="checkout-pay-list-v2">
            {PAY_METHODS.map(method => {
              const selected = selectedMethod === method.id;
              return (
                <button
                  type="button"
                  key={method.id}
                  className={`checkout-pay-item-v2${selected ? ' selected' : ''}${method.disabled ? ' disabled' : ''}`}
                  aria-pressed={selected}
                  aria-disabled={method.disabled}
                  disabled={method.disabled}
                  onClick={!method.disabled ? () => selectPay(method.id) : undefined}
                >
                  <span className={`checkout-pay-badge-v2 badge-${method.id.toLowerCase()}`}>{method.badge}</span>
                  <span className="checkout-pay-copy-v2">
                    <strong>{method.title}</strong>
                    <small>{method.subtitle}</small>
                  </span>
                  <span className={`checkout-pay-radio-v2${selected ? ' selected' : ''}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="checkout-secure-note-v2">
            <Lock size={16} strokeWidth={2.2} />
            <span>Your payment information is secure and encrypted. We do not store your card details.</span>
          </div>
        </section>

        {isStripeMethod && (
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
          </section>
        )}

        <section className="checkout-total-bar-v2">
          <button
            type="button"
            className="checkout-total-toggle"
            aria-expanded={totalExpanded}
            onClick={() => setTotalExpanded((v) => !v)}
          >
            <div>
              <small>Total Amount</small>
            </div>
            <div className="checkout-total-right-v2">
              <strong>{sgd(pricing.grandTotal).replace('SGD', 'S$')}</strong>
              <ChevronDown
                size={20}
                strokeWidth={2.1}
                className={`terms-item-chevron${totalExpanded ? ' checkout-chevron-open' : ''}`}
              />
            </div>
          </button>
          <small className="checkout-total-sub">(Incl. all fees)</small>

          {totalExpanded && (
            <div className="checkout-total-breakdown">
              <div className="checkout-total-breakdown-row">
                <span>Booking Fee</span>
                <span>{sgd(pricing.priceSubtotal).replace('SGD', 'S$')}</span>
              </div>
              <div className="checkout-total-breakdown-row">
                <span>Platform Fee</span>
                <span>{sgd(pricing.platformFee).replace('SGD', 'S$')}</span>
              </div>
              {pricing.tax > 0 && (
                <div className="checkout-total-breakdown-row">
                  <span>Card Processing Fee</span>
                  <span>{sgd(pricing.tax).replace('SGD', 'S$')}</span>
                </div>
              )}
              <div className="checkout-total-breakdown-row total">
                <span>Total Payable</span>
                <span>{sgd(pricing.grandTotal).replace('SGD', 'S$')}</span>
              </div>
            </div>
          )}
        </section>

        {MOCK_PAYMENT_ENABLED && (
          <button
            type="button"
            className="checkout-mock-pay-btn"
            disabled={paying || !coachingReady}
            onClick={handleMockPay}
          >
            <Zap size={18} strokeWidth={2.3} />
            <span>Mock Pay — Skip Stripe</span>
          </button>
        )}

        <button className="checkout-pay-btn-v2" disabled={!canPay} onClick={handlePayment}>
          {paying ? (
            <>
              <Spinner />
              <span>Processing payment...</span>
            </>
          ) : (
            <>
              <Lock size={20} strokeWidth={2.1} />
              <span>{payBtnLabel()}</span>
              <ArrowRight size={22} strokeWidth={2.3} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function CheckoutScreen() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutScreenContent />
    </Elements>
  );
}
