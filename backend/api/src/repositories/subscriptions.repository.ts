import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { Subscription } from '../models';

const subscriptions = new TableMapper<Subscription>('subscriptions', {
  id:                   { column: 'id', readOnly: true },
  userId:               'user_id',
  stripeCustomerId:     'stripe_customer_id',
  stripeSubscriptionId: 'stripe_subscription_id',
  status:               'status',
  currentPeriodEnd:     'current_period_end',
  cancelAtPeriodEnd:    'cancel_at_period_end',
  createdAt:            { column: 'created_at', readOnly: true },
  updatedAt:            { column: 'updated_at', readOnly: true },
});

export type SubscriptionPatch = Partial<
  Pick<Subscription, 'stripeSubscriptionId' | 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>
>;

export const subscriptionsRepository = {
  async findByUserId(userId: string, db: Queryable = getDb()): Promise<Subscription | null> {
    const { rows } = await db.query(
      `select ${subscriptions.columns} from subscriptions where user_id = $1`,
      [userId],
    );
    return rows[0] ? subscriptions.toEntity(rows[0]) : null;
  },

  /** Records the user's Stripe customer id, creating the subscription row if needed. */
  async upsertStripeCustomer(userId: string, stripeCustomerId: string, db: Queryable = getDb()): Promise<Subscription> {
    const { rows } = await db.query(
      `insert into subscriptions (user_id, stripe_customer_id) values ($1, $2)
       on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id
       returning ${subscriptions.columns}`,
      [userId, stripeCustomerId],
    );
    return subscriptions.toEntity(rows[0]);
  },

  /** Applies a Stripe webhook update. Returns null when no subscription has that customer. */
  async updateByStripeCustomerId(
    stripeCustomerId: string,
    patch: SubscriptionPatch,
    db: Queryable = getDb(),
  ): Promise<Subscription | null> {
    const set = subscriptions.toAssignments(patch, 2);
    if (!set) return null;
    const { rows } = await db.query(
      `update subscriptions set ${set.sql} where stripe_customer_id = $1 returning ${subscriptions.columns}`,
      [stripeCustomerId, ...set.values],
    );
    return rows[0] ? subscriptions.toEntity(rows[0]) : null;
  },
};
