// ─────────────────────────────────────────────────────────────
// Shared application types
// ─────────────────────────────────────────────────────────────

export type Screen = 'home' | 'sport-select' | 'sport-events' | 'facility-select' | 'schedule' | 'terms' | 'login' | 'forgot-password' | 'checkout' | 'booking-confirmation' | 'bookings' | 'profile' | 'payment-test' | 'block-slots';
export type UserRole = 'public' | 'coach' | 'admin';
export type SportId = 'cricket' | 'indoor-cricket' | 'pickleball' | 'futsal' | 'sepak-takraw' | 'tennis' | 'table-tennis' | 'soccer' | 'volleyball' | 'badminton' | 'basketball' | 'kabaddi';
export type SportImageKey = SportId;
export type BookingType = 'court' | 'coaching';
export type PayMethod = 'STRIPE' | 'GPAY' | 'PAYNOW' | 'GRABPAY';
export type PaymentStatus = 'success' | 'cash';

export interface SportOption {
  id: SportId;
  label: string;
  imageKey: SportImageKey;
  bannerKey: SportId;
  enabled: boolean;
  sortOrder: number;
}

export type SportEventImageKey = 'facility' | 'academy' | 'coach' | 'gear';
export type SportEventActionTarget = 'facility-select' | 'schedule';
export type SportEventIcon = 'calendar' | 'academy' | 'coach' | 'shop';

export type SportFacilityImageKey = 'bowling-lane' | 'nets-2' | 'nets-3' | 'nets-4' | 'indoor-court' | 'outdoor-field' | 'pb-indoor-court' | 'pb-outdoor-court';
export type SportFacilityActionTarget = 'schedule';
export type SportFacilityIcon = 'lane' | 'net' | 'court' | 'field' | 'academy' | 'gear';

export interface SportEventTemplate {
  id: string;
  sportId: SportId;
  titleTemplate: string;
  descriptionTemplate: string;
  imageKey: SportEventImageKey;
  icon: SportEventIcon;
  actionTarget: SportEventActionTarget;
  enabled: boolean;
  sortOrder: number;
}

export interface SportEventCard {
  id: string;
  sportId: SportId;
  title: string;
  description: string;
  imageKey: SportEventImageKey;
  icon: SportEventIcon;
  actionTarget: SportEventActionTarget;
  enabled: boolean;
  sortOrder: number;
}

export interface SportFacilityTemplate {
  sportId: SportId;
  code: string;
  titleTemplate: string;
  price: string;
  tag: string;
  imageKey: SportFacilityImageKey;
  icon: SportFacilityIcon;
  actionTarget: SportFacilityActionTarget;
  enabled: boolean;
  sortOrder: number;
  address: string;
  mapLocationUrl: string;
}

export interface SportFacilityCard {
  id: string;
  sportId: SportId;
  code: string;
  title: string;
  price: string;
  tag: string;
  imageKey: SportFacilityImageKey;
  icon: SportFacilityIcon;
  actionTarget: SportFacilityActionTarget;
  enabled: boolean;
  sortOrder: number;
  address: string;
  mapLocationUrl: string;
}

export interface Duration {
  label: string;
  value: number;
}

export interface Package {
  id: string;
  label: string;
  price: number;
  per: string;
}

export interface TimeSlot {
  time: string;
  key: string;
  booked: boolean;
  past: boolean;
}

export interface AppState {
  screen: Screen;
  bookingType: BookingType | null;
  selectedDate: string | null;     // ISO date: 'YYYY-MM-DD'
  selectedTime: string | null;     // 'HH:MM'
  durationMins: number;
  selectedSport: SportId | null;
  selectedFacility: SportFacilityCard | null;
  packageOption: string | null;
  isLoggedIn: boolean;
  customerEmail: string;
  userRole: UserRole;
  authToken: string | null;
  payMethod: PayMethod | null;
  slots: TimeSlot[];
  slotsLoading: boolean;
  slotsError: string | null;
  priceSubtotal: number;
  platformFee: number;
  tax: number;
  grandTotal: number;
  receiptId: string;
  paymentStatus: PaymentStatus | null;
  paymentCard: { brand: string; last4: string } | null;
  whatsAppMockSent: boolean;
  paymentError: string | null;
  postLoginRedirect: Screen | null;
}

