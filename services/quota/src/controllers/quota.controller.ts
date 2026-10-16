import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authenticate.js';
import * as quotaService from '../services/quota.service.js';
import { overrideQuota, MissingReasonError } from '../services/admin-override.service.js';
import { resetUserCounter } from '../services/quota.service.js';

// ─── GET /quota/me ────────────────────────────────────────────────────────────

/** Current quota status for the authenticated user. */
export async function getMyQuota(req: Request, res: Response): Promise<void> {
  const { userId, userPlan } = req as AuthenticatedRequest;
  try {
    const status = await quotaService.getStatus(userId, userPlan);
    res.json(status);
  } catch (err) {
    console.error('[quota] getMyQuota error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve quota' });
  }
}

// ─── POST /quota/check ────────────────────────────────────────────────────────

/**
 * Internal — the authoritative generation gate. Atomically reserves one unit of
 * quota. Returns 200 { allowed: true, ... } when allowed, 403 with an
 * upgrade-prompt payload when the limit is exceeded.
 */
export async function checkQuota(req: Request, res: Response): Promise<void> {
  const { userId, userPlan } = req as AuthenticatedRequest;
  try {
    // Internal authentication already validated the raw ID (<=200) and added
    // its service namespace. Preserve that namespace rather than dropping the receipt.
    const reservationId=typeof req.body?.reservationId==='string' && req.body.reservationId.length<=240 ? req.body.reservationId : undefined;
    const result = await quotaService.checkAndReserve(userId, userPlan,reservationId);

    if (!result.allowed) {
      res.status(403).json({
        error:     'quota_exceeded',
        message:   `You've used all ${result.limit} AI requests and PDF generations in this allowance window. Review your plan or wait until the reset time.`,
        actions:   ['upgrade_to_pro', 'wait_for_reset'],
        resets_at: result.resets_at,
        used:      result.used,
        limit:     result.limit,
      });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error('[quota] checkQuota error:', err);
    res.status((err as {statusCode?:number}).statusCode || 503).json({ error: 'quota_unavailable', message: 'Quota check failed' });
  }
}

// ─── POST /quota/increment ────────────────────────────────────────────────────

/**
 * Internal — counts a successful generation for callers that did not reserve
 * via /check. Atomic INCR in Redis.
 */
export async function incrementQuota(req: Request, res: Response): Promise<void> {
  const { userId, userPlan } = req as AuthenticatedRequest;
  try {
    const updated = await quotaService.increment(userId, userPlan);
    res.json(updated);
  } catch (err) {
    console.error('[quota] incrementQuota error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to increment quota' });
  }
}

// ─── POST /quota/reset ────────────────────────────────────────────────────────

/** Admin/internal — resets a single (target) user's quota. Body: { userId }. */
export async function resetUserQuota(req: Request, res: Response): Promise<void> {
  const targetUserId = (req.body as { userId?: string }).userId;
  if (!targetUserId) {
    res.status(400).json({ error: 'bad_request', message: 'userId is required in request body' });
    return;
  }

  try {
    await resetUserCounter(targetUserId);
    res.json({ success: true, userId: targetUserId, message: 'Quota reset successfully' });
  } catch (err) {
    console.error('[quota] resetUserQuota error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to reset quota' });
  }
}

// ─── POST /quota/refund ────────────────────────────────────────────────────

/**
 * Give back one unit of quota after a checkAndReserve()'d generation
 * ultimately failed to produce a document (worker crash, template error,
 * storage failure, ...). Called by the Document Service's PDF worker from
 * its failure handler — never from a user-facing path. Body: { userId, plan }.
 */
export async function refundQuota(req: Request, res: Response): Promise<void> {
  const { userId, plan, reservationId } = req.body as { userId?: string; plan?: string; reservationId?: string };
  if (!userId || typeof reservationId !== 'string' || !reservationId || reservationId.length > 240) {
    res.status(400).json({ error: 'bad_request', message: 'userId and a valid reservationId are required' });
    return;
  }

  try {
    const used = await quotaService.refundUsage(userId, plan || 'free', reservationId);
    res.json({ success: true, userId, used });
  } catch (err) {
    console.error('[quota] refundQuota error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to refund quota' });
  }
}

// ─── POST /quota/guest/check ──────────────────────────────────────────────────

/** Guest — atomic reserve for an unauthenticated session. Body: { sessionToken }. */
export async function checkGuestQuota(req: Request, res: Response): Promise<void> {
  const { sessionToken } = req.body as { sessionToken?: string };
  if (!sessionToken) {
    res.status(400).json({ error: 'bad_request', message: 'sessionToken is required' });
    return;
  }

  try {
    const status = await quotaService.checkGuestAndReserve(sessionToken);
    if (!status.allowed) {
      res.status(403).json({
        error:   'quota_exceeded',
        message: 'Guest users are limited to 1 document. Create a free account to get 3 per day.',
        actions: ['register', 'login'],
        used:    status.used,
        limit:   status.limit,
      });
      return;
    }
    res.json(status);
  } catch (err) {
    console.error('[quota] checkGuestQuota error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Guest quota check failed' });
  }
}

// ─── POST /quota/guest/increment ─────────────────────────────────────────────

