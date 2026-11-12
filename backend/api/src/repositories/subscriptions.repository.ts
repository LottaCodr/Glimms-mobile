import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { Subscription } from '../models';

const subscriptions = new TableMapper<Subscription>('subscriptions', {
  id:                   { column: 'id', readOnly: true },
  userId:               'user_id',
  stripeCustomerId:     'stripe_customer_id',
  stripeSubscriptionId: 'stripe_subscription_id',
  status:               'status',
  provider:             'provider',
  currentPeriodEnd:     'current_period_end',
  cancelAtPeriodEnd:    'cancel_at_period_end',
  createdAt:            { column: 'created_at', readOnly: true },
  updatedAt:            { column: 'updated_at', readOnly: true },
});

export type SubscriptionPatch = Partial<
  Pick<Subscription, 'stripeSubscriptionId' | 'status' | 'provider' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>
>;

export const subscriptionsRepository = {
  async findByUserId(userId: string, db: Queryable = getDb()): Promise<Subscription | null> {
    const { rows } = await db.query(
      `select ${subscriptions.columns} from subscriptions where user_id = $1`,
      [userId],
    );
    return rows[0] ? subscriptions.toEntity(rows[0]) : null;
  },

  async findByStripeCustomerId(stripeCustomerId: string, db: Queryable = getDb()): Promise<Subscription | null> {
    const { rows } = await db.query(
      `select ${subscriptions.columns} from subscriptions where stripe_customer_id = $1`,
      [stripeCustomerId],
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

  /** Locks the user's subscription row (creating it if needed) for an update in `tx`. */
  async lockForUser(userId: string, tx: Queryable): Promise<Subscription> {
    await tx.query('insert into subscriptions (user_id) values ($1) on conflict (user_id) do nothing', [userId]);
    const { rows } = await tx.query(
      `select ${subscriptions.columns} from subscriptions where user_id = $1 for update`,
      [userId],
    );
    return subscriptions.toEntity(rows[0]);
  },

  async updateByUserId(userId: string, patch: SubscriptionPatch, db: Queryable = getDb()): Promise<void> {
    const set = subscriptions.toAssignments(patch, 2);
    if (!set) return;
    await db.query(`update subscriptions set ${set.sql} where user_id = $1`, [userId, ...set.values]);
  },

  /**
   * Ends Credo passes whose paid period is over and returns the affected user
   * ids. Stripe subscriptions are never touched: Stripe tells us when they end.
   */
  async expireCredoPasses(db: Queryable = getDb()): Promise<string[]> {
    const { rows } = await db.query<{ user_id: string }>(
      `update subscriptions set status = 'inactive'
       where provider = 'credo' and status = 'active' and current_period_end < now()
       returning user_id`,
    );
    return rows.map((row) => row.user_id);
  },
};
