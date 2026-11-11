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

import { createApp } from './app';

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
      ['avatarUrl', 'createdAt', 'email', 'id', 'isActive', 'name', 'tier', 'updatedAt'],
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
    const body = { token: 'fcm-token-1', platform: 'android' };

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

describe('account deactivation', () => {
  it('soft-deletes: the row stays, login stops working', async () => {
    const token = await registerUser('leaving@glimms.ai');
    const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: 'leaving@glimms.ai', password: 'password123' });
    expect(login.status).toBe(401);
    const { rows } = await database.db.query("select is_active from users where email = 'leaving@glimms.ai'");
    expect(rows).toEqual([{ is_active: false }]);
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
