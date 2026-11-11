/**
 * Billing rules, against a real database and a fake Stripe.
 *
 * The fake records what the service asks Stripe to do and plays back webhook
 * events; signature checking is the SDK's job and is stubbed.
 */
import { BillingSettings, createSubscriptionsService, StripeClient } from './subscriptions.service';
import { subscriptionsRepository, usersRepository } from '../repositories';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';
import { createUser, UNKNOWN_ID } from '../test/fixtures';

const PREMIUM = 'price_premium123';
const PRO = 'price_pro456';

const SETTINGS: BillingSettings = {
  webhookSecret: 'whsec_test',
  prices: { premium: PREMIUM, pro: PRO },
  checkoutSuccessUrl: 'glimms://upgrade/success',
  checkoutCancelUrl: 'glimms://upgrade/cancelled',
  portalReturnUrl: 'glimms://profile',
};

function stripePrice(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    active: true,
    currency: 'usd',
    unit_amount: id === PRO ? 1999 : 999,
    recurring: { interval: 'month', interval_count: 1, trial_period_days: null },
    product: { id: `prod_${id}`, name: id === PRO ? 'Glimms Pro' : 'Glimms Premium', description: 'All the looks' },
    ...overrides,
  };
}

function fakeStripe() {
  let nextEvent: unknown = null;
  const stripe = {
    customers: { create: jest.fn(async () => ({ id: 'cus_new' })) },
    checkout: { sessions: { create: jest.fn(async () => ({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' })) } },
    billingPortal: { sessions: { create: jest.fn(async () => ({ url: 'https://billing.stripe.com/p/session/1' })) } },
    prices: { retrieve: jest.fn(async (id: string) => stripePrice(id)) },
    subscriptions: { retrieve: jest.fn(async () => ({ status: 'active' })) },
    webhooks: {
      constructEvent: jest.fn((_body: unknown, signature: string) => {
        if (signature !== 'valid') throw new Error('No signatures found matching the expected signature');
        return nextEvent;
      }),
    },
  };
  return {
    stripe,
    client: stripe as unknown as StripeClient,
    deliver: (event: unknown) => { nextEvent = event; },
  };
}

function subscriptionEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    type,
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        current_period_end: 1_900_000_000,
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ price: { id: PREMIUM } }] },
        ...overrides,
      },
    },
  };
}

let database: TestDatabase;
beforeAll(async () => { database = await setupTestDatabase(); });
afterAll(async () => { await database.close(); });
beforeEach(async () => { await database.reset(); });

describe('listPrices', () => {
  it('describes each configured plan from Stripe', async () => {
    const { client } = fakeStripe();
    const prices = await createSubscriptionsService(client, SETTINGS).listPrices();

    expect(prices).toEqual([
      {
        tier: 'premium', priceId: PREMIUM, name: 'Glimms Premium', description: 'All the looks',
        currency: 'usd', unitAmount: 999, interval: 'month', intervalCount: 1, trialDays: null,
      },
      {
        tier: 'pro', priceId: PRO, name: 'Glimms Pro', description: 'All the looks',
        currency: 'usd', unitAmount: 1999, interval: 'month', intervalCount: 1, trialDays: null,
      },
    ]);
  });

  it('is empty when Stripe or the price ids are not configured', async () => {
    expect(await createSubscriptionsService(null, SETTINGS).listPrices()).toEqual([]);
    const { client, stripe } = fakeStripe();
    expect(await createSubscriptionsService(client, { ...SETTINGS, prices: {} }).listPrices()).toEqual([]);
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
  });

  it('caches, and shares one fetch between concurrent callers', async () => {
    const { client, stripe } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);

    await Promise.all([service.listPrices(), service.listPrices(), service.listPrices()]);
    await service.listPrices();

    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(2); // one per plan, once
  });

  it('hides a plan whose price is archived or not recurring', async () => {
    const { client, stripe } = fakeStripe();
    stripe.prices.retrieve.mockImplementation(async (id: string) =>
      stripePrice(id, id === PREMIUM ? { active: false } : { recurring: null }));

    expect(await createSubscriptionsService(client, SETTINGS).listPrices()).toEqual([]);
  });

  it('serves the last known prices when Stripe fails, and 503s when it has none', async () => {
    const { client, stripe } = fakeStripe();
    const service = createSubscriptionsService(client, { ...SETTINGS, priceCacheMs: 0 });
    const first = await service.listPrices();

    stripe.prices.retrieve.mockRejectedValue(new Error('stripe is down'));
    expect(await service.listPrices()).toEqual(first);

    const cold = createSubscriptionsService(client, SETTINGS);
    await expect(cold.listPrices()).rejects.toMatchObject({ statusCode: 503, code: 'BILLING_UNAVAILABLE' });
  });
});

