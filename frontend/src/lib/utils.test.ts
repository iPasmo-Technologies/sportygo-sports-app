import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  announce,
  copyText,
  formatDateLong,
  formatDateShort,
  formatSgtTime,
  makeReceiptId,
  rollingDates,
  rollingDatesForMonths,
  toISO,
  toSgtIsoDate,
} from '@/lib/utils';

// All dates are Singapore time (UTC+8, no daylight saving).
function setNow(isoUtc: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(isoUtc));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('toSgtIsoDate / toISO', () => {
  it.each([
    ['2026-01-01T00:00:00Z', '2026-01-01'],
    ['2026-01-01T15:59:59Z', '2026-01-01'], // 23:59:59 in Singapore
    ['2026-01-01T16:00:00Z', '2026-01-02'], // midnight in Singapore: next day
    ['2026-12-31T16:00:00Z', '2027-01-01'], // year rollover
    ['2028-02-28T16:00:00Z', '2028-02-29'], // leap day
  ])('%s is %s in Singapore', (utc, expected) => {
    expect(toSgtIsoDate(new Date(utc))).toBe(expected);
    expect(toISO(new Date(utc))).toBe(expected);
  });
});

describe('formatSgtTime', () => {
  it.each([
    ['2026-01-01T16:00:00Z', '00:00'],
    ['2026-01-01T01:05:00Z', '09:05'],
    ['2026-01-01T04:30:00Z', '12:30'],
    ['2026-01-01T15:59:00Z', '23:59'],
  ])('%s is %s in Singapore', (utc, expected) => {
    expect(formatSgtTime(new Date(utc))).toBe(expected);
  });
});

describe('formatDateLong / formatDateShort', () => {
  it.each([
    ['2026-11-01', 'Sunday, 1 November 2026', 'Sun, 1 Nov 2026'],
    ['2026-01-01', 'Thursday, 1 January 2026', 'Thu, 1 Jan 2026'],
    ['2028-02-29', 'Tuesday, 29 February 2028', 'Tue, 29 Feb 2028'],
  ])('%s', (date, long, short) => {
    expect(formatDateLong(date)).toBe(long);
    expect(formatDateShort(date)).toBe(short);
  });

  it('throws for an invalid date string', () => {
    expect(() => formatDateLong('not-a-date')).toThrow(RangeError);
    expect(() => formatDateShort('2026-13-45')).toThrow(RangeError);
  });
});

