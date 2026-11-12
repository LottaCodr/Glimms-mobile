/**
 * Auth service tests — run against a real (in-process) Postgres.
 */
import jwt from 'jsonwebtoken';
import { authService } from '../services/auth.service';
import { refreshTokensRepository, usersRepository } from '../repositories';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';

let database: TestDatabase;

beforeAll(async () => {
  database = await setupTestDatabase();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.reset();
});

describe('authService.register', () => {
  it('creates a user and returns token pair', async () => {
    const result = await authService.register({
      email:    'lottanna@glimms.ai',
      password: 'securepassword123',
      name:     'Lotanna',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.expiresIn).toBe(900);
  });

  it('stores the user with a hashed password', async () => {
    await authService.register({ email: 'test@glimms.ai', password: 'password123' });
    const user = await usersRepository.findActiveCredentialsByEmail('test@glimms.ai');
    expect(user).not.toBeNull();
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt
    expect(user!.passwordHash).not.toBe('password123');
    expect(user!.tier).toBe('free');
  });

  it('throws ConflictError on duplicate email', async () => {
    await authService.register({ email: 'dup@glimms.ai', password: 'password123' });
    await expect(
      authService.register({ email: 'dup@glimms.ai', password: 'otherpassword' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('stores email in lowercase', async () => {
    await authService.register({ email: 'UPPER@GLIMMS.AI', password: 'password123' });
    const user = await usersRepository.findByEmail('upper@glimms.ai');
    expect(user).not.toBeNull();
  });
});

describe('authService.login', () => {
  beforeEach(async () => {
    await authService.register({ email: 'login@glimms.ai', password: 'mypassword' });
  });

  it('returns tokens for valid credentials', async () => {
    const result = await authService.login({ email: 'login@glimms.ai', password: 'mypassword' });
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('throws UnauthorizedError for wrong password', async () => {
    await expect(
      authService.login({ email: 'login@glimms.ai', password: 'wrongpassword' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws UnauthorizedError for unknown email', async () => {
    await expect(
      authService.login({ email: 'ghost@glimms.ai', password: 'password' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('authService.refresh', () => {
  it('rotates the refresh token', async () => {
    const { refreshToken: rt1 } = await authService.register({
      email: 'refresh@glimms.ai', password: 'password123',
    });

    const { refreshToken: rt2 } = await authService.refresh(rt1);

    // Old token should be invalidated
    await expect(authService.refresh(rt1)).rejects.toMatchObject({ statusCode: 401 });

    // New token should work
    const { accessToken } = await authService.refresh(rt2);
    expect(accessToken).toBeDefined();
  });

  it('throws for invalid token', async () => {
    await expect(authService.refresh('not-a-real-token')).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('authService.logout', () => {
  it('invalidates the refresh token', async () => {
    const { refreshToken } = await authService.register({
      email: 'logout@glimms.ai', password: 'password123',
    });

    await authService.logout(refreshToken);

    await expect(authService.refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('refresh token storage', () => {
  it('never returns the password hash on a plain user lookup', async () => {
    await authService.register({ email: 'nohash@glimms.ai', password: 'password123' });
    const user = await usersRepository.findByEmail('nohash@glimms.ai');
    expect(user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(user)).not.toContain('$2');
  });

  it('lets a refresh token be redeemed exactly once under concurrency', async () => {
    const { refreshToken } = await authService.register({ email: 'race@glimms.ai', password: 'password123' });

    const results = await Promise.allSettled([
      authService.refresh(refreshToken),
      authService.refresh(refreshToken),
      authService.refresh(refreshToken),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('rejects an expired refresh token and sweeps it', async () => {
    const { refreshToken } = await authService.register({ email: 'expired@glimms.ai', password: 'password123' });
    await database.db.query("update refresh_tokens set expires_at = now() - interval '1 minute'");

    await expect(authService.refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(await refreshTokensRepository.deleteExpired()).toBe(1);
  });

  it('refuses to refresh for a deactivated account', async () => {
    const { refreshToken } = await authService.register({ email: 'gone@glimms.ai', password: 'password123' });
    const user = await usersRepository.findByEmail('gone@glimms.ai');
    await usersRepository.update(user!.id, { isActive: false });

    await expect(authService.refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    await expect(authService.login({ email: 'gone@glimms.ai', password: 'password123' }))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  it('maps a concurrent duplicate sign-up to 409, not a database error', async () => {
    const attempts = await Promise.allSettled([
      authService.register({ email: 'twice@glimms.ai', password: 'password123' }),
      authService.register({ email: 'twice@glimms.ai', password: 'password123' }),
    ]);
    const rejected = attempts.filter((a): a is PromiseRejectedResult => a.status === 'rejected');
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409 });
  });
});

describe('authService.socialSignIn', () => {
  const idOf = (tokens: { accessToken: string }) => (jwt.decode(tokens.accessToken) as { sub: string }).sub;
  const verifierFor = (identity: Record<string, unknown>) => ({
    verify: jest.fn(async () => ({
      provider: 'google', subject: 'g-1', email: 'ada@glimms.ai', emailVerified: true, name: 'Ada', ...identity,
    })),
  }) as any;

  it('creates a verified account on first sign-in and reuses it afterwards', async () => {
    const first = await authService.socialSignIn('google', 'token', undefined, verifierFor({}));
    const second = await authService.socialSignIn('google', 'token', undefined, verifierFor({}));

    expect(idOf(second)).toBe(idOf(first));
    const user = await usersRepository.findByEmail('ada@glimms.ai');
    expect(user).toMatchObject({ name: 'Ada' });
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('finds the account by the provider\'s user id even when the email changes', async () => {
    const first = await authService.socialSignIn('google', 'token', undefined, verifierFor({}));
    const later = await authService.socialSignIn('google', 'token', undefined, verifierFor({ email: 'new@glimms.ai' }));
    expect(idOf(later)).toBe(idOf(first));
  });

  it('takes over an unverified password account: the old password and sessions stop working', async () => {
    // Someone registered the address without proving they own it.
    const squatter = await authService.register({ email: 'ada@glimms.ai', password: 'squatter-pass' });

    const owner = await authService.socialSignIn('google', 'token', undefined, verifierFor({}));

    expect(idOf(owner)).toBe(idOf(squatter));
    await expect(authService.login({ email: 'ada@glimms.ai', password: 'squatter-pass' })).rejects.toThrow('Invalid credentials');
    await expect(authService.refresh(squatter.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('does not link to an existing account when the provider has not verified the email', async () => {
    await authService.register({ email: 'ada@glimms.ai', password: 'password123' });
    await expect(authService.socialSignIn('google', 'token', undefined, verifierFor({ emailVerified: false })))
      .rejects.toMatchObject({ statusCode: 401 });
    // The existing account is untouched.
    await expect(authService.login({ email: 'ada@glimms.ai', password: 'password123' })).resolves.toHaveProperty('accessToken');
  });

  it('keeps Google and Apple identities apart', async () => {
    const google = await authService.socialSignIn('google', 'token', undefined, verifierFor({ subject: 'same-id' }));
    const apple = await authService.socialSignIn('apple', 'token', undefined,
      verifierFor({ provider: 'apple', subject: 'same-id', email: 'relay@privaterelay.appleid.com' }));
    expect(idOf(apple)).not.toBe(idOf(google));
  });
});