/** Guest — read-only status echo (the guest reserve happens at check). */
export async function incrementGuestQuota(req: Request, res: Response): Promise<void> {
  const { sessionToken } = req.body as { sessionToken?: string };
  if (!sessionToken) {
    res.status(400).json({ error: 'bad_request', message: 'sessionToken is required' });
    return;
  }

  try {
    const status = await quotaService.getGuestStatus(sessionToken);
    res.json(status);
  } catch (err) {
    console.error('[quota] incrementGuestQuota error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to read guest quota' });
  }
}

// ─── POST /quota/override ─────────────────────────────────────────────────────

/**
 * Admin — overrides a user's quota limit. A non-empty reason is mandatory and
 * is written to the immutable audit trail.
 * Body: { userId, overrideLimit, reason, adminId }.
 */
export async function overrideQuotaHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    userId?:        string;
    overrideLimit?: number;
    reason?:        string;
    adminId?:       string;
  };
  const { userId, overrideLimit, reason, adminId } = body;

  if (!userId || overrideLimit == null || !reason || !reason.trim() || !adminId) {
    res.status(400).json({
      error:   'bad_request',
      message: 'userId, overrideLimit, a non-empty reason, and adminId are all required',
    });
    return;
  }

  if (!Number.isSafeInteger(overrideLimit) || (overrideLimit !== quotaService.UNLIMITED_QUOTA && overrideLimit < 1)) {
    res.status(400).json({
      error:   'bad_request',
      message: `overrideLimit must be a natural number (>= 1), or ${quotaService.UNLIMITED_QUOTA} for unlimited`,
    });
    return;
  }

  try {
    const quota = await overrideQuota({ userId, overrideLimit, reason, adminId });
    res.json({ success: true, quota });
  } catch (err) {
    if (err instanceof MissingReasonError) {
      res.status(400).json({ error: 'bad_request', message: err.message });
      return;
    }
    console.error('[quota] overrideQuota error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to override quota' });
  }
}

// ─── GET /quota/admin/stats ───────────────────────────────────────────────────

/** Admin — aggregated quota stats, top user usage, and real monthly trend. */
export async function getAdminQuotaStats(req: Request, res: Response): Promise<void> {
  try {
    const { prisma } = await import('../db/prisma.js');

    // ── Total usage summary ──────────────────────────────────────────────────
    const totalUsage = await prisma.quota.aggregate({
      _sum: { used: true },
      _count: { _all: true },
    });

    // ── Top users by generations used ────────────────────────────────────────
    const topQuotas = await prisma.quota.findMany({
      orderBy: { used: 'desc' },
      take: 50,
    });

    // ── Recent reset log ─────────────────────────────────────────────────────
    const recentResets = await prisma.quotaResetLog.findMany({
      orderBy: { resetAt: 'desc' },
      take: 10,
    });

    // ── Monthly trend: aggregate quota usage by month (last 12 months) ───────
    // Group by month from all Quota records using periodStart
    // Split free (overrideLimit == null, default limit ≤ 5) vs pro (> 5)
    const allQuotas = await prisma.quota.findMany({
      select: { userId: true, used: true, overrideLimit: true, periodStart: true, updatedAt: true },
    });

    // Build a map: "YYYY-MM" → { free: number, pro: number }
    const monthMap: Record<string, { free: number; pro: number }> = {};
    for (const q of allQuotas) {
      const dateStr = q.periodStart
        ? new Date(q.periodStart).toISOString().substring(0, 7)
        : new Date(q.updatedAt).toISOString().substring(0, 7);
      if (!monthMap[dateStr]) monthMap[dateStr] = { free: 0, pro: 0 };
      const isPro = q.overrideLimit === quotaService.UNLIMITED_QUOTA || (q.overrideLimit ?? 0) > 5;
      if (isPro) {
        monthMap[dateStr].pro += q.used;
      } else {
        monthMap[dateStr].free += q.used;
      }
    }

    // Sort months chronologically, take last 12
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthly_trend = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, vals]) => {
        const [, mm] = key.split('-');
        return { month: MONTH_NAMES[parseInt(mm, 10) - 1] ?? key, free: vals.free, pro: vals.pro };
      });

    // ── Tier totals ──────────────────────────────────────────────────────────
    let free_tier_total = 0;
    let pro_tier_total = 0;
    for (const q of allQuotas) {
      if (q.overrideLimit === quotaService.UNLIMITED_QUOTA || (q.overrideLimit ?? 0) > 5) {
        pro_tier_total += q.used;
      } else {
        free_tier_total += q.used;
      }
    }

    // ── Failed generations count (quotaResetLog can track errors if recorded) ─
    // Return resets as proxy for service activity
    const failed_count = await prisma.quotaResetLog.count();

    res.json({
      success: true,
      total_quotas: totalUsage._count._all || 0,
      total_generations_used: totalUsage._sum.used || 0,
      top_user_quotas: topQuotas,
      recent_resets: recentResets,
      monthly_trend,
      free_tier_total,
      pro_tier_total,
      failed_count,
    });
  } catch (err) {
    console.error('[quota] getAdminQuotaStats error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to fetch admin quota stats' });
  }
}
