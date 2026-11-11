/** PostgreSQL SQLSTATE codes the API reacts to. */
export const PgErrorCode = {
  UniqueViolation:       '23505',
  ForeignKeyViolation:   '23503',
  CheckViolation:        '23514',
  NotNullViolation:      '23502',
  InvalidTextRepresentation: '22P02',
} as const;

export interface PgErrorLike {
  code: string;
  constraint?: string;
  detail?: string;
}

/** True for errors raised by Postgres itself (any driver): they carry a 5-char SQLSTATE. */
export function isPgError(err: unknown): err is PgErrorLike {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (!isPgError(err) || err.code !== PgErrorCode.UniqueViolation) return false;
  return constraint === undefined || err.constraint === constraint;
}
