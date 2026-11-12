/**
 * Database for the test suite.
 *
 * Default: PGlite — real PostgreSQL compiled to WASM, running inside the jest
 * worker. No Docker, no services, and each test file gets a private database,
 * so files can run in parallel.
 *
 * With TEST_DATABASE_URL set, the same tests run through the production
 * node-postgres driver against that server instead (CI does this against a
 * Postgres container). That mode resets the target database: run it with
 * `--runInBand` and never point it at anything you care about.
 */
import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../db';
import { runMigrations } from '../db/migrate';
import { createPgDatabase } from '../db/pgDatabase';
import type { Database, QueryResult, Queryable, Transaction } from '../db/types';

function pgliteQueryable(source: Pick<PGlite, 'query'>): Queryable {
  return {
    async query<Row>(text: string, params: readonly unknown[] = []): Promise<QueryResult<Row>> {
      const result = await source.query<Row>(text, params as unknown[]);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    },
  };
}

function createPgliteDatabase(): Database {
  const pglite = new PGlite();
  return {
    ...pgliteQueryable(pglite),
    transaction: <T>(fn: (tx: Transaction) => Promise<T>) =>
      pglite.transaction(async (tx) =>
        fn({
          ...pgliteQueryable(tx),
          exec: async (sql: string) => { await tx.exec(sql); },
        }),
      ) as Promise<T>,
    close: () => pglite.close(),
  };
}

async function createExternalDatabase(connectionString: string): Promise<Database> {
  const db = createPgDatabase({ connectionString, sslMode: 'disable', maxConnections: 4 });
  await db.transaction(async (tx) => {
    await tx.exec(`
      drop schema if exists public cascade;
      drop schema if exists supabase_migrations cascade;
      create schema public;
    `);
  });
  return db;
}

const TABLES = [
  'credo_payments', 'account_tokens', 'stripe_events', 'account_erasures',
  'saved_designs', 'design_sessions', 'design_jobs', 'catalog_items', 'device_tokens',
  'subscriptions', 'user_preferences', 'refresh_tokens', 'users',
];

export interface TestDatabase {
  db: Database;
  /** Empties every table (schema stays). */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** Creates a migrated database and installs it as the app's database. */
export async function setupTestDatabase(): Promise<TestDatabase> {
  const externalUrl = process.env.TEST_DATABASE_URL;
  const db = externalUrl ? await createExternalDatabase(externalUrl) : createPgliteDatabase();
  await runMigrations(db);
  setDb(db);

  return {
    db,
    async reset() {
      await db.query(`truncate table ${TABLES.join(', ')} cascade`);
    },
    async close() {
      setDb(null);
      await db.close();
    },
  };
}
