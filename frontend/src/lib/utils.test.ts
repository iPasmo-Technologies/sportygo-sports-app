import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  announce,
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

describe('rollingDatesForMonths', () => {
  it('returns every day from today up to the same day next month', () => {
    setNow('2026-11-01T02:00:00Z');
    const dates = rollingDatesForMonths(1).map(toISO);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-11-01');
    expect(dates.at(-1)).toBe('2026-11-30');
  });

  it('covers 3 months by default', () => {
    setNow('2026-01-01T02:00:00Z');
    const dates = rollingDatesForMonths().map(toISO);
    expect(dates[0]).toBe('2026-01-01');
    expect(dates.at(-1)).toBe('2026-03-31');
    expect(dates).toHaveLength(90);
  });

  it('has no duplicate or missing days', () => {
    setNow('2026-02-15T02:00:00Z');
    const dates = rollingDatesForMonths(2).map(toISO);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toContain('2026-02-28');
    expect(dates).toContain('2026-03-01');
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
