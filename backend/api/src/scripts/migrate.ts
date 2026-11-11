/**
 * Applies pending SQL migrations from supabase/migrations.
 *
 *   npm run db:migrate            # dev (ts-node)
 *   node dist/scripts/migrate.js  # production image / release step
 *
 * Equivalent to `supabase db push` and shares its history table, so either
 * tool can be used against the same database.
 */
import { disconnectDb, getDb } from '../db';
import { runMigrations } from '../db/migrate';

async function main() {
  const report = await runMigrations(getDb(), { log: (message) => console.log(`  ${message}`) });
  console.log(
    report.applied.length
      ? `✅ Applied ${report.applied.length} migration(s).`
      : `✅ Database is up to date (${report.skipped.length} migration(s) already applied).`,
  );
}

main()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
