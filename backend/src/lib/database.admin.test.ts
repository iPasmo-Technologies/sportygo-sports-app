import { beforeEach, describe, expect, it, vi } from 'vitest';

// database.ts creates its connection pool when it loads, so point it at a fake database first.
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:5432/unit-test';
});

type FakeResult = { rows: Record<string, unknown>[]; rowCount: number };
type Responder = (sql: string, params: unknown[]) => FakeResult | undefined;

// Every statement the code sends, in order. `respond` lets a test return rows for chosen SQL.
const db = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
  respond: undefined as Responder | undefined,
}));

vi.mock('pg', () => {
  const run = async (sql: string, params: unknown[] = []): Promise<FakeResult> => {
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

import { ensureDatabaseReady, promoteUserToAdmin, seedDatabase } from './database';

const USER_WRITE = /\b(INSERT\s+INTO|UPDATE)\s+users\b/i;

// Creating a user, or any user write that touches `role`. (Schema setup also runs a harmless
// backfill UPDATE that fills empty name/mobile columns on old rows; that one is allowed.)
function accountOrRoleWrites() {
  return db.statements.filter(({ sql }) => /\bINSERT\s+INTO\s+users\b/i.test(sql) || (USER_WRITE.test(sql) && /\brole\b/i.test(sql)));
}

function userRow(role: string) {
  return { id: 'u1', email: 'coach@example.com', fullName: 'Coach', role };
}

function respondWithUser(role: string | null): Responder {
  return (sql) => {
    if (/SELECT[\s\S]*FROM users/i.test(sql)) {
      return role ? { rows: [userRow(role)], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/UPDATE users/i.test(sql)) {
      return { rows: [{ email: 'coach@example.com' }], rowCount: 1 };
    }
    return undefined;
  };
}

beforeEach(() => {
  db.statements.length = 0;
  db.respond = undefined;
});

describe('no hardcoded admin account', () => {
  // Regression: startup used to create/repair an admin with a password written in the source code.
  it('server startup does not create users or change roles', async () => {
    await ensureDatabaseReady();
    expect(db.statements.length).toBeGreaterThan(0); // the schema setup really ran
    expect(accountOrRoleWrites()).toEqual([]);
  });

  it('seeding does not create users or change roles', async () => {
    await seedDatabase();
    expect(db.statements.some(({ sql }) => /INSERT INTO packages/i.test(sql))).toBe(true);
    expect(accountOrRoleWrites()).toEqual([]);
  });
});

describe('promoteUserToAdmin', () => {
  it('promotes an existing public user', async () => {
    db.respond = respondWithUser('public');
    await expect(promoteUserToAdmin('coach@example.com')).resolves.toBe('promoted');

    const update = db.statements.find(({ sql }) => USER_WRITE.test(sql));
    expect(update?.sql).toMatch(/SET\s+role\s*=\s*'admin'/i);
    expect(update?.params).toContain('coach@example.com');
  });

  it('promotes a coach', async () => {
    db.respond = respondWithUser('coach');
    await expect(promoteUserToAdmin('coach@example.com')).resolves.toBe('promoted');
  });

  it('never touches the password or reset code', async () => {
    db.respond = respondWithUser('public');
    await promoteUserToAdmin('coach@example.com');
    const update = db.statements.find(({ sql }) => USER_WRITE.test(sql));
    expect(update?.sql).not.toMatch(/password/i);
  });

  it('only updates accounts that are not deleted', async () => {
    db.respond = respondWithUser('public');
    await promoteUserToAdmin('coach@example.com');
    const update = db.statements.find(({ sql }) => USER_WRITE.test(sql));
    expect(update?.sql).toMatch(/deleted_at\s+IS\s+NULL/i);
  });

  it('trims and lowercases the email', async () => {
    db.respond = respondWithUser('public');
    await promoteUserToAdmin('  Coach@Example.COM ');
    const update = db.statements.find(({ sql }) => USER_WRITE.test(sql));
    expect(update?.params).toContain('coach@example.com');
  });

  it('reports an account that is already admin, without writing (safe to run twice)', async () => {
    db.respond = respondWithUser('admin');
    await expect(promoteUserToAdmin('coach@example.com')).resolves.toBe('already-admin');
    expect(db.statements.filter(({ sql }) => USER_WRITE.test(sql))).toEqual([]);
  });

  it('reports an unknown or deleted account, without writing', async () => {
    db.respond = respondWithUser(null);
    await expect(promoteUserToAdmin('nobody@example.com')).resolves.toBe('not-found');
    expect(db.statements.filter(({ sql }) => USER_WRITE.test(sql))).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['missing @', 'coach.example.com'],
    ['missing domain', 'coach@'],
    ['contains a space', 'co ach@example.com'],
    ['too long', `${'a'.repeat(250)}@example.com`],
  ])('rejects an invalid email (%s) before touching the database', async (_name, email) => {
    await expect(promoteUserToAdmin(email)).rejects.toThrow('A valid email address is required.');
    expect(db.statements).toEqual([]);
  });
});
