import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type { Action, AppState, Screen, BookingType, PayMethod } from '@/types';
import { calcPricing, parseRate } from '@/lib/pricing';
import { PLATFORM_FEE } from '@/lib/constants';

// ─────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────
const initialState: AppState = {
  screen:           'home',
  bookingType:      null,
  selectedDate:     null,
  selectedTime:     null,
  durationMins:     60,
  selectedSport:    null,
  selectedFacility: null,
  packageOption:    null,
  isLoggedIn:       false,
  customerEmail:    '',
  userRole:         'public',
  authToken:        null,
  payMethod:        null,
  slots:            [],
  slotsLoading:     false,
  slotsError:       null,
  priceSubtotal:    0,
  platformFee:      PLATFORM_FEE,
  tax:              0,
  grandTotal:       0,
  receiptId:        '',
  paymentStatus:    null,
  paymentCard:      null,
  whatsAppMockSent: false,
  paymentError:     null,
  postLoginRedirect: null,

};

// ─────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.payload };

    case 'SET_BOOKING_TYPE': {
      const isCoaching = action.payload === 'coaching';
      return {
        ...state,
        bookingType:   action.payload,
        durationMins:  isCoaching ? 60 : state.durationMins,
        packageOption: isCoaching ? null : state.packageOption,
      };
    }

    case 'SET_SELECTED_SPORT':
      return { ...state, selectedSport: action.payload, selectedFacility: null };

    case 'SET_SELECTED_FACILITY':
      return { ...state, selectedFacility: action.payload };

    case 'SET_DATE':
      if (state.selectedDate === action.payload) {
        return state;
      }

      return {
        ...state,
        selectedDate: action.payload,
        selectedTime: null,
        slots: [],
        slotsLoading: true,
        slotsError: null,
      };

    case 'SET_TIME':
      return { ...state, selectedTime: action.payload };

    case 'SET_DURATION': {
      const ratePerHour = parseRate(state.selectedFacility?.price);
      const pricing = calcPricing('court', action.payload, null, ratePerHour);
      return { ...state, durationMins: action.payload, ...pricing };
    }

    case 'SET_PACKAGE': {
      const pricing = calcPricing('coaching', state.durationMins, action.payload);
      return { ...state, packageOption: action.payload, ...pricing };
    }

    case 'SET_PAY_METHOD':
      return { ...state, payMethod: action.payload, paymentError: null };

    case 'SET_LOGGED_IN':
      return {
        ...state,
        isLoggedIn:    true,
        customerEmail: action.payload.email,
        authToken:     action.payload.token,
        userRole:      action.payload.role ?? 'public',
      };

    case 'SET_USER_ROLE':
      return { ...state, userRole: action.payload };

    case 'SET_SLOTS_LOADING':
      return { ...state, slotsLoading: true, slotsError: null };

    case 'SET_SLOTS':
      return { ...state, slots: action.payload, slotsLoading: false, slotsError: null };

    case 'SET_SLOTS_ERROR':
      return { ...state, slotsLoading: false, slotsError: action.payload };

    case 'CLEAR_SLOTS_ERROR':
      return { ...state, slotsError: null };

    case 'SET_PRICING':
      return { ...state, ...action.payload };

    case 'SET_RECEIPT':
      return { ...state, receiptId: action.payload };

    case 'SET_PAYMENT_STATUS':
      return { ...state, paymentStatus: action.payload, paymentError: null };

    case 'SET_PAYMENT_CARD':
      return { ...state, paymentCard: action.payload };

    case 'SET_PAYMENT_ERROR':
      return { ...state, paymentError: action.payload };

    case 'SET_POST_LOGIN_REDIRECT':
      return { ...state, postLoginRedirect: action.payload };

    case 'MARK_WHATSAPP_SENT':
      return { ...state, whatsAppMockSent: true };

    case 'LOG_OUT':
      return { ...initialState, screen: 'login' };

    case 'RESET':
      return {
        ...initialState,
        // Preserve login session across bookings
        isLoggedIn:    state.isLoggedIn,
        customerEmail: state.customerEmail,
        userRole:      state.userRole,
        authToken:     state.authToken,
      };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  navigate: (target: Screen) => void;
  goBack: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const navigate = useCallback(
    (target: Screen) => {
      // Navigation guards
      if (target === 'schedule' && !state.bookingType)           return;
      if (target === 'terms' && (!state.selectedDate || !state.selectedTime)) return;
      if (target === 'booking-confirmation' && state.screen !== 'checkout')    return; // only via payment flow
      if (target === 'checkout' && !state.isLoggedIn) {
        dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: 'checkout' });
        dispatch({ type: 'SET_SCREEN', payload: 'login' });
        return;
      }
      if (target === 'bookings' && !state.isLoggedIn) {
        dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: 'bookings' });
        dispatch({ type: 'SET_SCREEN', payload: 'login' });
        return;
      }
      if (target === 'profile' && !state.isLoggedIn) {
        dispatch({ type: 'SET_POST_LOGIN_REDIRECT', payload: 'profile' });
        dispatch({ type: 'SET_SCREEN', payload: 'login' });
        return;
      }
      if ((target === 'block-slots' || target === 'blocked-slots') && (!state.isLoggedIn || state.userRole !== 'admin')) {
        dispatch({ type: 'SET_SCREEN', payload: state.isLoggedIn ? 'sport-select' : 'login' });
        return;
      }
      if (target === 'checkout' && (!state.selectedDate || !state.selectedTime)) return;
      // payment-test is dev-only; no auth guard — screen handles it internally

      dispatch({ type: 'SET_SCREEN', payload: target });
    },
    [state.bookingType, state.isLoggedIn, state.selectedDate, state.selectedTime, state.screen, state.userRole]
  );

  const goBack = useCallback(() => {
    const order: Screen[] = ['home', 'sport-select', 'block-slots', 'blocked-slots', 'sport-events', 'facility-select', 'schedule', 'terms', 'login', 'forgot-password', 'checkout', 'booking-confirmation', 'bookings', 'profile', 'payment-test'];
    const idx = order.indexOf(state.screen);
    if (idx <= 0) return;

    let prev = order[idx - 1];
    // Skip login screen when already logged in
    if (prev === 'login' && state.isLoggedIn) {
      prev = order[Math.max(0, idx - 2)];
    }
    dispatch({ type: 'SET_SCREEN', payload: prev });
  }, [state.screen, state.isLoggedIn]);

  return (
    <AppContext.Provider value={{ state, dispatch, navigate, goBack }}>
      {children}
    </AppContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

// Typed convenience for selecting booking type
export function useSelectBookingType() {
  const { dispatch } = useApp();
  return useCallback(
    (type: BookingType) => dispatch({ type: 'SET_BOOKING_TYPE', payload: type }),
    [dispatch]
  );
}

// Typed convenience for selecting pay method
export function useSelectPayMethod() {
  const { dispatch } = useApp();
  return useCallback(
    (method: PayMethod | null) => dispatch({ type: 'SET_PAY_METHOD', payload: method }),
    [dispatch]
  );
}
