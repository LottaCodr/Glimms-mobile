/**
 * Auth service tests — run against a real (in-process) Postgres.
 */
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
