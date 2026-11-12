/**
 * Billing rules, against a real database and a fake Paystack.
 *
 * The fake answers the HTTP calls the service makes (plans, transactions,
 * subscriptions, customers) from in-memory state and records every request.
 */
import crypto from 'crypto';
import { BillingSettings, createSubscriptionsService, PaystackHttp } from './subscriptions.service';
import { subscriptionsRepository, usersRepository } from '../repositories';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';
import { createUser, UNKNOWN_ID } from '../test/fixtures';

const PREMIUM = 'PLN_premium123';
const PRO = 'PLN_pro456';
const SECRET = 'sk_test_abc123';
const DAY = 86_400_000;

const SETTINGS: BillingSettings = {
  secretKey: SECRET,
  baseUrl: 'https://paystack.test',
  plans: { premium: PREMIUM, pro: PRO },
  callbackUrl: 'https://api.glimms.test/account/paystack/return',
};

function plan(code: string, overrides: Record<string, unknown> = {}) {
  return {
    id: code === PRO ? 2 : 1, plan_code: code, name: code === PRO ? 'Glimms Pro' : 'Glimms Premium',
    description: 'All the looks', amount: code === PRO ? 500000 : 250000, interval: 'monthly', currency: 'NGN',
    is_deleted: false, is_archived: false, ...overrides,
  };
}

function fakePaystack() {
  const plans = new Map<string, any>([[PREMIUM, plan(PREMIUM)], [PRO, plan(PRO)]]);
  const transactions = new Map<string, any>();
  const subscriptions = new Map<string, any>();
  const customers = new Map<string, any>();
  const requests: { method: string; path: string; body?: any; auth?: string }[] = [];
  let down = false;

  const ok = (data: unknown) => ({ status: 200, json: async () => ({ status: true, message: 'ok', data }) });
  const missing = (status = 404) => ({ status, json: async () => ({ status: false, message: 'Not found' }) });

  const http: PaystackHttp = async (url, init) => {
    const path = url.replace(SETTINGS.baseUrl, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ method: init.method, path, body, auth: init.headers.Authorization });
    if (down) throw new Error('connect ETIMEDOUT');

    let match: RegExpExecArray | null;
    if ((match = /^\/plan\/(.+)$/.exec(path))) return plans.has(match[1]) ? ok(plans.get(match[1])) : missing();
    if (path === '/transaction/initialize') {
      return ok({ authorization_url: 'https://checkout.paystack.com/abc123', access_code: 'abc123', reference: body.reference });
    }
    if ((match = /^\/transaction\/verify\/(.+)$/.exec(path))) {
      return transactions.has(match[1]) ? ok(transactions.get(match[1])) : missing(400);
    }
    if ((match = /^\/subscription\/([^/?]+)\/manage\/link$/.exec(path))) {
      return subscriptions.has(match[1]) ? ok({ link: `https://paystack.com/manage/subscriptions/${match[1]}?subscription_token=t` }) : missing();
    }
    if (path === '/subscription/disable') {
      const sub = subscriptions.get(body.code);
      if (!sub || sub.email_token !== body.token) return missing(400);
      sub.status = 'non-renewing';
      return ok(undefined);
    }
    if ((match = /^\/subscription\?customer=(\d+)/.exec(path))) {
      return ok([...subscriptions.values()].filter((sub) => String(sub.customer.id) === match![1]));
    }
    if ((match = /^\/subscription\/([^/?]+)$/.exec(path))) return subscriptions.has(match[1]) ? ok(subscriptions.get(match[1])) : missing();
    if ((match = /^\/customer\/(.+)$/.exec(path))) return customers.has(match[1]) ? ok(customers.get(match[1])) : missing();
    return missing();
  };

  return {
    http, plans, transactions, subscriptions, customers, requests,
    setDown: (value: boolean) => { down = value; },
    calls: (path: RegExp) => requests.filter((request) => path.test(request.path)),

    /** A successful plan payment, as Paystack would report it. */
    pay(user: { id: string; email: string }, options: { reference?: string; planCode?: string; paidAt?: Date; customerCode?: string; metadata?: unknown; status?: string } = {}) {
      const reference = options.reference ?? 'glm_ref1';
      const customerCode = options.customerCode ?? 'CUS_1';
      const customer = { id: 77, customer_code: customerCode, email: user.email };
      customers.set(customerCode, customer);
      const planCode = options.planCode ?? PREMIUM;
      const txn = {
        reference, status: options.status ?? 'success', amount: plans.get(planCode)?.amount ?? 1, currency: 'NGN',
        paid_at: (options.paidAt ?? new Date()).toISOString(), customer,
        plan: planCode, plan_object: plans.get(planCode) ?? {},
        metadata: options.metadata === undefined ? { userId: user.id, tier: 'premium' } : options.metadata,
      };
      transactions.set(reference, txn);
      return txn;
    },

    /** The subscription Paystack creates after a plan payment. */
    subscribe(user: { email: string }, overrides: Record<string, unknown> = {}) {
      const customer = customers.get('CUS_1') ?? { id: 77, customer_code: 'CUS_1', email: user.email };
      customers.set(customer.customer_code, customer);
      const sub = {
        subscription_code: 'SUB_1', email_token: 'tok_1', status: 'active',
        next_payment_date: new Date(Date.now() + 30 * DAY).toISOString(), createdAt: new Date().toISOString(),
        plan: plans.get(PREMIUM), customer, ...overrides,
      } as any;
      subscriptions.set(sub.subscription_code, sub);
      return sub;
    },
  };
}

