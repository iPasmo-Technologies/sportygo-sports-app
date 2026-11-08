import { randomUUID } from 'crypto';
import {
  bookCoachingSession,
  cancelCoachingSessionAsAdmin,
  CoachingBookingError,
  createCoachingPurchase,
  ensureDatabaseReady,
  findCoachingPackage,
  getCoachingBalance,
  isDatabaseConfigured,
  query,
} from '../lib/database';
import { addDaysToDate, singaporeDateOf } from '../lib/coaching';

// Proves the coaching booking rules against a real Postgres (row locks can't be unit-tested).
// It creates its own sessions and purchases, tagged with a smoke marker, and always deletes them.
// Run against a local or staging database only: `npm run db:smoke:coaching`.

const RUN_ID = randomUUID().slice(0, 8);
const SMOKE_EMAIL_DOMAIN = `smoke-${RUN_ID}.sportygo.invalid`;
const SMOKE_LOCATION = `SMOKE TEST ${RUN_ID}`;
const PACKAGE_ID = 'pickleball-3-sessions';

function smokeEmail(name: string): string {
  return `${name}@${SMOKE_EMAIL_DOMAIN}`;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Smoke check failed: ${message}`);
}

async function createSession(spots: number, startTime: string): Promise<string> {
  const sessionDate = addDaysToDate(singaporeDateOf(new Date()), 3);
  const rows = await query<{ id: string }>(
    `INSERT INTO coaching_sessions (sport_id, session_date, start_time, end_time, title, location, spots, created_by)
     VALUES ('pickleball', $1, $2, $3, 'Smoke test session', $4, $5, 'smoke')
     RETURNING id`,
    [sessionDate, startTime, `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:00`, SMOKE_LOCATION, spots]
  );
  return rows[0].id;
}

async function buyPackage(email: string) {
  return createCoachingPurchase({
    customerEmail: email,
    packageId: PACKAGE_ID,
    amountPaid: 0,
    receiptId: `SMOKE-${RUN_ID}-${randomUUID().slice(0, 8)}`,
    stripePaymentIntentId: `pi_smoke_${RUN_ID}_${randomUUID().slice(0, 8)}`,
  });
}

async function outcomeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'booked';
  } catch (error) {
    if (error instanceof CoachingBookingError) return error.reason;
    throw error;
  }
}

async function cleanUp(): Promise<void> {
  await query(
    `DELETE FROM coaching_session_bookings
     WHERE session_id IN (SELECT id FROM coaching_sessions WHERE location = $1)
        OR customer_email LIKE $2`,
    [SMOKE_LOCATION, `%@${SMOKE_EMAIL_DOMAIN}`]
  );
  await query('DELETE FROM coaching_purchases WHERE customer_email LIKE $1', [`%@${SMOKE_EMAIL_DOMAIN}`]);
  await query('DELETE FROM coaching_sessions WHERE location = $1', [SMOKE_LOCATION]);
}

async function main(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.log('[db:smoke:coaching] DATABASE_URL is not configured. Skipping.');
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the coaching smoke test with NODE_ENV=production.');
  }

  await ensureDatabaseReady();
  if (!(await findCoachingPackage(PACKAGE_ID))) {
    throw new Error(`Package ${PACKAGE_ID} is missing. Run \`npm run db:seed\` first.`);
  }

  try {
    // 1. Three players race for a session with two spots: exactly two get in.
    const players = ['amy', 'ben', 'cal'].map(smokeEmail);
    for (const player of players) await buyPackage(player);
    const twoSpotSession = await createSession(2, '20:00');
    const raceOutcomes = await Promise.all(players.map((player) => outcomeOf(bookCoachingSession(twoSpotSession, player))));
    assert(raceOutcomes.filter((o) => o === 'booked').length === 2, `expected 2 bookings, got ${raceOutcomes.join(', ')}`);
    assert(raceOutcomes.filter((o) => o === 'full').length === 1, `expected 1 full, got ${raceOutcomes.join(', ')}`);
    console.log('[db:smoke:coaching] OK  spot limit holds under concurrent bookings');

    // 2. The same player double-taps Book: one booking, one already-booked, one session used.
    const dana = smokeEmail('dana');
    await buyPackage(dana);
    const roomySession = await createSession(10, '21:00');
    const doubleTap = await Promise.all([1, 2].map(() => outcomeOf(bookCoachingSession(roomySession, dana))));
    assert(doubleTap.sort().join(',') === 'already-booked,booked', `expected one booking, got ${doubleTap.join(', ')}`);
    assert((await getCoachingBalance(dana, 'pickleball')).remainingSessions === 2, 'double tap used more than one session');
    console.log('[db:smoke:coaching] OK  duplicate booking blocked, one session used');

    // 3. A player with one session left books two sessions at once: only one succeeds.
    const eve = smokeEmail('eve');
    const evePurchase = await buyPackage(eve);
    await query('UPDATE coaching_purchases SET remaining_sessions = 1 WHERE id = $1', [evePurchase.purchase.id]);
    const sessionA = await createSession(10, '18:00');
    const sessionB = await createSession(10, '19:00');
    const lastCredit = await Promise.all([sessionA, sessionB].map((id) => outcomeOf(bookCoachingSession(id, eve))));
    assert(lastCredit.sort().join(',') === 'booked,no-credits', `expected one booking, got ${lastCredit.join(', ')}`);
    console.log('[db:smoke:coaching] OK  last session cannot be spent twice');

    // 4. Admin cancels the two-spot session: both booked players get their session back.
    const cancelled = await cancelCoachingSessionAsAdmin(twoSpotSession, smokeEmail('admin'));
    assert(cancelled?.refundedBookings === 2, `expected 2 refunds, got ${cancelled?.refundedBookings}`);
    for (const player of players) {
      const balance = await getCoachingBalance(player, 'pickleball');
      assert(balance.remainingSessions === 3, `${player} has ${balance.remainingSessions} sessions after the refund`);
    }
    console.log('[db:smoke:coaching] OK  admin cancel returns every booked session');

    // 5. Retrying a purchase with the same Stripe payment does not add sessions twice.
    const intentId = `pi_smoke_${RUN_ID}_retry`;
    const retryInput = { customerEmail: smokeEmail('fay'), packageId: PACKAGE_ID, amountPaid: 0, receiptId: `SMOKE-${RUN_ID}-retry`, stripePaymentIntentId: intentId };
    const first = await createCoachingPurchase(retryInput);
    const second = await createCoachingPurchase(retryInput);
    assert(first.created && !second.created && first.purchase.id === second.purchase.id, 'payment retry created a second purchase');
    console.log('[db:smoke:coaching] OK  payment retry is idempotent');

    console.log('[db:smoke:coaching] All coaching checks passed.');
  } finally {
    await cleanUp();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[db:smoke:coaching]', error instanceof Error ? error.message : error);
    process.exit(1);
  });