describe('rollingDates', () => {
  it('returns 14 days starting today by default', () => {
    setNow('2026-11-01T02:00:00Z');
    const dates = rollingDates().map(toISO);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe('2026-11-01');
    expect(dates[13]).toBe('2026-11-14');
  });

  it('uses the Singapore date, not the UTC date, late at night', () => {
    setNow('2026-01-30T17:00:00Z'); // 01:00 on 31 Jan in Singapore, still 30 Jan in UTC
    expect(toISO(rollingDates(1)[0])).toBe('2026-01-31');
  });

  it('crosses a month boundary', () => {
    setNow('2026-01-30T02:00:00Z');
    expect(rollingDates(3).map(toISO)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01']);
  });

  it('crosses a year boundary', () => {
    setNow('2026-12-31T02:00:00Z');
    expect(rollingDates(2).map(toISO)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('applies a start offset', () => {
    setNow('2026-11-01T02:00:00Z');
    expect(rollingDates(2, 1).map(toISO)).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('returns an empty list for 0 days', () => {
    expect(rollingDates(0)).toEqual([]);
  });
});

// Calendar facts worked out on their own (UTC has no daylight saving), so the tests don't
// depend on hand-counted lengths: months have 28, 29, 30 or 31 days.
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function nextIsoDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return isoDate(year, month - 1, day + 1);
}

function expectConsecutiveDays(dates: string[], label: string) {
  for (let i = 1; i < dates.length; i += 1) {
    expect(dates[i], `${label}: entry ${i}`).toBe(nextIsoDay(dates[i - 1]));
  }
}

// An ordinary year and a leap year, on the first, middle and 28th of every month. Days 29-31 are
// left out on purpose: "the same date next month" doesn't exist for them (e.g. 31 Jan -> 31 Feb).
const MONTH_START_DATES = [2026, 2028].flatMap((year) =>
  Array.from({ length: 12 }, (_, monthIndex) => [1, 15, 28].map((day) => ({ year, monthIndex, day }))).flat());

// Customers (and CI) may run in any time zone; the booking calendar must still follow Singapore days.
describe.each(['Asia/Singapore', 'UTC', 'America/New_York'])('date lists when the browser is in %s', (timeZone) => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = timeZone;
  });

  afterEach(() => {
    // Assigning undefined would store the text "undefined", so remove the setting instead.
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it.each([1, 2, 3])('rollingDatesForMonths(%i) covers every day up to the same date that many months later', (months) => {
    for (const { year, monthIndex, day } of MONTH_START_DATES) {
      const today = isoDate(year, monthIndex, day);
      setNow(`${today}T02:00:00Z`); // 10:00 in Singapore
      const dates = rollingDatesForMonths(months).map(toISO);

      // From day D of one month to day D of the next is exactly that month's length.
      const expectedLength = Array.from({ length: months }, (_, i) => daysInMonth(year, monthIndex + i))
        .reduce((sum, length) => sum + length, 0);

      expect(dates, `starting ${today}`).toHaveLength(expectedLength);
      expect(dates[0], `starting ${today}`).toBe(today);
      expect(nextIsoDay(dates.at(-1)!), `starting ${today}`).toBe(isoDate(year, monthIndex + months, day));
      expectConsecutiveDays(dates, `starting ${today}`);
    }
  });

  it('rollingDatesForMonths covers 3 months by default', () => {
    setNow('2028-02-15T02:00:00Z');
    expect(rollingDatesForMonths().map(toISO)).toEqual(rollingDatesForMonths(3).map(toISO));
  });

  it('rollingDates gives one entry per Singapore day from any day of the year, including daylight-saving changes', () => {
    for (let dayOfYear = 0; dayOfYear < 365; dayOfYear += 1) {
      const today = isoDate(2026, 0, 1 + dayOfYear);
      setNow(`${today}T02:00:00Z`);
      const dates = rollingDates(14).map(toISO);
      expect(dates, `starting ${today}`).toHaveLength(14);
      expect(dates[0], `starting ${today}`).toBe(today);
      expectConsecutiveDays(dates, `starting ${today}`);
    }
  });
});

describe('makeReceiptId', () => {
  it('has the format SGO-<2-digit year><6 uppercase letters/digits>', () => {
    setNow('2026-11-01T02:00:00Z');
    expect(makeReceiptId()).toMatch(/^SGO-26[A-Z0-9]{6}$/);
  });

  it('uses the Singapore year at New Year', () => {
    setNow('2026-12-31T16:30:00Z'); // 00:30 on 1 Jan 2027 in Singapore
    expect(makeReceiptId()).toMatch(/^SGO-27/);
  });

  it('does not repeat across many calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => makeReceiptId()));
    expect(ids.size).toBe(1000);
  });
});

describe('announce', () => {
  it('writes the message into the live region on the next frame', () => {
    document.body.innerHTML = '<div id="a11y-live">old message</div>';
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });

    announce('Slot selected');
    const region = document.getElementById('a11y-live')!;
    expect(region.textContent).toBe(''); // cleared first so screen readers re-announce
    frame?.(0);
    expect(region.textContent).toBe('Slot selected');
  });

  it('does nothing when the live region is missing', () => {
    expect(() => announce('No region')).not.toThrow();
  });
});

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'execCommand');
  });

  function stubClipboard(writeText: ((text: string) => Promise<void>) | null) {
    vi.stubGlobal('navigator', { ...navigator, clipboard: writeText ? { writeText } : undefined });
  }

  it('uses the clipboard API when the page is secure', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await expect(copyText('SGO-26ABC123')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('SGO-26ABC123');
  });

  it('falls back to the copy command when the clipboard API is missing (http on a LAN IP)', async () => {
    stubClipboard(null);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    await expect(copyText('SGO-26ABC123')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back when the clipboard API refuses', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(true), configurable: true });
    await expect(copyText('x')).resolves.toBe(true);
  });

  it('reports failure when nothing can copy', async () => {
    stubClipboard(null);
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true });
    await expect(copyText('x')).resolves.toBe(false);
  });
});
