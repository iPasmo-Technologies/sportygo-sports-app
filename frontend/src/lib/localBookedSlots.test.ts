import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimeSlot } from '@/types';
import { makeSlotKey, markLocalBooked, mergeWithLocalBooked, unmarkLocalBooked } from '@/lib/localBookedSlots';

// Changing this key would make every browser forget its locally booked slots.
const STORAGE_KEY = 'pkl_sg_local_booked_slots_v2';

function slot(time: string, booked = false): TimeSlot {
  return { time, key: makeSlotKey('cricket', 'net-2', '2026-11-02', time), booked, past: false };
}

const SLOTS = [slot('16:00'), slot('16:30'), slot('17:00', true)];

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('makeSlotKey', () => {
  // Must match the key the backend returns from GET /api/slots.
  it('joins sport, facility, date and time with underscores', () => {
    expect(makeSlotKey('cricket', 'net-2', '2026-11-02', '16:00')).toBe('cricket_net-2_2026-11-02_16:00');
  });
});

describe('markLocalBooked / mergeWithLocalBooked', () => {
  it('leaves slots unchanged when nothing is stored', () => {
    expect(mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS)).toEqual(SLOTS);
  });

  it('marks only the matching slot as booked', () => {
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:30');
    const merged = mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS);
    expect(merged.map((item) => item.booked)).toEqual([false, true, true]);
  });

  it.each([
    ['another sport', 'badminton', 'net-2', '2026-11-02'],
    ['another facility', 'cricket', 'net-3', '2026-11-02'],
    ['another date', 'cricket', 'net-2', '2026-11-03'],
  ])('does not affect %s', (_name, sportId, facilityCode, date) => {
    markLocalBooked(sportId, facilityCode, date, '16:00');
    const merged = mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS);
    expect(merged.map((item) => item.booked)).toEqual([false, false, true]);
  });

  it('never un-books a slot the server says is booked', () => {
    const merged = mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS);
    expect(merged[2].booked).toBe(true);
  });

  it('does not change the slots passed in', () => {
    const input = [slot('16:00')];
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', input);
    expect(input[0].booked).toBe(false);
  });

  it('keeps earlier marks when adding new ones', () => {
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:30');
    const merged = mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS);
    expect(merged.map((item) => item.booked)).toEqual([true, true, true]);
  });

  it(`stores marks under "${STORAGE_KEY}"`, () => {
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ 'cricket_net-2_2026-11-02_16:00': true });
  });
});

describe('unmarkLocalBooked', () => {
  it('removes a mark', () => {
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    unmarkLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    const merged = mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS);
    expect(merged[0].booked).toBe(false);
  });

  it('removes only the requested mark', () => {
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:30');
    unmarkLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    const merged = mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS);
    expect(merged.map((item) => item.booked)).toEqual([false, true, true]);
  });

  it('does nothing for a slot that was never marked', () => {
    expect(() => unmarkLocalBooked('cricket', 'net-2', '2026-11-02', '09:00')).not.toThrow();
  });
});

describe('bad or unavailable storage', () => {
  it.each([
    ['invalid JSON', '{not json'],
    ['a JSON array', '[1,2,3]'],
    ['JSON null', 'null'],
  ])('ignores %s', (_name, stored) => {
    localStorage.setItem(STORAGE_KEY, stored);
    expect(mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS)).toEqual(SLOTS);
  });

  it('only treats the value true as booked', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      'cricket_net-2_2026-11-02_16:00': 'true',
      'cricket_net-2_2026-11-02_16:30': 1,
    }));
    const merged = mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS);
    expect(merged.map((item) => item.booked)).toEqual([false, false, true]);
  });

  it('replaces corrupt data when a slot is marked', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    markLocalBooked('cricket', 'net-2', '2026-11-02', '16:00');
    expect(mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS)[0].booked).toBe(true);
  });

  it('does not throw when storage is full or blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => markLocalBooked('cricket', 'net-2', '2026-11-02', '16:00')).not.toThrow();
  });

  it('does not throw when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(mergeWithLocalBooked('cricket', 'net-2', '2026-11-02', SLOTS)).toEqual(SLOTS);
  });
});
