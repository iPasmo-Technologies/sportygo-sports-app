import type { CoachingPackage, CoachingPurchase, CoachingSession, ProfileResponse, Screen, SportId } from '@/types';
import { ApiError } from './api';
import { formatDateShort, toSgtIsoDate } from './utils';

// ─── Labels ──────────────────────────────────────────────────

const SPORT_LABELS: Record<SportId, string> = {
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
};

// Sports whose coaching card is turned on (data migration 001-enable-coaching-cards).
export const COACHING_SPORT_IDS: SportId[] = ['cricket', 'indoor-cricket', 'pickleball'];

export function sportLabel(sportId: SportId): string {
  return SPORT_LABELS[sportId] ?? sportId;
}

export function noPackagesMessage(sportId: SportId): string {
  return `No available packages at this moment for ${sportLabel(sportId)}`;
}

// What the customer pays per session, fees included, so packages compare fairly.
export function pricePerSession(pkg: Pick<CoachingPackage, 'sessionCount' | 'pricing'>): number {
  if (pkg.sessionCount <= 0) return 0;
  return Math.round((pkg.pricing.grandTotal / pkg.sessionCount) * 100) / 100;
}

export function validityLabel(weeks: number): string {
  return `Valid for ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
}

export function sessionsLabel(count: number): string {
  return `${count} ${count === 1 ? 'session' : 'sessions'}`;
}

// The server sends expiry as a UTC timestamp; customers think in Singapore dates.
export function formatExpiryDate(expiresAtIso: string): string {
  return formatDateShort(toSgtIsoDate(new Date(expiresAtIso)));
}

function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${to12Hour(startTime)} - ${to12Hour(endTime)}`;
}

export function sessionDurationMinutes(startTime: string, endTime: string): number {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  return Math.max(0, toMinutes(endTime) - toMinutes(startTime));
}

export function spotsLeftLabel(session: Pick<CoachingSession, 'spots' | 'spotsLeft'>): string {
  return `${Math.max(0, session.spotsLeft)} / ${session.spots} spots left`;
}

export type SessionDayGroup = { date: string; sessions: CoachingSession[] };

export function groupSessionsByDate(sessions: CoachingSession[]): SessionDayGroup[] {
  const sorted = [...sessions].sort((a, b) =>
    a.sessionDate === b.sessionDate ? a.startTime.localeCompare(b.startTime) : a.sessionDate.localeCompare(b.sessionDate));
  const groups: SessionDayGroup[] = [];
  for (const session of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === session.sessionDate) last.sessions.push(session);
    else groups.push({ date: session.sessionDate, sessions: [session] });
  }
  return groups;
}

// Date search on the Book Session screen: only sessions on that day the user can still book
// (a spot is free and they don't already have one).
export function bookableSessionsOn(sessions: CoachingSession[], date: string): CoachingSession[] {
  return sessions
    .filter((session) => session.sessionDate === date && session.spotsLeft > 0 && !session.bookedByMe)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// The range the date picker allows: today (Singapore) up to the last scheduled session.
export function sessionSearchRange(sessions: CoachingSession[], today: string): { min: string; max: string } {
  const lastDate = sessions.reduce((latest, session) => (session.sessionDate > latest ? session.sessionDate : latest), today);
  return { min: today, max: lastDate };
}

// ─── Required details ────────────────────────────────────────

// The values signup stores when the user skipped them; same as backend/src/lib/coaching.ts.
const PLACEHOLDER_FULL_NAME = 'User';
const PLACEHOLDER_MOBILE_NUMBER = '+6500000000';

export function hasContactDetailsForCoaching(profile: Pick<ProfileResponse, 'fullName' | 'mobileNumber'>): boolean {
  const fullName = profile.fullName.trim();
  const mobileNumber = profile.mobileNumber.trim();
  return fullName.length > 0 && fullName !== PLACEHOLDER_FULL_NAME
    && mobileNumber.length > 0 && mobileNumber !== PLACEHOLDER_MOBILE_NUMBER;
}

// ─── Navigation guard ────────────────────────────────────────

export type CoachGuardState = {
  screen: Screen;
  isLoggedIn: boolean;
  selectedCoachPackage: CoachingPackage | null;
  coachPurchase: CoachingPurchase | null;
};

export type CoachGuardResult =
  | { kind: 'allow' }
  | { kind: 'block' }
  | { kind: 'login'; returnTo: Screen };

const COACH_LOGIN_SCREENS: Screen[] = ['coach-terms', 'coach-checkout', 'coach-sessions'];

// Returns null for screens outside the coaching flow so AppContext applies its own rules.
export function coachNavigationGuard(target: Screen, state: CoachGuardState): CoachGuardResult | null {
  if (!target.startsWith('coach-')) return null;

  if ((target === 'coach-terms' || target === 'coach-checkout') && !state.selectedCoachPackage) {
    return { kind: 'block' };
  }
  if (target === 'coach-success' && (state.screen !== 'coach-checkout' || !state.coachPurchase)) {
    return { kind: 'block' };
  }
  if (COACH_LOGIN_SCREENS.includes(target) && !state.isLoggedIn) {
    return { kind: 'login', returnTo: target };
  }
  return { kind: 'allow' };
}

// ─── Card image ──────────────────────────────────────────────

// `images` is the result of import.meta.glob over coach_*.png. A sport whose picture has not been
// added yet gets the fallback, so a missing file never breaks the build.
export function pickCoachImage(sportId: SportId, images: Record<string, string>, fallback: string): string {
  const fileName = `/coach_${sportId.replace(/-/g, '_')}.png`;
  const key = Object.keys(images).find((path) => path.endsWith(fileName));
  return key ? images[key] : fallback;
}

// ─── Retry after payment ─────────────────────────────────────

// Only "could not reach the server" failures are worth retrying; a 4xx answer will not change.
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  return error instanceof TypeError;
}

export async function retryWhenUnreachable<T>(
  action: () => Promise<T>,
  attempts = 3,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) break;
      await wait(attempt * 1000);
    }
  }
  throw lastError;
}
