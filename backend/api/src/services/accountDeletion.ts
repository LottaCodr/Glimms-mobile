import crypto from 'crypto';
import { aiClient } from '../lib/aiClient';
import { deletePrefixFromS3 } from '../lib/s3';
import { createAccountService } from './account.service';
import { subscriptionsService } from './subscriptions.service';

/** The account service wired to the real Paystack, S3 and vector store. */
export const accountService = createAccountService({
  cancelSubscription: subscriptionsService.isConfigured()
    ? (userId) => subscriptionsService.cancelForUser(userId)
    : null,
  deleteStoragePrefix: deletePrefixFromS3,
  deleteVectors: async (userId) => {
    await aiClient.deleteUserVectors(userId, 'items', `erase-${crypto.randomUUID()}`);
  },
});
