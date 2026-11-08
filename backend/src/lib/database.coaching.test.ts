import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// database.ts creates its connection pool when it loads, so point it at a fake database first.
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:5432/unit-test';
});

type FakeResult = { rows: Record<string, unknown>[]; rowCount: number };
type Responder = (sql: string, params: unknown[]) => FakeResult | undefined;

// Every statement the code sends, in order. Each test installs `respond` to steer the fake;
// anything it doesn't answer returns no rows.
const db = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  respond: undefined as Responder | undefined,
}));

function rows(list: Record<string, unknown>[]): FakeResult {
  return { rows: list, rowCount: list.length };
}

vi.mock('pg', () => {
  const run = async (sql: string, params: unknown[] = []) => {
    db.statements.push({ sql, params });
    return db.respond?.(sql, params) ?? { rows: [], rowCount: 0 };
  };
  class Pool {
    query = run;
    async connect() {
      return { query: run, release: () => undefined };
    }
  }
  return { Pool };
});

import {
  bookCoachingSession,
  cancelCoachingSessionAsAdmin,
  CoachingBookingError,
  CoachingPackageUnavailableError,
  createCoachingPurchase,
  ensureDatabaseReady,
  getCoachingBalance,
  listCoachingPackages,
  listUpcomingCoachingSessions,
  PaymentAlreadyUsedError,
} from './database';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const PURCHASE_ID = '22222222-2222-4222-8222-222222222222';

function sent(pattern: RegExp) {
  return db.statements.filter((statement) => pattern.test(statement.sql));
}

function indexOfStatement(pattern: RegExp): number {
  return db.statements.findIndex((statement) => pattern.test(statement.sql));
}

beforeAll(async () => {
  await ensureDatabaseReady();
});

beforeEach(() => {
  db.statements = [];
  db.respond = undefined;
});

describe('coaching schema', () => {
  it('never links coaching tables to sports, so re-seeding sports cannot cascade-delete purchases', async () => {
    vi.resetModules();
    db.statements = [];
    const fresh = await import('./database');
    await fresh.ensureDatabaseReady();

    const coachingTables = sent(/CREATE TABLE IF NOT EXISTS coaching_/);
    expect(coachingTables).toHaveLength(5);
    for (const statement of coachingTables) {
      expect(statement.sql).not.toMatch(/REFERENCES sports/i);
    }
  });

  it('protects spot limits and session balances with database checks', async () => {
    vi.resetModules();
    db.statements = [];
    const fresh = await import('./database');
    await fresh.ensureDatabaseReady();

    const schema = db.statements.map((statement) => statement.sql).join('\n');
    expect(schema).toMatch(/spots INTEGER NOT NULL CHECK \(spots BETWEEN 1 AND 50\)/);
    expect(schema).toMatch(/remaining_sessions >= 0 AND remaining_sessions <= total_sessions/);
    expect(schema).toMatch(/UNIQUE \(stripe_payment_intent_id\)/);
    expect(schema).toMatch(/ON coaching_session_bookings \(session_id, customer_email\)\s+WHERE status = 'booked'/);
    expect(schema).toMatch(/action_target IN \('facility-select', 'schedule', 'coach-packages'\)/);
  });
});

describe('listCoachingPackages', () => {
  it('returns an empty list, not an error, for a sport with no packages', async () => {
    await expect(listCoachingPackages('cricket')).resolves.toEqual([]);
    expect(sent(/FROM coaching_packages/)[0].params).toEqual(['cricket']);
  });
});

