import request from 'supertest';
import jwt from 'jsonwebtoken';
import { setupTestDatabase, TestDatabase } from './test/testDatabase';

// Redis-backed pieces are replaced so the HTTP suite needs no running services.
// (Postgres is real: see test/testDatabase.ts.)
jest.mock('./lib/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  },
  connectRedis: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./lib/queue', () => ({
  enqueueDesignJob: jest.fn().mockResolvedValue({ id: 'queued' }),
  enqueueNotification: jest.fn().mockResolvedValue({ id: 'queued' }),
}));
jest.mock('./middleware/rateLimiter.middleware', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { generalLimiter: pass, authLimiter: pass, scanLimiter: pass };
});

// Account deletion reaches Stripe, S3 and the vector store; here those are fakes.
const erased = { prefixes: [] as string[], vectors: [] as string[] };
jest.mock('./services/accountDeletion', () => {
  const { createAccountService } = jest.requireActual('./services/account.service');
  return {
    accountService: createAccountService({
      deleteStripeCustomer: null,
      deleteStoragePrefix: async (prefix: string) => { erased.prefixes.push(prefix); return 0; },
      deleteVectors: async (userId: string) => { erased.vectors.push(userId); },
    }),
  };
});
jest.mock('./lib/mailer', () => {
  const actual = jest.requireActual('./lib/mailer');
  return { ...actual, mailer: { isConfigured: () => true, send: jest.fn().mockResolvedValue(undefined) } };
});

import { createApp } from './app';
import { mailer } from './lib/mailer';

const app = createApp();
let database: TestDatabase;

beforeAll(async () => {
  database = await setupTestDatabase();
});

afterAll(async () => {
  await database.close();
});

async function registerUser(email: string, name?: string): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'password123', name });
  return res.body.accessToken as string;
}

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('glimms-api');
    expect(res.body.checks).toEqual({ database: 'ok', redis: 'ok' });
  });
});

describe('POST /api/auth/register', () => {
  it('registers a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@glimms.ai', password: 'password123', name: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.expiresIn).toBeDefined();
  });

  it('rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@glimms.ai', password: '123' });

    expect(res.status).toBe(400);
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@glimms.ai', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@glimms.ai', password: 'otherpass123' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'logintest@glimms.ai', password: 'mypassword123' });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logintest@glimms.ai', password: 'mypassword123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logintest@glimms.ai', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/users/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('returns user profile with valid token', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'profile@glimms.ai', password: 'password123', name: 'Profile User' });

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('profile@glimms.ai');
    expect(res.body.name).toBe('Profile User');
    expect(res.body.passwordHash).toBeUndefined();
  });
});

