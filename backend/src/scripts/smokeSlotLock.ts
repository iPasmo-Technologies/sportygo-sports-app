import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { blockSlotsForAdmin, isDatabaseConfigured, listSportFacilities, listSlotsForDate, saveBooking, seedDatabase, SlotAlreadyBookedError } from '../lib/database';

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

function nextDateFor(dayType: 'weekday' | 'weekend'): string {
  for (let days = 1; days <= 7; days++) {
    const date = datePlusDays(days);
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if ((dayType === 'weekend') === isWeekend) return date;
  }
  throw new Error(`Unable to find a ${dayType} verification date.`);
}

async function verifyFacilitySlotWindows(): Promise<void> {
  const facilities = [
    ...await listSportFacilities('cricket'),
    ...await listSportFacilities('pickleball'),
  ];
  const checks = [
    { date: nextDateFor('weekday'), first: '16:00', last: '18:30', count: 6 },
    { date: nextDateFor('weekend'), first: '08:00', last: '18:30', count: 22 },
  ];

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

async function verify2026ExceptionsAndAcademyBlocks(): Promise<void> {
  const facilities = [
    ...await listSportFacilities('cricket'),
    ...await listSportFacilities('pickleball'),
  ];

  for (const facility of facilities) {
    for (const date of ['2026-08-10', '2026-11-09', '2026-12-02']) {
      const slots = await listSlotsForDate(date, facility.sportId, facility.code);
      if (slots.length !== 22 || slots[0]?.time !== '08:00' || slots.at(-1)?.time !== '18:30') {
        throw new Error(`The 2026 availability exception was not applied to ${facility.sportId}/${facility.code} on ${date}.`);
      }
    }

    const slots2027 = await listSlotsForDate('2027-01-04', facility.sportId, facility.code);
    if (slots2027.length !== 6 || slots2027[0]?.time !== '16:00' || slots2027.at(-1)?.time !== '18:30') {
      throw new Error(`A 2026 availability exception incorrectly recurred for ${facility.sportId}/${facility.code} in 2027.`);
    }
  }

  const expectedBlocked = async (facilityCode: string, date: string, times: string[]) => {
    const slots = await listSlotsForDate(date, 'cricket', facilityCode);
    for (const time of times) {
      if (!slots.find((slot) => slot.time === time)?.booked) {
        throw new Error(`Expected Academy block missing for cricket/${facilityCode} on ${date} at ${time}.`);
      }
    }
  };

  await expectedBlocked('net-2', '2026-12-02', ['16:00', '16:30', '17:00', '17:30']);
  await expectedBlocked('bowling-lane', '2026-12-05', ['08:00', '08:30', '09:00', '09:30', '16:00', '16:30', '17:00', '17:30']);
  await expectedBlocked('net-3', '2026-12-05', [
    '08:00', '08:30', '09:00', '09:30',
    '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  ]);
  await expectedBlocked('indoor-court', '2026-12-05', ['16:00', '16:30', '17:00', '17:30']);
}

async function main() {
  if (!isDatabaseConfigured()) {
    console.log('[db:smoke:slot-lock] DATABASE_URL is not configured. Skipping smoke check.');
    return;
  }

  await seedDatabase();
  await verifyFacilitySlotWindows();
  await verify2026ExceptionsAndAcademyBlocks();

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