describe('createCoachingPurchase', () => {
  const PACKAGE = {
    id: 'pickleball-3-sessions', sportId: 'pickleball', title: 'Pickleball 3 Sessions Package',
    sessionCount: 3, price: 88, validityWeeks: 5, description: '', enabled: true, sortOrder: 1,
  };
  const INPUT = {
    customerEmail: ' User@Example.com ',
    packageId: PACKAGE.id,
    amountPaid: 92.63,
    receiptId: 'SGO-COACH-1',
    stripePaymentIntentId: 'pi_coach_1',
    purchasedAt: new Date('2026-11-01T02:00:00Z'),
  };
  const PURCHASE = { id: PURCHASE_ID, remainingSessions: 3, totalSessions: 3 };

  it('credits the package sessions with an expiry from its validity', async () => {
    db.respond = (sql) => {
      if (/FROM coaching_packages/.test(sql)) return rows([PACKAGE]);
      if (/INSERT INTO coaching_purchases/.test(sql)) return rows([PURCHASE]);
      return undefined;
    };

    await expect(createCoachingPurchase(INPUT)).resolves.toEqual({ purchase: PURCHASE, created: true });

    const [insert] = sent(/INSERT INTO coaching_purchases/);
    expect(insert.params).toEqual([
      'user@example.com', 'pickleball', PACKAGE.id, PACKAGE.title, 3, 92.63,
      'SGO-COACH-1', 'pi_coach_1', '2026-11-01T02:00:00.000Z', '2026-12-06T15:59:59.999Z',
    ]);
  });

  it('rejects a package that is missing or disabled', async () => {
    await expect(createCoachingPurchase(INPUT)).rejects.toBeInstanceOf(CoachingPackageUnavailableError);
    expect(sent(/INSERT INTO coaching_purchases/)).toHaveLength(0);
  });

  it('returns the existing purchase when the same customer retries the same payment', async () => {
    db.respond = (sql) => {
      if (/FROM coaching_packages/.test(sql)) return rows([PACKAGE]);
      if (/INSERT INTO coaching_purchases/.test(sql)) return rows([]); // ON CONFLICT DO NOTHING
      if (/WHERE stripe_payment_intent_id = \$1/.test(sql)) return rows([{ ...PURCHASE, customerEmail: 'user@example.com' }]);
      return undefined;
    };

    await expect(createCoachingPurchase(INPUT)).resolves.toEqual({ purchase: PURCHASE, created: false });
  });

  it("refuses a payment that already credited someone else's purchase", async () => {
    db.respond = (sql) => {
      if (/FROM coaching_packages/.test(sql)) return rows([PACKAGE]);
      if (/INSERT INTO coaching_purchases/.test(sql)) return rows([]);
      if (/WHERE stripe_payment_intent_id = \$1/.test(sql)) return rows([{ ...PURCHASE, customerEmail: 'other@example.com' }]);
      return undefined;
    };

    await expect(createCoachingPurchase(INPUT)).rejects.toBeInstanceOf(PaymentAlreadyUsedError);
  });
});

describe('getCoachingBalance', () => {
  it('adds up the sessions left on unexpired purchases', async () => {
    db.respond = (sql) => (/FROM coaching_purchases/.test(sql)
      ? rows([{ remainingSessions: 2 }, { remainingSessions: 5 }])
      : undefined);

    const balance = await getCoachingBalance('User@Example.com', 'pickleball');
    expect(balance.remainingSessions).toBe(7);
    expect(sent(/FROM coaching_purchases/)[0].sql).toMatch(/expires_at > NOW\(\)/);
    expect(sent(/FROM coaching_purchases/)[0].params).toEqual(['user@example.com', 'pickleball']);
  });
});

describe('listUpcomingCoachingSessions', () => {
  it('generates upcoming sessions first and reports spots left, never below zero', async () => {
    db.respond = (sql) => {
      if (/FROM coaching_sessions AS session/.test(sql)) {
        return rows([
          { id: 'a', spots: 4, bookedCount: 1, bookedByMe: false },
          { id: 'b', spots: 2, bookedCount: 3, bookedByMe: true }, // limit lowered after booking
        ]);
      }
      return undefined;
    };

    const sessions = await listUpcomingCoachingSessions('pickleball', 'user@example.com');
    expect(sessions.map((s) => s.spotsLeft)).toEqual([3, 0]);
    expect(indexOfStatement(/FROM coaching_session_templates/)).toBeLessThan(indexOfStatement(/FROM coaching_sessions AS session/));
  });
});

