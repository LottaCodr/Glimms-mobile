import Stripe from 'stripe';
import { getDb } from '../db';
import type { Transaction } from '../db';
import { stripeEventsRepository, subscriptionsRepository, usersRepository } from '../repositories';
import type { SubStatus, Tier } from '../models';
import { config } from '../config';
import { logger } from '../lib/logger';
import {
  AppError, BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError,
} from '../middleware/errorHandler.middleware';

export type PaidTier = Exclude<Tier, 'free'>;

/** A purchasable plan, as shown on the paywall. Amounts are in the currency's minor unit. */
export interface PlanPrice {
  tier:          PaidTier;
  priceId:       string;
  name:          string;
  description:   string | null;
  currency:      string;
  unitAmount:    number;
  interval:      'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  trialDays:     number | null;
}

export interface BillingSettings {
  webhookSecret?:     string;
  /** Stripe price id per paid tier; a tier without one is not for sale. */
  prices:             Partial<Record<PaidTier, string>>;
  checkoutSuccessUrl: string;
  checkoutCancelUrl:  string;
  portalReturnUrl:    string;
  /** How long Stripe price details are reused before being fetched again. */
  priceCacheMs?:      number;
}

/** The slice of the Stripe SDK this service uses (lets tests supply a fake). */
export type StripeClient = Pick<Stripe, 'customers' | 'checkout' | 'billingPortal' | 'prices' | 'subscriptions' | 'webhooks'>;

const PAID_TIERS: PaidTier[] = ['premium', 'pro'];
const DEFAULT_PRICE_CACHE_MS = 10 * 60 * 1000;

function billingUnavailable(): AppError {
  return new ServiceUnavailableError('Billing is not available right now', 'BILLING_NOT_CONFIGURED');
}

