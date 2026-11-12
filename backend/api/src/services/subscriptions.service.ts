/**
 * Card subscriptions through Paystack.
 *
 * Plans are created in the Paystack dashboard; the server maps each plan code
 * to a tier and is the only source of what can be bought. Checkout is
 * Paystack's hosted page: a transaction initialised with a plan charges the
 * card once and Paystack then creates the subscription and renews it.
 *
 * Access is only ever granted from what Paystack itself reports when asked
 * with our secret key (verify transaction, fetch subscription). The browser
 * redirect is user-controlled, and webhook payloads may be late or out of
 * order, so both are treated as prompts to go and ask.
 */
import crypto from 'crypto';
import { getDb } from '../db';
import type { Transaction } from '../db';
import { paystackEventsRepository, subscriptionsRepository, usersRepository } from '../repositories';
import type { Subscription, Tier } from '../models';
import { config } from '../config';
import { logger } from '../lib/logger';
import {
  AppError, BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError,
} from '../middleware/errorHandler.middleware';

export type PaidTier = Exclude<Tier, 'free'>;

/** A purchasable plan, as shown on the paywall. Amounts are in the currency's minor unit (kobo). */
export interface PlanPrice {
  tier:          PaidTier;
  planCode:      string;
  name:          string;
  description:   string | null;
  currency:      string;
  unitAmount:    number;
  interval:      'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  trialDays:     null;
}

export interface BillingSettings {
  secretKey?:   string;
  baseUrl:      string;
  /** Paystack plan code per paid tier; a tier without one is not for sale. */
  plans:        Partial<Record<PaidTier, string>>;
  /** Where Paystack sends the browser after payment (a page on this API). */
  callbackUrl:  string;
  /** How long plan details are reused before being fetched again. */
  planCacheMs?: number;
}

export type PaymentOutcome = 'paid' | 'pending' | 'failed';

/** Minimal HTTP surface, so tests can stand in for Paystack. */
export type PaystackHttp = (
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; json(): Promise<unknown> }>;

const PAID_TIERS: PaidTier[] = ['premium', 'pro'];
const DEFAULT_PLAN_CACHE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;
/** How long after a missed renewal date a subscription is re-checked with Paystack. */
const OVERDUE_GRACE_HOURS = 24;
/** How long a paid tier is kept after a renewal charge fails. */
const PAST_DUE_GRACE_DAYS = 7;

// https://paystack.com/docs/payments/subscriptions/#create-a-plan
const INTERVALS: Record<string, { interval: PlanPrice['interval']; intervalCount: number; days: number }> = {
  daily:      { interval: 'day',   intervalCount: 1, days: 1 },
  weekly:     { interval: 'week',  intervalCount: 1, days: 7 },
  monthly:    { interval: 'month', intervalCount: 1, days: 31 },
  quarterly:  { interval: 'month', intervalCount: 3, days: 92 },
  biannually: { interval: 'month', intervalCount: 6, days: 184 },
  annually:   { interval: 'year',  intervalCount: 1, days: 366 },
};

class PaystackError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function billingUnavailable(): AppError {
  return new ServiceUnavailableError('Billing is not available right now', 'BILLING_NOT_CONFIGURED');
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Paystack returns metadata as an object, a JSON string, or an empty string. */
function metadataOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return {};
}

/** The plan code of a transaction or subscription, whichever shape Paystack used. */
function planCodeOf(object: any): string | null {
  for (const plan of [object?.plan_object, object?.plan]) {
    if (typeof plan === 'string' && plan) return plan;
    if (plan && typeof plan.plan_code === 'string' && plan.plan_code) return plan.plan_code;
  }
  return null;
}

