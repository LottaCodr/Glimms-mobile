import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  accountTokensRepository, refreshTokensRepository, usersRepository, USERS_EMAIL_UNIQUE,
} from '../repositories';
import { getDb } from '../db';
import { emails, mailer } from '../lib/mailer';
import { logger } from '../lib/logger';
import { APPLE, GOOGLE, oidcVerifier, OidcVerifier, VerifiedIdentity } from '../lib/oidc';
import type { AccountTokenPurpose, UserCredentials } from '../models';
import { isUniqueViolation } from '../db/errors';
import { config } from '../config';
import { AppError, ConflictError, UnauthorizedError } from '../middleware/errorHandler.middleware';

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

// ── One-time account tokens (password reset, email verification) ─────────────

export const PASSWORD_RESET_MINUTES = 30;
const EMAIL_VERIFICATION_HOURS = 48;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

async function issueAccountToken(userId: string, purpose: AccountTokenPurpose, lifetimeMs: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString('base64url');
  await accountTokensRepository.replace({
    userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + lifetimeMs),
  });
  return raw;
}

/** Sends in the background: a slow or failing mail provider must never fail or delay the request. */
function sendInBackground(mail: Parameters<typeof mailer.send>[0], what: string): void {
  mailer.send(mail).catch((err) => logger.error({ err: err?.message }, `Could not send ${what} email`));
}

async function sendVerificationEmail(user: { id: string; email: string; name: string | null }): Promise<void> {
  const token = await issueAccountToken(user.id, 'email_verification', EMAIL_VERIFICATION_HOURS * 3_600_000);
  const url = `${config.publicApiUrl}/account/verify-email?token=${token}`;
  sendInBackground(emails.verifyEmail(user.email, user.name, url), 'verification');
}

function invalidLink(): AppError {
  return new AppError(400, 'This link is invalid or has expired', 'INVALID_TOKEN');
}

// ── Social sign-in ───────────────────────────────────────────────────────────

/**
 * Finds or creates the account for a verified Google/Apple identity.
 *
 * An identity is matched by the provider's stable subject id first. Only when
 * the provider vouches for the email is it matched to an existing account by
 * email. If that account never proved it owns the email, its password is
 * removed and its sessions revoked: otherwise someone could register with a
 * victim's address in advance and keep access after the victim signs in.
 */
async function resolveSocialUser(identity: VerifiedIdentity, suppliedName?: string): Promise<UserCredentials> {
  const subjectColumn = identity.provider === 'google' ? 'googleSub' : 'appleSub';

  const known = await usersRepository.findCredentialsByIdentity(identity.provider, identity.subject);
  if (known) return known;

  if (!identity.email || !identity.emailVerified) {
    throw new UnauthorizedError('This account has no verified email address');
  }

  const name = (suppliedName?.trim() || identity.name || '').slice(0, 100) || null;
  const existing = await usersRepository.findCredentialsByEmail(identity.email);
  if (existing) {
    const takeoverRisk = !existing.emailVerifiedAt;
    await getDb().transaction(async (tx) => {
      await usersRepository.updateCredentials(existing.id, {
        [subjectColumn]: identity.subject,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        ...(takeoverRisk ? { passwordHash: null } : {}),
        ...(!existing.name && name ? { name } : {}),
      }, tx);
      if (takeoverRisk) await refreshTokensRepository.deleteAllForUser(existing.id, tx);
    });
    return (await usersRepository.findCredentialsById(existing.id))!;
  }

  try {
    const created = await usersRepository.create({
      email: identity.email, passwordHash: null, name,
      emailVerifiedAt: new Date(), [subjectColumn]: identity.subject,
    });
    return (await usersRepository.findCredentialsById(created.id))!;
  } catch (err) {
    // Two first sign-ins racing each other: the loser reads the winner's row.
    if (isUniqueViolation(err)) {
      const winner = await usersRepository.findCredentialsByIdentity(identity.provider, identity.subject);
      if (winner) return winner;
    }
    throw err;
  }
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

    // Never blocks or fails registration.
    sendVerificationEmail(user).catch((err) => logger.error({ err: err?.message }, 'Could not issue verification email'));

    return issueTokenPair(user.id, user.email, user.tier);
  },

  async login({ email, password }: LoginInput) {
    const user = await usersRepository.findActiveCredentialsByEmail(email.toLowerCase());
    if (!user) throw new UnauthorizedError('Invalid credentials');
    // Same answer as a wrong password: which accounts exist, and how they sign
    // in, is not revealed to someone guessing.
    if (!user.passwordHash) throw new UnauthorizedError('Invalid credentials');

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

  /** `verifier` is injectable for tests; production uses the providers' live keys. */
  async socialSignIn(
    provider: 'google' | 'apple',
    idToken: string,
    suppliedName?: string,
    verifier: OidcVerifier = oidcVerifier,
  ) {
    const identity = provider === 'google'
      ? await verifier.verify(GOOGLE, idToken, config.social.googleClientIds)
      : await verifier.verify(APPLE, idToken, config.social.appleClientIds);

    const user = await resolveSocialUser(identity, suppliedName);
    if (!user.isActive) throw new UnauthorizedError('Account is deactivated');
    return issueTokenPair(user.id, user.email, user.tier);
  },

  /**
   * Always resolves the same way, whether or not the address has an account,
   * so the endpoint cannot be used to discover who is registered.
   */
  async requestPasswordReset(email: string) {
    const user = await usersRepository.findCredentialsByEmail(email.trim().toLowerCase());
    if (user?.isActive) {
      const token = await issueAccountToken(user.id, 'password_reset', PASSWORD_RESET_MINUTES * 60_000);
      const url = `${config.publicApiUrl}/account/reset-password?token=${token}`;
      sendInBackground(emails.passwordReset(user.email, url, PASSWORD_RESET_MINUTES), 'password reset');
    }
    return { message: 'If that email has an account, a reset link is on its way.' };
  },

  /** For rendering the reset form: is this link still usable? Does not consume it. */
  async isPasswordResetTokenValid(token: string): Promise<boolean> {
    return !!token && accountTokensRepository.isValid(sha256(token), 'password_reset');
  },

  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    const email = await getDb().transaction(async (tx) => {
      const redeemed = await accountTokensRepository.consume(sha256(token), 'password_reset', tx);
      if (!redeemed) throw invalidLink();
      const user = await usersRepository.findById(redeemed.userId, tx);
      if (!user?.isActive) throw invalidLink();
      // Receiving the link proves control of the mailbox.
      await usersRepository.updateCredentials(user.id, {
        passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      }, tx);
      // Whoever knew the old password, or stole a session, is signed out.
      await refreshTokensRepository.deleteAllForUser(user.id, tx);
      return user.email;
    });
    sendInBackground(emails.passwordChanged(email), 'password changed');
    return { message: 'Password updated. Sign in with your new password.' };
  },

  async verifyEmail(token: string) {
    const redeemed = await accountTokensRepository.consume(sha256(token), 'email_verification');
    if (!redeemed) throw invalidLink();
    const user = await usersRepository.findById(redeemed.userId);
    if (!user) throw invalidLink();
    if (!user.emailVerifiedAt) await usersRepository.updateCredentials(user.id, { emailVerifiedAt: new Date() });
    return { message: 'Email confirmed.' };
  },

  async resendVerification(userId: string) {
    const user = await usersRepository.findById(userId);
    if (!user) throw new UnauthorizedError();
    if (user.emailVerifiedAt) return { message: 'Email already confirmed.', alreadyVerified: true };
    await sendVerificationEmail(user);
    return { message: 'Verification email sent.', alreadyVerified: false };
  },
};
