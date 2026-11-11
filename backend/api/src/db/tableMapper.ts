/**
 * A deliberately small data mapper: one declaration per table of which entity
 * property lives in which column, and which columns are jsonb.
 *
 * It does three mechanical things so repositories don't repeat them:
 *   - SELECT list + row → entity (snake_case → camelCase)
 *   - entity → INSERT/UPDATE fragments, restricted to declared, writable
 *     properties. Anything else in the input is dropped, which is what stops
 *     mass-assignment (`{ ...req.body }`) from reaching the database.
 *   - jsonb encoding (node-postgres would otherwise send a JS array as a
 *     Postgres array literal, which is not valid JSON).
 *
 * Everything with actual logic is written as SQL in the repositories.
 */

export interface ColumnDef {
  column: string;
  /** Stored as jsonb — serialised on write. */
  json?: boolean;
  /** Set by the database (ids, timestamps) — never written by the mapper. */
  readOnly?: boolean;
}

export type ColumnMap<Entity> = { [K in keyof Entity & string]: string | ColumnDef };

export interface WriteFragments {
  columns: string[];
  placeholders: string[];
  values: unknown[];
}

export class TableMapper<Entity extends object> {
  private readonly defs: Array<{ property: keyof Entity & string } & ColumnDef>;

  constructor(
    readonly table: string,
    columns: ColumnMap<Entity>,
  ) {
    this.defs = (Object.keys(columns) as Array<keyof Entity & string>).map((property) => {
      const def: string | ColumnDef = columns[property];
      return typeof def === 'string' ? { property, column: def } : { property, ...def };
    });
  }

  /** Comma-separated column list for SELECT / RETURNING. */
  get columns(): string {
    return this.defs.map((d) => d.column).join(', ');
  }

  toEntity(row: Record<string, unknown>): Entity {
    const entity: Record<string, unknown> = {};
    for (const def of this.defs) entity[def.property] = row[def.column];
    return entity as Entity;
  }

  toEntities(rows: Array<Record<string, unknown>>): Entity[] {
    return rows.map((row) => this.toEntity(row));
  }

  /**
   * Column/placeholder/value triples for the writable properties present in
   * `data` (`undefined` means "not provided"; `null` is written as NULL).
   * Placeholders start at `$firstIndex`.
   */
  toWrite(data: Partial<Entity>, firstIndex = 1): WriteFragments {
    const out: WriteFragments = { columns: [], placeholders: [], values: [] };
    for (const def of this.defs) {
      if (def.readOnly) continue;
      const value = (data as Record<string, unknown>)[def.property];
      if (value === undefined) continue;
      const position = firstIndex + out.values.length;
      out.columns.push(def.column);
      out.placeholders.push(def.json ? `$${position}::jsonb` : `$${position}`);
      out.values.push(def.json && value !== null ? JSON.stringify(value) : value);
    }
    return out;
  }

  /** `col = $n, …` for UPDATE. Returns null when `data` has nothing writable. */
  toAssignments(data: Partial<Entity>, firstIndex = 1): { sql: string; values: unknown[] } | null {
    const write = this.toWrite(data, firstIndex);
    if (write.columns.length === 0) return null;
    return {
      sql: write.columns.map((column, i) => `${column} = ${write.placeholders[i]}`).join(', '),
      values: write.values,
    };
  }
}
