import { getDb, Queryable } from '../db';
import type { AccountTokenPurpose } from '../models';

export const accountTokensRepository = {
  /** Issues a token, replacing any earlier one for the same purpose. */
  async replace(
    data: { userId: string; purpose: AccountTokenPurpose; tokenHash: string; expiresAt: Date },
    db: Queryable = getDb(),
  ): Promise<void> {
    await db.query('delete from account_tokens where user_id = $1 and purpose = $2', [data.userId, data.purpose]);
    await db.query(
      'insert into account_tokens (user_id, purpose, token_hash, expires_at) values ($1, $2, $3, $4)',
      [data.userId, data.purpose, data.tokenHash, data.expiresAt],
    );
  },

  /** True while the token could still be redeemed. Does not redeem it. */
  async isValid(tokenHash: string, purpose: AccountTokenPurpose, db: Queryable = getDb()): Promise<boolean> {
    const { rows } = await db.query(
      'select 1 from account_tokens where token_hash = $1 and purpose = $2 and expires_at > now()',
      [tokenHash, purpose],
    );
    return rows.length > 0;
  },

  /**
   * Redeems a token: deletes it and returns its owner in one statement, so a
   * token can never be used twice, even by concurrent requests.
   */
  async consume(
    tokenHash: string,
    purpose: AccountTokenPurpose,
    db: Queryable = getDb(),
  ): Promise<{ userId: string } | null> {
    const { rows } = await db.query<{ user_id: string }>(
      `delete from account_tokens where token_hash = $1 and purpose = $2 and expires_at > now()
       returning user_id`,
      [tokenHash, purpose],
    );
    return rows[0] ? { userId: rows[0].user_id } : null;
  },

  async deleteExpired(db: Queryable = getDb()): Promise<number> {
    const result = await db.query('delete from account_tokens where expires_at <= now()');
    return result.rowCount;
  },
};