describe('createCheckoutSession', () => {
  it('creates the Stripe customer once and starts checkout for the plan', async () => {
    const { client, stripe } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    const user = await createUser({ email: 'buyer@glimms.ai' });

    const session = await service.createCheckoutSession(user.id, { tier: 'pro' });

    expect(session).toEqual({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    expect(stripe.customers.create).toHaveBeenCalledWith({ email: 'buyer@glimms.ai', metadata: { userId: user.id } });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_new',
      mode: 'subscription',
      line_items: [{ price: PRO, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { userId: user.id, tier: 'pro' } },
      success_url: 'glimms://upgrade/success',
      cancel_url: 'glimms://upgrade/cancelled',
    });
    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ stripeCustomerId: 'cus_new', status: 'inactive' });

    await service.createCheckoutSession(user.id, { priceId: PREMIUM });
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
  });

  it('refuses any price that is not a configured plan', async () => {
    const { client, stripe } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    const user = await createUser();

    await expect(service.createCheckoutSession(user.id, { priceId: 'price_cheapOther' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PRICE' });
    await expect(service.createCheckoutSession(user.id, { priceId: PREMIUM, tier: 'pro' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PRICE' });
    await expect(service.createCheckoutSession(user.id, {}))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PRICE' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it('refuses a tier that has no price configured', async () => {
    const { client } = fakeStripe();
    const service = createSubscriptionsService(client, { ...SETTINGS, prices: { premium: PREMIUM } });
    const user = await createUser();
    await expect(service.createCheckoutSession(user.id, { tier: 'pro' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PRICE' });
  });

  it('does not start a second subscription for an active subscriber', async () => {
    const { client, stripe } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    const user = await createUser();
    await subscriptionsRepository.upsertStripeCustomer(user.id, 'cus_1');
    await subscriptionsRepository.updateByStripeCustomerId('cus_1', { status: 'active', stripeSubscriptionId: 'sub_1' });

    await expect(service.createCheckoutSession(user.id, { tier: 'pro' })).rejects.toMatchObject({ statusCode: 409 });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('answers 503 when billing is not configured, and 404 for an unknown user', async () => {
    const user = await createUser();
    await expect(createSubscriptionsService(null, SETTINGS).createCheckoutSession(user.id, { tier: 'premium' }))
      .rejects.toMatchObject({ statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });

    const { client } = fakeStripe();
    await expect(createSubscriptionsService(client, { ...SETTINGS, prices: {} }).createCheckoutSession(user.id, { tier: 'premium' }))
      .rejects.toMatchObject({ statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
    await expect(createSubscriptionsService(client, SETTINGS).createCheckoutSession(UNKNOWN_ID, { tier: 'premium' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('createPortalSession', () => {
  it('opens the billing portal for the user\'s own Stripe customer', async () => {
    const { client, stripe } = fakeStripe();
    const user = await createUser();
    const other = await createUser();
    await subscriptionsRepository.upsertStripeCustomer(user.id, 'cus_mine');
    await subscriptionsRepository.upsertStripeCustomer(other.id, 'cus_theirs');

    const session = await createSubscriptionsService(client, SETTINGS).createPortalSession(user.id);

    expect(session).toEqual({ url: 'https://billing.stripe.com/p/session/1' });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_mine', return_url: 'glimms://profile' });
  });

  it('answers 409 NO_BILLING_ACCOUNT for a user who has never checked out', async () => {
    const { client, stripe } = fakeStripe();
    const user = await createUser();
    await expect(createSubscriptionsService(client, SETTINGS).createPortalSession(user.id))
      .rejects.toMatchObject({ statusCode: 409, code: 'NO_BILLING_ACCOUNT' });
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it('answers 503 when billing is not configured', async () => {
    const user = await createUser();
    await expect(createSubscriptionsService(null, SETTINGS).createPortalSession(user.id))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('getByUserId', () => {
  it('reports the free plan for a user with no subscription row', async () => {
    const user = await createUser();
    expect(await createSubscriptionsService(null, SETTINGS).getByUserId(user.id)).toEqual({
      userId: user.id, status: 'inactive', tier: 'free',
      stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
    });
  });

  it('includes the user\'s current tier alongside the subscription', async () => {
    const user = await createUser({ tier: 'pro' });
    await subscriptionsRepository.upsertStripeCustomer(user.id, 'cus_1');
    expect(await createSubscriptionsService(null, SETTINGS).getByUserId(user.id))
      .toMatchObject({ userId: user.id, tier: 'pro', stripeCustomerId: 'cus_1' });
  });
});

describe('handleWebhook', () => {
  async function subscriber() {
    const user = await createUser();
    await subscriptionsRepository.upsertStripeCustomer(user.id, 'cus_1');
    return user;
  }
  const body = Buffer.from('{}');

  it('rejects a bad signature with 400 and changes nothing', async () => {
    const { client, deliver } = fakeStripe();
    const user = await subscriber();
    deliver(subscriptionEvent('customer.subscription.updated'));

    await expect(createSubscriptionsService(client, SETTINGS).handleWebhook(body, 'forged'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });

  it('answers 503 when not configured so that Stripe retries', async () => {
    await expect(createSubscriptionsService(null, SETTINGS).handleWebhook(body, 'valid'))
      .rejects.toMatchObject({ statusCode: 503 });
    const { client } = fakeStripe();
    await expect(createSubscriptionsService(client, { ...SETTINGS, webhookSecret: undefined }).handleWebhook(body, 'valid'))
      .rejects.toMatchObject({ statusCode: 503 });
  });

  it('grants the tier of the purchased price', async () => {
    const { client, deliver } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    const user = await subscriber();

    deliver(subscriptionEvent('customer.subscription.created', { items: { data: [{ price: { id: PRO } }] } }));
    expect(await service.handleWebhook(body, 'valid')).toEqual({ received: true });

    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'pro' });
    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({
      status: 'active', stripeSubscriptionId: 'sub_1', cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_900_000_000 * 1000),
    });
  });

  it('ignores a tier claimed in metadata: only the price decides', async () => {
    const { client, deliver } = fakeStripe();
    const user = await subscriber();

    deliver(subscriptionEvent('customer.subscription.created', {
      metadata: { tier: 'pro' },
      items: { data: [{ price: { id: 'price_somethingElse', lookup_key: 'pro' } }] },
    }));
    await createSubscriptionsService(client, SETTINGS).handleWebhook(body, 'valid');

    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });

  it('treats a trial as active, and keeps the tier while a payment is past due', async () => {
    const { client, deliver } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    const user = await subscriber();

    deliver(subscriptionEvent('customer.subscription.created', { status: 'trialing' }));
    await service.handleWebhook(body, 'valid');
    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ status: 'active' });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'premium' });

    deliver(subscriptionEvent('customer.subscription.updated', { status: 'past_due' }));
    await service.handleWebhook(body, 'valid');
    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ status: 'past_due' });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'premium' });
  });

  it('removes the paid tier when the subscription stops being paid for', async () => {
    const { client, deliver } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    const user = await subscriber();
    deliver(subscriptionEvent('customer.subscription.created'));
    await service.handleWebhook(body, 'valid');

    deliver(subscriptionEvent('customer.subscription.updated', { status: 'unpaid' }));
    await service.handleWebhook(body, 'valid');

    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ status: 'inactive' });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });

  it('downgrades to free when the subscription is deleted', async () => {
    const { client, deliver } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    const user = await subscriber();
    deliver(subscriptionEvent('customer.subscription.created'));
    await service.handleWebhook(body, 'valid');

    deliver(subscriptionEvent('customer.subscription.deleted'));
    await service.handleWebhook(body, 'valid');

    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ status: 'cancelled', stripeSubscriptionId: null });
    expect(await usersRepository.findById(user.id)).toMatchObject({ tier: 'free' });
  });

  it('marks the subscription past due when an invoice fails', async () => {
    const { client, deliver } = fakeStripe();
    const user = await subscriber();
    deliver({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } });
    await createSubscriptionsService(client, SETTINGS).handleWebhook(body, 'valid');
    expect(await subscriptionsRepository.findByUserId(user.id)).toMatchObject({ status: 'past_due' });
  });

  it('acknowledges events for unknown customers and unhandled types', async () => {
    const { client, deliver } = fakeStripe();
    const service = createSubscriptionsService(client, SETTINGS);
    deliver(subscriptionEvent('customer.subscription.updated', { customer: 'cus_unknown' }));
    expect(await service.handleWebhook(body, 'valid')).toEqual({ received: true });
    deliver({ type: 'charge.refunded', data: { object: {} } });
    expect(await service.handleWebhook(body, 'valid')).toEqual({ received: true });
  });
});