describe('GET /api/catalog', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(401);
  });

  it('returns empty result for new user (paginated)', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'catalog@glimms.ai', password: 'password123' });

    const res = await request(app)
      .get('/api/catalog')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`);

    expect(res.status).toBe(200);
    // New paginated shape: { items, total, page, limit }
    if (Array.isArray(res.body)) {
      expect(res.body).toEqual([]);
    } else {
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.page).toBe(1);
    }
  });

  it('supports pagination params', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'catalog2@glimms.ai', password: 'password123' });

    const res = await request(app)
      .get('/api/catalog?page=1&limit=5')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
  });
});

describe('GET /api/designs/jobs', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/designs/jobs');
    expect(res.status).toBe(401);
  });

  it('returns paginated jobs for new user', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'designs@glimms.ai', password: 'password123' });

    const res = await request(app)
      .get('/api/designs/jobs')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
    expect(res.body.total).toBe(0);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('response contract (unchanged by the move to Postgres)', () => {
  it('serialises a user as camelCase with a string id and ISO dates', async () => {
    const token = await registerUser('contract@glimms.ai', 'Contract User');
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(Object.keys(res.body).sort()).toEqual(
      ['avatarUrl', 'createdAt', 'email', 'emailVerifiedAt', 'id', 'isActive', 'name', 'tier', 'updatedAt'],
    );
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
  });

  it('creates and lists catalog items with `id` on list entries', async () => {
    const token = await registerUser('items@glimms.ai');
    const created = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        vertical: 'wardrobe', label: 'white shirt', category: 'top',
        color: { dominant: { hex: '#ffffff', rgb: { r: 255, g: 255, b: 255 } } },
        imageKey: 'uploads/test/shirt.jpg', confidence: 0.9, tags: ['cotton'],
      });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/catalog?tag=cotton').set('Authorization', `Bearer ${token}`);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(created.body.id);
    expect(list.body.items[0].imageKey).toBe('uploads/test/shirt.jpg');
  });

  it('upserts preferences and returns {} before any are set', async () => {
    const token = await registerUser('prefs@glimms.ai');
    const auth = { Authorization: `Bearer ${token}` };

    expect((await request(app).get('/api/users/me/preferences').set(auth)).body).toEqual({});

    const put = await request(app).put('/api/users/me/preferences').set(auth).send({
      occupation: 'designer', styleGoals: ['comfortable'], location: { lat: 6.5, lon: 3.3, city: 'Lagos' },
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ occupation: 'designer', styleGoals: ['comfortable'], occasions: [] });

    // A partial update must not wipe fields it does not mention.
    const second = await request(app).put('/api/users/me/preferences').set(auth).send({ occasions: ['work'] });
    expect(second.body).toMatchObject({
      id: put.body.id, occupation: 'designer', occasions: ['work'], location: { lat: 6.5, lon: 3.3, city: 'Lagos' },
    });
  });

  it('returns a default subscription for a user without one', async () => {
    const token = await registerUser('sub@glimms.ai');
    const res = await request(app).get('/api/subscriptions/me').set('Authorization', `Bearer ${token}`);
    expect(res.body).toMatchObject({ status: 'inactive', tier: 'free', stripeCustomerId: null });
  });

  it('registers a device token once per device and re-points it on re-register', async () => {
    const first = await registerUser('device1@glimms.ai');
    const second = await registerUser('device2@glimms.ai');
    const body = { token: 'ExponentPushToken[device-1]', platform: 'android' };

    const a = await request(app).post('/api/notifications/device-token').set('Authorization', `Bearer ${first}`).send(body);
    const b = await request(app).post('/api/notifications/device-token').set('Authorization', `Bearer ${second}`).send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.userId).not.toBe(a.body.userId);

    const { rows } = await database.db.query('select count(*)::int as n from device_tokens');
    expect(rows[0]).toEqual({ n: 1 });
  });
});

describe('ids and tokens from before the migration', () => {
  it('answers 404 (not 500) for a Mongo ObjectId in the path', async () => {
    const token = await registerUser('legacy-id@glimms.ai');
    const auth = { Authorization: `Bearer ${token}` };
    for (const path of [
      '/api/catalog/665a1b2c3d4e5f6a7b8c9d0e',
      '/api/designs/jobs/665a1b2c3d4e5f6a7b8c9d0e',
      '/v1/design-sessions/665a1b2c3d4e5f6a7b8c9d0e',
    ]) {
      const res = await request(app).get(path).set(auth);
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
    }
  });

  it('rejects a validly signed access token whose subject is a Mongo ObjectId', async () => {
    const legacy = jwt.sign(
      { sub: '665a1b2c3d4e5f6a7b8c9d0e', email: 'old@glimms.ai', tier: 'free' },
      process.env.JWT_SECRET as string,
      { expiresIn: '15m' },
    );
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${legacy}`);
    // 401 INVALID_TOKEN is what makes the mobile client refresh / sign in again.
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});

