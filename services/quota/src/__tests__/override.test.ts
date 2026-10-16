/**
 * override.test.ts — admin override: mandatory reason + audit-log emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeRedis } from './fakeRedis.js';

const fake = new FakeRedis();

const prismaMock = {
  quota: {
    upsert:            vi.fn().mockResolvedValue({}),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ userId: 'u1', limit: 3 }),
  },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock('../db/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../db/redis.js', () => ({ getRedis: () => fake }));
vi.mock('../services/reservation-ledger.service.js',()=>({ledgerOperation:async()=>({userId:'u1',plan:'free',used:0,limit:100,remaining:100,resets_at:new Date().toISOString()})}));

const { overrideQuota, MissingReasonError } = await import('../services/admin-override.service.js');

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  prismaMock.quota.findUniqueOrThrow.mockResolvedValue({ userId: 'u1', limit: 3 });
});

describe('overrideQuota — reason is mandatory', () => {
  it('rejects an empty reason and writes nothing', async () => {
    await expect(
      overrideQuota({ userId: 'u1', overrideLimit: 100, reason: '', adminId: 'admin-1' }),
    ).rejects.toBeInstanceOf(MissingReasonError);

    expect(prismaMock.quota.upsert).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only reason', async () => {
    await expect(
      overrideQuota({ userId: 'u1', overrideLimit: 100, reason: '   ', adminId: 'admin-1' }),
    ).rejects.toBeInstanceOf(MissingReasonError);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('overrideQuota — successful override', () => {
  it('persists, updates the live Redis limit, and emits an immutable audit entry', async () => {
    await overrideQuota({ userId: 'u1', overrideLimit: 100, reason: 'VIP customer', adminId: 'admin-1' });

    expect(prismaMock.quota.upsert).toHaveBeenCalledOnce();

    // Live Redis limit updated immediately
    expect(await fake.get('quota:limit:u1')).toBe('100');

    // Audit entry with the exact required shape
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action:      'quota.override',
        targetType:  'user',
        targetId:    'u1',
        actorId:     'admin-1',
        reason:      'VIP customer',
        requires2FA: true,
      }),
    });
  });

  it('trims the reason before storing it', async () => {
    await overrideQuota({ userId: 'u1', overrideLimit: 50, reason: '  fraud review  ', adminId: 'admin-2' });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'fraud review' }),
    });
  });
});
