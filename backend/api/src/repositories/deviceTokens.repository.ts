import { getDb, Queryable } from '../db';
import { TableMapper } from '../db/tableMapper';
import type { DeviceToken } from '../models';

const deviceTokens = new TableMapper<DeviceToken>('device_tokens', {
  id:        { column: 'id', readOnly: true },
  userId:    'user_id',
  token:     'token',
  platform:  'platform',
  createdAt: { column: 'created_at', readOnly: true },
});

export const deviceTokensRepository = {
  /**
   * A push token identifies a device, not a user: when someone else signs in
   * on the same phone the token is re-pointed at them rather than duplicated.
   */
  async upsert(
    data: { userId: string; token: string; platform: 'ios' | 'android' },
    db: Queryable = getDb(),
  ): Promise<DeviceToken> {
    const { rows } = await db.query(
      `insert into device_tokens (user_id, token, platform) values ($1, $2, $3)
       on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform
       returning ${deviceTokens.columns}`,
      [data.userId, data.token, data.platform],
    );
    return deviceTokens.toEntity(rows[0]);
  },

  async listByUserId(userId: string, db: Queryable = getDb()): Promise<DeviceToken[]> {
    const { rows } = await db.query(
      `select ${deviceTokens.columns} from device_tokens where user_id = $1`,
      [userId],
    );
    return deviceTokens.toEntities(rows);
  },

  async delete(userId: string, token: string, db: Queryable = getDb()): Promise<void> {
    await db.query('delete from device_tokens where user_id = $1 and token = $2', [userId, token]);
  },

  /** Removes tokens the push service reports as no longer registered. */
  async deleteTokens(tokens: string[], db: Queryable = getDb()): Promise<number> {
    if (!tokens.length) return 0;
    const result = await db.query('delete from device_tokens where token = any($1::text[])', [tokens]);
    return result.rowCount;
  },
};
