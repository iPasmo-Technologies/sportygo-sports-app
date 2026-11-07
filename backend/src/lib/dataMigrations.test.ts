import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { applyDataMigrations, DATA_MIGRATIONS, type DataMigration } from './dataMigrations';

// A fake client that remembers which migrations were recorded, like the real table would.
function fakeClient(alreadyApplied: string[] = []) {
  const applied = new Set(alreadyApplied);
  const statements: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (/SELECT id FROM applied_data_migrations/i.test(sql)) {
        return { rows: [...applied].map((id) => ({ id })), rowCount: applied.size };
      }
      if (/INSERT INTO applied_data_migrations/i.test(sql)) {
        applied.add(params[0] as string);
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  return { client: client as unknown as PoolClient, statements, applied };
}

function migration(id: string, sql: string): DataMigration {
  return { id, description: `test ${id}`, up: async (client) => { await client.query(sql); } };
}

describe('applyDataMigrations', () => {
  it('runs each pending migration once, in order, and records it', async () => {
    const { client, statements, applied } = fakeClient();
    await applyDataMigrations(client, [migration('001-a', 'UPDATE a'), migration('002-b', 'UPDATE b')]);

    const ran = statements.map(({ sql }) => sql).filter((sql) => /^UPDATE [ab]$/.test(sql));
    expect(ran).toEqual(['UPDATE a', 'UPDATE b']);
    expect([...applied]).toEqual(['001-a', '002-b']);
  });

  it('skips migrations that already ran on this database', async () => {
    const { client, statements } = fakeClient(['001-a']);
    await applyDataMigrations(client, [migration('001-a', 'UPDATE a'), migration('002-b', 'UPDATE b')]);

    const ran = statements.map(({ sql }) => sql).filter((sql) => /^UPDATE [ab]$/.test(sql));
    expect(ran).toEqual(['UPDATE b']);
  });

  it('runs nothing the second time', async () => {
    const { client, statements } = fakeClient();
    const migrations = [migration('001-a', 'UPDATE a')];
    await applyDataMigrations(client, migrations);
    statements.length = 0;
    await applyDataMigrations(client, migrations);

    expect(statements.some(({ sql }) => sql === 'UPDATE a')).toBe(false);
  });

  it('takes a lock first so two app instances starting together cannot both run a migration', async () => {
    const { client, statements } = fakeClient();
    await applyDataMigrations(client, [migration('001-a', 'UPDATE a')]);

    const lock = statements.findIndex(({ sql }) => /pg_advisory_xact_lock/i.test(sql));
    const read = statements.findIndex(({ sql }) => /SELECT id FROM applied_data_migrations/i.test(sql));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(read);
  });

  it('stops at a failing migration without recording it', async () => {
    const { client, applied } = fakeClient();
    const failing: DataMigration = { id: '002-bad', description: 'fails', up: async () => { throw new Error('boom'); } };

    await expect(applyDataMigrations(client, [migration('001-a', 'UPDATE a'), failing])).rejects.toThrow('boom');
    expect(applied.has('002-bad')).toBe(false);
  });
});

describe('DATA_MIGRATIONS', () => {
  it('has unique ids, so a migration is never skipped by mistake', () => {
    const ids = DATA_MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
