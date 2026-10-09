import type {
  AdminSlotBlockPayload,
  AdminSlotBlockResponse,
  AdminBlockRulesResponse,
  AdminRecurringBlockPayload,
  AdminBlockWeekday,
  AdminBookingsResponse,
  AdminUsersResponse,
  BookingCancellationResponse,
  BookingHistoryResponse,
  BookingPayload,
  BookingResponse,
  BookingRescheduleResponse,
  LoginResponse,
  ProfileResponse,
  RegisterPayload,
  SlotsResponse,
  SportFacilitiesResponse,
  SportEventTemplate,
  SportEventsResponse,
  SportsResponse,
  StripePaymentIntentPayload,
  StripePaymentIntentResponse,
  StripeTestPaymentIntentPayload,
  SportId,
} from '@/types';
import { markLocalBooked, mergeWithLocalBooked, unmarkLocalBooked } from './localBookedSlots';
import { encryptPasswordForTransport } from './authCrypto';
import fallbackSports from '@/data/json/sports.json';
import fallbackSportEvents from '@/data/json/sport-events.json';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const CATALOG_FALLBACK_ENABLED = import.meta.env.VITE_ENABLE_CATALOG_FALLBACK === 'true';
let cachedSportsRequest: Promise<SportsResponse> | null = null;
const cachedSportEventsRequest = new Map<SportId, Promise<SportEventsResponse>>();
const cachedSportFacilitiesRequest = new Map<SportId, Promise<SportFacilitiesResponse>>();
const SINGAPORE_TIME_ZONE = 'Asia/Singapore';

function resolveCatalogTemplate(template: string, sportLabel: string): string {
  return template
    .replace(/\{sportLower\}/g, sportLabel.toLowerCase())
    .replace(/\{sport\}/g, sportLabel);
}

function buildFallbackSports(): SportsResponse {
  return { sports: fallbackSports as SportsResponse['sports'] };
}

function buildFallbackSportEvents(sportId: SportId): SportEventsResponse {
  const sports = fallbackSports as SportsResponse['sports'];
  const sport = sports.find((item) => item.id === sportId) ?? sports[0];
  const templates = fallbackSportEvents as SportEventTemplate[];
  return {
    sport,
    events: templates
      .filter((event) => event.sportId === sport.id)
      .map((event) => ({
        id: event.id,
        sportId: event.sportId,
        title: resolveCatalogTemplate(event.titleTemplate, sport.label),
        description: resolveCatalogTemplate(event.descriptionTemplate, sport.label),
        imageKey: event.imageKey,
        icon: event.icon,
        actionTarget: event.actionTarget,
        enabled: event.enabled,
        sortOrder: event.sortOrder,
      })),
  };
}

type SingaporeDateTimeParts = {
  date: string;
  time: string;
};

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message);
}

function isUnavailableApiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /request failed:\s*(404|5\d\d)/i.test(error.message);
}

function isAuthTokenError(error: unknown): boolean {
  return error instanceof Error && /invalid or expired token/i.test(error.message);
}