export type Action =
  | { type: 'SET_SCREEN'; payload: Screen }
  | { type: 'SET_BOOKING_TYPE'; payload: BookingType }
  | { type: 'SET_SELECTED_SPORT'; payload: SportId }
  | { type: 'SET_SELECTED_FACILITY'; payload: SportFacilityCard | null }
  | { type: 'SET_DATE'; payload: string }
  | { type: 'SET_TIME'; payload: string }
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_PACKAGE'; payload: string | null }
  | { type: 'SET_PAY_METHOD'; payload: PayMethod | null }
  | { type: 'SET_LOGGED_IN'; payload: { email: string; token: string; role?: UserRole } }
  | { type: 'SET_USER_ROLE'; payload: UserRole }
  | { type: 'SET_SLOTS_LOADING' }
  | { type: 'SET_SLOTS'; payload: TimeSlot[] }
  | { type: 'SET_SLOTS_ERROR'; payload: string }
  | { type: 'CLEAR_SLOTS_ERROR' }
  | { type: 'SET_PRICING'; payload: { priceSubtotal: number; tax: number; platformFee: number; grandTotal: number } }
  | { type: 'SET_RECEIPT'; payload: string }
  | { type: 'SET_PAYMENT_STATUS'; payload: PaymentStatus }
  | { type: 'SET_PAYMENT_CARD'; payload: { brand: string; last4: string } | null }
  | { type: 'SET_PAYMENT_ERROR'; payload: string | null }
  | { type: 'SET_POST_LOGIN_REDIRECT'; payload: Screen | null }
  | { type: 'MARK_WHATSAPP_SENT' }
  | { type: 'LOG_OUT' }
  | { type: 'RESET' };

export interface BookingPayload {
  bookingType: BookingType;
  sportId: SportId;
  facilityCode: string;
  selectedDate: string;
  selectedTime: string;
  durationMins: number;
  packageOption: string | null;
  payMethod: PayMethod;
  grandTotal: number;
  receiptId: string;
  stripePaymentIntentId?: string;
  customerEmail: string;
  facilityTitle: string | null;
  facilityAddress: string | null;
  facilityImageKey: SportFacilityImageKey | null;
  facilityTag: string | null;
  lockToken?: string | null;
}

export interface StripePaymentIntentPayload {
  bookingType: BookingType;
  sportId?: SportId | null;
  facilityCode?: string | null;
  durationMins: number;
  packageOption: string | null;
  currency?: string;
  receiptId: string;
}

export interface StripeTestPaymentIntentPayload {
  amount: number;
  currency?: string;
  receiptId: string;
}

export interface StripePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface LoginResponse {
  token: string;
  email: string;
}

export interface ProfileResponse {
  fullName: string;
  email: string;
  mobileNumber: string;
}

export interface RegisterPayload {
  name: string;
  mobileNumber: string;
  email: string;
  password: string;
}

export interface SlotsResponse {
  slots: TimeSlot[];
}

export interface AdminSlotBlockPayload {
  sportId: SportId;
  facilityCode: string;
  dates: string[];
  startTime: string;
  endTime: string;
  reason: string;
}

export interface AdminSlotBlockResponse extends AdminSlotBlockPayload {
  blockId: string;
  facilityTitle: string;
  blockedCount: number;
}

export type AdminBlockWeekday = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export interface AdminBlockRule {
  id: string;
  ruleType: 'one-time' | 'recurring';
  sportId: SportId | null;
  facilityCode: string | null;
  facilityTitle: string;
  dates: string[];
  validFrom: string | null;
  validTo: string | null;
  weekdays: AdminBlockWeekday[];
  startTime: string;
  endTime: string;
  reason: string;
  source: 'admin' | 'system-seed' | 'legacy';
  active: boolean;
  editable: boolean;
  createdAt: string;
}

export interface AdminRecurringBlockPayload {
  sportId: SportId;
  facilityCode: string;
  validFrom: string;
  validTo: string;
  weekdays: AdminBlockWeekday[];
  startTime: string;
  endTime: string;
  reason: string;
}

export interface AdminBlockRulesResponse {
  rules: AdminBlockRule[];
}

export interface SportsResponse {
  sports: SportOption[];
}

export interface SportEventsResponse {
  sport: SportOption;
  events: SportEventCard[];
}

export interface SportFacilitiesResponse {
  sport: SportOption;
  facilities: SportFacilityCard[];
}

export interface BookingResponse {
  receiptId: string;
  status: PaymentStatus;
  paymentMethod: 'ONLINE' | 'CASH';
  cardBrand?: string;
  cardLast4?: string;
}

export interface BookingHistoryItem {
  receiptId: string;
  bookingType: BookingType;
  slotDate: string;
  slotTime: string;
  durationMins: number;
  grandTotal: number;
  status: 'confirmed' | 'cash_pending';
  payMethod: PayMethod;
  paymentMethod: 'ONLINE' | 'CASH';
  facilityTitle: string | null;
  facilityAddress: string | null;
  facilityMapLocationUrl: string | null;
  facilityImageKey: SportFacilityImageKey | null;
  facilityTag: string | null;
}

export interface BookingHistoryResponse {
  bookings: BookingHistoryItem[];
}
