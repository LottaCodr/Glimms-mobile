import { Pool, PoolClient, PoolConfig } from 'pg';
import type { Database, QueryResult, Transaction } from './types';

export type SslMode = 'disable' | 'require' | 'verify-full';

export interface PgDatabaseOptions {
  connectionString: string;
  sslMode: SslMode;
  /** PEM CA bundle; required for `verify-full` against Supabase (it uses its own CA). */
  caCert?: string;
  maxConnections: number;
  onIdleClientError?: (err: Error) => void;
}

/**
 * `require` encrypts without verifying the certificate chain (libpq's
 * sslmode=require). `verify-full` also validates chain and hostname.
 */
function sslConfig(mode: SslMode, caCert?: string): PoolConfig['ssl'] {
  if (mode === 'disable') return false;
  if (mode === 'verify-full') return caCert ? { ca: caCert, rejectUnauthorized: true } : { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * node-postgres would otherwise let `?sslmode=` in the URL override the `ssl`
 * option. TLS is decided in exactly one place (DATABASE_SSL), so strip it.
 */
function withoutSslParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return connectionString; // not URL-shaped — let pg report the real problem
  }
}

function toResult<Row>(res: { rows: unknown[]; rowCount: number | null }): QueryResult<Row> {
  return { rows: res.rows as Row[], rowCount: res.rowCount ?? 0 };
}

function clientTransaction(client: PoolClient): Transaction {
  return {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      return toResult<Row>(await client.query(text, params as unknown[]));
    },
    async exec(sql: string) {
      // No parameters → simple query protocol → multiple statements allowed.
      await client.query(sql);
    },
  };
}

export function createPgDatabase(options: PgDatabaseOptions): Database {
  const pool = new Pool({
    connectionString: withoutSslParams(options.connectionString),
    ssl: sslConfig(options.sslMode, options.caCert),
    max: options.maxConnections,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Client-side so it also works through connection poolers, which reject
    // session-level startup parameters such as statement_timeout.
    query_timeout: 45_000,
    application_name: 'glimms-api',
  });

  // An idle pooled client can be dropped by the server or pooler (Supabase
  // restarts, network blips). Without a listener that surfaces as an unhandled
  // 'error' event and takes the whole process down.
  pool.on('error', (err) => options.onIdleClientError?.(err));

  return {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      return toResult<Row>(await pool.query(text, params as unknown[]));
    },

    async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(clientTransaction(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}
