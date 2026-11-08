import { beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the options the connection pool is created with.
const pool = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));

vi.mock('pg', () => {
  class Pool {
    constructor(options: Record<string, unknown>) {
      pool.options.push(options);
    }
    async query() {
      return { rows: [], rowCount: 0 };
    }
  }
  return { Pool };
});

async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  pool.options = [];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await import('./database');
  return pool.options[0];
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@db.example.com:5432/unit-test';
});

describe('database TLS', () => {
  // Regression: rejectUnauthorized: false accepted any certificate, so anyone on the network
  // path could pose as the database whenever the URL had no sslmode to override it.
  it('verifies the database certificate when SSL is on', async () => {
    const options = await loadWith({ DATABASE_SSL: 'true' });
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('uses SSL with verification by default', async () => {
    const options = await loadWith({ DATABASE_SSL: undefined });
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('turns SSL off only when DATABASE_SSL=false (e.g. a local database)', async () => {
    const options = await loadWith({ DATABASE_SSL: 'false' });
    expect(options.ssl).toBeUndefined();
  });
});