function isPreBooked(sportId: SportId, facilityCode: string, date: string, time: string): boolean {
  let hash = 0;
  const seed = `${sportId}_${facilityCode}_${date}_${time}`;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(hash) % 4 === 0;
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function currentSingaporeDateTimeParts(base = new Date()): SingaporeDateTimeParts {
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: SINGAPORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base).map((part) => [part.type, part.value]));

  const timeParts = Object.fromEntries(new Intl.DateTimeFormat('en-SG', {
    timeZone: SINGAPORE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(base).map((part) => [part.type, part.value]));

  return {
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    time: `${timeParts.hour}:${timeParts.minute}`,
  };
}

function isPastOrCurrentSlot(date: string, time: string, reference: SingaporeDateTimeParts = currentSingaporeDateTimeParts()): boolean {
  return date === reference.date && toMinutes(time) <= toMinutes(reference.time);
}

function hasAvailabilityException2026(date: string, sportId: SportId, facilityCode: string, dayOfWeek: number): boolean {
  const isConfiguredFacility = sportId === 'cricket'
    ? ['bowling-lane', 'net-2', 'net-3', 'net-4', 'indoor-court', 'outdoor-field'].includes(facilityCode)
    : sportId === 'pickleball' && ['indoor-court', 'outdoor-field'].includes(facilityCode);
  if (!isConfiguredFacility) return false;
  if (date === '2026-08-10' || date === '2026-11-09') return true;
  return date >= '2026-12-01' && date <= '2026-12-31' && dayOfWeek >= 1 && dayOfWeek <= 5;
}

function isAcademyBlocked2026(date: string, sportId: SportId, facilityCode: string, time: string, dayOfWeek: number): boolean {
  if (sportId !== 'cricket' || date < '2026-01-01' || date > '2026-12-31') return false;
  const minutes = toMinutes(time);
  const inRange = (start: string, end: string) => minutes >= toMinutes(start) && minutes < toMinutes(end);

  if (facilityCode === 'bowling-lane' && dayOfWeek === 6) {
    return inRange('08:00', '10:00') || inRange('16:00', '18:00');
  }
  if (['net-2', 'net-3', 'net-4'].includes(facilityCode)) {
    if (dayOfWeek === 3 || dayOfWeek === 5) return inRange('16:00', '18:00');
    if (dayOfWeek === 6) return inRange('08:00', '10:00') || inRange('13:30', '18:00');
    if (dayOfWeek === 0) return inRange('08:00', '10:00') || inRange('16:00', '18:00');
  }
  return facilityCode === 'indoor-court' && dayOfWeek === 6 && inRange('16:00', '18:00');
}

function buildLocalSlots(date: string, sportId: SportId, facilityCode: string): SlotsResponse {
  const slots: SlotsResponse['slots'] = [];
  const currentDateTime = currentSingaporeDateTimeParts();
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const startHour = dayOfWeek === 0 || dayOfWeek === 6 || hasAvailabilityException2026(date, sportId, facilityCode, dayOfWeek) ? 8 : 16;

  for (let h = startHour; h < 19; h++) {
    for (let m = 0; m < 60; m += 30) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const past = isPastOrCurrentSlot(date, time, currentDateTime);
      slots.push({
        time,
        key: `${sportId}_${facilityCode}_${date}_${time}`,
        booked: isAcademyBlocked2026(date, sportId, facilityCode, time, dayOfWeek)
          || isPreBooked(sportId, facilityCode, date, time),
        past,
      });
    }
  }

  return { slots };
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, {
    // Bypass HTTP caches (browser, mobile carrier proxies, CDNs) so stale payloads never linger.
    cache: 'no-store',
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError((body as { error?: string }).error ?? `Request failed: ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────

export async function loginUser(loginId: string, password: string): Promise<LoginResponse> {
  const encryptedPassword = await encryptPasswordForTransport(password);

  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginId, encryptedPassword }),
  });
}

export async function fetchProfile(token: string): Promise<ProfileResponse> {
  return request<ProfileResponse>('/api/auth/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateProfile(token: string, fullName: string, mobileNumber: string, clubs?: string): Promise<ProfileResponse> {
  return request<ProfileResponse>('/api/auth/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fullName, mobileNumber, clubs }),
  });
}

export async function registerUser(payload: RegisterPayload): Promise<LoginResponse> {
  const encryptedPassword = await encryptPasswordForTransport(payload.password);

  return request<LoginResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email,
      name: payload.name,
      mobileNumber: payload.mobileNumber,
      encryptedPassword,
      clubs: payload.clubs,
    }),
  });
}

export async function resetPassword(loginId: string, password: string): Promise<{ message: string }> {
  const encryptedPassword = await encryptPasswordForTransport(password);

  return request<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ loginId, encryptedPassword }),
  });
}

export async function requestPasswordResetCode(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/auth/forgot-password/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyPasswordResetCode(email: string, code: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/auth/forgot-password/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function resetPasswordWithCode(email: string, code: string, password: string): Promise<{ message: string }> {
  const encryptedPassword = await encryptPasswordForTransport(password);

  return request<{ message: string }>('/api/auth/forgot-password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, code, encryptedPassword }),
  });
}

// ─── Clubs ────────────────────────────────────────────────────
export async function fetchClubs(): Promise<Record<string, string>> {
  return request<Record<string, string>>('/api/auth/clubs', {
    method: 'GET',
  });
}

// ─── Slots ────────────────────────────────────────────────────

export async function fetchSlots(date: string, sportId: SportId, facilityCode: string): Promise<SlotsResponse> {
  let response: SlotsResponse;
  try {
    const query = new URLSearchParams({ date, sportId, facilityCode });
    response = await request<SlotsResponse>(`/api/slots?${query.toString()}`);
  } catch (error) {
    // Keep Schedule usable in demo/dev when backend is temporarily unavailable.
    if (!isNetworkError(error) && !isUnavailableApiError(error)) throw error;
    response = buildLocalSlots(date, sportId, facilityCode);
  }

  return {
    slots: mergeWithLocalBooked(sportId, facilityCode, date, response.slots),
  };
}

export async function blockSlotsForAdmin(
  payload: AdminSlotBlockPayload,
  token: string
): Promise<AdminSlotBlockResponse> {
  return request<AdminSlotBlockResponse>('/api/slots/block', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminBlockRules(token: string): Promise<AdminBlockRulesResponse> {
  return request<AdminBlockRulesResponse>('/api/slots/blocks', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchAdminUsers(token: string): Promise<AdminUsersResponse> {
  return request<AdminUsersResponse>('/api/auth/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function resendUserPasscode(email: string, token: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/auth/users/resend-passcode', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
  });
}

export async function extendUserPasscodeExpiry(email: string, token: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/auth/users/extend-passcode', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
  });
}

export async function createAdminRecurringBlocks(
  payload: AdminRecurringBlockPayload,
  token: string
): Promise<AdminBlockRulesResponse> {
  return request<AdminBlockRulesResponse>('/api/slots/blocks/recurring', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateAdminRecurringBlock(
  id: string,
  payload: Omit<AdminRecurringBlockPayload, 'sportId' | 'facilityCode' | 'weekdays'> & { weekday: AdminBlockWeekday },
  token: string
): Promise<AdminBlockRulesResponse> {
  return request<AdminBlockRulesResponse>(`/api/slots/blocks/recurring/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function deactivateAdminRecurringBlock(id: string, token: string): Promise<AdminBlockRulesResponse> {
  return request<AdminBlockRulesResponse>(`/api/slots/blocks/recurring/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ─── Sports ──────────────────────────────────────────────────

export async function fetchSports(): Promise<SportsResponse> {
  if (!cachedSportsRequest) {
    cachedSportsRequest = request<SportsResponse>('/api/sports')
      .catch((error) => {
        if (!CATALOG_FALLBACK_ENABLED) throw error;
        return buildFallbackSports();
      })
      .finally(() => {
        cachedSportsRequest = null;
      });
  }

  return cachedSportsRequest;
}

export async function fetchSportEvents(sportId: SportId): Promise<SportEventsResponse> {
  const cachedRequest = cachedSportEventsRequest.get(sportId);
  if (cachedRequest) {
    return cachedRequest;
  }

  const requestPromise = request<SportEventsResponse>(`/api/sports/${encodeURIComponent(sportId)}/events`)
    .catch((error) => {
      if (!CATALOG_FALLBACK_ENABLED) throw error;
      return buildFallbackSportEvents(sportId);
    })
    .finally(() => {
      cachedSportEventsRequest.delete(sportId);
    });

  cachedSportEventsRequest.set(sportId, requestPromise);
  return requestPromise;
}

export async function fetchSportFacilities(sportId: SportId): Promise<SportFacilitiesResponse> {
  const cachedRequest = cachedSportFacilitiesRequest.get(sportId);
  if (cachedRequest) {
    return cachedRequest;
  }

  const requestPromise = request<SportFacilitiesResponse>(`/api/sports/${encodeURIComponent(sportId)}/facilities`)
    .then((response) => {
      const enabledResponse = {
        ...response,
        facilities: response.facilities.filter((facility) => facility.enabled),
      };
      return enabledResponse;
    })
    .finally(() => {
      cachedSportFacilitiesRequest.delete(sportId);
    });

  cachedSportFacilitiesRequest.set(sportId, requestPromise);
  return requestPromise;
}

// ─── Bookings ─────────────────────────────────────────────────

export interface SlotReservationResponse {
  lockToken: string;
  expiresAt: string;
}

export async function reserveSlotForBooking(
  payload: { sportId: SportId; facilityCode: string; selectedDate: string; selectedTime: string; durationMins: number },
  token: string
): Promise<SlotReservationResponse> {
  return request<SlotReservationResponse>('/api/slots/reserve', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function releaseSlotReservation(lockToken: string, token: string): Promise<void> {
  // Best-effort: lock expires automatically if this fails
  await request('/api/slots/release', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lockToken }),
  }).catch(() => undefined);
}

export async function createStripePaymentIntent(
  payload: StripePaymentIntentPayload,
  token: string
): Promise<StripePaymentIntentResponse> {
  return request<StripePaymentIntentResponse>('/api/payments/stripe/payment-intent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function createStripeTestPaymentIntent(
  payload: StripeTestPaymentIntentPayload,
  token: string
): Promise<StripePaymentIntentResponse> {
  return request<StripePaymentIntentResponse>('/api/payments/stripe/test-payment-intent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function createBooking(
  payload: BookingPayload,
  token: string
): Promise<BookingResponse> {
  // Block the slot first on the client to satisfy booking-first workflow.
  markLocalBooked(payload.sportId, payload.facilityCode, payload.selectedDate, payload.selectedTime);

  try {
    return await request<BookingResponse>('/api/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Temporary UX fallback: allow checkout demo flow when JWT has expired.
    if (isAuthTokenError(error)) {
      return {
        receiptId: payload.receiptId,
        status: 'success',
        paymentMethod: 'ONLINE',
      };
    }

    // If transport fails, keep slot blocked and fall back to cash payment path.
    if (isNetworkError(error)) {
      return {
        receiptId: payload.receiptId,
        status: 'cash',
        paymentMethod: 'CASH',
      };
    }
    throw error;
  }
}

export async function createMockBooking(
  payload: BookingPayload,
  token: string
): Promise<BookingResponse> {
  markLocalBooked(payload.sportId, payload.facilityCode, payload.selectedDate, payload.selectedTime);
  return request<BookingResponse>('/api/bookings/mock', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function fetchMyBookings(token: string): Promise<BookingHistoryResponse> {
  try {
    return await request<BookingHistoryResponse>('/api/bookings', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (isNetworkError(error)) {
      return { bookings: [] };
    }
    throw error;
  }
}

export async function fetchAdminBookings(token: string): Promise<AdminBookingsResponse> {
  return request<AdminBookingsResponse>('/api/bookings/admin', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function cancelMyBooking(
  booking: { receiptId: string; sportId: SportId; facilityCode: string; slotDate: string; slotTime: string },
  token: string
): Promise<BookingCancellationResponse> {
  const response = await request<BookingCancellationResponse>(`/api/bookings/${encodeURIComponent(booking.receiptId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  unmarkLocalBooked(booking.sportId, booking.facilityCode, booking.slotDate, booking.slotTime.slice(0, 5));
  return response;
}

export async function rescheduleMyBooking(
  booking: { receiptId: string; sportId: SportId; facilityCode: string; slotDate: string; slotTime: string },
  selectedDate: string,
  selectedTime: string,
  token: string
): Promise<BookingRescheduleResponse> {
  const response = await request<BookingRescheduleResponse>(`/api/bookings/${encodeURIComponent(booking.receiptId)}/reschedule`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ selectedDate, selectedTime }),
  });
  unmarkLocalBooked(booking.sportId, booking.facilityCode, booking.slotDate, booking.slotTime.slice(0, 5));
  markLocalBooked(booking.sportId, booking.facilityCode, selectedDate, selectedTime);
  return response;
}
