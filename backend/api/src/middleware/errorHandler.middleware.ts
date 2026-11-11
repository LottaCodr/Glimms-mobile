import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../lib/logger';
import { isPgError, PgErrorCode, PgErrorLike } from '../db/errors';

// ── Custom error classes ──────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message, 'BAD_REQUEST');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, code = 'SERVICE_UNAVAILABLE') {
    super(503, message, code);
  }
}

// ── Database errors → HTTP ────────────────────────────────────────────────────

/** `users_email_key` → `email`: constraints are named <table>_<column(s)>_<kind>. */
function fieldFromConstraint(constraint: string | undefined): string {
  const match = /^(?:users|refresh_tokens|user_preferences|subscriptions|catalog_items|design_jobs|design_sessions|saved_designs|device_tokens)_(.+?)_[a-z]+$/.exec(constraint ?? '');
  return match?.[1] ?? 'field';
}

/**
 * Maps the constraint violations a client can cause to 4xx responses. Returns
 * null for everything else (connection loss, syntax errors, …) — those are
 * server faults and fall through to the generic 500.
 */
function describeDatabaseError(err: PgErrorLike): { status: number; body: Record<string, unknown> } | null {
  switch (err.code) {
    case PgErrorCode.UniqueViolation:
      return { status: 409, body: { error: `${fieldFromConstraint(err.constraint)} already exists`, code: 'DUPLICATE_KEY' } };
    case PgErrorCode.InvalidTextRepresentation:
      return { status: 400, body: { error: 'Invalid ID format', code: 'INVALID_ID' } };
    case PgErrorCode.ForeignKeyViolation:
      return { status: 409, body: { error: 'Referenced resource does not exist', code: 'INVALID_REFERENCE' } };
    case PgErrorCode.CheckViolation:
    case PgErrorCode.NotNullViolation:
      return { status: 400, body: { error: 'Validation failed', details: [err.constraint ?? 'constraint violated'], code: 'VALIDATION_ERROR' } };
    default:
      return null;
  }
}

// ── Global error handler ──────────────────────────────────────────────────────

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Known app errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // Database constraint violations that slipped past request validation
  if (isPgError(err)) {
    const response = describeDatabaseError(err);
    if (response) {
      res.status(response.status).json(response.body);
      return;
    }
  }

  // Multer errors
  if (err.name === 'MulterError') {
    res.status(400).json({ error: err.message, code: 'FILE_ERROR' });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return;
  }

  // Unknown — log and hide details in production
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  res.status(500).json({
    error: config.isDev ? err.message : 'Something went wrong',
    code:  'INTERNAL_ERROR',
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}