function signed(event: unknown, secret = SECRET): [Buffer, string] {
  const raw = Buffer.from(JSON.stringify(event));
  return [raw, crypto.createHmac('sha512', secret).update(raw).digest('hex')];
}

type Fake = ReturnType<typeof fakePaystack>;
const make = (fake: Fake, settings: Partial<BillingSettings> = {}) => createSubscriptionsService(fake.http, { ...SETTINGS, ...settings });
const deliver = (service: ReturnType<typeof make>, event: unknown) => service.handleWebhook(...signed(event));
const row = (userId: string) => subscriptionsRepository.findByUserId(userId);
const tierOf = async (userId: string) => (await usersRepository.findById(userId))?.tier;

let database: TestDatabase;
beforeAll(async () => { database = await setupTestDatabase(); });
afterAll(async () => { await database.close(); });
beforeEach(async () => { await database.reset(); });

describe('listPrices', () => {
  it('describes each configured plan from Paystack', async () => {
    const fake = fakePaystack();
    fake.plans.set(PRO, plan(PRO, { interval: 'annually', description: '' }));

    expect(await make(fake).listPrices()).toEqual([
      {
        tier: 'premium', planCode: PREMIUM, name: 'Glimms Premium', description: 'All the looks',
        currency: 'ngn', unitAmount: 250000, interval: 'month', intervalCount: 1, trialDays: null,
      },
      {
        tier: 'pro', planCode: PRO, name: 'Glimms Pro', description: null,
        currency: 'ngn', unitAmount: 500000, interval: 'year', intervalCount: 1, trialDays: null,
      },
    ]);
    expect(fake.requests[0].auth).toBe(`Bearer ${SECRET}`);
  });

  it('is empty when Paystack or the plan codes are not configured', async () => {
    const fake = fakePaystack();
    expect(await make(fake, { secretKey: undefined }).listPrices()).toEqual([]);
    expect(await make(fake, { plans: {} }).listPrices()).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });

  it('caches, and shares one fetch between concurrent callers', async () => {
    const fake = fakePaystack();
    const service = make(fake);
    await Promise.all([service.listPrices(), service.listPrices(), service.listPrices()]);
    await service.listPrices();
    expect(fake.calls(/^\/plan\//)).toHaveLength(2); // one per plan, once
  });

  it.each([
    ['archived', { is_archived: true }],
    ['deleted', { is_deleted: true }],
    ['billed hourly', { interval: 'hourly' }],
    ['without a price', { amount: 0 }],
  ])('hides a plan that is %s', async (_label, overrides) => {
    const fake = fakePaystack();
    fake.plans.set(PRO, plan(PRO, overrides));
    expect((await make(fake).listPrices()).map((p) => p.tier)).toEqual(['premium']);
  });

  it('serves the last known prices when Paystack fails, and 503s when it has none', async () => {
    const fake = fakePaystack();
    const service = make(fake, { planCacheMs: 0 });
    const first = await service.listPrices();
    fake.setDown(true);
    expect(await service.listPrices()).toEqual(first);

    await expect(make(fake).listPrices()).rejects.toMatchObject({ statusCode: 503, code: 'BILLING_UNAVAILABLE' });
  });
});

describe('createCheckoutSession', () => {
  it('starts Paystack checkout on the plan, tagged with the user', async () => {
    const fake = fakePaystack();
    const user = await createUser();

    const session = await make(fake).createCheckoutSession(user.id, { tier: 'pro' });

    expect(session.url).toBe('https://checkout.paystack.com/abc123');
    expect(session.reference).toMatch(/^glm_[0-9a-f]{24}$/);
    expect(fake.calls(/initialize/)[0].body).toEqual({
      email: user.email, amount: 500000, plan: PRO, reference: session.reference,
      callback_url: SETTINGS.callbackUrl, metadata: { userId: user.id, tier: 'pro' },
    });
  });

  it('accepts a configured plan code, and refuses any other', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    const service = make(fake);

    await expect(service.createCheckoutSession(user.id, { planCode: PREMIUM })).resolves.toMatchObject({ url: expect.any(String) });
    await expect(service.createCheckoutSession(user.id, { planCode: 'PLN_other' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PRICE' });
    await expect(service.createCheckoutSession(user.id, { planCode: PREMIUM, tier: 'pro' })).rejects.toMatchObject({ code: 'INVALID_PRICE' });
  });

  it('refuses a tier with no plan configured, or whose plan is hidden', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    await expect(make(fake, { plans: { premium: PREMIUM } }).createCheckoutSession(user.id, { tier: 'pro' }))
      .rejects.toMatchObject({ code: 'INVALID_PRICE' });

    fake.plans.set(PRO, plan(PRO, { is_archived: true }));
    await expect(make(fake).createCheckoutSession(user.id, { tier: 'pro' })).rejects.toMatchObject({ code: 'INVALID_PRICE' });
    expect(fake.calls(/initialize/)).toHaveLength(0);
  });

  it('does not start a second subscription for a subscriber, or over a running Credo pass', async () => {
    const fake = fakePaystack();
    const subscriber = await createUser();
    await subscriptionsRepository.lockForUser(subscriber.id, database.db);
    await subscriptionsRepository.updateByUserId(subscriber.id, { provider: 'paystack', status: 'past_due' });
    const passHolder = await createUser();
    await subscriptionsRepository.lockForUser(passHolder.id, database.db);
    await subscriptionsRepository.updateByUserId(passHolder.id, { provider: 'credo', status: 'active' });

    const service = make(fake);
    await expect(service.createCheckoutSession(subscriber.id, { tier: 'pro' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.createCheckoutSession(passHolder.id, { tier: 'pro' })).rejects.toMatchObject({ statusCode: 409 });
    expect(fake.calls(/initialize/)).toHaveLength(0);
  });

  it('answers 503 when billing is off or Paystack fails, and 404 for an unknown user', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    await expect(make(fake, { secretKey: undefined }).createCheckoutSession(user.id, { tier: 'pro' }))
      .rejects.toMatchObject({ statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
    await expect(make(fake).createCheckoutSession(UNKNOWN_ID, { tier: 'pro' })).rejects.toMatchObject({ statusCode: 404 });

    const service = make(fake);
    await service.listPrices();
    fake.setDown(true);
    await expect(service.createCheckoutSession(user.id, { tier: 'pro' })).rejects.toMatchObject({ statusCode: 503, code: 'BILLING_UNAVAILABLE' });
  });
});

describe('confirmForUser', () => {
  it('grants the tier of the plan Paystack says was paid for, and attaches the subscription', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user, { planCode: PRO });
    const sub = fake.subscribe(user, { plan: fake.plans.get(PRO) });

    await expect(make(fake).confirmForUser(user.id, 'glm_ref1')).resolves.toEqual({ status: 'paid', tier: 'pro' });

    expect(await tierOf(user.id)).toBe('pro');
    expect(await row(user.id)).toMatchObject({
      provider: 'paystack', status: 'active', paystackCustomerCode: 'CUS_1', paystackSubscriptionCode: 'SUB_1',
      cancelAtPeriodEnd: false, currentPeriodEnd: new Date(sub.next_payment_date),
    });
  });

  it('grants access straight away even if Paystack has not created the subscription yet', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    const paidAt = new Date();
    fake.pay(user, { paidAt });

    await make(fake).confirmForUser(user.id, 'glm_ref1');

    const saved = await row(user.id);
    expect(saved).toMatchObject({ provider: 'paystack', status: 'active', paystackSubscriptionCode: null });
    expect(saved!.currentPeriodEnd!.getTime()).toBe(paidAt.getTime() + 31 * DAY);
    expect(await tierOf(user.id)).toBe('premium');
  });

  it('ignores a tier claimed in metadata: only the plan decides', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user, { planCode: PREMIUM, metadata: { userId: user.id, tier: 'pro' } });
    await expect(make(fake).confirmForUser(user.id, 'glm_ref1')).resolves.toMatchObject({ tier: 'premium' });
    expect(await tierOf(user.id)).toBe('premium');
  });

  it.each([
    ['abandoned', 'pending'], ['ongoing', 'pending'], ['pending', 'pending'], ['failed', 'failed'], ['reversed', 'failed'],
  ])('reports a %s transaction as %s and grants nothing', async (status, outcome) => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user, { status });
    await expect(make(fake).confirmForUser(user.id, 'glm_ref1')).resolves.toMatchObject({ status: outcome });
    expect(await tierOf(user.id)).toBe('free');
  });

  it('answers 404 for someone else\'s payment, an unknown reference, or a payment for no plan of ours', async () => {
    const fake = fakePaystack();
    const payer = await createUser();
    const other = await createUser();
    fake.pay(payer);
    fake.pay(other, { reference: 'glm_other', planCode: 'PLN_unrelated' });
    const service = make(fake);

    await expect(service.confirmForUser(other.id, 'glm_ref1')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.confirmForUser(payer.id, 'glm_nope')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.confirmForUser(other.id, 'glm_other')).rejects.toMatchObject({ statusCode: 404 });
    expect(await tierOf(other.id)).toBe('free');
  });

  it('is repeatable: confirming twice changes nothing, and cannot undo a cancellation', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    fake.subscribe(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');
    const first = await row(user.id);

    fake.subscriptions.get('SUB_1').status = 'non-renewing';
    await deliver(service, { event: 'subscription.not_renew', data: { subscription_code: 'SUB_1' } });
    await service.confirmForUser(user.id, 'glm_ref1');

    expect(await row(user.id)).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: first!.currentPeriodEnd });
  });

  it('does not revive a plan from a payment whose period is long over', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user, { paidAt: new Date(Date.now() - 90 * DAY) });
    await make(fake).confirmForUser(user.id, 'glm_ref1');
    expect(await tierOf(user.id)).toBe('free');
  });

  it('answers 503 when Paystack cannot be reached', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.setDown(true);
    await expect(make(fake).confirmForUser(user.id, 'glm_ref1')).rejects.toMatchObject({ statusCode: 503, code: 'BILLING_UNAVAILABLE' });
  });
});

