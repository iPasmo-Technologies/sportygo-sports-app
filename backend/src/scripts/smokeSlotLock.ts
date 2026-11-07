import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { blockSlotsForAdmin, isDatabaseConfigured, listSportFacilities, listSlotsForDate, query, saveBooking, SlotAlreadyBookedError } from '../lib/database';

// Proves that court bookings and admin blocks lock slots per facility against a real Postgres.
// It does not seed: run `npm run db:seed` first. Run against a local or test database only.

function datePlusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Dates with an availability exception (e.g. school holidays) have a different window, so
// the default-window check skips them.
async function exceptionDatesWithin(days: number): Promise<Set<string>> {
  const rows = await query<{ date: string }>(
    `SELECT DISTINCT exception_date::text AS date
     FROM slot_availability_exceptions
     WHERE deleted_at IS NULL AND exception_date BETWEEN $1::date AND $2::date`,
    [datePlusDays(1), datePlusDays(days)]
  );
  return new Set(rows.map((row) => row.date));
}

function nextDateFor(dayType: 'weekday' | 'weekend', skip: Set<string>): string | null {
  for (let days = 1; days <= 28; days++) {
    const date = datePlusDays(days);
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if ((dayType === 'weekend') === isWeekend && !skip.has(date)) return date;
  }
  return null;
}

async function verifyFacilitySlotWindows(): Promise<void> {
  const facilities = [
    ...await listSportFacilities('cricket'),
    ...await listSportFacilities('pickleball'),
  ];
  if (facilities.length === 0) {
    throw new Error('No cricket or pickleball facilities found. Run `npm run db:seed` first.');
  }

  const skip = await exceptionDatesWithin(28);
  const weekday = nextDateFor('weekday', skip);
  const weekend = nextDateFor('weekend', skip);
  const checks = [
    ...(weekday ? [{ date: weekday, first: '16:00', last: '18:30', count: 6 }] : []),
    ...(weekend ? [{ date: weekend, first: '08:00', last: '18:30', count: 22 }] : []),
  ];
  if (!weekday) console.log('[db:smoke:slot-lock] SKIP weekday window check: every weekday in the next 4 weeks has an exception.');

  for (const facility of facilities) {
    for (const check of checks) {
      const slots = await listSlotsForDate(check.date, facility.sportId, facility.code);
      if (slots.length !== check.count || slots[0]?.time !== check.first || slots.at(-1)?.time !== check.last) {
        throw new Error(
          `Unexpected slot window for ${facility.sportId}/${facility.code} on ${check.date}: `
          + `${slots[0]?.time ?? 'none'}-${slots.at(-1)?.time ?? 'none'} (${slots.length} slots).`
        );
      }
    }
  }
}

