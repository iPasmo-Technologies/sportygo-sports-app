import { beforeEach, describe, expect, it, vi } from 'vitest';

// database.ts creates its connection pool when it loads, so point it at a fake database first.
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://unit-test:unit-test@localhost:5432/unit-test';
});

const db = vi.hoisted(() => ({
  statements: [] as { sql: string; params: unknown[] }[],
}));

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

// The database is the source of truth: catalog tables may be filled when empty, never
// emptied or overwritten from the seed files or code defaults.
const CATALOG_TABLES = [
  'packages', 'sports', 'sport_events', 'sport_facilities', 'slot_weekday_configurations',
  'slot_availability_exceptions', 'slot_block_rules', 'coaching_packages',
  'coaching_session_templates', 'coaching_sessions',
].join('|');

async function freshDatabaseModule() {
  vi.resetModules(); // database.ts runs its schema setup once per module instance
  db.statements = [];
  return import('./database');
}

function sqlOf(pattern: RegExp) {
  return db.statements.filter(({ sql }) => pattern.test(sql)).map(({ sql }) => sql);
}

beforeEach(() => {
  db.statements = [];
});

describe('db:seed keeps existing data', () => {
  it('deletes nothing from catalog tables', async () => {
    const { seedDatabase } = await freshDatabaseModule();
    await seedDatabase();

    // The schema setup may still remove rows with no sport or facility: they can't be valid, and the
    // next statement makes those columns NOT NULL.
    const deletes = sqlOf(new RegExp(`(DELETE FROM|TRUNCATE TABLE)\\s+(${CATALOG_TABLES})\\b`, 'i'))
      .filter((sql) => !/WHERE sport_id IS NULL OR facility_code IS NULL$/i.test(sql.trim()));
    expect(deletes).toEqual([]);
  });

  it('only inserts missing catalog rows and never overwrites existing ones', async () => {
    const { seedDatabase } = await freshDatabaseModule();
    await seedDatabase();

    const catalogInserts = sqlOf(new RegExp(`INSERT INTO (${CATALOG_TABLES})\\b`, 'i'));
    expect(catalogInserts.length).toBeGreaterThanOrEqual(9);
    for (const sql of catalogInserts) {
      expect(sql).not.toMatch(/DO UPDATE/i);
    }
  });

  it('does not disable or change coaching packages, weekly sessions or session spots', async () => {
    const { seedDatabase } = await freshDatabaseModule();
    await seedDatabase();

    expect(sqlOf(/UPDATE (coaching_packages|coaching_session_templates|coaching_sessions)\b/i)).toEqual([]);
  });
});

describe('server startup keeps existing data', () => {
  it('no longer forces facility addresses, prices, tags or disabled sports', async () => {
    const { ensureDatabaseReady } = await freshDatabaseModule();
    await ensureDatabaseReady();

    const startup = db.statements.map(({ sql }) => sql).join('\n');
    // Filling a missing address is allowed; replacing one that is set is not.
    for (const sql of sqlOf(/SET address\s*=/i)) {
      expect(sql).toMatch(/WHERE address IS NULL OR map_location_url IS NULL/i);
    }
    expect(startup).not.toMatch(/price_label\s*=\s*CASE/i);
    expect(startup).not.toMatch(/SET tag_label\s*=/i);
    expect(startup).not.toMatch(/UPDATE sports\s+SET enabled = FALSE/i);
  });

  it('still fills empty values, which never changes real data', async () => {
    const { ensureDatabaseReady } = await freshDatabaseModule();
    await ensureDatabaseReady();

    expect(sqlOf(/UPDATE sports\s+SET banner_key = COALESCE\(banner_key, image_key\)\s+WHERE banner_key IS NULL/i)).toHaveLength(1);
  });

  it('applies one-time data migrations as part of the schema setup', async () => {
    const { ensureDatabaseReady } = await freshDatabaseModule();
    await ensureDatabaseReady();

    expect(sqlOf(/CREATE TABLE IF NOT EXISTS applied_data_migrations/i)).toHaveLength(1);
  });
});