export function createSubscriptionsService(stripe: StripeClient | null, settings: BillingSettings) {
  const tierByPriceId = new Map<string, PaidTier>();
  for (const tier of PAID_TIERS) {
    const priceId = settings.prices[tier];
    if (priceId) tierByPriceId.set(priceId, tier);
  }

  let priceCache: { expiresAt: number; prices: PlanPrice[] } | null = null;
  let priceFetch: Promise<PlanPrice[]> | null = null;

  async function fetchPrices(client: StripeClient): Promise<PlanPrice[]> {
    const plans: PlanPrice[] = [];
    for (const tier of PAID_TIERS) {
      const priceId = settings.prices[tier];
      if (!priceId) continue;
      const price = await client.prices.retrieve(priceId, { expand: ['product'] });
      // A plan we cannot sell correctly is left out rather than shown wrong.
      if (!price.active || price.unit_amount == null || !price.recurring) {
        logger.error({ tier, priceId }, 'Configured Stripe price is inactive or not a fixed recurring price — hidden');
        continue;
      }
      const product = typeof price.product === 'object' && price.product && !('deleted' in price.product && price.product.deleted)
        ? price.product as Stripe.Product
        : null;
      plans.push({
        tier,
        priceId,
        name:          product?.name ?? tier,
        description:   product?.description ?? null,
        currency:      price.currency,
        unitAmount:    price.unit_amount,
        interval:      price.recurring.interval,
        intervalCount: price.recurring.interval_count,
        trialDays:     price.recurring.trial_period_days ?? null,
      });
    }
    return plans;
  }

  /** Get or create the Stripe customer for a user. */
  async function ensureCustomer(client: StripeClient, userId: string): Promise<string> {
    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const existing = await subscriptionsRepository.findByUserId(userId);
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const customer = await client.customers.create({ email: user.email, metadata: { userId } });
    await subscriptionsRepository.upsertStripeCustomer(userId, customer.id);
    return customer.id;
  }

  /** The tier a Stripe subscription grants, decided by its price — never by client-supplied data. */
  function tierOfSubscription(subscription: any): Tier {
    const priceIds: string[] = (subscription.items?.data ?? []).map((item: any) => item?.price?.id).filter(Boolean);
    for (const priceId of priceIds) {
      const tier = tierByPriceId.get(priceId);
      if (tier) return tier;
    }
    logger.error(
      { subscriptionId: subscription.id, priceIds },
      'Stripe subscription has no price configured as a tier (STRIPE_*_PRICE_ID) — granting no paid tier',
    );
    return 'free';
  }

  /** The live subscription from Stripe, or null when Stripe no longer has it. */
  async function retrieveSubscription(client: StripeClient, subscriptionId: string): Promise<any | null> {
    try {
      return await client.subscriptions.retrieve(subscriptionId);
    } catch (err: any) {
      if (err?.code === 'resource_missing' || err?.statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Brings our row in line with a Stripe subscription's current state.
   *
   * Webhooks can arrive late and out of order, so the state applied is the one
   * read from Stripe now, never the snapshot inside the event. `ended` forces
   * the terminal outcome for a deletion event.
   */
  async function syncSubscription(
    client: StripeClient,
    customerId: string,
    subscriptionId: string,
    tx: Transaction,
    ended = false,
  ): Promise<void> {
    const row = await subscriptionsRepository.findByStripeCustomerId(customerId, tx);
    if (!row) return; // not one of our customers (or the account was deleted)

    const live = ended ? null : await retrieveSubscription(client, subscriptionId);
    const stripeStatus: string = live?.status ?? 'canceled';
    const terminal = stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired';
    const inGoodStanding = stripeStatus === 'active' || stripeStatus === 'trialing' || stripeStatus === 'past_due';

    // News about a subscription other than the one on record only matters if
    // it is a live one taking over; an old subscription ending or lapsing must
    // not downgrade a user who has since bought a new one.
    const superseded = row.provider === 'credo'
      ? row.status === 'active' // a Credo pass is running; an old Stripe subscription ending changes nothing
      : !!row.stripeSubscriptionId && row.stripeSubscriptionId !== subscriptionId;
    if (superseded && !inGoodStanding) {
      logger.info({ userId: row.userId, subscriptionId }, 'Ignoring update for a superseded subscription');
      return;
    }

    if (terminal) {
      await subscriptionsRepository.updateByStripeCustomerId(
        customerId, { status: 'cancelled', stripeSubscriptionId: null, cancelAtPeriodEnd: false }, tx,
      );
      await usersRepository.update(row.userId, { tier: 'free' }, tx);
      logger.info({ userId: row.userId }, 'Subscription ended — user is on the free tier');
      return;
    }

    // Trials are paid plans in good standing; past_due keeps the tier during
    // Stripe's retry window; anything else (incomplete, unpaid, paused) grants nothing.
    const status: SubStatus = stripeStatus === 'active' || stripeStatus === 'trialing' ? 'active'
      : stripeStatus === 'past_due' ? 'past_due' : 'inactive';
    const tier: Tier = status === 'inactive' ? 'free' : tierOfSubscription(live);

    // Subscription state and the user's tier change together or not at all.
    await subscriptionsRepository.updateByStripeCustomerId(customerId, {
      stripeSubscriptionId: live.id,
      provider:             'stripe',
      status,
      currentPeriodEnd:     live.current_period_end ? new Date(live.current_period_end * 1000) : null,
      cancelAtPeriodEnd:    live.cancel_at_period_end ?? false,
    }, tx);
    await usersRepository.update(row.userId, { tier }, tx);
    logger.info({ userId: row.userId, tier, status }, 'Subscription synced from Stripe');
  }

  async function applyEvent(client: StripeClient, event: Stripe.Event, tx: Transaction): Promise<void> {
    const object = event.data.object as any;
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await syncSubscription(client, object.customer as string, object.id, tx);
        break;

      case 'customer.subscription.deleted':
        await syncSubscription(client, object.customer as string, object.id, tx, true);
        break;

      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded':
        if (object.subscription) {
          await syncSubscription(client, object.customer as string, String(object.subscription), tx);
        } else if (event.type === 'invoice.payment_failed') {
          await subscriptionsRepository.updateByStripeCustomerId(object.customer as string, { status: 'past_due' }, tx);
        }
        break;

      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe webhook event — ignored');
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
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    return { ...sub, tier };
  },

  /**
   * Plans that can be bought right now. An empty list means purchases are
   * switched off (Stripe or the price ids are not configured), which clients
   * show as "not available" rather than as an error.
   */
  async listPrices(): Promise<PlanPrice[]> {
    if (!stripe || tierByPriceId.size === 0) return [];
    if (priceCache && priceCache.expiresAt > Date.now()) return priceCache.prices;

    // One Stripe round trip no matter how many requests arrive together.
    priceFetch ??= fetchPrices(stripe)
      .then((prices) => {
        priceCache = { expiresAt: Date.now() + (settings.priceCacheMs ?? DEFAULT_PRICE_CACHE_MS), prices };
        return prices;
      })
      .finally(() => { priceFetch = null; });

    try {
      return await priceFetch;
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Could not load prices from Stripe');
      if (priceCache) return priceCache.prices; // stale beats unavailable
      throw new ServiceUnavailableError('Prices are temporarily unavailable', 'BILLING_UNAVAILABLE');
    }
  },

  /**
   * Start Stripe Checkout for a plan, chosen by `tier` or by its `priceId`.
   * Only prices configured on the server can be bought.
   */
  async createCheckoutSession(userId: string, plan: { priceId?: string; tier?: PaidTier }) {
    if (!stripe || tierByPriceId.size === 0) throw billingUnavailable();

    const priceId = plan.priceId ?? (plan.tier ? settings.prices[plan.tier] : undefined);
    const tier = priceId ? tierByPriceId.get(priceId) : undefined;
    if (!priceId || !tier || (plan.tier && plan.tier !== tier)) {
      throw new AppError(400, 'That plan is not available', 'INVALID_PRICE');
    }

    const current = await subscriptionsRepository.findByUserId(userId);
    if (current?.stripeSubscriptionId && (current.status === 'active' || current.status === 'past_due')) {
      // A second checkout would create a second subscription and double-bill.
      throw new ConflictError('You already have a subscription. Manage it from billing settings.');
    }

    if (current?.provider === 'credo' && current.status === 'active') {
      throw new ConflictError('You already have an active plan. You can switch when it ends.');
    }

    const customerId = await ensureCustomer(stripe, userId);
    const session = await stripe.checkout.sessions.create({
      customer:            customerId,
      mode:                'subscription',
      line_items:          [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      subscription_data:   { metadata: { userId, tier } },
      success_url:         settings.checkoutSuccessUrl,
      cancel_url:          settings.checkoutCancelUrl,
    });
    if (!session.url) throw new ServiceUnavailableError('Checkout could not be started', 'BILLING_UNAVAILABLE');

    return { url: session.url, id: session.id };
  },

  /** Stripe-hosted page where the user changes plan, card, or cancels. */
  async createPortalSession(userId: string) {
    if (!stripe) throw billingUnavailable();

    const sub = await subscriptionsRepository.findByUserId(userId);
    if (!sub?.stripeCustomerId) {
      throw new AppError(409, 'There is no billing account to manage yet', 'NO_BILLING_ACCOUNT');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: settings.portalReturnUrl,
    });
    return { url: session.url };
  },

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!stripe || !settings.webhookSecret) {
      // 503 so Stripe retries once the service is configured, instead of
      // treating the event as delivered and dropping it.
      logger.warn('Stripe webhook received but Stripe is not configured');
      throw billingUnavailable();
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, settings.webhookSecret);
    } catch (err: any) {
      logger.error({ err: err.message }, 'Stripe webhook signature verification failed');
      throw new BadRequestError('Invalid Stripe signature');
    }

    logger.info({ type: event.type, id: event.id }, 'Stripe webhook received');

    // Stripe delivers at least once. The event id is recorded in the same
    // transaction as its effects, so a redelivery is acknowledged and skipped,
    // while an event whose handling failed is not recorded and gets retried.
    return getDb().transaction(async (tx) => {
      if (!(await stripeEventsRepository.recordOnce(event.id, event.type, tx))) {
        logger.info({ id: event.id }, 'Stripe webhook already processed — skipped');
        return { received: true, duplicate: true };
      }
      await applyEvent(stripe, event, tx);
      return { received: true };
    });
  },

  /** Deletes the Stripe customer; Stripe cancels all of their subscriptions with it. */
  async deleteCustomer(customerId: string): Promise<void> {
    if (!stripe) throw billingUnavailable();
    try {
      await stripe.customers.del(customerId);
    } catch (err: any) {
      // Already gone is the outcome we wanted.
      if (err?.code === 'resource_missing' || err?.statusCode === 404) return;
      throw err;
    }
  },

  isConfigured(): boolean {
    return !!stripe;
  },
  };
}

const stripeClient = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' as any })
  : null;

if (stripeClient && !config.stripe.prices.premium && !config.stripe.prices.pro) {
  logger.warn('Stripe is configured but STRIPE_PREMIUM_PRICE_ID / STRIPE_PRO_PRICE_ID are not: nothing can be purchased');
}

export const subscriptionsService = createSubscriptionsService(stripeClient, {
  webhookSecret:      config.stripe.webhookSecret,
  prices:             config.stripe.prices,
  checkoutSuccessUrl: config.stripe.checkoutSuccessUrl,
  checkoutCancelUrl:  config.stripe.checkoutCancelUrl,
  portalReturnUrl:    config.stripe.portalReturnUrl,
});
