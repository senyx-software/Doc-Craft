/**
 * guest.test.ts — guest sessions capped at 1 doc with a 24h TTL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FakeRedis } from './fakeRedis.js';

const fake = new FakeRedis();
vi.mock('../db/redis.js', () => ({ getRedis: () => fake }));
vi.mock('../services/quota-sync.service.js', () => ({ syncUsage: vi.fn() }));

const { checkGuestAndReserve, GUEST_TTL_SECONDS } = await import('../services/quota.service.js');

beforeEach(() => fake.reset());

describe('checkGuestAndReserve', () => {
  it('allows exactly one document per guest session', async () => {
    const first = await checkGuestAndReserve('sess-1');
    expect(first).toMatchObject({ allowed: true, used: 1, limit: 1, remaining: 0 });

    const second = await checkGuestAndReserve('sess-1');
    expect(second.allowed).toBe(false);
    expect(second.used).toBe(1);                    // rolled back — still 1
  });

  it('sets a 24-hour TTL on the guest key on first reserve', async () => {
    expect(GUEST_TTL_SECONDS).toBe(86_400);
    await checkGuestAndReserve('sess-2');
    expect(fake.expireCalls).toContainEqual(['quota:guest:sess-2', 86_400]);
  });

  it('tracks guest sessions in a separate keyspace from users', async () => {
    await checkGuestAndReserve('sess-3');
    // A user counter for the same id must be unaffected (different key pattern)
    const userExpire = fake.expireCalls.find(([k]) => k.startsWith('quota:user:'));
    expect(userExpire).toBeUndefined();
  });
});
