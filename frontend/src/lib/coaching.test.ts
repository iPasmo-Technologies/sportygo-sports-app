import { describe, expect, it, vi } from 'vitest';
import type { CoachingPackage, CoachingPurchase, CoachingSession } from '@/types';
import { ApiError } from '@/lib/api';
import {
  bookableSessionsOn,
  coachNavigationGuard,
  sessionSearchRange,
  formatExpiryDate,
  formatTimeRange,
  groupSessionsByDate,
  hasContactDetailsForCoaching,
  isRetryableError,
  noPackagesMessage,
  pickCoachImage,
  pricePerSession,
  retryWhenUnreachable,
  sessionDurationMinutes,
  sessionsLabel,
  spotsLeftLabel,
  validityLabel,
  type CoachGuardState,
} from '@/lib/coaching';

const PACKAGE: CoachingPackage = {
  id: 'pickleball-3-sessions',
  sportId: 'pickleball',
  title: 'Pickleball 3 Sessions Package',
  sessionCount: 3,
  price: 88,
  validityWeeks: 5,
  description: '',
  enabled: true,
  sortOrder: 1,
  pricing: { priceSubtotal: 88, tax: 3.13, platformFee: 1.5, grandTotal: 92.63 },
};

const PURCHASE = { id: 'p1' } as CoachingPurchase;

function session(id: string, sessionDate: string, startTime: string): CoachingSession {
  return {
    id, sportId: 'pickleball', sessionDate, startTime, endTime: '19:00', title: 'Drills', location: 'Court',
    spots: 4, bookedCount: 0, spotsLeft: 4, bookedByMe: false,
  };
}

function guardState(overrides: Partial<CoachGuardState> = {}): CoachGuardState {
  return { screen: 'coach-packages', isLoggedIn: true, selectedCoachPackage: PACKAGE, coachPurchase: null, ...overrides };
}

describe('display helpers', () => {
  it('works out the fee-inclusive price per session, rounded to cents', () => {
    expect(pricePerSession(PACKAGE)).toBe(30.88);
    expect(pricePerSession({ ...PACKAGE, sessionCount: 0 })).toBe(0);
  });

  it('labels validity and session counts in singular and plural', () => {
    expect(validityLabel(1)).toBe('Valid for 1 week');
    expect(validityLabel(5)).toBe('Valid for 5 weeks');
    expect(sessionsLabel(1)).toBe('1 session');
    expect(sessionsLabel(3)).toBe('3 sessions');
  });

  it('shows the expiry as a Singapore date, even when UTC is still the previous day', () => {
    // 15:59 UTC on 12 Dec is 23:59 on 12 Dec in Singapore; 16:00 UTC is already 13 Dec.
    expect(formatExpiryDate('2026-12-12T15:59:59.999Z')).toContain('12 Dec');
    expect(formatExpiryDate('2026-12-12T16:00:00.000Z')).toContain('13 Dec');
  });

  it('formats a session time range in 12-hour time', () => {
    expect(formatTimeRange('18:00', '19:00')).toBe('6:00 PM - 7:00 PM');
    expect(formatTimeRange('00:30', '12:00')).toBe('12:30 AM - 12:00 PM');
  });

  it('works out a session length in minutes', () => {
    expect(sessionDurationMinutes('18:00', '19:00')).toBe(60);
    expect(sessionDurationMinutes('18:30', '19:15')).toBe(45);
    expect(sessionDurationMinutes('19:00', '18:00')).toBe(0);
  });

  it('shows spots left and never a negative number', () => {
    expect(spotsLeftLabel({ spots: 4, spotsLeft: 3 })).toBe('3 / 4 spots left');
    expect(spotsLeftLabel({ spots: 4, spotsLeft: -1 })).toBe('0 / 4 spots left');
  });

  it('names the sport in the empty-package message', () => {
    expect(noPackagesMessage('cricket')).toBe('No available packages at this moment for Cricket');
    expect(noPackagesMessage('indoor-cricket')).toBe('No available packages at this moment for Indoor Cricket');
  });

  it('groups sessions by date in date and time order', () => {
    const groups = groupSessionsByDate([
      session('c', '2026-11-16', '18:00'),
      session('b', '2026-11-09', '19:00'),
      session('a', '2026-11-09', '18:00'),
    ]);
    expect(groups.map((group) => [group.date, group.sessions.map((s) => s.id)])).toEqual([
      ['2026-11-09', ['a', 'b']],
      ['2026-11-16', ['c']],
    ]);
    expect(groupSessionsByDate([])).toEqual([]);
  });
});