/** The one-time link from the most recent email to `to`. */
function lastEmailedLink(to: string): URL {
  const sent = (mailer.send as jest.Mock).mock.calls.map(([mail]) => mail).filter((mail) => mail.to === to);
  const match = /https?:\/\/\S+/.exec(sent[sent.length - 1].text);
  return new URL(match![0]);
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('account deletion', () => {
  it('removes the account and everything it owns, and erases its files', async () => {
    const token = await registerUser('leaving@glimms.ai');
    const auth = { Authorization: `Bearer ${token}` };
    const me = await request(app).get('/api/users/me').set(auth);
    await request(app).post('/api/catalog').set(auth).send({
      vertical: 'wardrobe', label: 'white shirt', category: 'top',
      color: { dominant: { hex: '#ffffff', rgb: { r: 255, g: 255, b: 255 } } },
      imageKey: 'uploads/test/shirt.jpg', confidence: 0.9,
    });
    await request(app).post('/api/notifications/device-token').set(auth)
      .send({ token: 'ExponentPushToken[leaving]', platform: 'ios' });

    const res = await request(app).delete('/api/users/me').set(auth);
    expect(res.status).toBe(200);
    await settle();

    for (const table of ['users', 'catalog_items', 'device_tokens', 'refresh_tokens', 'account_tokens']) {
      const column = table === 'users' ? 'id' : 'user_id';
      const { rows } = await database.db.query(`select count(*)::int as n from ${table} where ${column} = $1`, [me.body.id]);
      expect({ table, n: rows[0].n }).toEqual({ table, n: 0 });
    }
    expect(erased.prefixes).toEqual(expect.arrayContaining([`users/${me.body.id}/`, `uploads/${me.body.id}/`]));
    expect(erased.vectors).toContain(me.body.id);

    const login = await request(app).post('/api/auth/login').send({ email: 'leaving@glimms.ai', password: 'password123' });
    expect(login.status).toBe(401);
    // The address is free to register again.
    const again = await request(app).post('/api/auth/register').send({ email: 'leaving@glimms.ai', password: 'password123' });
    expect(again.status).toBe(201);
  });

  it('requires authentication', async () => {
    expect((await request(app).delete('/api/users/me')).status).toBe(401);
  });
});

describe('password reset', () => {
  it('answers the same for known and unknown addresses, and only emails the known one', async () => {
    await registerUser('known@glimms.ai');
    (mailer.send as jest.Mock).mockClear();

    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'known@glimms.ai' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@glimms.ai' });
    await settle();

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect((mailer.send as jest.Mock).mock.calls.map(([mail]) => mail.to)).toEqual(['known@glimms.ai']);
  });

  it('lets the user choose a new password from the emailed page, once', async () => {
    await registerUser('forgetful@glimms.ai');
    const before = await request(app).post('/api/auth/login').send({ email: 'forgetful@glimms.ai', password: 'password123' });
    await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@glimms.ai' });
    await settle();
    const link = lastEmailedLink('forgetful@glimms.ai');
    expect(link.origin).toBe('https://api.glimms.test');
    const token = link.searchParams.get('token')!;

    const form = await request(app).get(link.pathname + link.search);
    expect(form.status).toBe(200);
    expect(form.headers['content-type']).toContain('text/html');
    expect(form.headers['cache-control']).toBe('no-store');
    expect(form.text).toContain('name="password"');

    const mismatch = await request(app).post('/account/reset-password').type('form')
      .send({ token, password: 'brand-new-pass', confirm: 'something-else' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.text).toContain('do not match');

    const done = await request(app).post('/account/reset-password').type('form')
      .send({ token, password: 'brand-new-pass', confirm: 'brand-new-pass' });
    expect(done.status).toBe(200);
    expect(done.text).toContain('Password updated');

    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'forgetful@glimms.ai', password: 'password123' });
    const newLogin = await request(app).post('/api/auth/login').send({ email: 'forgetful@glimms.ai', password: 'brand-new-pass' });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);

    // Sessions from before the reset are signed out.
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: before.body.refreshToken });
    expect(refresh.status).toBe(401);

    // The link cannot be used a second time.
    const reuse = await request(app).post('/api/auth/reset-password').send({ token, password: 'attacker-pass-1' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('INVALID_TOKEN');
    expect((await request(app).get(link.pathname + link.search)).status).toBe(400);
  });

  it('rejects unknown tokens and short passwords', async () => {
    const bad = await request(app).post('/api/auth/reset-password').send({ token: 'not-a-token', password: 'long-enough-pass' });
    expect(bad.status).toBe(400);
    const short = await request(app).post('/api/auth/reset-password').send({ token: 'x', password: 'short' });
    expect(short.status).toBe(400);
  });

  it('escapes the token it echoes into the page', async () => {
    const res = await request(app).get('/account/verify-email').query({ token: '"><script>alert(1)</script>' });
    expect(res.text).not.toContain('<script>');
  });
});

describe('email verification', () => {
  it('confirms the address from the emailed link, by POST only', async () => {
    const token = await registerUser('verify@glimms.ai');
    const auth = { Authorization: `Bearer ${token}` };
    await settle();
    expect((await request(app).get('/api/users/me').set(auth)).body.emailVerifiedAt).toBeNull();

    const link = lastEmailedLink('verify@glimms.ai');
    // Opening the link (as a mail scanner would) confirms nothing.
    expect((await request(app).get(link.pathname + link.search)).status).toBe(200);
    expect((await request(app).get('/api/users/me').set(auth)).body.emailVerifiedAt).toBeNull();

    const confirm = await request(app).post('/account/verify-email').type('form')
      .send({ token: link.searchParams.get('token') });
    expect(confirm.status).toBe(200);
    expect((await request(app).get('/api/users/me').set(auth)).body.emailVerifiedAt).toEqual(expect.any(String));

    const resend = await request(app).post('/api/auth/resend-verification').set(auth);
    expect(resend.body.alreadyVerified).toBe(true);
  });

  it('re-sends the email on request, invalidating the earlier link', async () => {
    const token = await registerUser('resend@glimms.ai');
    await settle();
    const first = lastEmailedLink('resend@glimms.ai').searchParams.get('token');

    const resend = await request(app).post('/api/auth/resend-verification').set('Authorization', `Bearer ${token}`);
    expect(resend.status).toBe(200);
    await settle();
    const second = lastEmailedLink('resend@glimms.ai').searchParams.get('token');
    expect(second).not.toBe(first);

    expect((await request(app).post('/api/auth/verify-email').send({ token: first })).status).toBe(400);
    expect((await request(app).post('/api/auth/verify-email').send({ token: second })).status).toBe(200);
  });
});

