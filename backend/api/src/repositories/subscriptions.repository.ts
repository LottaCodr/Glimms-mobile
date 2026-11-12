import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { Subscription } from '../models';

const subscriptions = new TableMapper<Subscription>('subscriptions', {
  id:                   { column: 'id', readOnly: true },
  userId:               'user_id',
  paystackCustomerCode:     'paystack_customer_code',
  paystackSubscriptionCode: 'paystack_subscription_code',
  status:               'status',
  provider:             'provider',
  currentPeriodEnd:     'current_period_end',
  cancelAtPeriodEnd:    'cancel_at_period_end',
  createdAt:            { column: 'created_at', readOnly: true },
  updatedAt:            { column: 'updated_at', readOnly: true },
});

export type SubscriptionPatch = Partial<
  Pick<Subscription, 'paystackCustomerCode' | 'paystackSubscriptionCode' | 'status' | 'provider' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>
>;

export const subscriptionsRepository = {
  async findByUserId(userId: string, db: Queryable = getDb()): Promise<Subscription | null> {
    const { rows } = await db.query(
      `select ${subscriptions.columns} from subscriptions where user_id = $1`,
      [userId],
    );
    return rows[0] ? subscriptions.toEntity(rows[0]) : null;
  },

  async findByPaystackSubscriptionCode(code: string, db: Queryable = getDb()): Promise<Subscription | null> {
    const { rows } = await db.query(
      `select ${subscriptions.columns} from subscriptions where paystack_subscription_code = $1`,
      [code],
    );
    return rows[0] ? subscriptions.toEntity(rows[0]) : null;
  },

  async findByPaystackCustomerCode(code: string, db: Queryable = getDb()): Promise<Subscription | null> {
    const { rows } = await db.query(
      `select ${subscriptions.columns} from subscriptions where paystack_customer_code = $1
       order by updated_at desc limit 1`,
      [code],
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
   * Ends plans whose paid period is over and returns the affected user ids:
   * Credo passes (they never renew) and Paystack subscriptions the customer
   * cancelled. A Paystack subscription that is still renewing is left alone;
   * Paystack reports its renewals and failures.
   */
  async expireEndedPlans(db: Queryable = getDb()): Promise<string[]> {
    const { rows } = await db.query<{ user_id: string }>(
      `update subscriptions set status = 'inactive', paystack_subscription_code = null
       where status = 'active' and current_period_end < now()
         and (provider = 'credo' or (provider = 'paystack' and cancel_at_period_end))
       returning user_id`,
    );
    return rows.map((row) => row.user_id);
  },

  /**
   * Paystack subscriptions that should have renewed a while ago but still look
   * paid: a renewal or failure notification was probably missed.
   */
  async findOverduePaystack(graceHours: number, limit: number, db: Queryable = getDb()): Promise<Subscription[]> {
    const { rows } = await db.query(
      `select ${subscriptions.columns} from subscriptions
       where provider = 'paystack' and status in ('active', 'past_due') and not cancel_at_period_end
         and current_period_end < now() - make_interval(hours => $1::int)
       order by current_period_end limit $2`,
      [graceHours, limit],
    );
    return rows.map((row) => subscriptions.toEntity(row));
  },
};
