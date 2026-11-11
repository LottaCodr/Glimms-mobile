import Stripe from 'stripe';
import { getDb } from '../db';
import { subscriptionsRepository, usersRepository } from '../repositories';
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

    logger.info({ type: event.type }, 'Stripe webhook received');

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const s     = event.data.object as any;
        // Trials are paid plans in good standing; everything else that is not
        // past_due (incomplete, unpaid, paused…) grants nothing.
        const status: SubStatus = s.status === 'active' || s.status === 'trialing' ? 'active'
          : s.status === 'past_due' ? 'past_due' : 'inactive';
        // Access follows payment state: past_due keeps the tier during
        // Stripe's retry window, inactive loses it.
        const resolvedTier: Tier = status === 'inactive' ? 'free' : tierOfSubscription(s);

        // Subscription state and the user's tier must never disagree, so they
        // change together or not at all.
        const subscription = await getDb().transaction(async (tx) => {
          const updated = await subscriptionsRepository.updateByStripeCustomerId(s.customer as string, {
            stripeSubscriptionId: s.id,
            status,
            currentPeriodEnd:     s.current_period_end ? new Date(s.current_period_end * 1000) : null,
            cancelAtPeriodEnd:    s.cancel_at_period_end ?? false,
          }, tx);
          if (updated) await usersRepository.update(updated.userId, { tier: resolvedTier }, tx);
          return updated;
        });
        if (subscription) {
          logger.info({ userId: subscription.userId, tier: resolvedTier }, 'User tier updated via webhook');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const s = event.data.object as any;
        const subscription = await getDb().transaction(async (tx) => {
          const updated = await subscriptionsRepository.updateByStripeCustomerId(
            s.customer as string,
            { status: 'cancelled', stripeSubscriptionId: null },
            tx,
          );
          if (updated) await usersRepository.update(updated.userId, { tier: 'free' }, tx);
          return updated;
        });
        if (subscription) {
          logger.info({ userId: subscription.userId }, 'User downgraded to free after subscription deleted');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as any;
        const customerId = inv.customer as string;
        await subscriptionsRepository.updateByStripeCustomerId(customerId, { status: 'past_due' });
        logger.warn({ customerId }, 'Invoice payment failed — subscription marked past_due');
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object as any;
        if (inv.subscription) {
          // Payment succeeded — ensure active
          const s = await stripe.subscriptions.retrieve(inv.subscription);
          await subscriptionsRepository.updateByStripeCustomerId(
            inv.customer as string,
            { status: s.status === 'active' || s.status === 'trialing' ? 'active' : 'inactive' },
          );
        }
        break;
      }

      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe webhook event — ignored');
    }

    return { received: true };
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