describe('push device tokens', () => {
  it('accepts only Expo push tokens', async () => {
    const token = await registerUser('push-format@glimms.ai');
    const res = await request(app).post('/api/notifications/device-token')
      .set('Authorization', `Bearer ${token}`).send({ token: 'raw-apns-or-fcm-token', platform: 'ios' });
    expect(res.status).toBe(400);
  });
});

describe('social sign-in (not configured)', () => {
  it('refuses tokens when no client ids are configured', async () => {
    const google = await request(app).post('/api/auth/google').send({ idToken: 'a.b.c' });
    const apple = await request(app).post('/api/auth/apple').send({ identityToken: 'a.b.c' });
    expect(google.status).toBe(401);
    expect(apple.status).toBe(401);
  });
});

describe('subscription billing endpoints (Stripe not configured)', () => {
  it('GET /prices is public and reports that nothing is for sale', async () => {
    const res = await request(app).get('/api/subscriptions/prices');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ prices: [] });
    expect(res.headers['cache-control']).toContain('max-age=300');
  });

  it('POST /checkout and /portal require authentication', async () => {
    expect((await request(app).post('/api/subscriptions/checkout').send({ tier: 'premium' })).status).toBe(401);
    expect((await request(app).post('/api/subscriptions/portal')).status).toBe(401);
  });

  it('POST /checkout validates the plan before anything else', async () => {
    const token = await registerUser('billing-validate@glimms.ai');
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).post('/api/subscriptions/checkout').set(auth).send({})).status).toBe(400);
    expect((await request(app).post('/api/subscriptions/checkout').set(auth).send({ tier: 'gold' })).status).toBe(400);
    expect((await request(app).post('/api/subscriptions/checkout').set(auth).send({ priceId: 'not-a-price' })).status).toBe(400);
  });

  it('POST /checkout and /portal answer 503 BILLING_NOT_CONFIGURED', async () => {
    const token = await registerUser('billing-off@glimms.ai');
    const auth = { Authorization: `Bearer ${token}` };

    const checkout = await request(app).post('/api/subscriptions/checkout').set(auth).send({ tier: 'premium' });
    expect(checkout.status).toBe(503);
    expect(checkout.body.code).toBe('BILLING_NOT_CONFIGURED');

    const portal = await request(app).post('/api/subscriptions/portal').set(auth);
    expect(portal.status).toBe(503);
    expect(portal.body.code).toBe('BILLING_NOT_CONFIGURED');
  });

  it('POST /webhook needs a signature, and is retried by Stripe while unconfigured', async () => {
    const unsigned = await request(app).post('/api/subscriptions/webhook')
      .set('Content-Type', 'application/json').send('{}');
    expect(unsigned.status).toBe(400);
    expect(unsigned.body.code).toBe('MISSING_SIGNATURE');

    const signed = await request(app).post('/api/subscriptions/webhook')
      .set('Content-Type', 'application/json').set('Stripe-Signature', 't=1,v1=abc').send('{}');
    expect(signed.status).toBe(503);
  });
});

describe('Credo endpoints (not configured)', () => {
  it('lists no plans, publicly', async () => {
    const res = await request(app).get('/api/subscriptions/credo/plans');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plans: [] });
  });

  it('requires authentication to pay or confirm, and answers 503 when switched off', async () => {
    expect((await request(app).post('/api/subscriptions/credo/checkout').send({ tier: 'premium' })).status).toBe(401);
    expect((await request(app).post('/api/subscriptions/credo/confirm').send({ reference: 'x' })).status).toBe(401);

    const token = await registerUser('naira@glimms.ai');
    const res = await request(app).post('/api/subscriptions/credo/checkout')
      .set('Authorization', `Bearer ${token}`).send({ tier: 'premium' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('BILLING_NOT_CONFIGURED');

    const webhook = await request(app).post('/api/subscriptions/credo/webhook').send({ event: 'transaction.successful', data: {} });
    expect(webhook.status).toBe(503);
  });

  it('shows a return page that sends the browser back to the app without trusting the query', async () => {
    const res = await request(app).get('/account/credo/return').query({ transRef: '"><script>x</script>' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Payment not found');
    expect(res.text).not.toContain('<script>');
    expect(res.headers.refresh).toBe('0; url=glimms://billing/return?status=unknown');
  });
});
