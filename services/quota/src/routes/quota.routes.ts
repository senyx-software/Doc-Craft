import { Router } from 'express';
import { authenticateUser, authenticateInternal, requireInternalSecret } from '../middleware/authenticate.js';
import { ipAbuseDetection } from '../security/ipAbuseDetection.js';
import * as ctrl from '../controllers/quota.controller.js';
import { syncPlanQuota } from '../services/plan-sync.service.js';
import type { AuthenticatedRequest } from '../middleware/authenticate.js';
import { prisma } from '../db/prisma.js';
import { getRedis } from '../db/redis.js';

const router = Router();

// ─── Protected (user-facing) ──────────────────────────────────────────────────

/**
 * GET /v1/quota/me
 * Returns the authenticated user's current quota status.
 * Access: Protected (JWT required)
 */
router.get('/entitlements', authenticateUser, async (req,res)=>{
  try {res.json(await (await import('../../../../shared/entitlements.mjs')).getEntitlements((req as AuthenticatedRequest).userId));}
  catch {res.status(503).json({error:'Entitlements unavailable'});}
});
router.get('/me', authenticateUser, ctrl.getMyQuota);

// ─── Internal (service-to-service) ───────────────────────────────────────────

/**
 * POST /v1/quota/check
 * Checks if a user can generate a document. Called by document service.
 * Returns 200 if allowed, 403 if quota exceeded.
 * Access: Internal (X-Internal-Secret or gateway-injected headers)
 */
router.post('/check', authenticateInternal, ipAbuseDetection, ctrl.checkQuota);
router.post('/plan/sync', authenticateInternal, async (req, res) => {
  try {
    const { userId, userPlan } = req as AuthenticatedRequest;
    await syncPlanQuota(userId, userPlan);
    res.json({ success: true });
  } catch {
    res.status(503).json({ error: 'Plan synchronization unavailable' });
  }
});

/**
 * POST /v1/quota/increment
 * Atomically increments the counter after successful generation.
 * Access: Internal
 */
router.post('/increment', authenticateInternal, ipAbuseDetection, ctrl.incrementQuota);

/**
 * POST /v1/quota/refund
 * Gives back one unit of quota after a reserved generation ultimately
 * failed to produce a document. Called by the Document Service's PDF
 * worker on job failure.
 * Access: Internal (X-Internal-Secret)
 * Body: { userId: string, plan: string }
 */
router.post('/refund', authenticateInternal, ctrl.refundQuota);

/**
 * POST /v1/quota/reset
 * Resets a single user's quota counter. Used by admin or payment service
 * on subscription renewal.
 * Access: Internal (X-Internal-Secret)
 * Body: { userId: string }
 */
router.post('/reset', authenticateInternal, ctrl.resetUserQuota);

// ─── Guest (unauthenticated) ──────────────────────────────────────────────────

/**
 * POST /v1/quota/guest/check
 * Checks quota for an unauthenticated guest session.
 * Body: { sessionToken: string }
 */
router.post('/guest/check', ctrl.checkGuestQuota);

/**
 * POST /v1/quota/guest/increment
 * Increments a guest session's quota counter.
 * Body: { sessionToken: string }
 */
router.post('/guest/increment', ctrl.incrementGuestQuota);

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * POST /v1/quota/override
 * Admin-only: overrides a user's quota limit with a mandatory reason.
 * The admin-api service calls this with X-Internal-Secret.
 * Body: { userId, overrideLimit, reason, adminId }
 */
router.post('/override', authenticateInternal, ctrl.overrideQuotaHandler);
router.delete('/override/:userId', requireInternalSecret, async (req, res) => {
  const userId = req.params.userId;
  if (typeof userId !== 'string' || !userId) { res.status(400).json({ error: 'invalid_user_id' }); return; }
  try {
    await prisma.quota.updateMany({ where: { userId }, data: {
      overrideLimit: null, overrideReason: null, overriddenByAdminId: null,
    } });
    await getRedis().del(`quota:limit:${userId}`);
    res.status(204).end();
  } catch {
    res.status(503).json({ error: 'override_removal_unavailable' });
  }
});

/**
 * GET /v1/quota/admin/stats
 * Admin-only: aggregated quota usage and top user stats.
 */
router.get('/admin/stats', requireInternalSecret, ctrl.getAdminQuotaStats);

export default router;
