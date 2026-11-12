import { getDb, Queryable } from '../db';

export interface AccountErasure {
  userId:   string;
  attempts: number;
}

export const accountErasuresRepository = {
  async add(userId: string, db: Queryable = getDb()): Promise<void> {
    await db.query(
      'insert into account_erasures (user_id) values ($1) on conflict (user_id) do nothing',
      [userId],
    );
  },

  async list(limit = 50, db: Queryable = getDb()): Promise<AccountErasure[]> {
    const { rows } = await db.query<{ user_id: string; attempts: number }>(
      'select user_id, attempts from account_erasures order by requested_at limit $1',
      [limit],
    );
    return rows.map((row) => ({ userId: row.user_id, attempts: row.attempts }));
  },

  async complete(userId: string, db: Queryable = getDb()): Promise<void> {
    await db.query('delete from account_erasures where user_id = $1', [userId]);
  },

  async recordFailure(userId: string, error: string, db: Queryable = getDb()): Promise<void> {
    await db.query(
      'update account_erasures set attempts = attempts + 1, last_error = $2 where user_id = $1',
      [userId, error.slice(0, 500)],
    );
  },
};
