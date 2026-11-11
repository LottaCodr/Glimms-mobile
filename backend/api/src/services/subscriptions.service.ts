import Stripe from 'stripe';
import { getDb } from '../db';
import { subscriptionsRepository, usersRepository } from '../repositories';
import type { SubStatus, Tier } from '../models';
import { config } from '../config';
import { logger } from '../lib/logger';
import { NotFoundError } from '../middleware/errorHandler.middleware';

const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' as any })
  : null;

export const subscriptionsService = {

  async getByUserId(userId: string) {
    const sub = await subscriptionsRepository.findByUserId(userId);
    // Return a default free subscription object if none exists — avoids 404 for new users
    if (!sub) {
      return {
        userId,
        status: 'inactive',
        tier: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    return sub;
  },

  async createCheckoutSession(userId: string, priceId: string) {
    if (!stripe) throw new Error('Stripe is not configured');

    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    // Get or create Stripe customer
    const sub = await subscriptionsRepository.findByUserId(userId);
    let customerId = sub?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        metadata: { userId },
      });
      customerId = customer.id;

      await subscriptionsRepository.upsertStripeCustomer(userId, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: priceId, quantity: 1 }],
      success_url: 'https://app.glimms.ai/dashboard?upgrade=success',
      cancel_url:  'https://app.glimms.ai/upgrade?cancelled=true',
    } as any);

    return { url: session.url, id: session.id };
  },

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!stripe || !config.stripe.webhookSecret) {
      logger.warn('Stripe webhook received but Stripe not configured');
      return { received: false };
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
    } catch (err: any) {
      logger.error({ err: err.message }, 'Stripe webhook signature verification failed');
      return { received: false, error: 'Invalid signature' };
    }

    logger.info({ type: event.type }, 'Stripe webhook received');

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const s     = event.data.object as any;
        const tier  = (s.metadata?.tier ?? s.items?.data?.[0]?.price?.lookup_key ?? 'premium').toLowerCase();
        const allowedTiers = ['free', 'premium', 'pro'];
        const resolvedTier: Tier = allowedTiers.includes(tier) ? tier : 'premium';
        const status: SubStatus = s.status === 'active' ? 'active' : s.status === 'past_due' ? 'past_due' : 'inactive';

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
            { status: s.status === 'active' ? 'active' : 'inactive' },
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
