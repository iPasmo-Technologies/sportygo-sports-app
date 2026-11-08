// ─── Date helpers ────────────────────────────────────────────

const SINGAPORE_TIME_ZONE = 'Asia/Singapore';

function formatDateParts(date: Date): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SINGAPORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
}

function formatTimeParts(date: Date): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: SINGAPORE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
}

export function toSgtIsoDate(date: Date): string {
  const parts = Object.fromEntries(formatDateParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatSgtTime(date: Date): string {
  const parts = Object.fromEntries(formatTimeParts(date).map((part) => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}`;
}

// Midnight in Singapore, `days` and `months` after today's Singapore date. The arithmetic runs on
// UTC dates, not the browser's clock, so a visitor's own time zone or daylight saving can't shift the day.
function sgtDateFromToday(days: number, months = 0): Date {
  const [year, month, day] = toSgtIsoDate(new Date()).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, day + days));
  return new Date(`${shifted.toISOString().slice(0, 10)}T00:00:00+08:00`);
}

export function rollingDates(days = 14, startOffset = 0): Date[] {
  return Array.from({ length: days }, (_, i) => sgtDateFromToday(startOffset + i));
}

export function rollingDatesForMonths(months = 3): Date[] {
  const end = sgtDateFromToday(0, months);

  const dates: Date[] = [];
  for (let i = 0, date = sgtDateFromToday(0); date < end; i += 1, date = sgtDateFromToday(i)) {
    dates.push(date);
  }

  return dates;
}

export function toISO(d: Date): string {
  return toSgtIsoDate(d);
}

export function formatDateLong(dateStr: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: SINGAPORE_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateStr}T00:00:00+08:00`));
}

export function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    timeZone: SINGAPORE_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${dateStr}T00:00:00+08:00`));
}

// ─── Receipt ID generator ────────────────────────────────────

export function makeReceiptId(): string {
  const year = toSgtIsoDate(new Date()).slice(2, 4);
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomValues = new Uint8Array(6);
  crypto.getRandomValues(randomValues);
  const suffix = Array.from(randomValues, (value) => characters[value % characters.length]).join('');
  return `SGO-${year}${suffix}`;
}

// ─── Clipboard ───────────────────────────────────────────────

// navigator.clipboard only exists on HTTPS and localhost. The dev server is also opened by LAN IP
// (e.g. testing on a phone), so fall back to the older copy command there. Returns whether it worked.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or not focused: try the fallback below.
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  try {
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

// ─── ARIA live announcer ─────────────────────────────────────

export function announce(msg: string): void {
  const el = document.getElementById('a11y-live');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}
