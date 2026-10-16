/**
 * admin-override.service.ts — the admin quota-override write path.
 *
 * Invoked (via the internal endpoint) by the admin-api service. A reason is
 * MANDATORY: an override with a missing/blank reason is rejected before any
 * state changes, and every successful override is recorded in the immutable
 * AuditLog. 2FA itself is enforced upstream by admin-api; we record that the
 * action was one that required it.
 */

import { prisma } from '../db/prisma.js';
import { nextMidnightUTC } from '../lib/time.js';
import { setUserLimitOverride, getStatus, type QuotaStatus } from './quota.service.js';
import { quotaConfigClient } from './quotaConfigClient.service.js';

export class MissingReasonError extends Error {
  constructor() {
    super('An override reason is required');
    this.name = 'MissingReasonError';
  }
}

export interface OverrideInput {
  userId:        string;
  overrideLimit: number;
  reason:        string;
  adminId:       string;
}

/**
 * overrideQuota — sets a custom limit for a user.
 *
 *   1. Reject if the reason is missing/blank (before any write).
 *   2. Persist override fields to the Postgres Quota row.
 *   3. Update the live Redis limit immediately.
 *   4. Emit an immutable AuditLog entry (action "quota.override", requires2FA).
 */
export async function overrideQuota(input: OverrideInput): Promise<QuotaStatus> {
  const { userId, overrideLimit, adminId } = input;
  const reason = input.reason?.trim();

  if (!reason) {
    throw new MissingReasonError();
  }

  // 2. Persist the override to Postgres (source of truth for the durable record)
  await prisma.quota.upsert({
    where:  { userId },
    create: {
      userId,
      used:                0,
      limit:               overrideLimit,
      overrideLimit,
      overrideReason:      reason,
      overriddenByAdminId: adminId,
      periodStart:         new Date(),
      resetsAt:            nextMidnightUTC(),
    },
    update: {
      overrideLimit,
      overrideReason:      reason,
      overriddenByAdminId: adminId,
      updatedAt:           new Date(),
    },
  });

  // 3. Update the live Redis limit so the hot path sees it immediately
  await setUserLimitOverride(userId, overrideLimit);

  // 4. Immutable audit entry — the override is not "done" until this is written
  await prisma.auditLog.create({
    data: {
      action:      'quota.override',
      targetType:  'user',
      targetId:    userId,
      actorId:     adminId,
      reason,
      requires2FA: true,
      metadata:    { overrideLimit },
    },
  });

  // Return the effective status. Infer plan from the persisted base limit
  // against the live admin-managed pro quota (never a hardcoded number).
  const record = await prisma.quota.findUniqueOrThrow({ where: { userId } });
  const proLimit = await quotaConfigClient.getPlanQuota('pro');
  const plan = proLimit !== 0 && record.limit === proLimit ? 'pro' : 'free';
  return getStatus(userId, plan);
}
