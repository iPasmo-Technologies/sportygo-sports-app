import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// database.ts creates its connection pool when it loads, so point it at a fake database first.
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:5432/unit-test';
});

type FakeResult = { rows: Record<string, unknown>[]; rowCount: number };

// Every statement the code sends, in order. `paymentAlreadyUsed` and `insertError` steer the fake.
const db = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  paymentAlreadyUsed: false,
  insertError: undefined as unknown,
}));

function rows(list: Record<string, unknown>[]): FakeResult {
  return { rows: list, rowCount: list.length };
}

// Just enough answers for saveBooking to reach its INSERT: an enabled facility, a 16:00-19:00
// window, two free 30-minute slots for a 60-minute booking, and no overlapping booking.
function respond(sql: string): FakeResult {
  if (/FROM bookings[\s\S]*stripe_payment_intent_id\s*=\s*\$1/i.test(sql)) {
    return db.paymentAlreadyUsed ? rows([{ exists: 1 }]) : rows([]);
  }
  if (/INSERT INTO bookings/i.test(sql) && db.insertError) {
    throw db.insertError;
  }
  if (/SELECT 1 FROM sport_facilities/i.test(sql)) return rows([{ exists: 1 }]);
  if (/configured_window/i.test(sql)) return rows([{ slotStartTime: '16:00:00', slotEndTime: '19:00:00' }]);
  if (/FOR UPDATE/i.test(sql)) {
    return rows([
      { id: 's1', slot_time: '16:00:00', is_booked: false },
      { id: 's2', slot_time: '16:30:00', is_booked: false },
    ]);
  }
  if (/AS overlaps/i.test(sql)) return rows([{ overlaps: false }]);
  return rows([]);
}

vi.mock('pg', () => {
  const run = async (sql: string, params: unknown[] = []) => {
    db.statements.push({ sql, params });
    return respond(sql);
  };
  class Pool {
    query = run;
    async connect() {
      return { query: run, release: () => undefined };
    }
  }
  return { Pool };
});

import { ensureDatabaseReady, isStripePaymentReuseViolation, PaymentAlreadyUsedError, saveBooking } from './database';

const BOOKING = {
  bookingType: 'court',
  sportId: 'cricket' as const,
  facilityCode: 'net-2',
  selectedDate: '2099-01-05',
  selectedTime: '16:00',
  durationMins: 60,
  packageOption: null,
  payMethod: 'STRIPE',
  grandTotal: 63.65,
  receiptId: 'SGO-99ABC123',
  customerEmail: 'user@example.com',
  bookingStatus: 'confirmed',
  paymentMethod: 'ONLINE' as const,
  stripePaymentIntentId: 'pi_test_123',
};

const UNIQUE_VIOLATION = Object.assign(new Error('duplicate key value violates unique constraint'), {
  code: '23505',
  constraint: 'idx_bookings_stripe_payment_intent_unique',
});

function statementsMatching(pattern: RegExp) {
  return db.statements.filter(({ sql }) => pattern.test(sql));
}

beforeEach(() => {
  db.statements.length = 0;
  db.paymentAlreadyUsed = false;
  db.insertError = undefined;
});

describe('bookings schema', () => {
  // Schema setup runs only once per process, so record its statements once for both checks.
  let schema: string[] = [];
  beforeAll(async () => {
    await ensureDatabaseReady();
    schema = db.statements.map(({ sql }) => sql);
  });

  it('adds a stripe_payment_intent_id column', () => {
    expect(schema.filter((sql) => /ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL/i.test(sql)))
      .toHaveLength(1);
  });

  // The database itself refuses a second booking with the same payment, even for two requests at once.
  it('makes stripe_payment_intent_id unique, ignoring bookings without one', () => {
    const index = schema.find((sql) => /idx_bookings_stripe_payment_intent_unique/i.test(sql)) ?? '';
    expect(index).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/i);
    expect(index).toMatch(/ON bookings \(stripe_payment_intent_id\)/i);
    expect(index).toMatch(/WHERE stripe_payment_intent_id IS NOT NULL/i);
  });
});

describe('saveBooking - Stripe payment reuse', () => {
  it('saves the payment id with the booking', async () => {
    await saveBooking(BOOKING);
    const insert = statementsMatching(/INSERT INTO bookings/i)[0];
    expect(insert.sql).toMatch(/stripe_payment_intent_id/);
    expect(insert.params).toContain('pi_test_123');
    expect(statementsMatching(/^COMMIT$/)).toHaveLength(1);
  });

  it('rejects a payment id that is already on another booking, before reserving any slot', async () => {
    db.paymentAlreadyUsed = true;
    await expect(saveBooking(BOOKING)).rejects.toBeInstanceOf(PaymentAlreadyUsedError);
    expect(statementsMatching(/INSERT INTO bookings/i)).toEqual([]);
    expect(statementsMatching(/UPDATE slots/i)).toEqual([]);
    expect(statementsMatching(/^ROLLBACK$/)).toHaveLength(1);
  });

  it('turns the database unique-index error (two requests at once) into PaymentAlreadyUsedError', async () => {
    db.insertError = UNIQUE_VIOLATION;
    await expect(saveBooking(BOOKING)).rejects.toBeInstanceOf(PaymentAlreadyUsedError);
    expect(statementsMatching(/^ROLLBACK$/)).toHaveLength(1);
    expect(statementsMatching(/^COMMIT$/)).toEqual([]);
  });

  it('passes other database errors through unchanged', async () => {
    const otherError = Object.assign(new Error('other unique'), { code: '23505', constraint: 'bookings_receipt_id_key' });
    db.insertError = otherError;
    await expect(saveBooking(BOOKING)).rejects.toBe(otherError);
  });

  it.each([['null', null], ['missing', undefined]])(
    'skips the reuse check for a %s payment id (Mock Pay bookings)',
    async (_name, stripePaymentIntentId) => {
      await saveBooking({ ...BOOKING, stripePaymentIntentId });
      expect(statementsMatching(/FROM bookings[\s\S]*stripe_payment_intent_id\s*=\s*\$1/i)).toEqual([]);
      expect(statementsMatching(/INSERT INTO bookings/i)[0].params).toContain(null);
    }
  );
});

describe('isStripePaymentReuseViolation', () => {
  it('recognises the payment unique-index error', () => {
    expect(isStripePaymentReuseViolation(UNIQUE_VIOLATION)).toBe(true);
  });

  it.each([
    ['another unique constraint', { code: '23505', constraint: 'bookings_receipt_id_key' }],
    ['another error code', { code: '23503', constraint: 'idx_bookings_stripe_payment_intent_unique' }],
    ['a plain Error', new Error('boom')],
    ['null', null],
    ['a string', '23505'],
  ])('ignores %s', (_name, error) => {
    expect(isStripePaymentReuseViolation(error)).toBe(false);
  });
});
