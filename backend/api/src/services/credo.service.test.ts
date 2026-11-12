import crypto from 'crypto';
import { createCredoService, CredoHttp, CredoSettings } from './credo.service';
import { credoPaymentsRepository, subscriptionsRepository, usersRepository } from '../repositories';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';
import { createUser } from '../test/fixtures';

let database: TestDatabase;
beforeAll(async () => { database = await setupTestDatabase(); });
afterAll(async () => { await database.close(); });
beforeEach(async () => { await database.reset(); });

const SETTINGS: CredoSettings = {
  publicKey: '0PUBtest', secretKey: 'secret-key', baseUrl: 'https://api.credodemo.com',
  currency: 'NGN', amounts: { premium: 250_000, pro: 600_000 }, periodDays: 30, feeBearer: 1,
  callbackUrl: 'https://api.glimms.test/account/credo/return',
};
const BUSINESS_CODE = '700607002190001';
const SIGNATURE = crypto.createHash('sha512').update(`secret-key${BUSINESS_CODE}`).digest('hex');
const DAY = 86_400_000;

/** A stand-in for Credo: remembers initialised transactions and what verify should say. */
function fakeCredo() {
  const transactions = new Map<string, any>();
  const requests: Array<{ url: string; method: string; key: string; body: any }> = [];
  let next = 0;
  let initializeResponse: ((body: any) => any) | null = null;
  let down = false;

  const http: CredoHttp = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url, method: init.method, key: init.headers.Authorization, body });
    if (down) throw new Error('ECONNRESET');

    if (url.endsWith('/transaction/initialize')) {
      if (init.headers.Authorization !== SETTINGS.publicKey) return { status: 401, json: async () => ({ status: 401 }) };
      const transRef = `vs_${++next}`;
      transactions.set(transRef, {
        transRef, businessRef: body.reference, transAmount: body.amount, currencyCode: body.currency, status: 15,
      });
      const data = initializeResponse?.(body) ?? {
        authorizationUrl: `https://pay.credodemo.com/checkout/${transRef}`, reference: body.reference, credoReference: transRef,
      };
      return { status: 200, json: async () => ({ status: 200, data }) };
    }
    const match = /\/transaction\/([^/]+)\/verify$/.exec(url);
    if (match) {
      if (init.headers.Authorization !== SETTINGS.secretKey) return { status: 401, json: async () => ({ status: 401 }) };
      const transaction = transactions.get(decodeURIComponent(match[1]));
      if (!transaction) return { status: 404, json: async () => ({ status: 404, message: 'not found' }) };
      return { status: 200, json: async () => ({ status: 200, data: transaction }) };
    }
    return { status: 404, json: async () => ({}) };
  };

  return {
    http, requests, transactions,
    /** Changes what Credo reports for the most recent transaction. */
    report: (patch: object) => {
      const last = [...transactions.values()].pop();
      Object.assign(last, patch);
      return last;
    },
    respondToInitializeWith: (fn: (body: any) => any) => { initializeResponse = fn; },
    goDown: (value = true) => { down = value; },
  };
}

const webhook = (transaction: any, event = 'transaction.successful') => ({
  event, data: { businessCode: BUSINESS_CODE, transRef: transaction.transRef, businessRef: transaction.businessRef, status: 0 },
});

describe('listPlans', () => {
  it('lists the configured passes, and nothing when Credo is not set up', () => {
    const { http } = fakeCredo();
    expect(createCredoService(http, SETTINGS).listPlans()).toEqual([
      { tier: 'premium', currency: 'NGN', amount: 250_000, periodDays: 30, feeOnTop: false },
      { tier: 'pro', currency: 'NGN', amount: 600_000, periodDays: 30, feeOnTop: false },
    ]);
    expect(createCredoService(http, { ...SETTINGS, amounts: { premium: 250_000 } }).listPlans()).toHaveLength(1);
    expect(createCredoService(http, { ...SETTINGS, secretKey: undefined }).listPlans()).toEqual([]);
  });
});

