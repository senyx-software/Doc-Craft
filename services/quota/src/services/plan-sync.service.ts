import { prisma } from '../db/prisma.js';
import { getRedis } from '../db/redis.js';
import { nextMidnightUTC } from '../lib/time.js';
import { quotaConfigClient } from './quotaConfigClient.service.js';

/** Billing changes the plan baseline, while explicit staff overrides retain priority. */
export async function syncPlanQuota(userId: string, plan: string): Promise<void> {
  const limit = await quotaConfigClient.getPlanQuota(plan);
  if (limit === 0) throw new Error('Plan configuration unavailable');
  const record = await prisma.$transaction(async tx => {
    // Repair only overrides previously created by billing. Never erase staff grants.
    await tx.quota.updateMany({ where: { userId, overriddenByAdminId: 'system', overrideReason: 'Automatic plan change from payment webhook' }, data: { overrideLimit: null, overrideReason: null, overriddenByAdminId: null } });
    return tx.quota.upsert({ where: { userId }, create: { userId, used: 0, limit, resetsAt: nextMidnightUTC() }, update: { limit } });
  });
  const redis = getRedis();
  if (record.overrideLimit !== null) await redis.set(`quota:limit:${userId}`, String(record.overrideLimit));
  else await redis.del(`quota:limit:${userId}`);
}
