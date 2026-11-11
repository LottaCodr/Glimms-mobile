import { config } from '../config';
import { logger } from '../lib/logger';
import { createPgDatabase } from './pgDatabase';
import type { Database } from './types';

export type { Database, Queryable, Transaction, QueryResult } from './types';

let instance: Database | null = null;

/**
 * The process-wide database handle. Created lazily so that importing a
 * repository never opens sockets (tests install their own via `setDb`).
 */
export function getDb(): Database {
  if (!instance) {
    instance = createPgDatabase({
      connectionString: config.database.url,
      sslMode:          config.database.sslMode,
      caCert:           config.database.caCert,
      maxConnections:   config.database.poolMax,
      onIdleClientError: (err) => logger.error({ err }, 'Postgres idle client error'),
    });
  }
  return instance;
}

/** Swap the handle — for tests and scripts. Returns the previous one. */
export function setDb(db: Database | null): Database | null {
  const previous = instance;
  instance = db;
  return previous;
}

/** Fails fast at boot when the database is unreachable or misconfigured. */
export async function connectDb(): Promise<void> {
  await getDb().query('select 1');
  logger.info('Postgres connected');
}

export async function disconnectDb(): Promise<void> {
  if (!instance) return;
  await instance.close();
  instance = null;
  logger.info('Postgres disconnected cleanly');
}

/** Liveness probe for /health. Never throws. */
export async function pingDb(timeoutMs = 3_000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('database ping timed out')), timeoutMs);
    });
    await Promise.race([getDb().query('select 1'), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
