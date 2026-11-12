import { getDb, Queryable } from '../db';

export const paystackEventsRepository = {
  /** Records the event (keyed by a hash of its body). False when it was already recorded (a redelivery). */
  async recordOnce(eventId: string, type: string, db: Queryable = getDb()): Promise<boolean> {
    const result = await db.query(
      'insert into paystack_events (event_id, type) values ($1, $2) on conflict (event_id) do nothing',
      [eventId, type],
    );
    return result.rowCount > 0;
  },

  /** Paystack stops retrying after 72 hours; older ids are no longer needed. */
  async deleteOlderThan(days: number, db: Queryable = getDb()): Promise<number> {
    const result = await db.query(
      `delete from paystack_events where received_at < now() - make_interval(days => $1::int)`,
      [days],
    );
    return result.rowCount;
  },
};
