import type { PoolClient } from 'pg';

// The database is the source of truth for catalog data (sports, cards, facilities, prices,
// coaching packages and sessions): db:seed only fills an empty database. To change data in a
// database that already exists, add a migration here. Each one runs once per database, inside
// the schema-setup transaction, and is recorded so it never runs again and can't overwrite
// later edits. Also update the matching seed JSON, so a brand-new database starts the same way.
//
// Rules: never edit or remove a migration that has shipped; give each a new, unique id
// ("NNN-short-name"); keep it idempotent (e.g. UPDATE ... WHERE value IS DISTINCT FROM ...).
export type DataMigration = {
  id: string;
  description: string;
  up: (client: PoolClient) => Promise<void>;
};

export const DATA_MIGRATIONS: DataMigration[] = [];

export async function applyDataMigrations(client: PoolClient, migrations: DataMigration[] = DATA_MIGRATIONS): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS applied_data_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  if (migrations.length === 0) {
    return;
  }

  // Two app instances starting at once would otherwise both see a migration as pending.
  // The lock is released when the surrounding transaction ends.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['applied_data_migrations']);

  const appliedResult = await client.query<{ id: string }>('SELECT id FROM applied_data_migrations');
  const applied = new Set(appliedResult.rows.map((row) => row.id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await migration.up(client);
    await client.query(
      'INSERT INTO applied_data_migrations (id, description) VALUES ($1, $2)',
      [migration.id, migration.description]
    );
    console.log(`[db] Applied data migration ${migration.id}: ${migration.description}`);
  }
}
