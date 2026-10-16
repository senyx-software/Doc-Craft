/**
 * subscription-quota.test.ts — activateProSubscription / downgradeToFree must
 * grant the Admin-managed plan quota, not a hardcoded business number.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = { get: vi.fn(), on: vi.fn(), connect: vi.fn(), status: 'ready' };
vi.mock('../db/redis.js', () => ({ getRedis: () => redisMock }));

const prismaMock = {
  subscription: { upsert: vi.fn(), updateMany: vi.fn() },
};
vi.mock('../db/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../services/paddle.client.js', () => ({ paddle: {} }));

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal('fetch', fetchMock);

const { activateProSubscription, downgradeToFree } = await import('../services/subscription.service.js');
const { paymentConfigClient } = await import('../services/paymentConfigClient.service.js');

function mockAdminPlans(plans: Record<string, any>) {
  redisMock.get.mockImplementation((key: string) =>
    key === 'config:domain:plans' ? Promise.resolve(JSON.stringify({ data: plans })) : Promise.resolve(null),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  paymentConfigClient.clearMemoryCache();
});

describe('activateProSubscription — grants the Admin-managed quota', () => {
  it('synchronizes the plan baseline without creating a permanent override', async () => {
    mockAdminPlans({ pro: { name: 'pro', monthly_quota: 750 } });

    await activateProSubscription({
      userId: 'user-1', planId: 'plan-pro', planName: 'pro', gateway: 'paddle',
      periodStart: new Date(), periodEnd: new Date(),
    });

    const overrideCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/quota/plan/sync'));
    expect(overrideCall).toBeDefined();
    const body = JSON.parse(overrideCall![1].body);
    expect(body).toEqual({ userId: 'user-1', plan: 'pro' }); // NOT the old hardcoded 999_999
  });

  it('reflects an admin price/quota change on the next activation without a code change', async () => {
    mockAdminPlans({ pro: { name: 'pro', monthly_quota: 2000 } });

    await activateProSubscription({
      userId: 'user-2', planId: 'plan-pro', planName: 'pro', gateway: 'payhere',
      periodStart: new Date(), periodEnd: new Date(),
    });

    const overrideCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/quota/plan/sync'));
    const body = JSON.parse(overrideCall![1].body);
    expect(body).toEqual({ userId: 'user-2', plan: 'pro' });
  });
});

describe('downgradeToFree — grants the Admin-managed free quota', () => {
  it('restores the free plan baseline without inventing an override', async () => {
    mockAdminPlans({ free: { name: 'free', monthly_quota: 8 } });

    await downgradeToFree('user-3');

    const overrideCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/quota/plan/sync'));
    expect(overrideCall).toBeDefined();
    const body = JSON.parse(overrideCall![1].body);
    expect(body).toEqual({ userId: 'user-3', plan: 'free' }); // NOT the old hardcoded 3
    expect(fetchMock.mock.calls.some(([url]) => /\/quota\/(reset|override)$/.test(String(url)))).toBe(false);
  });
});

it('paid activation updates the Auth-owned user plan as well as quota', async () => {
  mockAdminPlans({ pro: { monthly_quota: 10 } });
  await activateProSubscription({ userId:'u', planId:'p', planName:'pro', gateway:'paddle', periodStart:new Date(), periodEnd:new Date() });
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/internal/users/u/plan'));
  expect(call).toBeDefined();
  expect(call![1].method).toBe('PATCH');
  expect(JSON.parse(call![1].body)).toEqual({plan:'pro'});
});

it('account synchronization failure remains a retryable worker failure', async () => {
  mockAdminPlans({ pro: { monthly_quota: 10 } });
  fetchMock.mockResolvedValueOnce({ok:false});
  await expect(activateProSubscription({ userId:'u', planId:'p', planName:'pro', gateway:'paddle', periodStart:new Date(), periodEnd:new Date() })).rejects.toThrow('Account plan synchronization failed');
});
