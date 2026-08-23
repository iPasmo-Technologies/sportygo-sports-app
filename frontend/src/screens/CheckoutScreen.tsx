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
  futsal: 'Futsal',
  'sepak-takraw': 'Sepak Takraw',
  tennis: 'Tennis',
  'table-tennis': 'Table Tennis',
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
type SupportedCardBrand = 'visa' | 'mastercard' | 'amex' | 'unionpay' | 'unknown';
type CardFieldState = Record<CardFieldKey, boolean>;

function CardBrandIcon({ brand, active }: { brand: SupportedCardBrand; active: boolean }) {
  const className = `checkout-card-brand-icon${active ? ' active' : ''}`;

  switch (brand) {
    case 'visa':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <g clipPath="url(#visa-card-brand)">
            <path fill="#00579f" d="M22 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2" />
            <path fill="#fff" d="M10.367 10.91H8.85l.949-5.802h1.517zm5.501-5.66a3.8 3.8 0 0 0-1.36-.247c-1.5 0-2.555.79-2.561 1.92-.013.833.755 1.296 1.33 1.574.587.284.786.469.786.722-.006.389-.474.568-.91.568-.607 0-.931-.092-1.425-.309l-.2-.092-.212 1.302c.356.16 1.012.303 1.692.309 1.593 0 2.63-.778 2.642-1.982.006-.66-.4-1.166-1.274-1.58-.53-.265-.856-.444-.856-.716.006-.247.275-.5.874-.5.493-.012.856.105 1.13.222l.138.062z" />
            <path fill="#fff" fillRule="evenodd" d="M18.584 5.108h1.174l1.224 5.802h-1.405l-.18-.87h-1.95c-.055.154-.318.87-.318.87h-1.592l2.254-5.32c.156-.377.431-.482.793-.482m-.093 2.124-.606 1.623h1.261c-.062-.29-.35-1.679-.35-1.679l-.106-.5a31 31 0 0 1-.2.556" clipRule="evenodd" />
            <path fill="#fff" d="M7.582 5.108 6.096 9.065l-.162-.803c-.275-.926-1.136-1.931-2.098-2.432l1.361 5.074h1.605l2.385-5.796z" />
            <path fill="#fff" d="M4.716 5.108H2.275l-.025.118c1.904.481 3.166 1.641 3.684 3.036l-.53-2.666c-.088-.37-.357-.475-.688-.488" />
          </g>
          <defs>
            <clipPath id="visa-card-brand">
              <path fill="#fff" d="M0 0h24v16H0z" />
            </clipPath>
          </defs>
        </svg>
      );
    case 'mastercard':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <rect fill="#252525" width="24" height="16" rx="2" />
          <circle cx="9" cy="8" r="5" fill="#eb001b" />
          <circle cx="15" cy="8" r="5" fill="#f79e1b" />
          <path fill="#ff5f00" d="M12 4c1.214.912 2 2.364 2 4s-.786 3.088-2 4c-1.214-.912-2-2.364-2-4s.786-3.088 2-4z" />
        </svg>
      );
    case 'amex':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <g clipPath="url(#amex-card-brand)">
            <path fill="#0193ce" d="M22 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2" />
            <path fill="#fff" d="m19.127 8.063 2.278-2.333h-3.037l-.823.883-.696-.883h-3.505v.63h3.252l.949 1.135L18.62 6.36h1.139l-1.646 1.703 1.646 1.575h-1.14l-1.075-1.133-.986 1.133h-3.215v.632h3.505l.696-.883.823.883h3.037z" />
            <path fill="#fff" d="M14.19 9.009h1.9l.885-.946-.76-.946h-2.024v.63h1.772v.631H14.19z" />
            <path fill="#fff" fillRule="evenodd" d="m5.478 9.514-.262.756H2.595l2.228-4.54h2.102l.258.504V5.73h2.621l.525 1.261.524-1.261h2.49v4.54h-1.972v-.63l-.256.63H9.542l-.262-.63v.63H6.396l-.262-.756zm6.424.126h.782l.004-3.28h-1.31l-1.05 2.27L9.28 6.36H7.97v3.027L6.395 6.36H5.347L3.774 9.64h.918l.262-.757h1.704l.262.757h1.836V7.117l1.18 2.523h.786l1.18-2.523zM6.396 8.252l-.524-1.387-.656 1.387z" clipRule="evenodd" />
          </g>
          <defs>
            <clipPath id="amex-card-brand">
              <path fill="#fff" d="M0 0h24v16H0z" />
            </clipPath>
          </defs>
        </svg>
      );
    case 'unionpay':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="28" fill="none" viewBox="0 0 24 16" role="presentation" focusable="false" className={className}>
          <path fill="#dd2423" d="M4.546 0h5.794c.808 0 1.311.726 1.123 1.619L8.765 14.368c-.19.89-1 1.616-1.81 1.616H1.164c-.808 0-1.312-.726-1.123-1.616L2.738 1.619C2.927.726 3.736 0 4.546 0" />
          <path fill="#16315e" d="M9.858 0h6.662c.809 0 .444.726.254 1.619l-2.697 12.749c-.19.89-.13 1.616-.94 1.616H6.474c-.81 0-1.312-.726-1.122-1.616L8.05 1.619C8.241.726 9.05 0 9.858 0" />
          <path fill="#036862" d="M16.256 0h5.794c.81 0 1.313.726 1.122 1.619l-2.697 12.749c-.19.89-1 1.616-1.81 1.616h-5.791c-.81 0-1.313-.726-1.123-1.616l2.697-12.749C14.637.726 15.446 0 16.256 0" />
          <path fill="#fff" d="M4.244 4.145h1.03l-.522 2.443c-.075.335-.25 1.114-1.425 1.114-.714 0-1.11-.279-1.11-.885 0-.123.014-.262.044-.412l.505-2.26h1.03l-.49 2.222a1.5 1.5 0 0 0-.029.24c0 .201.113.3.362.3.335 0 .507-.195.61-.67zm2.465 1.255c.154 0 .304.03.4.078l-.143.693a.74.74 0 0 0-.355-.083c-.26 0-.45.109-.559.642l-.186.915h-.963l.366-1.772c.06-.286.1-.548.126-.776h.835l-.05.34h.012c.166-.266.383-.414.517-.414zm2.538.871c0 .862-.505 1.43-1.35 1.43-.676 0-1.094-.41-1.094-1.023 0-.822.486-1.428 1.349-1.428.707 0 1.095.437 1.095 1.021zm-1.463.386c0 .22.086.349.258.349.291 0 .446-.472.446-.763 0-.211-.079-.35-.25-.35-.299 0-.454.464-.454.764zm3.07-1.257c.571 0 .79.353.79.77 0 .164-.028.36-.075.58l-.19.896h-.954l.164-.774c.03-.149.066-.314.066-.41 0-.117-.046-.188-.169-.188-.105 0-.214.053-.324.132l-.259 1.24h-.954l.355-1.697c.052-.257.088-.503.122-.729h.86l-.044.282h.01c.24-.213.438-.302.602-.302z" />
        </svg>
      );
    default:
      return null;
  }
}

function CardBrandIcons({ activeBrand }: { activeBrand: SupportedCardBrand }) {
  const brands: SupportedCardBrand[] = ['visa', 'mastercard', 'amex', 'unionpay'];

  return (
    <div className="checkout-card-brand-list" aria-hidden="true">
      {brands.map((brand) => (
        <CardBrandIcon key={brand} brand={brand} active={activeBrand === 'unknown' || activeBrand === brand} />
      ))}
    </div>
  );
}

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
