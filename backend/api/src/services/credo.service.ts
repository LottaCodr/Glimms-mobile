/**
 * Credo (eTranzact) payments: naira cards and bank transfers.
 *
 * Credo's public API has no subscriptions or saved cards, so a payment buys a
 * fixed period ("pass") of a paid tier, and the user pays again to extend it.
 *
 * What grants access is only ever Credo's own answer to "what is the state of
 * this transaction?", asked with our secret key (`GET /transaction/:ref/verify`)
 * and compared with the order we stored. The browser redirect and the webhook
 * are both treated as hints to go and ask: the redirect is user-controlled, and
 * the webhook signature is SHA-512(secretKey + businessCode), which does not
 * cover the body and never changes, so it cannot prove what a webhook says.
 */
import crypto from 'crypto';
import { getDb } from '../db';
import {
  credoPaymentsRepository, CredoPayment, subscriptionsRepository, usersRepository,
} from '../repositories';
import { config } from '../config';
import { logger } from '../lib/logger';
import {
  AppError, ConflictError, NotFoundError, ServiceUnavailableError,
} from '../middleware/errorHandler.middleware';

export type PaidTier = 'premium' | 'pro';
const PAID_TIERS: PaidTier[] = ['premium', 'pro'];

export interface CredoSettings {
  publicKey?:   string;
  secretKey?:   string;
  baseUrl:      string;
  currency:     string;
  amounts:      Partial<Record<PaidTier, number>>;
  periodDays:   number;
  feeBearer:    0 | 1;
  /** Where Credo sends the browser after payment (a page on this API). */
  callbackUrl:  string;
}

export interface CredoPlan {
  tier:       PaidTier;
  currency:   string;
  /** Minor unit (kobo). */
  amount:     number;
  periodDays: number;
  /** Whether Credo's processing fee is added on top at checkout. */
  feeOnTop:   boolean;
}

export type CredoOutcome = 'paid' | 'pending' | 'failed';

/** Minimal HTTP surface, so tests can stand in for Credo. */
export type CredoHttp = (
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; json(): Promise<unknown> }>;

const REQUEST_TIMEOUT_MS = 15_000;
// https://docs.credocentral.com/docs/concepts#transaction-statuses
const STATUS_SUCCESSFUL = new Set([0, 4, 5]);        // successful, queued for settlement, settled
const STATUS_FAILED = new Set([3, 7, 9, 10]);        // failed, declined, cancelled by customer/merchant
const CHECKOUT_HOSTS = /(^|\.)(credocentral\.com|credodemo\.com)$/;

function unavailable(code = 'BILLING_NOT_CONFIGURED'): AppError {
  return new ServiceUnavailableError('Naira payments are not available right now', code);
}

function sha512(value: string): string {
  return crypto.createHash('sha512').update(value).digest('hex');
}