export function createSubscriptionsService(http: PaystackHttp, settings: BillingSettings) {
  const secretKey = settings.secretKey;
  const tierByPlan = new Map<string, PaidTier>();
  for (const tier of PAID_TIERS) {
    const code = settings.plans[tier];
    if (code) tierByPlan.set(code, tier);
  }
  const selling = !!secretKey && tierByPlan.size > 0;

  let planCache: { expiresAt: number; plans: PlanPrice[] } | null = null;
  let planFetch: Promise<PlanPrice[]> | null = null;

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    if (!secretKey) throw billingUnavailable();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await http(`${settings.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const payload: any = await response.json().catch(() => null);
      if (response.status < 200 || response.status >= 300 || payload?.status !== true) {
        throw new PaystackError(String(payload?.message ?? `Paystack answered ${response.status}`), response.status);
      }
      return payload.data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** `call`, but a missing object is null instead of an error. */
  async function callOrNull(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any | null> {
    try {
      return await call(method, path, body);
    } catch (err) {
      if (err instanceof PaystackError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  }

  async function fetchPlans(): Promise<PlanPrice[]> {
    const plans: PlanPrice[] = [];
    for (const tier of PAID_TIERS) {
      const planCode = settings.plans[tier];
      if (!planCode) continue;
      const plan = await call('GET', `/plan/${encodeURIComponent(planCode)}`);
      const cadence = INTERVALS[String(plan?.interval)];
      // A plan we cannot sell correctly is left out rather than shown wrong.
      if (!cadence || !Number.isInteger(plan?.amount) || plan.amount <= 0 || plan.is_deleted || plan.is_archived) {
        logger.error({ tier, planCode }, 'Configured Paystack plan is archived or has an unsupported interval or amount: hidden');
        continue;
      }
      plans.push({
        tier,
        planCode,
        name:          typeof plan.name === 'string' && plan.name ? plan.name : tier,
        description:   typeof plan.description === 'string' && plan.description ? plan.description : null,
        currency:      String(plan.currency ?? 'NGN').toLowerCase(),
        unitAmount:    plan.amount,
        interval:      cadence.interval,
        intervalCount: cadence.intervalCount,
        trialDays:     null,
      });
    }
    return plans;
  }

  async function listPrices(): Promise<PlanPrice[]> {
    if (!selling) return [];
    if (planCache && planCache.expiresAt > Date.now()) return planCache.plans;

    // One round of Paystack calls no matter how many requests arrive together.
    planFetch ??= fetchPlans()
      .then((plans) => {
        planCache = { expiresAt: Date.now() + (settings.planCacheMs ?? DEFAULT_PLAN_CACHE_MS), plans };
        return plans;
      })
      .finally(() => { planFetch = null; });

    try {
      return await planFetch;
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Could not load plans from Paystack');
      if (planCache) return planCache.plans; // stale beats unavailable
      throw new ServiceUnavailableError('Prices are temporarily unavailable', 'BILLING_UNAVAILABLE');
    }
  }

  /** Days one payment of this plan covers (generous, so a renewal never lands after expiry). */
  async function periodDays(planCode: string, txn: any): Promise<number> {
    const named = INTERVALS[String(txn?.plan_object?.interval ?? txn?.plan?.interval)];
    if (named) return named.days;
    const known = (await listPrices().catch(() => [])).find((plan) => plan.planCode === planCode);
    if (!known) return INTERVALS.monthly.days;
    return Object.values(INTERVALS)
      .find((c) => c.interval === known.interval && c.intervalCount === known.intervalCount)?.days ?? INTERVALS.monthly.days;
  }

  /** Whose payment or subscription this is: our own metadata first, then the customer. */
  async function ownerOf(object: any, tx: Transaction): Promise<string | null> {
    const userId = metadataOf(object?.metadata).userId;
    if (typeof userId === 'string' && /^[0-9a-f-]{36}$/i.test(userId)) {
      const user = await usersRepository.findById(userId, tx);
      if (user) return user.id;
    }
    const customerCode = object?.customer?.customer_code;
    if (typeof customerCode === 'string' && customerCode) {
      const row = await subscriptionsRepository.findByPaystackCustomerCode(customerCode, tx);
      if (row) return row.userId;
    }
    const email = object?.customer?.email;
    if (typeof email === 'string' && email) {
      const user = await usersRepository.findByEmail(email.toLowerCase(), tx);
      if (user) return user.id;
    }
    return null;
  }

  /**
   * Grants the tier a successful plan payment paid for. Safe to repeat: the
   * period is derived from when Paystack says the payment happened, so the
   * same payment always yields the same end date.
   */
  async function applyPayment(txn: any, tx: Transaction, expectedUserId?: string): Promise<{ outcome: PaymentOutcome; tier?: PaidTier; userId?: string }> {
    const planCode = planCodeOf(txn);
    const tier = planCode ? tierByPlan.get(planCode) : undefined;
    if (!planCode || !tier) return { outcome: 'failed' }; // not a payment for one of our plans

    const userId = await ownerOf(txn, tx);
    if (!userId || (expectedUserId && userId !== expectedUserId)) return { outcome: 'failed' };

    const paidAt = parseDate(txn.paid_at ?? txn.paidAt ?? txn.transaction_date) ?? new Date();
    const paidUntil = new Date(paidAt.getTime() + (await periodDays(planCode, txn)) * DAY_MS);
    if (paidUntil.getTime() <= Date.now()) return { outcome: 'paid', tier, userId }; // an old payment: nothing left to grant

    const row = await subscriptionsRepository.lockForUser(userId, tx);
    const alreadyRunning = row.provider === 'paystack' && row.status === 'active';
    // Once the subscription is attached, its next payment date (set by
    // syncSubscription) is exact. The estimate only replaces it for a payment
    // made around or after that date, i.e. a renewal.
    const exact = alreadyRunning && !!row.paystackSubscriptionCode && !!row.currentPeriodEnd
      && row.currentPeriodEnd.getTime() > paidAt.getTime() + 2 * DAY_MS;
    const later = exact || (alreadyRunning && row.currentPeriodEnd && row.currentPeriodEnd > paidUntil)
      ? row.currentPeriodEnd! : paidUntil;

    await subscriptionsRepository.updateByUserId(userId, {
      provider:             'paystack',
      status:               'active',
      paystackCustomerCode: typeof txn.customer?.customer_code === 'string' ? txn.customer.customer_code : row.paystackCustomerCode,
      currentPeriodEnd:     later,
      // A repeat confirmation must not undo a cancellation made since.
      ...(alreadyRunning ? {} : { cancelAtPeriodEnd: false, paystackSubscriptionCode: null }),
    }, tx);
    await usersRepository.update(userId, { tier }, tx);
    logger.info({ userId, tier }, 'Paystack payment applied');
    return { outcome: 'paid', tier, userId };
  }

  /**
   * Brings our row in line with a Paystack subscription's current state, read
   * from Paystack now rather than taken from an event snapshot.
   */
  async function syncSubscription(code: string, tx: Transaction): Promise<void> {
    const live = await callOrNull('GET', `/subscription/${encodeURIComponent(code)}`);

    let row = await subscriptionsRepository.findByPaystackSubscriptionCode(code, tx);
    if (!row && live) {
      const userId = await ownerOf(live, tx);
      row = userId ? await subscriptionsRepository.lockForUser(userId, tx) : null;
    }
    if (!row) return; // not one of our customers (or the account was deleted)

    const liveStatus: string = live?.status ?? 'cancelled';
    const inGoodStanding = liveStatus === 'active' || liveStatus === 'non-renewing' || liveStatus === 'attention';

    // News about a subscription other than the one on record only matters if
    // it is a live one taking over; an old subscription ending must not
    // downgrade a user who has since bought something else.
    const superseded = row.provider === 'credo'
      ? row.status === 'active'
      : !!row.paystackSubscriptionCode && row.paystackSubscriptionCode !== code;
    if (superseded && !inGoodStanding) {
      logger.info({ userId: row.userId, code }, 'Ignoring update for a superseded subscription');
      return;
    }

    const tier: Tier = (live && tierByPlan.get(planCodeOf(live) ?? '')) || 'free';
    if (inGoodStanding && tier === 'free') {
      logger.error({ code }, 'Paystack subscription is on a plan not configured as a tier (PAYSTACK_*_PLAN_CODE): granting no paid tier');
    }

    const nextPayment = parseDate(live?.next_payment_date);
    const paidUntil = nextPayment ?? row.currentPeriodEnd;
    const customerCode = typeof live?.customer?.customer_code === 'string' ? live.customer.customer_code : row.paystackCustomerCode;

    if (!inGoodStanding || tier === 'free') {
      // Cancelled or completed. Time already paid for is honoured: the plan
      // stays until the period ends, then the expiry sweep closes it.
      const stillPaid = row.provider === 'paystack' && row.status === 'active'
        && !!row.currentPeriodEnd && row.currentPeriodEnd.getTime() > Date.now() && tier !== 'free';
      if (stillPaid) {
        await subscriptionsRepository.updateByUserId(row.userId, { cancelAtPeriodEnd: true, paystackSubscriptionCode: code }, tx);
        return;
      }
      await subscriptionsRepository.updateByUserId(row.userId, {
        provider: 'paystack', status: 'cancelled', paystackSubscriptionCode: null, cancelAtPeriodEnd: false,
      }, tx);
      await usersRepository.update(row.userId, { tier: 'free' }, tx);
      logger.info({ userId: row.userId }, 'Subscription ended: user is on the free tier');
      return;
    }

    // "attention" means the last renewal charge failed; the tier is kept while
    // the customer fixes their card, as Paystack keeps the subscription open.
    await subscriptionsRepository.updateByUserId(row.userId, {
      provider:                 'paystack',
      paystackSubscriptionCode: code,
      paystackCustomerCode:     customerCode,
      status:                   liveStatus === 'attention' ? 'past_due' : 'active',
      currentPeriodEnd:         paidUntil,
      cancelAtPeriodEnd:        liveStatus === 'non-renewing',
    }, tx);
    await usersRepository.update(row.userId, { tier }, tx);
    logger.info({ userId: row.userId, tier, status: liveStatus }, 'Subscription synced from Paystack');
  }

  /** The customer's open subscription to one of our plans, if Paystack has created it yet. */
  async function findSubscriptionCode(customerCode: string): Promise<string | null> {
    const customer = await callOrNull('GET', `/customer/${encodeURIComponent(customerCode)}`);
    if (!customer?.id) return null;
    const list = await call('GET', `/subscription?customer=${encodeURIComponent(String(customer.id))}&perPage=50`);
    const ours = (Array.isArray(list) ? list : [])
      .filter((sub: any) => tierByPlan.has(planCodeOf(sub) ?? '') && typeof sub.subscription_code === 'string');
    const rank = (sub: any) => ['active', 'non-renewing', 'attention'].indexOf(sub.status);
    ours.sort((a: any, b: any) => (rank(a) < 0 ? 9 : rank(a)) - (rank(b) < 0 ? 9 : rank(b))
      || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    return ours.length && rank(ours[0]) >= 0 ? ours[0].subscription_code : null;
  }

  /**
   * After a payment, attach the subscription Paystack created for it. Paystack
   * creates it moments after the charge, so not finding it yet is normal; the
   * `subscription.create` webhook or the sweep attaches it later.
   */
  async function linkSubscription(userId: string): Promise<string | null> {
    try {
      const row = await subscriptionsRepository.findByUserId(userId);
      if (!row?.paystackCustomerCode || row.provider !== 'paystack') return null;
      if (row.paystackSubscriptionCode) return row.paystackSubscriptionCode;
      const code = await findSubscriptionCode(row.paystackCustomerCode);
      if (!code) return null;
      await getDb().transaction((tx) => syncSubscription(code, tx));
      return code;
    } catch (err: any) {
      logger.warn({ userId, err: err?.message }, 'Could not attach the Paystack subscription yet');
      return null;
    }
  }

  /** Asks Paystack about a transaction and applies it if it paid for a plan. */
  async function settle(reference: string, expectedUserId?: string): Promise<{ status: PaymentOutcome | 'unknown'; tier?: PaidTier }> {
    const txn = await callOrNull('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (!txn) return { status: 'unknown' };

    const owner = metadataOf(txn.metadata).userId;
    if (expectedUserId && owner !== expectedUserId) return { status: 'unknown' };

    if (txn.status !== 'success') {
      const failed = txn.status === 'failed' || txn.status === 'reversed';
      return { status: failed ? 'failed' : 'pending' }; // abandoned / ongoing / pending / queued may still complete
    }

    const applied = await getDb().transaction((tx) => applyPayment(txn, tx, expectedUserId));
    if (applied.outcome === 'paid' && applied.userId) await linkSubscription(applied.userId);
    return { status: applied.outcome === 'paid' ? 'paid' : 'unknown', tier: applied.tier };
  }

  async function applyEvent(event: any, tx: Transaction): Promise<string | null> {
    const data = event?.data ?? {};
    switch (event?.event) {
      case 'charge.success': {
        // Re-read the charge: the event shows the sender knows our key, but
        // Paystack's own record is what counts.
        const txn = typeof data.reference === 'string'
          ? await callOrNull('GET', `/transaction/verify/${encodeURIComponent(data.reference)}`)
          : null;
        if (txn?.status !== 'success') return null;
        const applied = await applyPayment(txn, tx);
        return applied.outcome === 'paid' ? applied.userId ?? null : null;
      }

      case 'subscription.create':
      case 'subscription.not_renew':
      case 'subscription.disable':
        if (typeof data.subscription_code === 'string') await syncSubscription(data.subscription_code, tx);
        return null;

      case 'invoice.create':
      case 'invoice.update':
      case 'invoice.payment_failed':
        if (typeof data.subscription?.subscription_code === 'string') {
          await syncSubscription(data.subscription.subscription_code, tx);
        }
        return null;

      default:
        logger.debug({ event: event?.event }, 'Unhandled Paystack webhook event: ignored');
        return null;
    }
  }

  return {

  /** Never 404s: a user without a subscription row is simply on the free plan. */
  async getByUserId(userId: string) {
    const [sub, user] = await Promise.all([
      subscriptionsRepository.findByUserId(userId),
      usersRepository.findById(userId),
    ]);
    const tier: Tier = user?.tier ?? 'free';
    if (!sub) {
      return {
        userId,
        status: 'inactive',
        tier,
        provider: null,
        paystackCustomerCode: null,
        paystackSubscriptionCode: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    return { ...sub, tier };
  },

  /**
   * Plans that can be bought right now. An empty list means purchases are
   * switched off (Paystack or the plan codes are not configured), which
   * clients show as "not available" rather than as an error.
   */
  listPrices,

  /**
   * Start Paystack checkout for a plan, chosen by `tier` or by its `planCode`.
   * Only plans configured on the server can be bought.
   */
  async createCheckoutSession(userId: string, choice: { planCode?: string; tier?: PaidTier }) {
    if (!selling) throw billingUnavailable();

    const planCode = choice.planCode ?? (choice.tier ? settings.plans[choice.tier] : undefined);
    const tier = planCode ? tierByPlan.get(planCode) : undefined;
    if (!planCode || !tier || (choice.tier && choice.tier !== tier)) {
      throw new AppError(400, 'That plan is not available', 'INVALID_PRICE');
    }

    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const current = await subscriptionsRepository.findByUserId(userId);
    if (current?.provider === 'paystack' && (current.status === 'active' || current.status === 'past_due')) {
      // A second checkout would create a second subscription and double-bill.
      throw new ConflictError('You already have a subscription. Manage it from billing settings.');
    }
    if (current?.provider === 'credo' && current.status === 'active') {
      throw new ConflictError('You already have an active plan. You can switch when it ends.');
    }

    const plan = (await listPrices()).find((candidate) => candidate.planCode === planCode);
    if (!plan) throw new AppError(400, 'That plan is not available', 'INVALID_PRICE');

    const reference = `glm_${crypto.randomBytes(12).toString('hex')}`;
    let data: any;
    try {
      data = await call('POST', '/transaction/initialize', {
        email:        user.email,
        amount:       plan.unitAmount, // required by the API; the plan's own amount is what is charged
        plan:         planCode,
        reference,
        callback_url: settings.callbackUrl,
        metadata:     { userId, tier },
      });
    } catch (err: any) {
      logger.error({ userId, err: err?.message }, 'Paystack checkout could not be started');
      throw new ServiceUnavailableError('Checkout could not be started', 'BILLING_UNAVAILABLE');
    }
    if (typeof data?.authorization_url !== 'string') {
      throw new ServiceUnavailableError('Checkout could not be started', 'BILLING_UNAVAILABLE');
    }
    return { url: data.authorization_url as string, reference: String(data.reference ?? reference) };
  },

  /** The app asks whether its own checkout has been paid. */
  async confirmForUser(userId: string, reference: string): Promise<{ status: PaymentOutcome; tier?: PaidTier }> {
    if (!secretKey) throw billingUnavailable();
    let result;
    try {
      result = await settle(reference, userId);
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.warn({ userId, err: err?.message }, 'Paystack could not be asked about a payment');
      throw new ServiceUnavailableError('Payment status is temporarily unavailable', 'BILLING_UNAVAILABLE');
    }
    if (result.status === 'unknown') throw new NotFoundError('Payment');
    return { status: result.status, tier: result.tier };
  },

  /** The browser came back from checkout. The query string proves nothing; Paystack is asked. */
  async confirmFromRedirect(reference: string): Promise<PaymentOutcome | 'unknown'> {
    if (!secretKey || !reference) return 'unknown';
    return (await settle(reference)).status;
  },

  /** Paystack-hosted page where the user updates their card or cancels. */
  async createPortalSession(userId: string) {
    if (!secretKey) throw billingUnavailable();

    const sub = await subscriptionsRepository.findByUserId(userId);
    const code = sub?.provider === 'paystack'
      ? sub.paystackSubscriptionCode ?? await linkSubscription(userId)
      : null;
    if (!code) {
      throw new AppError(409, 'There is no subscription to manage yet', 'NO_BILLING_ACCOUNT');
    }

    let data: any;
    try {
      data = await call('GET', `/subscription/${encodeURIComponent(code)}/manage/link`);
    } catch (err: any) {
      logger.error({ userId, err: err?.message }, 'Paystack manage link could not be created');
      throw new ServiceUnavailableError('Billing settings are temporarily unavailable', 'BILLING_UNAVAILABLE');
    }
    if (typeof data?.link !== 'string') {
      throw new ServiceUnavailableError('Billing settings are temporarily unavailable', 'BILLING_UNAVAILABLE');
    }
    return { url: data.link as string };
  },

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!secretKey) {
      // 503 so Paystack retries once the service is configured, instead of
      // treating the event as delivered and dropping it.
      logger.warn('Paystack webhook received but Paystack is not configured');
      throw billingUnavailable();
    }

    // https://paystack.com/docs/payments/webhooks/#verify-event-origin
    const expected = Buffer.from(crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex'));
    const given = Buffer.from(String(signature ?? '').trim().toLowerCase());
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      logger.error('Paystack webhook signature verification failed');
      throw new BadRequestError('Invalid Paystack signature');
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestError('Webhook body is not JSON');
    }
    logger.info({ event: event?.event }, 'Paystack webhook received');

    // Paystack retries until it gets a 200 and its events have no id, so the
    // body's hash is recorded in the same transaction as the effects: a
    // redelivery is acknowledged and skipped, while an event whose handling
    // failed is not recorded and gets retried.
    const eventId = crypto.createHash('sha256').update(rawBody).digest('hex');
    let paidUserId: string | null = null;
    const result = await getDb().transaction(async (tx) => {
      if (!(await paystackEventsRepository.recordOnce(eventId, String(event?.event ?? 'unknown').slice(0, 100), tx))) {
        logger.info({ event: event?.event }, 'Paystack webhook already processed: skipped');
        return { received: true, duplicate: true };
      }
      paidUserId = await applyEvent(event, tx);
      return { received: true };
    });
    if (paidUserId) await linkSubscription(paidUserId);
    return result;
  },

  /**
   * Stops a user's subscription from renewing (used before deleting an
   * account). Paystack has no API to delete a customer; the customer record
   * stays in the Paystack dashboard.
   */
  async cancelForUser(userId: string): Promise<void> {
    const sub = await subscriptionsRepository.findByUserId(userId);
    if (!sub || sub.provider !== 'paystack') return;
    if (!secretKey) throw billingUnavailable();

    const code = sub.paystackSubscriptionCode
      ?? (sub.paystackCustomerCode ? await findSubscriptionCode(sub.paystackCustomerCode) : null);
    if (!code) return;

    const live = await callOrNull('GET', `/subscription/${encodeURIComponent(code)}`);
    if (!live || live.status === 'cancelled' || live.status === 'completed' || live.status === 'non-renewing') return;
    await call('POST', '/subscription/disable', { code, token: live.email_token });
  },

  /**
   * Re-checks subscriptions whose renewal date passed without news, so a
   * missed webhook cannot leave someone on a paid tier for free (or the reverse).
   */
  async reconcileOverdue(limit = 50): Promise<number> {
    if (!secretKey) return 0;
    const rows: Subscription[] = await subscriptionsRepository.findOverduePaystack(OVERDUE_GRACE_HOURS, limit);
    let checked = 0;
    for (const row of rows) {
      try {
        const code = row.paystackSubscriptionCode
          ?? (row.paystackCustomerCode ? await findSubscriptionCode(row.paystackCustomerCode) : null);
        if (code) {
          await getDb().transaction((tx) => syncSubscription(code, tx));
          // Paystack leaves a subscription in "attention" until the customer
          // fixes their card. The tier is kept for a grace period, not forever.
          const after = await subscriptionsRepository.findByUserId(row.userId);
          if (after?.provider === 'paystack' && after.status === 'past_due' && after.currentPeriodEnd
            && after.currentPeriodEnd.getTime() < Date.now() - PAST_DUE_GRACE_DAYS * DAY_MS) {
            await getDb().transaction(async (tx) => {
              await subscriptionsRepository.updateByUserId(row.userId, { status: 'inactive' }, tx);
              await usersRepository.update(row.userId, { tier: 'free' }, tx);
            });
            logger.info({ userId: row.userId }, 'Renewal unpaid past the grace period: user is on the free tier');
          }
        } else {
          // Paid once but Paystack never created a subscription: the paid period is simply over.
          await getDb().transaction(async (tx) => {
            await subscriptionsRepository.updateByUserId(row.userId, { status: 'inactive', cancelAtPeriodEnd: false }, tx);
            await usersRepository.update(row.userId, { tier: 'free' }, tx);
          });
        }
        checked += 1;
      } catch (err: any) {
        logger.warn({ userId: row.userId, err: err?.message }, 'Paystack reconcile failed for a subscription');
      }
    }
    return checked;
  },

  isConfigured(): boolean {
    return !!secretKey;
  },
  };
}

if (config.paystack.secretKey && !config.paystack.plans.premium && !config.paystack.plans.pro) {
  logger.warn('Paystack is configured but PAYSTACK_PREMIUM_PLAN_CODE / PAYSTACK_PRO_PLAN_CODE are not: nothing can be purchased');
}

export const subscriptionsService = createSubscriptionsService(
  (url, init) => fetch(url, init),
  {
    secretKey:   config.paystack.secretKey,
    baseUrl:     config.paystack.baseUrl,
    plans:       config.paystack.plans,
    callbackUrl: `${config.publicApiUrl}/account/paystack/return`,
  },
);
