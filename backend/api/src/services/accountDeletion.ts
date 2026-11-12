import crypto from 'crypto';
import { aiClient } from '../lib/aiClient';
import { deletePrefixFromS3 } from '../lib/s3';
import { createAccountService } from './account.service';
import { subscriptionsService } from './subscriptions.service';

/** The account service wired to the real Stripe, S3 and vector store. */
export const accountService = createAccountService({
  deleteStripeCustomer: subscriptionsService.isConfigured()
    ? (customerId) => subscriptionsService.deleteCustomer(customerId)
    : null,
  deleteStoragePrefix: deletePrefixFromS3,
  deleteVectors: async (userId) => {
    await aiClient.deleteUserVectors(userId, 'items', `erase-${crypto.randomUUID()}`);
  },
});
