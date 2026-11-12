import { getDb, Queryable } from '../db';

export type CredoPaymentStatus = 'pending' | 'paid' | 'failed';

export interface CredoPayment {
  id:             string;
  userId:         string;
  reference:      string;
  credoReference: string | null;
  tier:           'premium' | 'pro';
  amountMinor:    number;
  currency:       string;
  periodDays:     number;
  status:         CredoPaymentStatus;
  paidAt:         Date | null;
  createdAt:      Date;
}

const COLUMNS = `id, user_id, reference, credo_reference, tier, amount_minor, currency,
  period_days, status, paid_at, created_at`;

function toEntity(row: any): CredoPayment {
  return {
    id: row.id, userId: row.user_id, reference: row.reference, credoReference: row.credo_reference,
    tier: row.tier, amountMinor: row.amount_minor, currency: row.currency, periodDays: row.period_days,
    status: row.status, paidAt: row.paid_at, createdAt: row.created_at,
  };
}

export const credoPaymentsRepository = {
  async create(
    input: Pick<CredoPayment, 'userId' | 'reference' | 'tier' | 'amountMinor' | 'currency' | 'periodDays'>,
    db: Queryable = getDb(),
  ): Promise<CredoPayment> {
    const { rows } = await db.query(
      `insert into credo_payments (user_id, reference, tier, amount_minor, currency, period_days)
       values ($1, $2, $3, $4, $5, $6) returning ${COLUMNS}`,
      [input.userId, input.reference, input.tier, input.amountMinor, input.currency, input.periodDays],
    );
    return toEntity(rows[0]);
  },

  async setCredoReference(id: string, credoReference: string, db: Queryable = getDb()): Promise<void> {
    await db.query('update credo_payments set credo_reference = $2 where id = $1', [id, credoReference]);
  },

  /** Looks a payment up by our reference or by Credo's. */
  async findByAnyReference(reference: string, db: Queryable = getDb()): Promise<CredoPayment | null> {
    const { rows } = await db.query(
      `select ${COLUMNS} from credo_payments where reference = $1 or credo_reference = $1`,
      [reference],
    );
    return rows[0] ? toEntity(rows[0]) : null;
  },

  /**
   * Marks the payment paid. False when it already was, which is what makes
   * granting the paid period happen exactly once per payment.
   */
  async markPaidOnce(id: string, db: Queryable = getDb()): Promise<boolean> {
    const result = await db.query(
      `update credo_payments set status = 'paid', paid_at = now() where id = $1 and status <> 'paid'`,
      [id],
    );
    return result.rowCount > 0;
  },

  async markFailed(id: string, db: Queryable = getDb()): Promise<void> {
    await db.query(`update credo_payments set status = 'failed' where id = $1 and status = 'pending'`, [id]);
  },

  /** Unfinished payments old enough that the customer has left the checkout. */
  async listPendingOlderThan(minutes: number, limit = 50, db: Queryable = getDb()): Promise<CredoPayment[]> {
    const { rows } = await db.query(
      `select ${COLUMNS} from credo_payments
       where status = 'pending' and credo_reference is not null
         and created_at < now() - make_interval(mins => $1::int)
         and created_at > now() - interval '3 days'
       order by created_at limit $2`,
      [minutes, limit],
    );
    return rows.map(toEntity);
  },
};
