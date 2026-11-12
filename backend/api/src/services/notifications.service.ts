import { deviceTokensRepository } from '../repositories';
import { logger } from '../lib/logger';
import { createExpoPush, ExpoPush, isExpoPushToken } from '../lib/expoPush';
import { mailer } from '../lib/mailer';
import { BadRequestError } from '../middleware/errorHandler.middleware';

export function createNotificationsService(push: ExpoPush = createExpoPush()) {
  return {
    async registerDevice(userId: string, token: string, platform: 'ios' | 'android') {
      // Only Expo push tokens can be delivered to; storing anything else would
      // look registered and silently never arrive.
      if (!isExpoPushToken(token)) throw new BadRequestError('token must be an Expo push token');
      return deviceTokensRepository.upsert({ userId, token, platform });
    },

    async unregisterDevice(userId: string, token: string) {
      await deviceTokensRepository.delete(userId, token);
    },

    /** Never throws: a push is a courtesy, not part of the work that triggered it. */
    async sendPush(userId: string, title: string, body: string, data?: Record<string, string>) {
      try {
        const devices = await deviceTokensRepository.listByUserId(userId);
        const tokens = devices.map((device) => device.token).filter(isExpoPushToken);
        if (!tokens.length) return { sent: 0 };

        const result = await push.send(tokens.map((to) => ({ to, title, body, data })));
        if (result.unregistered.length) {
          // The app was uninstalled or notifications were revoked.
          await deviceTokensRepository.deleteTokens(result.unregistered);
        }
        logger.info(
          { userId, sent: result.sent, failed: result.failed, removed: result.unregistered.length },
          'Push notifications dispatched',
        );
        return { sent: result.sent };
      } catch (err: any) {
        logger.warn({ userId, err: err?.message }, 'Push notification failed');
        return { sent: 0 };
      }
    },

    async sendEmail(to: string, subject: string, html: string) {
      await mailer.send({ to, subject, html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
    },
  };
}

export const notificationsService = createNotificationsService();