describe('confirmFromRedirect', () => {
  it('settles the payment for whoever started it, and reports unknown references', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    const service = make(fake);

    expect(await service.confirmFromRedirect('glm_ref1')).toBe('paid');
    expect(await tierOf(user.id)).toBe('premium');
    expect(await service.confirmFromRedirect('glm_missing')).toBe('unknown');
    expect(await service.confirmFromRedirect('')).toBe('unknown');
  });
});

describe('createPortalSession', () => {
  it('returns Paystack\'s manage link for the user\'s subscription', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    fake.subscribe(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');

    await expect(service.createPortalSession(user.id)).resolves.toEqual({
      url: 'https://paystack.com/manage/subscriptions/SUB_1?subscription_token=t',
    });
  });

  it('finds the subscription if it was created after the payment was confirmed', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');
    fake.subscribe(user);

    await expect(service.createPortalSession(user.id)).resolves.toMatchObject({ url: expect.stringContaining('SUB_1') });
    expect(await row(user.id)).toMatchObject({ paystackSubscriptionCode: 'SUB_1' });
  });

  it('answers 409 NO_BILLING_ACCOUNT without a Paystack subscription, and 503 when billing is off', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    await expect(make(fake).createPortalSession(user.id)).rejects.toMatchObject({ statusCode: 409, code: 'NO_BILLING_ACCOUNT' });

    await subscriptionsRepository.lockForUser(user.id, database.db);
    await subscriptionsRepository.updateByUserId(user.id, { provider: 'credo', status: 'active' });
    await expect(make(fake).createPortalSession(user.id)).rejects.toMatchObject({ code: 'NO_BILLING_ACCOUNT' });

    await expect(make(fake, { secretKey: undefined }).createPortalSession(user.id)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('getByUserId', () => {
  it('reports the free plan for a user with no subscription row', async () => {
    const user = await createUser();
    expect(await make(fakePaystack()).getByUserId(user.id)).toMatchObject({
      userId: user.id, status: 'inactive', tier: 'free', provider: null, paystackSubscriptionCode: null,
    });
  });

  it('includes the user\'s current tier alongside the subscription', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');
    expect(await service.getByUserId(user.id)).toMatchObject({ status: 'active', tier: 'premium', provider: 'paystack' });
  });
});

describe('handleWebhook', () => {
  /** A user who has paid and whose subscription is on record. */
  async function subscriber(fake: Fake) {
    const user = await createUser();
    fake.pay(user);
    fake.subscribe(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');
    return { user, service };
  }

  it('rejects a missing, wrong or wrong-key signature with 400 and changes nothing', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    const service = make(fake);
    const event = { event: 'charge.success', data: { reference: 'glm_ref1' } };
    const [raw, good] = signed(event);

    await expect(service.handleWebhook(raw, '')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.handleWebhook(raw, 'a'.repeat(128))).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.handleWebhook(...signed(event, 'sk_test_other'))).rejects.toMatchObject({ statusCode: 400 });
    // A valid signature for a different body does not carry over.
    await expect(service.handleWebhook(Buffer.from(JSON.stringify({ ...event, extra: 1 })), good)).rejects.toMatchObject({ statusCode: 400 });
    expect(await tierOf(user.id)).toBe('free');
  });

  it('answers 503 when not configured so that Paystack retries', async () => {
    const service = make(fakePaystack(), { secretKey: undefined });
    await expect(service.handleWebhook(...signed({ event: 'charge.success' }))).rejects.toMatchObject({ statusCode: 503 });
  });

  it('grants the plan on charge.success by asking Paystack about the charge', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user, { planCode: PRO });
    fake.subscribe(user, { plan: fake.plans.get(PRO) });

    await expect(deliver(make(fake), { event: 'charge.success', data: { reference: 'glm_ref1' } })).resolves.toEqual({ received: true });

    expect(await tierOf(user.id)).toBe('pro');
    expect(await row(user.id)).toMatchObject({ status: 'active', paystackSubscriptionCode: 'SUB_1' });
  });

  it('does not believe a charge.success that Paystack does not confirm', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user, { status: 'failed' });
    const service = make(fake);

    await deliver(service, { event: 'charge.success', data: { reference: 'glm_ref1', status: 'success', plan: { plan_code: PRO }, metadata: { userId: user.id } } });
    await deliver(service, { event: 'charge.success', data: { reference: 'glm_invented', status: 'success', metadata: { userId: user.id } } });

    expect(await tierOf(user.id)).toBe('free');
  });

  it('extends the period on a renewal charge, found by customer when there is no metadata', async () => {
    const fake = fakePaystack();
    const { user, service } = await subscriber(fake);
    const next = new Date(Date.now() + 60 * DAY).toISOString();
    fake.subscriptions.get('SUB_1').next_payment_date = next;
    fake.pay(user, { reference: 'renewal_2', metadata: '' });

    await deliver(service, { event: 'charge.success', data: { reference: 'renewal_2' } });
    await deliver(service, { event: 'invoice.update', data: { subscription: { subscription_code: 'SUB_1' } } });

    expect(await row(user.id)).toMatchObject({ status: 'active', currentPeriodEnd: new Date(next) });
  });

  it('attaches a new subscription from subscription.create, matching the customer by email', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.subscribe(user);

    await deliver(make(fake), { event: 'subscription.create', data: { subscription_code: 'SUB_1' } });

    expect(await row(user.id)).toMatchObject({ provider: 'paystack', status: 'active', paystackSubscriptionCode: 'SUB_1', paystackCustomerCode: 'CUS_1' });
    expect(await tierOf(user.id)).toBe('premium');
  });

  it('keeps the plan until the period ends when the customer cancels', async () => {
    const fake = fakePaystack();
    const { user, service } = await subscriber(fake);
    const paidUntil = (await row(user.id))!.currentPeriodEnd;

    fake.subscriptions.get('SUB_1').status = 'non-renewing';
    fake.subscriptions.get('SUB_1').next_payment_date = null;
    await deliver(service, { event: 'subscription.not_renew', data: { subscription_code: 'SUB_1' } });
    expect(await row(user.id)).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: paidUntil });
    expect(await tierOf(user.id)).toBe('premium');

    // Paystack then closes it; the time already paid for still stands.
    fake.subscriptions.get('SUB_1').status = 'cancelled';
    await deliver(service, { event: 'subscription.disable', data: { subscription_code: 'SUB_1' } });
    expect(await row(user.id)).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
    expect(await tierOf(user.id)).toBe('premium');
  });

  it('downgrades to free when the subscription ends and nothing paid for remains', async () => {
    const fake = fakePaystack();
    const { user, service } = await subscriber(fake);
    await subscriptionsRepository.updateByUserId(user.id, { currentPeriodEnd: new Date(Date.now() - DAY) });

    fake.subscriptions.get('SUB_1').status = 'completed';
    await deliver(service, { event: 'subscription.disable', data: { subscription_code: 'SUB_1' } });

    expect(await row(user.id)).toMatchObject({ status: 'cancelled', paystackSubscriptionCode: null });
    expect(await tierOf(user.id)).toBe('free');
  });

  it('keeps the tier but marks the subscription past due when a renewal charge fails', async () => {
    const fake = fakePaystack();
    const { user, service } = await subscriber(fake);
    fake.subscriptions.get('SUB_1').status = 'attention';

    await deliver(service, { event: 'invoice.payment_failed', data: { subscription: { subscription_code: 'SUB_1' } } });

    expect(await row(user.id)).toMatchObject({ status: 'past_due' });
    expect(await tierOf(user.id)).toBe('premium');
  });

  it('grants nothing for a subscription on a plan that is not one of ours', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.subscribe(user, { plan: plan('PLN_unrelated') });
    await deliver(make(fake), { event: 'subscription.create', data: { subscription_code: 'SUB_1' } });
    expect(await tierOf(user.id)).toBe('free');
  });

  it('acknowledges events for unknown customers and unhandled types', async () => {
    const fake = fakePaystack();
    fake.subscribe({ email: 'stranger@example.com' });
    const service = make(fake);
    await expect(deliver(service, { event: 'subscription.create', data: { subscription_code: 'SUB_1' } })).resolves.toEqual({ received: true });
    await expect(deliver(service, { event: 'transfer.success', data: {} })).resolves.toEqual({ received: true });
    await expect(deliver(service, { event: 'invoice.update', data: {} })).resolves.toEqual({ received: true });
  });

  it('applies a redelivered event only once', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    const service = make(fake);
    const event = { event: 'charge.success', data: { reference: 'glm_ref1' } };

    await expect(deliver(service, event)).resolves.toEqual({ received: true });
    await expect(deliver(service, event)).resolves.toEqual({ received: true, duplicate: true });
    expect(fake.calls(/transaction\/verify/)).toHaveLength(1);
  });

  it('retries an event whose handling failed', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    const service = make(fake);
    const event = { event: 'charge.success', data: { reference: 'glm_ref1' } };

    fake.setDown(true);
    await expect(deliver(service, event)).rejects.toThrow();
    fake.setDown(false);
    await expect(deliver(service, event)).resolves.toEqual({ received: true });
    expect(await tierOf(user.id)).toBe('premium');
  });

  it('uses the subscription\'s current state, not a late event\'s snapshot', async () => {
    const fake = fakePaystack();
    const { user, service } = await subscriber(fake);
    // The event claims "attention", but by now the customer has paid.
    await deliver(service, { event: 'invoice.payment_failed', data: { subscription: { subscription_code: 'SUB_1', status: 'attention' } } });
    expect(await row(user.id)).toMatchObject({ status: 'active' });
  });

  it('does not downgrade when an old subscription ends after a new one started', async () => {
    const fake = fakePaystack();
    const { user, service } = await subscriber(fake);
    fake.subscribe(user, { subscription_code: 'SUB_OLD', status: 'cancelled' });
    await subscriptionsRepository.updateByUserId(user.id, { currentPeriodEnd: new Date(Date.now() - DAY) });

    await deliver(service, { event: 'subscription.disable', data: { subscription_code: 'SUB_OLD' } });

    expect(await row(user.id)).toMatchObject({ status: 'active', paystackSubscriptionCode: 'SUB_1' });
    expect(await tierOf(user.id)).toBe('premium');
  });

  it('leaves a running Credo pass alone when an old Paystack subscription ends', async () => {
    const fake = fakePaystack();
    const user = await createUser({ tier: 'pro' });
    fake.subscribe(user, { status: 'cancelled' });
    await subscriptionsRepository.lockForUser(user.id, database.db);
    await subscriptionsRepository.updateByUserId(user.id, { provider: 'credo', status: 'active', paystackCustomerCode: 'CUS_1' });

    await deliver(make(fake), { event: 'subscription.disable', data: { subscription_code: 'SUB_1' } });

    expect(await row(user.id)).toMatchObject({ provider: 'credo', status: 'active' });
    expect(await tierOf(user.id)).toBe('pro');
  });
});