describe('createCheckout', () => {
  it('initialises a transaction for the server-side price and returns the Credo page', async () => {
    const credo = fakeCredo();
    const user = await createUser({ name: 'Ada Obi Lovelace' });

    const result = await createCredoService(credo.http, SETTINGS).createCheckout(user.id, 'premium');

    expect(result.url).toBe('https://pay.credodemo.com/checkout/vs_1');
    expect(credo.requests[0]).toMatchObject({
      url: 'https://api.credodemo.com/transaction/initialize', method: 'POST', key: '0PUBtest',
      body: {
        amount: 250_000, currency: 'NGN', email: user.email, bearer: 1, channels: ['CARD', 'BANK'],
        reference: result.reference, callbackUrl: SETTINGS.callbackUrl,
        customerFirstName: 'Ada', customerLastName: 'Obi Lovelace',
      },
    });
    expect(await credoPaymentsRepository.findByAnyReference('vs_1')).toMatchObject({
      userId: user.id, tier: 'premium', amountMinor: 250_000, status: 'pending', reference: result.reference,
    });
    // Starting a checkout grants nothing.
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });

  it('refuses when not configured, for an unpriced tier, and alongside a card subscription', async () => {
    const credo = fakeCredo();
    const user = await createUser();

    await expect(createCredoService(credo.http, { ...SETTINGS, publicKey: undefined }).createCheckout(user.id, 'pro'))
      .rejects.toMatchObject({ statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
    await expect(createCredoService(credo.http, { ...SETTINGS, amounts: {} }).createCheckout(user.id, 'pro'))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PRICE' });

    await subscriptionsRepository.lockForUser(user.id, database.db);
    await subscriptionsRepository.updateByUserId(user.id, { status: 'active', paystackSubscriptionCode: 'SUB_1', provider: 'paystack' });
    await expect(createCredoService(credo.http, SETTINGS).createCheckout(user.id, 'pro'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it.each([
    ['a non-Credo host', 'https://pay.credocentral.com.evil.example/checkout/x'],
    ['plain http', 'http://pay.credocentral.com/checkout/x'],
    ['an app-scheme url', 'javascript:alert(1)'],
  ])('does not hand the app %s', async (_label, authorizationUrl) => {
    const credo = fakeCredo();
    credo.respondToInitializeWith(() => ({ authorizationUrl, credoReference: 'vs_x' }));
    const user = await createUser();
    await expect(createCredoService(credo.http, SETTINGS).createCheckout(user.id, 'premium'))
      .rejects.toMatchObject({ statusCode: 503, code: 'BILLING_UNAVAILABLE' });
  });

  it('answers 503 when Credo is unreachable', async () => {
    const credo = fakeCredo();
    credo.goDown();
    const user = await createUser();
    await expect(createCredoService(credo.http, SETTINGS).createCheckout(user.id, 'premium'))
      .rejects.toMatchObject({ statusCode: 503, code: 'BILLING_UNAVAILABLE' });
  });
});

describe('confirming a payment', () => {
  async function checkout(tier: 'premium' | 'pro' = 'premium') {
    const credo = fakeCredo();
    const service = createCredoService(credo.http, SETTINGS);
    const user = await createUser();
    const { reference } = await service.createCheckout(user.id, tier);
    return { credo, service, user, reference };
  }

  it('grants the tier for the paid period once Credo reports success', async () => {
    const { credo, service, user, reference } = await checkout();

    expect(await service.confirmForUser(user.id, reference)).toEqual({ status: 'pending', tier: 'premium' });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });

    credo.report({ status: 0 });
    expect(await service.confirmForUser(user.id, reference)).toEqual({ status: 'paid', tier: 'premium' });

    const sub = await subscriptionsRepository.findByUserId(user.id);
    expect(sub).toMatchObject({ provider: 'credo', status: 'active', cancelAtPeriodEnd: true });
    expect(sub!.currentPeriodEnd!.getTime() - Date.now()).toBeGreaterThan(29.9 * DAY);
    expect(sub!.currentPeriodEnd!.getTime() - Date.now()).toBeLessThan(30.1 * DAY);
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'premium' });
  });

  it('verifies with the secret key, never the public one', async () => {
    const { credo, service, user, reference } = await checkout();
    await service.confirmForUser(user.id, reference);
    expect(credo.requests[1]).toMatchObject({ url: 'https://api.credodemo.com/transaction/vs_1/verify', method: 'GET', key: 'secret-key' });
  });

  it('counts one payment once, however many times it is confirmed', async () => {
    const { credo, service, user, reference } = await checkout();
    const transaction = credo.report({ status: 0 });

    await Promise.all([
      service.confirmForUser(user.id, reference),
      service.confirmFromRedirect(transaction.transRef),
      service.handleWebhook(SIGNATURE, webhook(transaction)),
    ]);
    await service.handleWebhook(SIGNATURE, webhook(transaction));

    const sub = await subscriptionsRepository.findByUserId(user.id);
    expect(sub!.currentPeriodEnd!.getTime() - Date.now()).toBeLessThan(30.1 * DAY);
  });

  it('adds a second payment for the same tier to the end of the running pass', async () => {
    const { credo, service, user, reference } = await checkout();
    credo.report({ status: 0 });
    await service.confirmForUser(user.id, reference);

    const second = await service.createCheckout(user.id, 'premium');
    credo.report({ status: 0 });
    await service.confirmForUser(user.id, second.reference);

    const sub = await subscriptionsRepository.findByUserId(user.id);
    expect(sub!.currentPeriodEnd!.getTime() - Date.now()).toBeGreaterThan(59.9 * DAY);
  });

  it('accepts Credo reporting the amount in naira instead of kobo', async () => {
    const { credo, service, user, reference } = await checkout();
    credo.report({ status: 0, transAmount: 2500.0 });
    expect((await service.confirmForUser(user.id, reference)).status).toBe('paid');
  });

  it.each([
    ['a smaller amount', { transAmount: 100 }],
    ['another currency', { currencyCode: 'USD' }],
    ['another order\'s reference', { businessRef: 'someone-elses-order' }],
  ])('grants nothing when Credo reports %s', async (_label, patch) => {
    const { credo, service, user, reference } = await checkout();
    credo.report({ status: 0, ...patch });

    expect((await service.confirmForUser(user.id, reference)).status).toBe('failed');
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });

  it.each([3, 7, 9, 10])('records status %i as failed', async (status) => {
    const { credo, service, user, reference } = await checkout();
    credo.report({ status });
    expect((await service.confirmForUser(user.id, reference)).status).toBe('failed');
    expect(await credoPaymentsRepository.findByAnyReference(reference)).toMatchObject({ status: 'failed' });
  });

  it('still grants a payment that succeeds after an earlier failed attempt', async () => {
    const { credo, service, user, reference } = await checkout();
    credo.report({ status: 3 });
    await service.confirmForUser(user.id, reference);
    credo.report({ status: 0 });
    expect((await service.confirmForUser(user.id, reference)).status).toBe('paid');
  });

  it('does not let one user confirm another user\'s payment', async () => {
    const { credo, service, reference } = await checkout();
    credo.report({ status: 0 });
    const other = await createUser();

    await expect(service.confirmForUser(other.id, reference)).rejects.toMatchObject({ statusCode: 404 });
    expect(await usersRepository.findById(other.id)).toMatchObject({ tier: 'free' });
  });

  it('reports "unknown" for a made-up reference on the redirect', async () => {
    const { service } = await checkout();
    expect(await service.confirmFromRedirect('made-up')).toBe('unknown');
    expect(await service.confirmFromRedirect('')).toBe('unknown');
  });
});

describe('handleWebhook', () => {
  it('rejects a missing or wrong signature', async () => {
    const credo = fakeCredo();
    const service = createCredoService(credo.http, SETTINGS);
    const body = webhook({ transRef: 'vs_1', businessRef: 'x' });

    await expect(service.handleWebhook(undefined, body)).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.handleWebhook('0'.repeat(128), body)).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.handleWebhook(SIGNATURE, { event: 'transaction.successful', data: {} })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('does not believe a correctly signed "successful" for a payment Credo says is unpaid', async () => {
    const credo = fakeCredo();
    const service = createCredoService(credo.http, SETTINGS);
    const user = await createUser();
    await service.createCheckout(user.id, 'pro');
    const transaction = credo.report({}); // still status 15 at Credo

    // The signature never changes, so anyone who has seen one could replay it.
    await service.handleWebhook(SIGNATURE, webhook(transaction));

    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });

  it('grants when the webhook arrives and Credo confirms it', async () => {
    const credo = fakeCredo();
    const service = createCredoService(credo.http, SETTINGS);
    const user = await createUser();
    await service.createCheckout(user.id, 'pro');
    const transaction = credo.report({ status: 0 });

    expect(await service.handleWebhook(SIGNATURE.toUpperCase(), webhook(transaction))).toEqual({ received: true });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'pro' });
  });

  it('acknowledges events about payments it does not know, and fails loudly when Credo is down', async () => {
    const credo = fakeCredo();
    const service = createCredoService(credo.http, SETTINGS);
    expect(await service.handleWebhook(SIGNATURE, webhook({ transRef: 'vs_other', businessRef: 'other' }, 'transaction.settlement.success')))
      .toEqual({ received: true });

    const user = await createUser();
    await service.createCheckout(user.id, 'pro');
    const transaction = credo.report({ status: 0 });
    credo.goDown();
    await expect(service.handleWebhook(SIGNATURE, webhook(transaction))).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('sweeps', () => {
  it('settles a paid payment whose redirect and webhook never arrived', async () => {
    const credo = fakeCredo();
    const service = createCredoService(credo.http, SETTINGS);
    const user = await createUser();
    const { reference } = await service.createCheckout(user.id, 'premium');
    credo.report({ status: 0 });

    expect(await service.reconcilePending()).toBe(0); // too recent: the customer may still be paying
    await database.db.query("update credo_payments set created_at = now() - interval '10 minutes' where reference = $1", [reference]);
    expect(await service.reconcilePending()).toBe(1);
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'premium' });
  });

  it('returns a user to the free tier when the pass ends, and leaves renewing Paystack subscribers alone', async () => {
    const credo = fakeCredo();
    const service = createCredoService(credo.http, SETTINGS);
    const user = await createUser();
    const { reference } = await service.createCheckout(user.id, 'premium');
    credo.report({ status: 0 });
    await service.confirmForUser(user.id, reference);

    const cardUser = await createUser({ tier: 'pro' });
    await subscriptionsRepository.lockForUser(cardUser.id, database.db);
    await subscriptionsRepository.updateByUserId(cardUser.id, {
      status: 'active', provider: 'paystack', paystackSubscriptionCode: 'SUB_S', currentPeriodEnd: new Date(Date.now() - DAY),
    });

    expect(await service.expirePasses()).toBe(0);
    await database.db.query("update subscriptions set current_period_end = now() - interval '1 minute' where user_id = $1", [user.id]);
    expect(await service.expirePasses()).toBe(1);

    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ status: 'inactive' });
    expect(await usersRepository.findById(cardUser.id)).toMatchObject({ tier: 'pro' });
  });
});
