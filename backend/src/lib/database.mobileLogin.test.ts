import { beforeEach, describe, expect, it, vi } from 'vitest';

// database.ts creates its connection pool when it loads, so point it at a fake database first.
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:5432/unit-test';
});

const db = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[] }));

vi.mock('pg', () => {
  const run = async (sql: string, params: unknown[] = []) => {
    db.statements.push({ sql, params });
    return { rows: [], rowCount: 0 };
  };
  class Pool {
    query = run;
    async connect() {
      return { query: run, release: () => undefined };
    }
  }
  return { Pool };
});

import { countUsersByMobileNumber, findUserByEmailOrMobile } from './database';

function lastUsersQuery() {
  return db.statements.filter(({ sql }) => /FROM users/i.test(sql)).at(-1);
}

beforeEach(() => {
  db.statements = [];
});

// Older accounts saved the number as typed (91234567); new ones are saved as +6591234567.
describe('mobile login lookup', () => {
  it('finds a Singapore number however it was saved', async () => {
    await findUserByEmailOrMobile('91234567');
    expect(lastUsersQuery()?.params).toEqual(['91234567', ['+6591234567', '6591234567', '91234567']]);
  });

  it('counts duplicates across every saved form of the same Singapore number', async () => {
    await countUsersByMobileNumber('+6591234567');
    expect(lastUsersQuery()?.params).toEqual([['+6591234567', '6591234567', '91234567']]);
  });

  it('still logs in by email', async () => {
    await findUserByEmailOrMobile('Jane@Example.com');
    expect(lastUsersQuery()?.params).toEqual(['jane@example.com', ['jane@example.com']]);
  });
});