describe('bookCoachingSession', () => {
  type Scenario = {
    session?: Record<string, unknown> | null;
    booked?: number;
    mine?: boolean;
    purchase?: boolean;
    insertError?: unknown;
  };

  function scenario({ session, booked = 0, mine = false, purchase = true, insertError }: Scenario) {
    const sessionRow = session === undefined
      ? { sport_id: 'pickleball', spots: 4, status: 'scheduled', is_future: true }
      : session;
    db.respond = (sql) => {
      if (/FROM coaching_sessions\s+WHERE id = \$1\s+FOR UPDATE/.test(sql)) return rows(sessionRow ? [sessionRow] : []);
      if (/COUNT\(\*\)::int AS booked/.test(sql)) return rows([{ booked, mine }]);
      if (/FOR UPDATE OF purchase/.test(sql)) return rows(purchase ? [{ id: PURCHASE_ID }] : []);
      if (/INSERT INTO coaching_session_bookings/.test(sql)) {
        if (insertError) throw insertError;
        return rows([{ id: 'booking-1' }]);
      }
      if (/AS remaining/.test(sql)) return rows([{ remaining: 2 }]);
      return undefined;
    };
  }

  async function expectRejected(reason: string) {
    const error = await bookCoachingSession(SESSION_ID, 'user@example.com').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CoachingBookingError);
    expect((error as CoachingBookingError).reason).toBe(reason);
    expect(sent(/^ROLLBACK$/)).toHaveLength(1);
    expect(sent(/UPDATE coaching_purchases/)).toHaveLength(0);
  }

  it('locks the session, then the purchase, uses one session and adds the booking', async () => {
    scenario({ booked: 3 });

    await expect(bookCoachingSession(SESSION_ID, ' User@Example.com ')).resolves.toEqual({
      bookingId: 'booking-1',
      remainingSessions: 2,
    });

    const order = [
      /^BEGIN$/,
      /FROM coaching_sessions\s+WHERE id = \$1\s+FOR UPDATE/,
      /COUNT\(\*\)::int AS booked/,
      /FOR UPDATE OF purchase/,
      /remaining_sessions = remaining_sessions - 1/,
      /INSERT INTO coaching_session_bookings/,
      /^COMMIT$/,
    ].map(indexOfStatement);
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sent(/INSERT INTO coaching_session_bookings/)[0].params).toEqual([SESSION_ID, PURCHASE_ID, 'user@example.com']);
  });

  it('picks the soonest-expiring credit that is still valid when the session starts', async () => {
    scenario({});
    await bookCoachingSession(SESSION_ID, 'user@example.com');

    const [purchaseQuery] = sent(/FOR UPDATE OF purchase/);
    expect(purchaseQuery.sql).toMatch(/remaining_sessions > 0/);
    expect(purchaseQuery.sql).toMatch(/expires_at >= \(\(session\.session_date \+ session\.start_time\)/);
    expect(purchaseQuery.sql).toMatch(/ORDER BY purchase\.expires_at/);
  });

  it('rejects an unknown session', async () => {
    scenario({ session: null });
    await expectRejected('not-found');
  });

  it('rejects a session an admin cancelled', async () => {
    scenario({ session: { sport_id: 'pickleball', spots: 4, status: 'cancelled', is_future: true } });
    await expectRejected('not-available');
  });

  it('rejects a session that has already started', async () => {
    scenario({ session: { sport_id: 'pickleball', spots: 4, status: 'scheduled', is_future: false } });
    await expectRejected('not-available');
  });

  it('rejects when every spot is taken', async () => {
    scenario({ booked: 4 });
    await expectRejected('full');
  });

  it('rejects a second booking of the same session by the same user', async () => {
    scenario({ booked: 1, mine: true });
    await expectRejected('already-booked');
  });

  it('rejects when the user has no valid sessions left for this sport', async () => {
    scenario({ purchase: false });
    await expectRejected('no-credits');
  });

  it('turns a duplicate-booking race caught by the unique index into already-booked', async () => {
    scenario({
      insertError: Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'idx_coaching_session_bookings_active_unique',
      }),
    });

    const error = await bookCoachingSession(SESSION_ID, 'user@example.com').catch((caught: unknown) => caught);
    expect((error as CoachingBookingError).reason).toBe('already-booked');
    expect(sent(/^ROLLBACK$/)).toHaveLength(1);
  });
});

describe('cancelCoachingSessionAsAdmin', () => {
  it('returns null for an unknown session', async () => {
    await expect(cancelCoachingSessionAsAdmin(SESSION_ID, 'admin@example.com')).resolves.toBeNull();
  });

  it('does nothing twice for a session that is already cancelled', async () => {
    db.respond = (sql) => (/SELECT status FROM coaching_sessions/.test(sql) ? rows([{ status: 'cancelled' }]) : undefined);

    await expect(cancelCoachingSessionAsAdmin(SESSION_ID, 'admin@example.com')).resolves.toEqual({
      alreadyCancelled: true,
      refundedBookings: 0,
    });
    expect(sent(/UPDATE coaching_purchases/)).toHaveLength(0);
  });

  it('cancels the session and its bookings and gives each player one session back', async () => {
    const otherPurchase = '33333333-3333-4333-8333-333333333333';
    db.respond = (sql) => {
      if (/SELECT status FROM coaching_sessions/.test(sql)) return rows([{ status: 'scheduled' }]);
      if (/UPDATE coaching_session_bookings/.test(sql)) return rows([{ purchase_id: PURCHASE_ID }, { purchase_id: otherPurchase }]);
      return undefined;
    };

    await expect(cancelCoachingSessionAsAdmin(SESSION_ID, 'Admin@Example.com')).resolves.toEqual({
      alreadyCancelled: false,
      refundedBookings: 2,
    });

    const [refund] = sent(/UPDATE coaching_purchases AS purchase/);
    expect(refund.params).toEqual([[PURCHASE_ID, otherPurchase], 7, 'admin@example.com']);
    expect(refund.sql).toMatch(/WHEN purchase\.expires_at <= NOW\(\) THEN NOW\(\) \+ make_interval\(days => \$2\)/);
    expect(sent(/^COMMIT$/)).toHaveLength(1);
    // Same lock order as booking: the session row first, then purchases.
    expect(indexOfStatement(/SELECT status FROM coaching_sessions/)).toBeLessThan(indexOfStatement(/UPDATE coaching_purchases/));
  });
});
