import type { TimeSlot } from '@/types';

const LS_BOOKED_KEY = 'pkl_sg_local_booked_slots_v2';

type LocalBookedMap = Record<string, true>;

function readMap(): LocalBookedMap {
  try {
    const raw = localStorage.getItem(LS_BOOKED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: LocalBookedMap = {};
    Object.keys(parsed).forEach(key => {
      if (parsed[key] === true) clean[key] = true;
    });
    return clean;
  } catch {
    return {};
  }
}

function writeMap(map: LocalBookedMap): void {
  try {
    localStorage.setItem(LS_BOOKED_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors in private mode / restricted browsers.
  }
}

export function makeSlotKey(sportId: string, facilityCode: string, date: string, time: string): string {
  return `${sportId}_${facilityCode}_${date}_${time}`;
}

export function markLocalBooked(sportId: string, facilityCode: string, date: string, time: string): void {
  const map = readMap();
  map[makeSlotKey(sportId, facilityCode, date, time)] = true;
  writeMap(map);
}

export function unmarkLocalBooked(sportId: string, facilityCode: string, date: string, time: string): void {
  const map = readMap();
  delete map[makeSlotKey(sportId, facilityCode, date, time)];
  writeMap(map);
}

export function mergeWithLocalBooked(sportId: string, facilityCode: string, date: string, slots: TimeSlot[]): TimeSlot[] {
  const map = readMap();
  return slots.map(slot => {
    const forcedBooked = map[makeSlotKey(sportId, facilityCode, date, slot.time)] === true;
    return forcedBooked ? { ...slot, booked: true } : slot;
  });
}
