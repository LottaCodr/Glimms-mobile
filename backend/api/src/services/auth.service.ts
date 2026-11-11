import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { refreshTokensRepository, usersRepository, USERS_EMAIL_UNIQUE } from '../repositories';
import { isUniqueViolation } from '../db/errors';
import { config } from '../config';
import { ConflictError, UnauthorizedError } from '../middleware/errorHandler.middleware';

export interface RegisterInput { email: string; password: string; name?: string }
export interface LoginInput    { email: string; password: string }

// Parse expiresIn like "15m", "7d" to seconds for response; fallback 900
function parseExpiresInToSeconds(exp: string): number {
  const m = exp.match(/^(\d+)([smhd])$/);
  if (!m) return 900;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[unit] ?? 1);
}

function parseRefreshExpiresMs(exp: string): number {
  const secs = parseExpiresInToSeconds(exp);
  return secs * 1000;
}

// ── Token pair generator ──────────────────────────────────────────────────────

async function issueTokenPair(userId: string, email: string, tier: string) {
  // Access token (short-lived)
  const accessToken = jwt.sign(
    { sub: userId, email, tier },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any },
  );

  // Refresh token (long-lived; only its SHA-256 hash is stored)
  const rawRefresh  = crypto.randomBytes(48).toString('hex');
  const tokenHash   = crypto.createHash('sha256').update(rawRefresh).digest('hex');
  const expiresAt   = new Date(Date.now() + parseRefreshExpiresMs(config.jwt.refreshExpiresIn));

  // Postgres has no TTL index, so clear this user's dead tokens as we go.
  await refreshTokensRepository.deleteExpired(userId);
  await refreshTokensRepository.create({ userId, tokenHash, expiresAt });

  return { accessToken, refreshToken: rawRefresh, expiresIn: parseExpiresInToSeconds(config.jwt.expiresIn) };
}

// ── Public service methods ────────────────────────────────────────────────────

export const authService = {

  async register({ email, password, name }: RegisterInput) {
    const normalisedEmail = email.toLowerCase();
    if (await usersRepository.findByEmail(normalisedEmail)) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    let user;
    try {
      user = await usersRepository.create({ email: normalisedEmail, passwordHash, name: name?.trim() || null });
    } catch (err) {
      // Two sign-ups for one address can both pass the check above; the unique
      // constraint is what actually decides, so translate its violation too.
      if (isUniqueViolation(err, USERS_EMAIL_UNIQUE)) throw new ConflictError('Email already registered');
      throw err;
    }

    // Welcome email (fire-and-forget, never block registration)
    try {
      const { notificationsService } = await import('./notifications.service');
      notificationsService.sendEmail(
        user.email,
        'Welcome to Glimms ✨',
        `<p>Hi ${user.name ?? 'there'},</p><p>Welcome to Glimms — your AI style companion. Start by scanning your wardrobe!</p>`
      ).catch(() => { /* ignore email failures */ });
    } catch (_e) {
      // ignore — email is non-critical
    }

    return issueTokenPair(user.id, user.email, user.tier);
  },

  async login({ email, password }: LoginInput) {
    const user = await usersRepository.findActiveCredentialsByEmail(email.toLowerCase());
    if (!user) throw new UnauthorizedError('Invalid credentials');
    if (!user.passwordHash) throw new UnauthorizedError('Please use social sign-in for this account');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    return issueTokenPair(user.id, user.email, user.tier);
  },

  async refresh(rawRefreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // Rotation: the token is deleted as it is redeemed (single statement), so
    // it cannot be replayed — not even by a concurrent request.
    const redeemed = await refreshTokensRepository.consume(tokenHash);
    if (!redeemed) throw new UnauthorizedError('Refresh token is invalid or expired');

    const user = await usersRepository.findById(redeemed.userId);
    if (!user?.isActive) throw new UnauthorizedError('Account is deactivated');

    return issueTokenPair(user.id, user.email, user.tier);
  },

  async logout(rawRefreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await refreshTokensRepository.deleteByHash(tokenHash);
    return { message: 'Logged out successfully' };
  },
};
