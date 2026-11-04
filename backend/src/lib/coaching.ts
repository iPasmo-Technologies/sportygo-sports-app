// Pure coaching rules (no database), so they can be unit-tested directly.

export const COACHING_SESSION_WEEKS_AHEAD = 4;
export const COACHING_MAX_SPOTS = 50;
// When an admin cancels a session and the credit's package has already expired,
// the credit is given this many extra days so it can still be used.
export const COACHING_REFUND_EXTENSION_DAYS = 7;

const SINGAPORE_TIME_ZONE = 'Asia/Singapore';
const SINGAPORE_UTC_OFFSET = '+08:00';

export type WeeklySessionTemplate = {
  id: string;
  dayOfWeek: number;
};

export type GeneratedSessionDate = {
  templateId: string;
  sessionDate: string;
};

export function singaporeDateOf(instant: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: SINGAPORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant).map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysToDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function dayOfWeekForDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// A package bought on any day of 1 Nov with 5 weeks validity can be used until 23:59:59.999 SGT on 6 Dec.
export function computePackageExpiry(purchasedAt: Date, validityWeeks: number): Date {
  const lastDay = addDaysToDate(singaporeDateOf(purchasedAt), validityWeeks * 7);
  return new Date(`${lastDay}T23:59:59.999${SINGAPORE_UTC_OFFSET}`);
}

export function sessionStartsAt(sessionDate: string, startTime: string): Date {
  return new Date(`${sessionDate}T${startTime.slice(0, 5)}:00${SINGAPORE_UTC_OFFSET}`);
}

// Every date from `fromDate` for `weeks` weeks on which a template runs. Re-running it gives the
// same list, and the database's unique key skips sessions that already exist.
export function generateWeeklySessionDates(
  templates: WeeklySessionTemplate[],
  fromDate: string,
  weeks: number = COACHING_SESSION_WEEKS_AHEAD
): GeneratedSessionDate[] {
  const generated: GeneratedSessionDate[] = [];
  for (let offset = 0; offset < weeks * 7; offset++) {
    const sessionDate = addDaysToDate(fromDate, offset);
    const dayOfWeek = dayOfWeekForDate(sessionDate);
    for (const template of templates) {
      if (template.dayOfWeek === dayOfWeek) {
        generated.push({ templateId: template.id, sessionDate });
      }
    }
  }
  return generated;
}
