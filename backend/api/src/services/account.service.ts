/**
 * Account deletion.
 *
 * Order matters:
 *  1. Stop billing. If Paystack cannot be reached the deletion is refused, so a
 *     user is never left paying for an account that no longer exists.
 *  2. Delete the user row. Foreign keys cascade to every table that holds
 *     their data, and the same transaction records an "erasure" still owed.
 *  3. Erase what lives outside the database (S3 objects, vectors). This is
 *     attempted immediately and retried by `sweepErasures` until it succeeds.
 */
import { getDb } from '../db';
import { accountErasuresRepository, subscriptionsRepository, usersRepository } from '../repositories';
import { logger } from '../lib/logger';
import { NotFoundError, ServiceUnavailableError } from '../middleware/errorHandler.middleware';

export interface AccountDeletionDeps {
  /** Stops the user's Paystack subscription from renewing. Null when Paystack is not configured. */
  cancelSubscription:   ((userId: string) => Promise<void>) | null;
  deleteStoragePrefix:  (prefix: string) => Promise<number>;
  deleteVectors:        (userId: string) => Promise<void>;
}

/** Everything a user's uploads and generated images are stored under. */
export const userStoragePrefixes = (userId: string) => [`users/${userId}/`, `uploads/${userId}/`];

export function createAccountService(deps: AccountDeletionDeps) {
  async function erase(userId: string): Promise<boolean> {
    try {
      for (const prefix of userStoragePrefixes(userId)) await deps.deleteStoragePrefix(prefix);
      await deps.deleteVectors(userId);
      await accountErasuresRepository.complete(userId);
      logger.info({ userId }, 'Deleted account data erased from storage');
      return true;
    } catch (err: any) {
      await accountErasuresRepository.recordFailure(userId, String(err?.message ?? err));
      logger.error({ userId, err: err?.message }, 'Account erasure incomplete — will retry');
      return false;
    }
  }

  return {
    async deleteAccount(userId: string) {
      const user = await usersRepository.findById(userId);
      if (!user) throw new NotFoundError('User');

      const subscription = await subscriptionsRepository.findByUserId(userId);
      if (subscription?.provider === 'paystack') {
        const live = subscription.status === 'active' || subscription.status === 'past_due';
        const refused = () => new ServiceUnavailableError(
          'Your subscription could not be cancelled right now, so the account was not deleted. Please try again.',
          'BILLING_UNAVAILABLE',
        );
        if (!deps.cancelSubscription) {
          if (live && !subscription.cancelAtPeriodEnd) throw refused();
        } else if (live || subscription.paystackSubscriptionCode) {
          try {
            await deps.cancelSubscription(userId);
          } catch (err: any) {
            logger.error({ userId, err: err?.message }, 'Could not cancel the Paystack subscription: account deletion refused');
            throw refused();
          }
        }
      }

      await getDb().transaction(async (tx) => {
        await accountErasuresRepository.add(userId, tx);
        await usersRepository.delete(userId, tx);
      });
      logger.info({ userId }, 'Account deleted');

      // Not awaited: the account is gone either way, and the sweep retries.
      void erase(userId);
      return { message: 'Account deleted' };
    },

    /** Retries erasures that did not complete. Returns how many are now done. */
    async sweepErasures(): Promise<number> {
      let completed = 0;
      for (const erasure of await accountErasuresRepository.list()) {
        if (await erase(erasure.userId)) completed += 1;
      }
      return completed;
    },

    /** Exposed for tests. */
    erase,
  };
}
