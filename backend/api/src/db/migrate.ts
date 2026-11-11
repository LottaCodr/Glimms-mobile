import { promises as fs } from 'fs';
import path from 'path';
import type { Database } from './types';

/**
 * Forward-only SQL migrations from `supabase/migrations/<version>_<name>.sql`.
 *
 * History lives in `supabase_migrations.schema_migrations` — the table the
 * Supabase CLI itself uses — so `supabase db push` and this runner agree on
 * what has been applied and can be used interchangeably.
 *
 * Each file runs in its own transaction together with its history row, so a
 * failed migration leaves nothing behind. A transaction-scoped advisory lock
 * stops two instances that boot at the same time from racing.
 */

export const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const FILE_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const ADVISORY_LOCK_KEY = 7_461_001; // arbitrary, unique to this runner

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
}

export async function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = (await fs.readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  const migrations: MigrationFile[] = [];
  for (const file of entries) {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      throw new Error(`Migration "${file}" must be named <YYYYMMDDHHMMSS>_<snake_case_name>.sql`);
    }
    migrations.push({ version: match[1], name: match[2], sql: await fs.readFile(path.join(dir, file), 'utf8') });
  }
  return migrations;
}

async function ensureHistoryTable(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.exec(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version    text primary key,
        statements text[],
        name       text
      );
    `);
  });
}

export async function runMigrations(
  db: Database,
  options: { dir?: string; log?: (message: string) => void } = {},
): Promise<MigrationReport> {
  const log = options.log ?? (() => undefined);
  const migrations = await loadMigrations(options.dir);
  const report: MigrationReport = { applied: [], skipped: [] };

  await ensureHistoryTable(db);

  for (const migration of migrations) {
    const label = `${migration.version}_${migration.name}`;
    const applied = await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);
      // Re-check under the lock: another instance may have just applied it.
      const existing = await tx.query(
        'select 1 from supabase_migrations.schema_migrations where version = $1',
        [migration.version],
      );
      if (existing.rows.length > 0) return false;

      await tx.exec(migration.sql);
      await tx.query(
        'insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)',
        [migration.version, migration.name, [migration.sql]],
      );
      return true;
    });

    if (applied) {
      report.applied.push(label);
      log(`applied ${label}`);
    } else {
      report.skipped.push(label);
    }
  }

  return report;
}
