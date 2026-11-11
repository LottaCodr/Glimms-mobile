import { getDb, Queryable } from '../db';

export const refreshTokensRepository = {
  async create(
    data: { userId: string; tokenHash: string; expiresAt: Date },
    db: Queryable = getDb(),
  ): Promise<void> {
    await db.query(
      'insert into refresh_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)',
      [data.userId, data.tokenHash, data.expiresAt],
    );
  },

  /**
   * Redeems a refresh token: deletes it and returns its owner, in one
   * statement. Because the delete and the check are atomic, two concurrent
   * requests can never both redeem the same single-use token.
   * Returns null when the token is unknown or expired.
   */
  async consume(tokenHash: string, db: Queryable = getDb()): Promise<{ userId: string } | null> {
    const { rows } = await db.query<{ user_id: string }>(
      'delete from refresh_tokens where token_hash = $1 and expires_at > now() returning user_id',
      [tokenHash],
    );
    return rows[0] ? { userId: rows[0].user_id } : null;
  },

  async deleteByHash(tokenHash: string, db: Queryable = getDb()): Promise<void> {
    await db.query('delete from refresh_tokens where token_hash = $1', [tokenHash]);
  },

  /**
   * Replaces Mongo's TTL index. Returns the number of rows removed.
   * Scoped to one user when `userId` is given (cheap, done on every login);
   * unscoped for the periodic sweep.
   */
  async deleteExpired(userId?: string, db: Queryable = getDb()): Promise<number> {
    const result = userId
      ? await db.query('delete from refresh_tokens where user_id = $1 and expires_at <= now()', [userId])
      : await db.query('delete from refresh_tokens where expires_at <= now()');
    return result.rowCount;
  },
};
