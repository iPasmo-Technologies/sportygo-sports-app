// ─── Date helpers ────────────────────────────────────────────

const SINGAPORE_TIME_ZONE = 'Asia/Singapore';

function getSgtCalendarDate(base = new Date()): Date {
  const iso = toSgtIsoDate(base);
  return new Date(`${iso}T00:00:00+08:00`);
}

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

export function rollingDates(days = 14, startOffset = 0): Date[] {
  const today = getSgtCalendarDate();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + startOffset + i);
    return d;
  });
}

export function rollingDatesForMonths(months = 3): Date[] {
  const start = getSgtCalendarDate();
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);

  const dates: Date[] = [];
  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(new Date(cursor));
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