export function createCredoService(http: CredoHttp, settings: CredoSettings) {
  const configured = !!settings.publicKey && !!settings.secretKey;

  async function call(path: string, method: 'GET' | 'POST', key: string, body?: unknown): Promise<any> {
    let response;
    try {
      response = await http(`${settings.baseUrl}${path}`, {
        method,
        // Credo takes the bare key: no "Bearer" prefix.
        headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err: any) {
      logger.error({ err: err?.message, path }, 'Credo request failed');
      throw unavailable('BILLING_UNAVAILABLE');
    }
    const payload: any = await response.json().catch(() => null);
    // Credo reports errors in the body's own `status` as well as over HTTP.
    if (response.status >= 400 || !payload || (typeof payload.status === 'number' && payload.status >= 400)) {
      logger.error({ path, httpStatus: response.status, message: payload?.message }, 'Credo returned an error');
      throw unavailable('BILLING_UNAVAILABLE');
    }
    return payload.data ?? {};
  }

  /**
   * True when what Credo reports is the order we created, paid in full.
   * The docs show amounts both in kobo and in naira, so either reading of the
   * expected amount is accepted; the amount itself was fixed by us at
   * initialisation and is bound to this reference.
   */
  function matchesOrder(payment: CredoPayment, data: any): boolean {
    const amount = Number(data.transAmount);
    const amountOk = amount === payment.amountMinor || Math.round(amount * 100) === payment.amountMinor;
    const refOk = data.businessRef === payment.reference;
    const currencyOk = String(data.currencyCode ?? '').toUpperCase() === payment.currency;
    if (!amountOk || !refOk || !currencyOk) {
      logger.error(
        { reference: payment.reference, amount, currency: data.currencyCode, businessRef: data.businessRef },
        'Credo transaction does not match the order — nothing granted',
      );
    }
    return amountOk && refOk && currencyOk;
  }

  /** Marks the payment paid and starts or extends the pass, exactly once. */
  async function grant(payment: CredoPayment): Promise<void> {
    await getDb().transaction(async (tx) => {
      if (!(await credoPaymentsRepository.markPaidOnce(payment.id, tx))) return;

      const current = await subscriptionsRepository.lockForUser(payment.userId, tx);
      const now = Date.now();
      // Paying again for the same tier before the pass ends adds to it.
      const runningSameTier = current.provider === 'credo' && current.status === 'active'
        && !!current.currentPeriodEnd && current.currentPeriodEnd.getTime() > now
        && (await usersRepository.findById(payment.userId, tx))?.tier === payment.tier;
      const from = runningSameTier ? current.currentPeriodEnd!.getTime() : now;

      await subscriptionsRepository.updateByUserId(payment.userId, {
        provider:             'credo',
        status:               'active',
        stripeSubscriptionId: null,
        currentPeriodEnd:     new Date(from + payment.periodDays * 86_400_000),
        cancelAtPeriodEnd:    true, // a pass never renews by itself
      }, tx);
      await usersRepository.update(payment.userId, { tier: payment.tier }, tx);
      logger.info({ userId: payment.userId, tier: payment.tier, reference: payment.reference }, 'Credo payment confirmed');
    });
  }

  /** Asks Credo for the truth about a payment and applies it. */
  async function settle(payment: CredoPayment): Promise<CredoOutcome> {
    if (payment.status === 'paid') return 'paid';
    if (!payment.credoReference || !settings.secretKey) return payment.status;

    const data = await call(
      `/transaction/${encodeURIComponent(payment.credoReference)}/verify`, 'GET', settings.secretKey,
    );
    const status = Number(data.status);

    if (STATUS_SUCCESSFUL.has(status)) {
      if (!matchesOrder(payment, data)) return 'failed';
      await grant(payment);
      return 'paid';
    }
    if (STATUS_FAILED.has(status)) {
      await credoPaymentsRepository.markFailed(payment.id);
      return 'failed';
    }
    return 'pending';
  }

  return {
    isConfigured: () => configured,

    /** Passes that can be bought. Empty when Credo is not set up. */
    listPlans(): CredoPlan[] {
      if (!configured) return [];
      return PAID_TIERS.flatMap((tier) => {
        const amount = settings.amounts[tier];
        return amount
          ? [{ tier, currency: settings.currency, amount, periodDays: settings.periodDays, feeOnTop: settings.feeBearer === 0 }]
          : [];
      });
    },

    /** Starts a hosted checkout and returns the page to open. */
    async createCheckout(userId: string, tier: PaidTier): Promise<{ url: string; reference: string }> {
      const amount = settings.amounts[tier];
      if (!configured || !settings.publicKey) throw unavailable();
      if (!amount) throw new AppError(400, 'That plan is not available', 'INVALID_PRICE');

      const user = await usersRepository.findById(userId);
      if (!user) throw new NotFoundError('User');

      const current = await subscriptionsRepository.findByUserId(userId);
      if (current?.provider !== 'credo' && current?.stripeSubscriptionId
        && (current.status === 'active' || current.status === 'past_due')) {
        // Otherwise the card subscription would keep billing alongside the pass.
        throw new ConflictError('You already have a subscription. Manage it from billing settings.');
      }

      const payment = await credoPaymentsRepository.create({
        userId, tier, amountMinor: amount, currency: settings.currency, periodDays: settings.periodDays,
        reference: `glm${crypto.randomBytes(12).toString('hex')}`,
      });

      const [firstName, ...rest] = (user.name ?? '').trim().split(/\s+/).filter(Boolean);
      const data = await call('/transaction/initialize', 'POST', settings.publicKey, {
        amount,
        email:             user.email,
        currency:          settings.currency,
        bearer:            settings.feeBearer,
        channels:          ['CARD', 'BANK'],
        initializeAccount: 0,
        reference:         payment.reference,
        callbackUrl:       settings.callbackUrl,
        narration:         `Glimms ${tier === 'pro' ? 'Pro' : 'Premium'} — ${settings.periodDays} days`,
        ...(firstName ? { customerFirstName: firstName } : {}),
        ...(rest.length ? { customerLastName: rest.join(' ') } : {}),
        metadata:          { userId, tier },
      });

      // The app opens this URL: only ever hand back a Credo https page.
      let url: URL | null = null;
      try { url = new URL(String(data.authorizationUrl)); } catch { /* handled below */ }
      if (!url || url.protocol !== 'https:' || !CHECKOUT_HOSTS.test(url.hostname) || !data.credoReference) {
        logger.error({ reference: payment.reference }, 'Credo initialise response was not usable');
        await credoPaymentsRepository.markFailed(payment.id);
        throw unavailable('BILLING_UNAVAILABLE');
      }

      await credoPaymentsRepository.setCredoReference(payment.id, String(data.credoReference));
      return { url: url.toString(), reference: payment.reference };
    },

    /** The app asking "did my payment go through?". Only for the payer's own payments. */
    async confirmForUser(userId: string, reference: string): Promise<{ status: CredoOutcome; tier: PaidTier }> {
      const payment = await credoPaymentsRepository.findByAnyReference(reference);
      if (!payment || payment.userId !== userId) throw new NotFoundError('Payment');
      return { status: await settle(payment), tier: payment.tier };
    },

    /** The browser coming back from Credo's checkout. The reference is untrusted input. */
    async confirmFromRedirect(reference: string): Promise<CredoOutcome | 'unknown'> {
      const payment = reference ? await credoPaymentsRepository.findByAnyReference(reference) : null;
      if (!payment) return 'unknown';
      return settle(payment);
    },

    /**
     * Credo's webhook. The signature only shows the sender knows our secret
     * key; the payload is used solely to find which payment to re-check.
     */
    async handleWebhook(signature: string | undefined, body: any): Promise<{ received: true }> {
      if (!configured || !settings.secretKey) throw unavailable();

      const businessCode = typeof body?.data?.businessCode === 'string' ? body.data.businessCode : '';
      const expected = Buffer.from(sha512(settings.secretKey + businessCode));
      const given = Buffer.from(String(signature ?? '').toLowerCase());
      if (!businessCode || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        throw new AppError(401, 'Invalid Credo signature', 'INVALID_SIGNATURE');
      }

      const reference = [body.data.businessRef, body.data.transRef].find((value) => typeof value === 'string' && value);
      const payment = reference ? await credoPaymentsRepository.findByAnyReference(reference) : null;
      if (!payment) {
        logger.info({ event: body.event, reference }, 'Credo webhook for an unknown payment — ignored');
        return { received: true };
      }
      // A failure here answers 5xx, so Credo retries the webhook.
      await settle(payment);
      return { received: true };
    },

    /** Re-checks payments whose redirect and webhook were both missed. */
    async reconcilePending(): Promise<number> {
      if (!configured) return 0;
      let settled = 0;
      for (const payment of await credoPaymentsRepository.listPendingOlderThan(2)) {
        try {
          if ((await settle(payment)) !== 'pending') settled += 1;
        } catch (err: any) {
          logger.warn({ reference: payment.reference, err: err?.message }, 'Credo reconcile failed for a payment');
        }
      }
      return settled;
    },

    /** Puts users whose pass has ended back on the free tier. */
    async expirePasses(): Promise<number> {
      return getDb().transaction(async (tx) => {
        const userIds = await subscriptionsRepository.expireCredoPasses(tx);
        for (const userId of userIds) await usersRepository.update(userId, { tier: 'free' }, tx);
        return userIds.length;
      });
    },
  };
}

export const credoService = createCredoService(
  (url, init) => fetch(url, init),
  {
    publicKey:   config.credo.publicKey,
    secretKey:   config.credo.secretKey,
    baseUrl:     config.credo.baseUrl,
    currency:    config.credo.currency,
    amounts:     config.credo.amounts,
    periodDays:  config.credo.periodDays,
    feeBearer:   config.credo.feeBearer,
    callbackUrl: `${config.publicApiUrl}/account/credo/return`,
  },
);