describe('cancelForUser', () => {
  it('disables the subscription with its email token', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    fake.subscribe(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');

    await service.cancelForUser(user.id);

    expect(fake.calls(/disable/)[0].body).toEqual({ code: 'SUB_1', token: 'tok_1' });
    expect(fake.subscriptions.get('SUB_1').status).toBe('non-renewing');
  });

  it('finds a subscription that was never attached, so it cannot keep charging', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');
    fake.subscribe(user);

    await service.cancelForUser(user.id);
    expect(fake.subscriptions.get('SUB_1').status).toBe('non-renewing');
  });

  it('does nothing for a user with no Paystack subscription, or one already cancelled or gone', async () => {
    const fake = fakePaystack();
    const service = make(fake);
    await service.cancelForUser((await createUser()).id);

    const user = await createUser();
    fake.pay(user);
    fake.subscribe(user, { status: 'non-renewing' });
    await service.confirmForUser(user.id, 'glm_ref1');
    await service.cancelForUser(user.id);
    fake.subscriptions.delete('SUB_1');
    await service.cancelForUser(user.id);

    expect(fake.calls(/disable/)).toHaveLength(0);
  });

  it('fails when Paystack cannot be reached, so the caller can refuse to delete the account', async () => {
    const fake = fakePaystack();
    const user = await createUser();
    fake.pay(user);
    fake.subscribe(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');
    fake.setDown(true);
    await expect(service.cancelForUser(user.id)).rejects.toThrow();
  });
});

