/**
 * reset.test.ts — midnight-UTC boundary math + daily cron reset correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextMidnightUTC, secondsUntilMidnightUTC } from '../lib/time.js';

// Mock the reset primitives so runDailyReset can be tested in isolation.
vi.mock('../services/quota.service.js', () => ({
  resetAllCounters: vi.fn().mockResolvedValue(7),
}));
vi.mock('../services/quota-sync.service.js', () => ({
  resetAllRecords: vi.fn().mockResolvedValue(7),
  logReset:        vi.fn().mockResolvedValue(undefined),
}));

const { runDailyReset } = await import('../queues/quota-reset.queue.js');
const quotaService = await import('../services/quota.service.js');
const quotaSync    = await import('../services/quota-sync.service.js');

beforeEach(() => vi.clearAllMocks());

describe('nextMidnightUTC — day boundary', () => {
  it('rolls to the next UTC day just before midnight', () => {
    const from = new Date('2026-07-11T23:30:00.000Z');
    expect(nextMidnightUTC(from).toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('rolls to tomorrow when called exactly at midnight', () => {
    const from = new Date('2026-07-11T00:00:00.000Z');
    expect(nextMidnightUTC(from).toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('handles month/year rollover', () => {
    const from = new Date('2026-12-31T12:00:00.000Z');
    expect(nextMidnightUTC(from).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('secondsUntilMidnightUTC is positive and within a day', () => {
    const from = new Date('2026-07-11T23:59:00.000Z');
    const secs = secondsUntilMidnightUTC(from);
    expect(secs).toBe(60);
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(86_400);
  });
});

describe('runDailyReset — cron reset run', () => {
  it('preserves current Redis reservations while reconciling expired reporting rows', async () => {
    const result = await runDailyReset('cron');

    expect(quotaService.resetAllCounters).not.toHaveBeenCalled();
    expect(quotaSync.resetAllRecords).toHaveBeenCalledOnce();
    expect(quotaSync.logReset).toHaveBeenCalledWith(7, 'cron');
    expect(result).toEqual({ deletedKeys: 0, usersReset: 7 });
  });
});