async function main() {
  if (!isDatabaseConfigured()) {
    console.log('[db:smoke:slot-lock] DATABASE_URL is not configured. Skipping smoke check.');
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the slot-lock smoke test with NODE_ENV=production.');
  }

  await verifyFacilitySlotWindows();

  const receiptPrefix = `SMOKE-${randomUUID().slice(0, 8).toUpperCase()}`;
  let targetDate = '';
  let targetTime = '';
  let adminBlockTime = '';
  let adminBlockId = '';

  for (let days = 10; days <= 20 && !targetTime; days++) {
    const candidateDate = datePlusDays(days);
    const net2Slots = await listSlotsForDate(candidateDate, 'cricket', 'net-2');
    const net3Slots = await listSlotsForDate(candidateDate, 'cricket', 'net-3');
    const net3Available = new Set(net3Slots.filter((slot) => !slot.booked && !slot.past).map((slot) => slot.time));
    const commonSlots = net2Slots.filter((slot) => !slot.booked && !slot.past && net3Available.has(slot.time));
    if (commonSlots.length >= 2) {
      targetDate = candidateDate;
      targetTime = commonSlots[0].time;
      adminBlockTime = commonSlots[1].time;
    }
  }

  if (!targetDate || !targetTime) {
    throw new Error('No common available verification slot found for cricket net-2 and net-3.');
  }

  const booking = (facilityCode: 'net-2' | 'net-3', suffix: string, email: string) => saveBooking({
    bookingType: 'court',
    sportId: 'cricket',
    facilityCode,
    selectedDate: targetDate,
    selectedTime: targetTime,
    durationMins: 30,
    packageOption: null,
    payMethod: 'STRIPE',
    grandTotal: 22.50,
    receiptId: `${receiptPrefix}-${suffix}`,
    customerEmail: email,
    bookingStatus: 'confirmed',
    paymentMethod: 'ONLINE',
  });

  try {
    await booking('net-2', 'A', 'slot.lock.a@example.com');

    try {
      await booking('net-2', 'B', 'slot.lock.b@example.com');
      throw new Error('Same-facility duplicate unexpectedly succeeded.');
    } catch (error) {
      if (!(error instanceof SlotAlreadyBookedError)) throw error;
    }

    const net2After = await listSlotsForDate(targetDate, 'cricket', 'net-2');
    const net3Before = await listSlotsForDate(targetDate, 'cricket', 'net-3');
    if (!net2After.find((slot) => slot.time === targetTime)?.booked) {
      throw new Error('Booked facility still reports the slot as available.');
    }
    if (net3Before.find((slot) => slot.time === targetTime)?.booked) {
      throw new Error('Booking one facility incorrectly blocked another facility.');
    }

    await booking('net-3', 'C', 'slot.lock.c@example.com');

    const adminResult = await blockSlotsForAdmin({
      adminEmail: 'slot.lock.admin@example.com',
      sportId: 'cricket',
      facilityCode: 'net-2',
      dates: [targetDate],
      startTime: adminBlockTime,
      endTime: `${String(Number(adminBlockTime.slice(0, 2)) + (adminBlockTime.endsWith(':30') ? 1 : 0)).padStart(2, '0')}:${adminBlockTime.endsWith(':30') ? '00' : '30'}`,
      reason: 'Facility isolation smoke test',
    });
    adminBlockId = adminResult.blockId;
    if (adminResult.blockedCount !== 1) {
      throw new Error(`Expected one admin-blocked slot, received ${adminResult.blockedCount}.`);
    }

    const net2Blocked = await listSlotsForDate(targetDate, 'cricket', 'net-2');
    const net3Unblocked = await listSlotsForDate(targetDate, 'cricket', 'net-3');
    if (!net2Blocked.find((slot) => slot.time === adminBlockTime)?.booked) {
      throw new Error('Admin block did not affect the selected facility.');
    }
    if (net3Unblocked.find((slot) => slot.time === adminBlockTime)?.booked) {
      throw new Error('Admin block incorrectly affected another facility.');
    }

    console.log(`[db:smoke:slot-lock] PASS - bookings and admin blocks are isolated per facility on ${targetDate}.`);
  } finally {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      const client = new Client({
        connectionString: databaseUrl,
        ssl: (process.env.DATABASE_SSL ?? 'true').toLowerCase() !== 'false' ? { rejectUnauthorized: false } : undefined,
      });
      await client.connect();
      await client.query('DELETE FROM bookings WHERE receipt_id LIKE $1', [`${receiptPrefix}-%`]);
      if (adminBlockId) {
        await client.query('DELETE FROM slot_block_rules WHERE id = $1', [adminBlockId]);
      }
      await client.query(
        `UPDATE slots SET is_booked = FALSE, updated_at = NOW(), updated_by = 'system'
         WHERE sport_id = 'cricket' AND facility_code IN ('net-2', 'net-3')
            AND slot_date = $1 AND slot_time IN ($2::time, $3::time)`,
          [targetDate, targetTime, adminBlockTime]
      );
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error('[db:smoke:slot-lock] FAILED:', error);
  process.exitCode = 1;
});