describe('expiry and reconciliation', () => {
  async function paid(fake: Fake, withSubscription = true) {
    const user = await createUser();
    fake.pay(user);
    if (withSubscription) fake.subscribe(user);
    const service = make(fake);
    await service.confirmForUser(user.id, 'glm_ref1');
    return { user, service };
  }

  it('ends a cancelled subscription when its paid period is over, and leaves renewing ones alone', async () => {
    const fake = fakePaystack();
    const { user } = await paid(fake);
    await subscriptionsRepository.updateByUserId(user.id, { cancelAtPeriodEnd: true, currentPeriodEnd: new Date(Date.now() - 1000) });
    const renewing = await createUser({ tier: 'pro' });
    await subscriptionsRepository.lockForUser(renewing.id, database.db);
    await subscriptionsRepository.updateByUserId(renewing.id, { provider: 'paystack', status: 'active', currentPeriodEnd: new Date(Date.now() - 1000) });

    expect(await subscriptionsRepository.expireEndedPlans()).toEqual([user.id]);
    expect(await row(user.id)).toMatchObject({ status: 'inactive', paystackSubscriptionCode: null });
    expect(await row(renewing.id)).toMatchObject({ status: 'active' });
  });

  it('picks up a renewal whose webhook never arrived', async () => {
    const fake = fakePaystack();
    const { user, service } = await paid(fake);
    await subscriptionsRepository.updateByUserId(user.id, { currentPeriodEnd: new Date(Date.now() - 2 * DAY) });
    const next = new Date(Date.now() + 28 * DAY).toISOString();
    fake.subscriptions.get('SUB_1').next_payment_date = next;

    expect(await service.reconcileOverdue()).toBe(1);
    expect(await row(user.id)).toMatchObject({ status: 'active', currentPeriodEnd: new Date(next) });
    expect(await service.reconcileOverdue()).toBe(0);
  });

  it('picks up a cancellation whose webhook never arrived', async () => {
    const fake = fakePaystack();
    const { user, service } = await paid(fake);
    await subscriptionsRepository.updateByUserId(user.id, { currentPeriodEnd: new Date(Date.now() - 2 * DAY) });
    fake.subscriptions.get('SUB_1').status = 'cancelled';

    await service.reconcileOverdue();
    expect(await tierOf(user.id)).toBe('free');
    expect(await row(user.id)).toMatchObject({ status: 'cancelled' });
  });

  it('keeps the tier for a week after a failed renewal, then removes it', async () => {
    const fake = fakePaystack();
    const { user, service } = await paid(fake);
    fake.subscriptions.get('SUB_1').status = 'attention';
    fake.subscriptions.get('SUB_1').next_payment_date = new Date(Date.now() - 2 * DAY).toISOString();
    await subscriptionsRepository.updateByUserId(user.id, { currentPeriodEnd: new Date(Date.now() - 2 * DAY) });

    await service.reconcileOverdue();
    expect(await row(user.id)).toMatchObject({ status: 'past_due' });
    expect(await tierOf(user.id)).toBe('premium');

    fake.subscriptions.get('SUB_1').next_payment_date = new Date(Date.now() - 8 * DAY).toISOString();
    await service.reconcileOverdue();
    expect(await row(user.id)).toMatchObject({ status: 'inactive' });
    expect(await tierOf(user.id)).toBe('free');
  });

  it('ends a one-off paid period when Paystack never created a subscription', async () => {
    const fake = fakePaystack();
    const { user, service } = await paid(fake, false);
    await subscriptionsRepository.updateByUserId(user.id, { currentPeriodEnd: new Date(Date.now() - 2 * DAY) });

    await service.reconcileOverdue();
    expect(await tierOf(user.id)).toBe('free');
  });

  it('leaves subscriptions that are not overdue, and does nothing when billing is off', async () => {
    const fake = fakePaystack();
    const { user, service } = await paid(fake);
    const before = fake.requests.length;
    expect(await service.reconcileOverdue()).toBe(0);
    expect(fake.requests).toHaveLength(before);

    await subscriptionsRepository.updateByUserId(user.id, { currentPeriodEnd: new Date(Date.now() - 2 * DAY) });
    expect(await make(fake, { secretKey: undefined }).reconcileOverdue()).toBe(0);
  });
});
