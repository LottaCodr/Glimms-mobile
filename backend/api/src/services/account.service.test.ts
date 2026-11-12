import { createAccountService } from './account.service';
import { accountErasuresRepository, subscriptionsRepository, usersRepository } from '../repositories';
import { setupTestDatabase, TestDatabase } from '../test/testDatabase';
import { createUser, UNKNOWN_ID } from '../test/fixtures';

let database: TestDatabase;
beforeAll(async () => { database = await setupTestDatabase(); });
afterAll(async () => { await database.close(); });
beforeEach(async () => { await database.reset(); });

function deps() {
  return {
    cancelSubscription: jest.fn(async (_userId: string) => undefined),
    deleteStoragePrefix: jest.fn(async (_prefix: string) => 3),
    deleteVectors: jest.fn(async (_userId: string) => undefined),
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function subscriber(status: 'active' | 'inactive' = 'active') {
  const user = await createUser({ tier: 'premium' });
  await subscriptionsRepository.lockForUser(user.id, database.db);
  await subscriptionsRepository.updateByUserId(user.id, {
    provider: 'paystack', paystackCustomerCode: 'CUS_1', status,
    paystackSubscriptionCode: status === 'active' ? 'SUB_1' : null,
  });
  return user;
}

describe('deleteAccount', () => {
  it('cancels billing, deletes the user, then erases files and vectors', async () => {
    const d = deps();
    const user = await subscriber();

    await createAccountService(d).deleteAccount(user.id);
    await settle();

    expect(d.cancelSubscription).toHaveBeenCalledWith(user.id);
    expect(await usersRepository.findById(user.id)).toBeNull();
    expect(await subscriptionsRepository.findByUserId(user.id)).toBeNull();
    expect(d.deleteStoragePrefix.mock.calls.map(([prefix]) => prefix)).toEqual([`users/${user.id}/`, `uploads/${user.id}/`]);
    expect(d.deleteVectors).toHaveBeenCalledWith(user.id);
    expect(await accountErasuresRepository.list()).toEqual([]);
  });

  it('keeps the account when billing cannot be cancelled', async () => {
    const d = deps();
    d.cancelSubscription.mockRejectedValue(new Error('paystack is down'));
    const user = await subscriber();

    await expect(createAccountService(d).deleteAccount(user.id))
      .rejects.toMatchObject({ statusCode: 503, code: 'BILLING_UNAVAILABLE' });

    expect(await usersRepository.findById(user.id)).not.toBeNull();
    expect(d.deleteStoragePrefix).not.toHaveBeenCalled();
  });

  it('refuses to delete a paying subscriber when Paystack is not configured', async () => {
    const user = await subscriber();
    const service = createAccountService({ ...deps(), cancelSubscription: null });

    await expect(service.deleteAccount(user.id)).rejects.toMatchObject({ statusCode: 503 });
    expect(await usersRepository.findById(user.id)).not.toBeNull();
  });

  it('deletes a user who only ever started a checkout, even without Paystack', async () => {
    const user = await subscriber('inactive');
    await createAccountService({ ...deps(), cancelSubscription: null }).deleteAccount(user.id);
    expect(await usersRepository.findById(user.id)).toBeNull();
  });

  it('does not contact Paystack for a user who never subscribed', async () => {
    const d = deps();
    const user = await createUser();
    await createAccountService(d).deleteAccount(user.id);
    expect(d.cancelSubscription).not.toHaveBeenCalled();
    expect(await usersRepository.findById(user.id)).toBeNull();
  });

  it('answers 404 for an unknown user', async () => {
    await expect(createAccountService(deps()).deleteAccount(UNKNOWN_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('erasure retries', () => {
  it('still deletes the account when storage is down, and finishes the erasure later', async () => {
    const d = deps();
    d.deleteStoragePrefix.mockRejectedValue(new Error('S3 unavailable'));
    const service = createAccountService(d);
    const user = await createUser();

    await service.deleteAccount(user.id);
    await settle();

    expect(await usersRepository.findById(user.id)).toBeNull();
    expect(await accountErasuresRepository.list()).toEqual([{ userId: user.id, attempts: 1 }]);
    expect(d.deleteVectors).not.toHaveBeenCalled();

    expect(await service.sweepErasures()).toBe(0); // still down
    expect(await accountErasuresRepository.list()).toEqual([{ userId: user.id, attempts: 2 }]);

    d.deleteStoragePrefix.mockResolvedValue(0);
    expect(await service.sweepErasures()).toBe(1);
    expect(d.deleteVectors).toHaveBeenCalledWith(user.id);
    expect(await accountErasuresRepository.list()).toEqual([]);
  });

  it('keeps the erasure owed when the vector store fails', async () => {
    const d = deps();
    d.deleteVectors.mockRejectedValue(new Error('vector store unavailable'));
    const service = createAccountService(d);
    const user = await createUser();

    await service.deleteAccount(user.id);
    await settle();

    expect(await accountErasuresRepository.list()).toHaveLength(1);
  });
});
