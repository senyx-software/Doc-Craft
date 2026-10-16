import { Router } from 'express';
import express from 'express';
import { authenticateUser, requireInternalSecret } from '../middleware/authenticate.js';
import { allowPaddleWebhookIps, allowPayhereWebhookIps } from '../security/webhookIpAllowlist.js';
import { verifyPaddleWebhook, verifyPayhereWebhook } from '../middleware/webhook-verify.middleware.js';
import * as payment from '../controllers/payment.controller.js';

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────

/** GET /v1/payment/plans — list subscription plans with pricing */
router.get('/plans', payment.listPlans);

// ─── Webhook routes ───────────────────────────────────────────────────────────
// Security layers (defence in depth, per spec section 11.3):
//   1. IP allowlist   — rejects non-gateway source IPs in production
//   2. Body parser    — Paddle needs the raw Buffer; PayHere needs urlencoded
//   3. Verify strategy — Paddle SDK unmarshal (HMAC-SHA256) / PayHere MD5,
//                        run before the controller treats the body as data

/**
 * POST /v1/payment/webhook/paddle
 * Paddle delivers JSON signed with the Paddle-Signature header.
 */
router.post(
  '/webhook/paddle',
  allowPaddleWebhookIps,
  express.raw({ type: 'application/json' }),
  verifyPaddleWebhook,
  payment.paddleWebhook,
);

/**
 * POST /v1/payment/webhook/payhere
 * PayHere delivers URL-encoded form data with an md5sig field.
 */
router.post(
  '/webhook/payhere',
  allowPayhereWebhookIps,
  express.urlencoded({ extended: false }),
  verifyPayhereWebhook,
  payment.payhereWebhook,
);

// ─── Protected (authenticated users) ─────────────────────────────────────────

/** POST /v1/payment/subscribe — create checkout session (Paddle or PayHere) */
router.post('/subscribe', authenticateUser, payment.createCheckout);

/** POST /v1/payment/portal — Paddle billing portal URL */
router.post('/portal', authenticateUser, payment.getBillingPortal);

/** GET /v1/payment/subscription — current subscription + plan */
router.get('/subscription', authenticateUser, payment.getSubscription);

/** POST /v1/payment/cancel — cancel at end of billing period */
router.post('/cancel', authenticateUser, payment.cancelSubscription);

/** GET /v1/payment/invoices — paginated invoice history */
router.get('/invoices', authenticateUser, payment.listInvoices);

/** POST /v1/payment/coupon/validate — validate a discount code */
router.post('/coupon/validate', authenticateUser, payment.validateCouponHandler);

/** Payment Method Management */
router.get('/methods', authenticateUser, payment.listPaymentMethods);
router.post('/methods', authenticateUser, payment.addPaymentMethod);
router.delete('/methods/:id', authenticateUser, payment.deletePaymentMethod);
router.post('/methods/:id/default', authenticateUser, payment.setDefaultPaymentMethod);

// ─── Admin-only internal routes (server-to-server, called by admin-api) ──────
router.use('/admin', requireInternalSecret);

/** GET /v1/payment/admin/subscriptions — all subscriptions (admin only) */
router.post('/admin/payhere/reconcile/:orderId',async(req,res)=>{
  try {res.json(await (await import('../services/payhere-reconciliation.service.js')).reconcilePayhereOrder(String(req.params.orderId)));}
  catch {res.status(503).json({error:'Trusted PayHere reconciliation unavailable; verify OAuth credentials, mandate identity, currency, and timestamp offset'});}
});
router.get('/admin/entitlements/:userId', async (req, res) => {
  try {
    const sub = await (await import('../services/subscription.service.js')).getSubscription(String(req.params.userId));
    res.json({subscription: sub ? {plan:sub.plan.name,status:sub.status,currentPeriodEnd:sub.currentPeriodEnd,cancelAtPeriodEnd:sub.cancelAtPeriodEnd} : null});
  } catch { res.status(503).json({error:'Subscription policy unavailable'}); }
});
router.get('/admin/subscriptions/stats', payment.adminSubscriptionStats);
router.get('/admin/subscriptions',       payment.adminListSubscriptions);

/** GET /v1/payment/admin/invoices — all billing invoices (admin only) */
router.get('/admin/invoices', payment.adminListInvoices);

/** GET /v1/payment/admin/revenue — MRR/ARR summary (admin only) */
router.get('/admin/revenue', payment.adminRevenueSummary);

/** GET /v1/payment/admin/revenue/trajectory — last 12 months of paid revenue (admin only) */
router.get('/admin/revenue/trajectory', payment.adminRevenueTrajectory);

/** GET /v1/payment/admin/failed-payments — failed payment log (admin only) */
router.get('/admin/failed-payments', payment.adminFailedPayments);

/** GET /v1/payment/admin/refunds — refunded payments (admin only) */
router.get('/admin/refunds', payment.adminRefunds);

/** GET /v1/payment/admin/keys/status — gateway secret configuration status (admin only) */
router.get('/admin/keys/status', payment.adminKeyStatus);

/** Coupons — the same table validated at real checkout (admin only) */
router.get('/admin/coupons', payment.adminListCoupons);
router.post('/admin/coupons', payment.adminCreateCoupon);
router.post('/admin/coupons/:id/archive', payment.adminArchiveCoupon);

/** Trial Management (admin only) */
router.get('/admin/trials', payment.adminListTrials);
router.post('/admin/trials', payment.adminStartTrial);
router.patch('/admin/trials/:id/extend', payment.adminExtendTrial);
router.post('/admin/trials/:id/end', payment.adminEndTrial);

export default router;
