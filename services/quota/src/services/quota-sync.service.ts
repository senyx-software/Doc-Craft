/**
 * quota-sync.service.ts — keeps the Supabase `Quota` rows in step with the
 * live Redis counters, for reporting and admin views.
 *
 * Nothing here is on the request-blocking path: quota.service calls syncUsage()
 * fire-and-forget, so a slow or failing Postgres write can never delay (or
 * fail) a /quota/check. Every function swallows its own errors for that reason.
 */

import { prisma } from '../db/prisma.js';
import { nextMidnightUTC } from '../lib/time.js';

/**
 * ensureRecord — creates a Quota row on first access. Idempotent; never
 * overwrites an existing row.
 */
export async function ensureRecord(userId: string, limit: number): Promise<void> {
  try {
    await prisma.quota.upsert({
      where:  { userId },
      create: { userId, used: 0, limit, periodStart: new Date(), resetsAt: nextMidnightUTC() },
      update: {},
    });
  } catch (err) {
    console.error('[quota-sync] ensureRecord failed:', err);
  }
}

/**
 * syncUsage — mirrors the current Redis count/limit into Postgres. Called
 * fire-and-forget from the hot path, so it must never throw.
 */
export async function syncUsage(
  userId: string,
  used: number,
  limit: number,
  _plan: 'free' | 'pro' | string,
): Promise<void> {
  try {
    await prisma.quota.upsert({
      where:  { userId },
      create: { userId, used, limit, periodStart: new Date(), resetsAt: nextMidnightUTC() },
      update: { used, limit, periodStart: new Date(), resetsAt: nextMidnightUTC(), updatedAt: new Date() },
    });
  } catch (err) {
    console.error('[quota-sync] syncUsage failed:', err);
  }
}

/** resetUserRecord — resets a single user's persisted Quota row. */
export async function resetUserRecord(userId: string): Promise<void> {
  try {
    await prisma.quota.updateMany({
      where: { userId },
      data:  { used: 0, periodStart: new Date(), resetsAt: nextMidnightUTC(), updatedAt: new Date() },
    });
  } catch (err) {
    console.error('[quota-sync] resetUserRecord failed:', err);
  }
}

/**
 * resetAllRecords — resets every persisted Quota row (used by the midnight
 * cron). Returns the number of rows reset. Throws on failure so the cron run
 * is recorded as failed.
 */
export async function resetAllRecords(): Promise<number> {
  const now = new Date();
  const result = await prisma.quota.updateMany({
    where: { resetsAt: { lte: now }, used: {gt:0} },
    data: { used: 0, updatedAt: now },
  });
  return result.count;
}

/** logReset — records a reset run in the audit table. */
export async function logReset(usersReset: number, triggeredBy = 'cron'): Promise<void> {
  try {
    await prisma.quotaResetLog.create({ data: { usersReset, triggeredBy } });
  } catch (err) {
    console.error('[quota-sync] logReset failed:', err);
  }
}
