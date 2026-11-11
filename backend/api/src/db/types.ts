/**
 * The database seam.
 *
 * Repositories depend on these interfaces, never on a driver. Production wires
 * in node-postgres (`pgDatabase.ts`); the test suite wires in an in-process
 * Postgres. Both speak the same SQL, so nothing above this layer can tell.
 */

export interface QueryResult<Row> {
  rows: Row[];
  /** Rows affected by INSERT/UPDATE/DELETE (0 when the driver reports none). */
  rowCount: number;
}

/** Anything that can run a parameterised statement: the pool or a transaction. */
export interface Queryable {
  query<Row = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<Row>>;
}

/** A transaction handle. Additionally allows multi-statement scripts (migrations). */
export interface Transaction extends Queryable {
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  /**
   * Runs `fn` inside BEGIN/COMMIT on a single connection. Rolls back and
   * rethrows if `fn` throws. Pass the handle to repositories that must take part.
   */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
