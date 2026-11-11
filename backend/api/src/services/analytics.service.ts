import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { catalogRepository, savedDesignsRepository } from '../repositories';

// Events are buffered in a Redis list and drained by a background consumer
// into ClickHouse (or Segment/Mixpanel). For MVP the list itself is the store.
const EVENT_KEY    = 'glimms:analytics:events';
const EVENT_BUFFER = 10_000;  // keep last 10k events in memory

export const analyticsService = {

  async track(
    userId:     string,
    event:      string,
    properties: Record<string, unknown> = {},
  ) {
    const payload = JSON.stringify({
      userId,
      event,
      properties,
      ts: Date.now(),
    });

    try {
      await redis
        .pipeline()
        .lpush(EVENT_KEY, payload)
        .ltrim(EVENT_KEY, 0, EVENT_BUFFER - 1)
        .exec();
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Analytics track failed — Redis unavailable');
      // Fallback: log locally; don't fail the request
    }

    logger.debug({ userId, event }, 'Analytics event tracked');
    return { tracked: true };
  },

  async getBasicStats(userId: string) {
    const today      = new Date().toISOString().slice(0, 10);
    const scanKey    = `scan_limit:${userId}:${today}`;
    try {
      const scansToday = parseInt((await redis.get(scanKey)) ?? '0');
      // Totals are a nice-to-have on the dashboard — never fail the request for them.
      const [catalogCount, savedCount] = await Promise.all([
        catalogRepository.countActive(userId).catch(() => 0),
        savedDesignsRepository.countByUser(userId).catch(() => 0),
      ]);
      return { scansToday, catalogCount, savedCount };
    } catch {
      return { scansToday: 0, catalogCount: 0, savedCount: 0 };
    }
  },
};
