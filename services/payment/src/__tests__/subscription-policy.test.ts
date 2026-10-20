import { beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../db/prisma.js', () => ({ prisma: { subscription: storage } }));
vi.mock('../services/paddle.client.js', () => ({ paddle: {} }));
vi.mock('../services/paymentConfigClient.service.js', () => ({ paymentConfigClient: {} }));

import { getSubscriptionPolicy } from '../services/subscription.service.js';

beforeEach(() => vi.resetAllMocks());

it.each(['active', 'cancelled', 'past_due'])('reads %s subscription policy without requiring billing synchronization columns', async status => {
  const currentPeriodEnd = new Date('2026-01-01T00:00:00Z');
  storage.findUnique.mockImplementation(async ({ where, select }) => {
    // Model the existing database: newer billing metadata has not been migrated.
    const columns = new Set(['plan', 'status', 'currentPeriodEnd', 'cancelAtPeriodEnd']);
    if (!select || Object.keys(select).some(column => !columns.has(column))) {
      throw Object.assign(new Error('Column payhereSyncAt does not exist'), { code: 'P2022' });
    }
    if (where.userId !== 'account') throw new Error('Unexpected account lookup');
    return { plan: { name: 'pro' }, status, currentPeriodEnd, cancelAtPeriodEnd: true };
  });

  await expect(getSubscriptionPolicy('account')).resolves.toEqual({
    plan: 'pro', status, currentPeriodEnd, cancelAtPeriodEnd: true,
  });
});

it('returns no subscription when the account has no billing record', async () => {
  storage.findUnique.mockResolvedValue(null);
  await expect(getSubscriptionPolicy('free-account')).resolves.toBeNull();
});

it('propagates storage failure instead of treating an unknown subscription as free', async () => {
  storage.findUnique.mockRejectedValue(new Error('Database unavailable'));
  await expect(getSubscriptionPolicy('account')).rejects.toThrow('Database unavailable');
});
