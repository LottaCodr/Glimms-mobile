import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../lib/logger';
import { isUuid } from '../utils/uuid';

export interface AuthUser {
  sub:   string;   // users.id (uuid)
  email: string;
  tier:  'free' | 'premium' | 'pro';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Verifies an access token and returns its claims; throws if it is not valid.
 *
 * A correctly signed token whose subject is not a uuid was issued before the
 * move to Postgres (Mongo ObjectId subjects). It is treated as invalid so the
 * client refreshes or signs in again, instead of the id reaching a uuid column.
 */
export function verifyAccessToken(token: string): AuthUser {
  const claims = jwt.verify(token, config.jwt.secret) as AuthUser;
  if (!isUuid(claims?.sub)) throw new jwt.JsonWebTokenError('token subject is not a valid user id');
  return claims;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ── Require a valid JWT — rejects with 401 if missing/invalid ─────────────────

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing access token', code: 'MISSING_TOKEN' });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    logger.debug({ err }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }
}

// ── Optional auth — attaches user if token present, continues either way ──────

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // silently ignore — user stays undefined
    }
  }
  next();
}

// ── Tier guard — must be used AFTER requireAuth ────────────────────────────────

export function requireTier(...tiers: Array<'free' | 'premium' | 'pro'>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });
      return;
    }
    if (!tiers.includes(req.user.tier)) {
      res.status(403).json({
        error:       `This feature requires: ${tiers.join(' or ')}`,
        yourTier:    req.user.tier,
        upgradeUrl:  'https://app.glimms.ai/upgrade',
        code:        'UPGRADE_REQUIRED',
      });
      return;
    }
    next();
  };
}
