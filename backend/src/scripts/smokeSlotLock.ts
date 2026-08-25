import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { blockSlotsForAdmin, isDatabaseConfigured, listSlotsForDate, saveBooking, seedDatabase, SlotAlreadyBookedError } from '../lib/database';

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

async function main() {
  if (!isDatabaseConfigured()) {
    console.log('[db:smoke:slot-lock] DATABASE_URL is not configured. Skipping smoke check.');
    return;
  }

  await seedDatabase();

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
        await client.query('DELETE FROM admin_slot_blocks WHERE id = $1', [adminBlockId]);
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
