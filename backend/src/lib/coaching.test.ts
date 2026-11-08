import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  hasContactDetailsForCoaching,
  computePackageExpiry,
  generateWeeklySessionDates,
  sessionStartsAt,
  singaporeDateOf,
} from './coaching';

describe('singaporeDateOf', () => {
  it('uses the Singapore calendar day, not the UTC one', () => {
    // 20:00 UTC on 1 Nov is already 04:00 on 2 Nov in Singapore.
    expect(singaporeDateOf(new Date('2026-11-01T20:00:00Z'))).toBe('2026-11-02');
  });
});

describe('addDaysToDate', () => {
  it('crosses month and year ends', () => {
    expect(addDaysToDate('2026-11-28', 5)).toBe('2026-12-03');
    expect(addDaysToDate('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('computePackageExpiry', () => {
  it('expires at the end of the Singapore day, validity weeks after purchase', () => {
    const expiry = computePackageExpiry(new Date('2026-11-01T02:00:00Z'), 5);
    expect(expiry.toISOString()).toBe('2026-12-06T15:59:59.999Z'); // 23:59:59.999 SGT on 6 Dec
  });

  it('counts from the Singapore date when the purchase is late in the UTC day', () => {
    const expiry = computePackageExpiry(new Date('2026-11-01T20:00:00Z'), 1);
    expect(expiry.toISOString()).toBe('2026-11-09T15:59:59.999Z');
  });
});

describe('sessionStartsAt', () => {
  it('reads the session time as Singapore time and accepts HH:MM:SS', () => {
    expect(sessionStartsAt('2026-11-02', '18:00:00').toISOString()).toBe('2026-11-02T10:00:00.000Z');
  });
});

describe('generateWeeklySessionDates', () => {
  const monday = { id: 'mon', dayOfWeek: 1 };
  const saturday = { id: 'sat', dayOfWeek: 6 };

  it('creates one session per matching weekday for the given number of weeks', () => {
    // 2026-11-01 is a Sunday.
    expect(generateWeeklySessionDates([monday], '2026-11-01', 4)).toEqual([
      { templateId: 'mon', sessionDate: '2026-11-02' },
      { templateId: 'mon', sessionDate: '2026-11-09' },
      { templateId: 'mon', sessionDate: '2026-11-16' },
      { templateId: 'mon', sessionDate: '2026-11-23' },
    ]);
  });

  it('includes today when today is a session day', () => {
    expect(generateWeeklySessionDates([monday], '2026-11-02', 1)).toEqual([
      { templateId: 'mon', sessionDate: '2026-11-02' },
    ]);
  });

  it('handles several templates without duplicates', () => {
    const dates = generateWeeklySessionDates([monday, saturday], '2026-11-01', 2);
    expect(dates).toHaveLength(4);
    expect(new Set(dates.map((d) => `${d.templateId}|${d.sessionDate}`)).size).toBe(4);
  });

  it('returns nothing when there are no templates', () => {
    expect(generateWeeklySessionDates([], '2026-11-01', 4)).toEqual([]);
  });
});

describe('hasContactDetailsForCoaching', () => {
  it('accepts a real name and mobile number', () => {
    expect(hasContactDetailsForCoaching({ fullName: 'Tan Wei Ming', mobileNumber: '+6591234567' })).toBe(true);
  });

  it.each([
    ['the signup placeholder name', { fullName: 'User', mobileNumber: '+6591234567' }],
    ['the signup placeholder mobile', { fullName: 'Tan Wei Ming', mobileNumber: '+6500000000' }],
    ['a blank name', { fullName: '   ', mobileNumber: '+6591234567' }],
    ['a missing mobile', { fullName: 'Tan Wei Ming', mobileNumber: null }],
    ['a placeholder with spaces around it', { fullName: ' User ', mobileNumber: '+6591234567' }],
  ])('rejects %s', (_label, user) => {
    expect(hasContactDetailsForCoaching(user)).toBe(false);
  });
});