describe('session date search', () => {
  const sessions = [
    { ...session('late', '2026-11-09', '19:00') },
    { ...session('early', '2026-11-09', '18:00') },
    { ...session('full', '2026-11-09', '20:00'), spotsLeft: 0, bookedCount: 4 },
    { ...session('mine', '2026-11-09', '07:00'), bookedByMe: true, spotsLeft: 3 },
    { ...session('next-week', '2026-11-16', '18:00') },
  ];

  it('returns only that day\'s sessions with a free spot the user has not booked, in time order', () => {
    expect(bookableSessionsOn(sessions, '2026-11-09').map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('returns nothing for a day without sessions', () => {
    expect(bookableSessionsOn(sessions, '2026-11-10')).toEqual([]);
    expect(bookableSessionsOn([], '2026-11-09')).toEqual([]);
  });

  it('limits the date picker to today through the last scheduled session', () => {
    expect(sessionSearchRange(sessions, '2026-11-08')).toEqual({ min: '2026-11-08', max: '2026-11-16' });
    expect(sessionSearchRange([], '2026-11-08')).toEqual({ min: '2026-11-08', max: '2026-11-08' });
  });
});

describe('hasContactDetailsForCoaching', () => {
  it('accepts a real name and mobile', () => {
    expect(hasContactDetailsForCoaching({ fullName: 'Jane Tan', mobileNumber: '+6591234567' })).toBe(true);
  });

  it('rejects the signup placeholders and blanks', () => {
    expect(hasContactDetailsForCoaching({ fullName: 'User', mobileNumber: '+6591234567' })).toBe(false);
    expect(hasContactDetailsForCoaching({ fullName: 'Jane Tan', mobileNumber: '+6500000000' })).toBe(false);
    expect(hasContactDetailsForCoaching({ fullName: '  ', mobileNumber: '+6591234567' })).toBe(false);
    expect(hasContactDetailsForCoaching({ fullName: 'Jane Tan', mobileNumber: '' })).toBe(false);
  });
});

describe('coachNavigationGuard', () => {
  it('ignores screens outside the coaching flow', () => {
    expect(coachNavigationGuard('checkout', guardState())).toBeNull();
  });

  it('lets anyone browse packages, logged in or not', () => {
    expect(coachNavigationGuard('coach-packages', guardState({ isLoggedIn: false }))).toEqual({ kind: 'allow' });
  });

  it('sends a logged-out user to login and back to the same coaching step', () => {
    expect(coachNavigationGuard('coach-terms', guardState({ isLoggedIn: false }))).toEqual({ kind: 'login', returnTo: 'coach-terms' });
    expect(coachNavigationGuard('coach-checkout', guardState({ isLoggedIn: false }))).toEqual({ kind: 'login', returnTo: 'coach-checkout' });
    expect(coachNavigationGuard('coach-sessions', guardState({ isLoggedIn: false }))).toEqual({ kind: 'login', returnTo: 'coach-sessions' });
  });

  it('blocks terms and checkout until a package is chosen', () => {
    expect(coachNavigationGuard('coach-terms', guardState({ selectedCoachPackage: null }))).toEqual({ kind: 'block' });
    expect(coachNavigationGuard('coach-checkout', guardState({ selectedCoachPackage: null }))).toEqual({ kind: 'block' });
  });

  it('opens the success page only from checkout with a purchase', () => {
    expect(coachNavigationGuard('coach-success', guardState({ screen: 'coach-checkout', coachPurchase: PURCHASE }))).toEqual({ kind: 'allow' });
    expect(coachNavigationGuard('coach-success', guardState({ screen: 'coach-packages', coachPurchase: PURCHASE }))).toEqual({ kind: 'block' });
    expect(coachNavigationGuard('coach-success', guardState({ screen: 'coach-checkout', coachPurchase: null }))).toEqual({ kind: 'block' });
  });
});

describe('pickCoachImage', () => {
  const images = {
    '/src/assets/coach_pickleball.png': 'pickleball.png',
    '/src/assets/coach_indoor_cricket.png': 'indoor.png',
  };

  it('uses the sport image when it exists', () => {
    expect(pickCoachImage('pickleball', images, 'fallback.png')).toBe('pickleball.png');
    expect(pickCoachImage('indoor-cricket', images, 'fallback.png')).toBe('indoor.png');
  });

  it('falls back when the sport has no image yet', () => {
    expect(pickCoachImage('cricket', images, 'fallback.png')).toBe('fallback.png');
    expect(pickCoachImage('pickleball', {}, 'fallback.png')).toBe('fallback.png');
  });
});

describe('retryWhenUnreachable', () => {
  const noWait = () => Promise.resolve();

  it('treats network failures and 5xx as retryable, 4xx as final', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableError(new ApiError('Bad gateway', 502))).toBe(true);
    expect(isRetryableError(new ApiError('Not paid', 402))).toBe(false);
    expect(isRetryableError(new Error('other'))).toBe(false);
  });

  it('retries a network failure and returns the later success', async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce('ok');
    await expect(retryWhenUnreachable(action, 3, noWait)).resolves.toBe('ok');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('does not retry an answer the server will repeat', async () => {
    const action = vi.fn().mockRejectedValue(new ApiError('Payment already used', 409));
    await expect(retryWhenUnreachable(action, 3, noWait)).rejects.toMatchObject({ status: 409 });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last attempt with the last error', async () => {
    const action = vi.fn().mockRejectedValue(new ApiError('Bad gateway', 502));
    await expect(retryWhenUnreachable(action, 3, noWait)).rejects.toMatchObject({ status: 502 });
    expect(action).toHaveBeenCalledTimes(3);
  });
});
