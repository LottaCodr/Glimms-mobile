/**
 * Expo push service client (https://docs.expo.dev/push-notifications/sending-notifications/).
 * One service for iOS and Android: the app registers an Expo push token and
 * Expo relays to APNs / FCM.
 */
import { config } from '../config';

export interface PushMessage {
  to:     string;
  title:  string;
  body:   string;
  data?:  Record<string, string>;
}

export interface PushResult {
  sent:         number;
  failed:       number;
  /** Tokens Expo says will never work again; the caller should forget them. */
  unregistered: string[];
}

type PushFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo's limit per request

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

export function createExpoPush(fetchImpl: PushFetch = fetch as unknown as PushFetch, accessToken = config.expo.accessToken) {
  return {
    async send(messages: PushMessage[]): Promise<PushResult> {
      const result: PushResult = { sent: 0, failed: 0, unregistered: [] };
      for (let start = 0; start < messages.length; start += BATCH) {
        const batch = messages.slice(start, start + BATCH);
        const response = await fetchImpl(SEND_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(batch.map((message) => ({
            to:       message.to,
            title:    message.title,
            body:     message.body,
            data:     message.data ?? {},
            sound:    'default',
            priority: 'high',
          }))),
        });
        if (!response.ok) throw new Error(`Expo push service responded ${response.status}`);

        const tickets: any[] = (await response.json())?.data ?? [];
        batch.forEach((message, index) => {
          const ticket = tickets[index];
          if (ticket?.status === 'ok') {
            result.sent += 1;
            return;
          }
          result.failed += 1;
          if (ticket?.details?.error === 'DeviceNotRegistered') result.unregistered.push(message.to);
        });
      }
      return result;
    },
  };
}

export type ExpoPush = ReturnType<typeof createExpoPush>;
