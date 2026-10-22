import {getEntitlements} from '../../../../shared/entitlements.mjs';
/**
 * payment.controller.ts — request/response handling for all /payment routes.
 *
 * Controllers stay thin: they parse the request, delegate to services, and
 * shape the response. All business logic (routing, gateway calls, event
 * mapping, persistence) lives in the service layer.
 */

import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import type { AuthenticatedRequest } from '../middleware/authenticate.js';
import type { PaddleWebhookRequest } from '../middleware/webhook-verify.middleware.js';

import * as planService from '../services/plan.service.js';
import * as subscriptionService from '../services/subscription.service.js';
import { validateCoupon } from '../services/coupon.service.js';
import {subscriptionBillingFacts} from '../services/subscription-display.service.js';
import { getUserInvoices } from '../services/invoice.service.js';
import { selectGatewayAsync } from '../services/gateway-router.service.js';
import { createPaddleCheckout, getPortalSession } from '../services/paddle.service.js';
import {
  buildCheckoutData,
  PAYHERE_CHECKOUT_URL,
  type PayhereWebhookPayload,
} from '../services/payhere.service.js';
import { enqueueWebhookJob } from '../queues/payment-webhook.queue.js';

// ─── GET /v1/payment/plans (public) ──────────────────────────────────────────

export async function listPlans(_req: Request, res: Response): Promise<void> {
  try {
    const plans = await planService.listPlans();
    res.json({ plans });
  } catch (err) {
    console.error('[payment] listPlans error:', err);
    res.status(503).json({ error: 'plans_unavailable', message: 'Plan configuration unavailable' });
  }
}

// ─── POST /v1/payment/subscribe ───────────────────────────────────────────────

/**
 * Creates a checkout session and returns the checkout URL, routing by billing
 * country (LK → PayHere, else → Paddle).
 *
 * Body: { country: string, billingCycle?: 'monthly'|'yearly', email?, firstName?, lastName? }
 */
export async function createCheckout(req: Request, res: Response): Promise<void> {
  const { userId } = req as AuthenticatedRequest;
  const body = req.body as {
    country?:      string;
    billingCycle?: 'monthly' | 'yearly';
    plan?: string;
    email?:        string;
    firstName?:    string;
    lastName?:     string;
  };

  let country = body.country ?? '';
  const planName = body.plan ?? 'pro';
  if (!['pro', 'max'].includes(planName) || body.billingCycle && !['monthly', 'yearly'].includes(body.billingCycle)) {
    res.status(400).json({ error: 'invalid_checkout', message: 'Invalid plan or billing cycle' }); return;
  }
  const billingCycle = body.billingCycle ?? 'monthly';
  const email        = body.email ?? (req.headers['x-user-email'] as string) ?? '';

  try {
    const proPlan = await planService.getPlanByName(planName);
    if (!proPlan) {
      res.status(500).json({ error: 'internal_error', message: 'Pro plan not configured' });
      return;
    }

    country ||= proPlan.currency === 'LKR' ? 'LK' : 'US';
    const gateway = await selectGatewayAsync(country, proPlan.currency);
    if ((gateway === 'payhere' ? 'LKR' : 'USD') !== proPlan.currency) {
      res.status(409).json({ error: 'currency_provider_mismatch', message: 'Selected billing provider does not support the configured plan currency' }); return;
    }
    if(gateway==='payhere' && (!env.PAYHERE_MERCHANT_ID || !env.PAYHERE_MERCHANT_SECRET) || gateway==='paddle' && !env.PADDLE_API_KEY){res.status(503).json({error:'provider_unconfigured',message:'Payment provider sandbox credentials are required'});return;}
    if (gateway === 'payhere') {
      // ── PayHere path ─────────────────────────────────────────────────────
      const orderId = uuidv4();
      const amount = proPlan.prices.LKR[billingCycle];
      if (amount === null || amount <= 0) {
        res.status(503).json({ error: 'price_not_configured', message: 'An explicit LKR price is required for PayHere checkout' }); return;
      }
      await prisma.checkoutIntent.create({ data: {
        orderId, userId, planId: proPlan.id, billingCycle,
        amountMinor: Math.round(amount * 100), currency: 'LKR',
      } });

      const formData = buildCheckoutData({
        userId,
        planId:    proPlan.id,
        orderId,
        amount:    amount.toFixed(2),
        email,
        firstName: body.firstName,
        lastName:  body.lastName,
        billingCycle, planName,
      });

      res.json({
        gateway:      'payhere',
        checkout_url: PAYHERE_CHECKOUT_URL,
        form_data:    formData,
        message:      'POST the form_data fields to checkout_url',
      });
    } else {
      // ── Paddle path ──────────────────────────────────────────────────────
      const priceId = billingCycle === 'yearly'
        ? proPlan.paddlePriceYearlyId
        : proPlan.paddlePriceMonthlyId;

      if (!priceId) {
        res.status(500).json({
          error:   'configuration_error',
          message: 'Paddle price ID not configured for this billing cycle',
        });
        return;
      }

      const { checkoutUrl } = await createPaddleCheckout(userId, priceId, email, { amount: proPlan.prices.USD[billingCycle], billingCycle });
      res.json({ gateway: 'paddle', checkout_url: checkoutUrl });
    }
  } catch (err) {
    console.error('[payment] createCheckout error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to create checkout session' });
  }
}

// ─── POST /v1/payment/portal ──────────────────────────────────────────────────

/**
 * Returns a Paddle billing-portal URL. PayHere subscribers get a documented
 * `available: false` response (200) rather than an error, since PayHere has no
 * equivalent portal.
 */
export async function getBillingPortal(req: Request, res: Response): Promise<void> {
  const { userId } = req as AuthenticatedRequest;
  try {
    const result = await getPortalSession(userId);
    if (!result) {
      res.status(404).json({ error: 'not_found', message: 'No active subscription found' });
      return;
    }
    if (!result.available) {
      res.status(200).json({ portal_url: null, available: false, message: result.message });
      return;
    }
    res.json({ portal_url: result.portalUrl, available: true });
  } catch (err) {
    console.error('[payment] getBillingPortal error:', err);
    res.status(500).json({ error: 'portal_error', message: 'Failed to get billing portal' });
  }
}

// ─── GET /v1/payment/subscription ────────────────────────────────────────────

export async function getSubscription(req: Request, res: Response): Promise<void> {
  const { userId } = req as AuthenticatedRequest;
  try {
    const [sub,policy]=await Promise.all([subscriptionService.getSubscription(userId),getEntitlements(userId)]);
    res.json({subscription:sub,plan:policy.plan,entitlements:policy});
  } catch (err) {
    console.error('[payment] getSubscription error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve subscription' });
  }
}

// ─── POST /v1/payment/cancel ──────────────────────────────────────────────────

export async function cancelSubscription(req: Request, res: Response): Promise<void> {
  const { userId } = req as AuthenticatedRequest;
  try {
    const result = await subscriptionService.cancelSubscription(userId);
    res.json({ success: true, message: result.message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel subscription';
    res.status(400).json({ error: 'cancel_error', message });
  }
}

// ─── GET /v1/payment/invoices ─────────────────────────────────────────────────

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const { userId } = req as AuthenticatedRequest;
  const page  = Math.max(1, parseInt(req.query['page']  as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string) || 20));

  try {
    const result = await getUserInvoices(userId, page, limit);
    res.json(result);
  } catch (err) {
    console.error('[payment] listInvoices error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to retrieve invoices' });
  }
}

// ─── POST /v1/payment/coupon/validate ─────────────────────────────────────────

export async function validateCouponHandler(req: Request, res: Response): Promise<void> {
  const { code } = req.body as { code?: string };
  if (!code) {
    res.status(400).json({ error: 'bad_request', message: 'Coupon code is required' });
    return;
  }
  try {
    const result = await validateCoupon(code.trim().toUpperCase());
    if (!result.valid) {
      res.status(400).json({ error: 'invalid_coupon', message: result.error });
      return;
    }
    res.json({ valid: true, discountType: result.discountType, value: result.value });
  } catch (err) {
    console.error('[payment] validateCoupon error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Coupon validation failed' });
  }
}

// ─── POST /v1/payment/webhook/paddle ─────────────────────────────────────────

/**
 * Paddle webhook receiver. The Paddle-Signature has already been verified by
 * verifyPaddleWebhook middleware, which attached the parsed `req.paddleEvent`.
 * We ack fast (Paddle expects a quick 200) and process asynchronously via BullMQ.
 */
export async function paddleWebhook(req: Request, res: Response): Promise<void> {
  const event = (req as PaddleWebhookRequest).paddleEvent;

  const idempotencyKey = event.eventId ?? `paddle:${event.eventType}:${event.occurredAt}`;
  try {
    await enqueueWebhookJob(
    {
      gateway:   'paddle',
      eventId:   event.eventId,
      eventType: event.eventType,
      occurredAt: String(event.occurredAt),
      data:      event.data as unknown as Record<string, unknown>,
    },
    idempotencyKey,
    );
    res.status(200).json({ received: true });
  } catch {
    res.status(503).json({ error: 'queue_unavailable', message: 'Please retry this event' });
  }
}

// ─── POST /v1/payment/webhook/payhere ────────────────────────────────────────

/**
 * PayHere IPN receiver. The md5sig has already been verified by
 * verifyPayhereWebhook middleware. We ack fast and process via BullMQ.
 */
export async function payhereWebhook(req: Request, res: Response): Promise<void> {
  const payload = req.body as PayhereWebhookPayload;

  const idempotencyKey = `payhere:${payload.order_id}:${payload.status_code}`;
  try {
    await enqueueWebhookJob({ gateway: 'payhere', ...payload }, idempotencyKey);
    res.status(200).send('OK');
  } catch {
    res.status(503).json({ error: 'queue_unavailable', message: 'Please retry this event' });
  }
}

// ─── Payment Methods Controllers ─────────────────────────────────────────────

export async function listPaymentMethods(_req: Request, res: Response): Promise<void> {
  res.json({ methods: [], managedBy: 'provider', message: 'Use the provider billing portal to manage payment methods.' });
}

export async function addPaymentMethod(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: 'provider_managed_payment_methods', message: 'Manage payment methods in the provider billing portal. DocCraft does not accept or store card details.' });
}

export const deletePaymentMethod = addPaymentMethod;
export const setDefaultPaymentMethod = addPaymentMethod;

// ─── Admin-only endpoints (no user auth required — called server-side by admin-api) ──────────────

import { prisma } from '../db/prisma.js';

/**
 * GET /v1/admin/subscriptions
 * Returns all subscription records from the Prisma DB with plan details.
 * Called by admin-api only (not exposed to end users via gateway).
 */
export async function adminListSubscriptions(req: Request, res: Response): Promise<void> {
  try {
    const status = (req.query.status as string) || undefined;
    const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);

    const where = status ? { status: status as any } : {};

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({
      data: subscriptions.map((s) => ({
        id:                   s.id,
        user_id:              s.userId,
        plan_id:              s.planId,
        plan_name:            s.plan.name,
        gateway:              s.gateway,
        status:               s.status,
        paddle_sub_id:        s.paddleSubscriptionId,
        payhere_sub_id:       s.payhereSubscriptionId,
        current_period_start: s.currentPeriodStart,
        current_period_end:   s.currentPeriodEnd,
        created_at:           s.createdAt,
        updated_at:           s.updatedAt,
        ...subscriptionBillingFacts(s),
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[payment] adminListSubscriptions error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list subscriptions' });
  }
}

/**
 * GET /v1/admin/subscriptions/stats
 * Returns counts grouped by status for dashboard KPIs.
 */
export async function adminSubscriptionStats(req: Request, res: Response): Promise<void> {
  try {
    const grouped = await prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const stats: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      stats[g.status] = g._count._all;
      total += g._count._all;
    }

    res.json({
      total,
      active:    stats['active']    ?? 0,
      cancelled: stats['canceled']  ?? stats['cancelled']  ?? 0,
      past_due:  stats['past_due']  ?? 0,
      trialing:  stats['trialing']  ?? 0,
      paused:    stats['paused']    ?? 0,
    });
  } catch (err) {
    console.error('[payment] adminSubscriptionStats error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to get subscription stats' });
  }
}

/**
 * GET /v1/admin/invoices
 * Returns all billing invoices from the Prisma DB.
 */
export async function adminListInvoices(req: Request, res: Response): Promise<void> {
  try {
    const status = (req.query.status as string) || undefined;
    const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);

    const where = status ? { status: status as any } : {};

    const [invoices, total] = await Promise.all([
      prisma.billingInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.billingInvoice.count({ where }),
    ]);

    res.json({
      data: invoices.map((inv) => ({
        id:                  inv.id,
        user_id:             inv.userId,
        subscription_id:     inv.subscriptionId,
        gateway_invoice_id:  inv.gatewayInvoiceId,
        gateway:             inv.gateway,
        amount:              inv.amount,
        currency:            inv.currency,
        status:              inv.status,
        created_at:          inv.createdAt,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[payment] adminListInvoices error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list invoices' });
  }
}

/**
 * GET /v1/payment/admin/revenue
 * Returns MRR, ARR, and revenue summary from active subscriptions + paid invoices.
 */
export async function adminRevenueSummary(req: Request, res: Response): Promise<void> {
  const currency = String(req.query.currency || 'USD');
  if (!['USD','LKR'].includes(currency)) {res.status(400).json({error:'invalid_currency'});return;}
  try {
    const {summarizeRevenue}=await import('../services/revenue.service.js');
    const [subscriptions,cancelled,invoices,adjustments]=await Promise.all([
      prisma.subscription.findMany({where:{status:'active',currentPeriodEnd:{gt:new Date()}},include:{plan:true}}),
      prisma.subscription.count({where:{status:{in:['canceled','cancelled']}}}),
      prisma.billingInvoice.findMany({where:{status:{in:['paid','refunded']}},select:{id:true,currency:true,amount:true,status:true}}),
      prisma.billingAdjustment.findMany({select:{invoiceId:true,currency:true,amountMinor:true}}),
    ]);
    const summary=summarizeRevenue(subscriptions,invoices,adjustments), current=summary.by_currency[currency];
    const byPlan:Record<string,number>={};
    for(const sub of subscriptions)byPlan[sub.plan.name]=(byPlan[sub.plan.name]||0)+1;
    res.json({...current,...summary,currency,arpu:current.active_subscriptions?current.mrr/current.active_subscriptions:0,ltv:null,
      churn_rate:subscriptions.length+cancelled?cancelled/(subscriptions.length+cancelled):0,
      total_active_subscriptions:subscriptions.length,total_cancelled_subscriptions:cancelled,subscriptions_by_plan:byPlan});
  } catch {res.status(503).json({error:'revenue_unavailable'});}
}

/**
 * GET /v1/payment/admin/revenue/trajectory
 * Returns paid-invoice revenue grouped by calendar month for the last 12
 * months — the real MRR growth chart data source (no fabricated points).
 */
export async function adminRevenueTrajectory(req: Request, res: Response): Promise<void> {
  const currency=String(req.query.currency || 'USD');
  if(!['USD','LKR'].includes(currency)){res.status(400).json({error:'invalid_currency'});return;}
  try {
    const rows = await prisma.$queryRaw<Array<{ month: Date; total: number }>>`
      SELECT date_trunc('month', "paidAt") AS month, SUM("amount")::float AS total
      FROM billing_invoices
      WHERE status = 'paid' AND currency = ${currency} AND "paidAt" >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month ASC
    `;

    const trajectory = rows.map((r) => ({
      month: new Date(r.month).toLocaleString('en-US', { month: 'short' }),
      mrr:   Number(r.total) || 0,
    }));

    res.json({ trajectory, currency });
  } catch (err) {
    console.error('[payment] adminRevenueTrajectory error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to compute revenue trajectory' });
  }
}

function isConfigured(value: string | undefined): boolean {
  return Boolean(value) && !value!.toUpperCase().includes('REPLACE');
}

function last4(value: string | undefined): string | null {
  if (!isConfigured(value) || value!.length < 4) return null;
  return value!.slice(-4);
}

/**
 * GET /v1/payment/admin/keys/status
 * Reports whether this service's gateway secrets are configured, without
 * ever exposing the real values — used by the admin API-Keys status view.
 */
export function adminKeyStatus(req: Request, res: Response): void {


  res.json({
    keys: [
      {
        id: 'payhere',
        name: 'PayHere Merchant Secret',
        configured: isConfigured(env.PAYHERE_MERCHANT_SECRET),
        last4: last4(env.PAYHERE_MERCHANT_SECRET),
      },
      {
        id: 'paddle',
        name: 'Paddle API Secret Key',
        configured: isConfigured(env.PADDLE_API_KEY),
        last4: last4(env.PADDLE_API_KEY),
      },
    ],
  });
}

/**
 * GET /v1/payment/admin/failed-payments
 * Returns failed payment invoices.
 */
export async function adminFailedPayments(req: Request, res: Response): Promise<void> {
  try {
    const limit  = Math.min(Number(req.query['limit']  ?? 100), 500);
    const offset = Number(req.query['offset'] ?? 0);

    const [records, total] = await Promise.all([
      prisma.billingInvoice.findMany({
        where: { status: 'failed' }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
      }),
      prisma.billingInvoice.count({ where: { status: 'failed' } }),
    ]);

    res.json({
      data: records.map((inv) => ({
        id: inv.id, user_id: inv.userId, gateway: inv.gateway,
        gateway_invoice_id: inv.gatewayInvoiceId, amount: inv.amount,
        currency: inv.currency, failed_at: inv.createdAt,
      })),
      total, limit, offset,
    });
  } catch (err) {
    console.error('[payment] adminFailedPayments error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list failed payments' });
  }
}

/**
 * GET /v1/payment/admin/refunds
 * Returns refunded invoices with total refunded amount.
 */
export async function adminRefunds(req: Request, res: Response): Promise<void> {
  try {
    const limit  = Math.min(Number(req.query['limit']  ?? 100), 500);
    const offset = Number(req.query['offset'] ?? 0);

    const [records, total] = await Promise.all([
      prisma.billingInvoice.findMany({
        where: { status: 'refunded' }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
      }),
      prisma.billingInvoice.count({ where: { status: 'refunded' } }),
    ]);

    res.json({
      data: records.map((inv) => ({
        id: inv.id, user_id: inv.userId, gateway: inv.gateway,
        gateway_invoice_id: inv.gatewayInvoiceId, amount: inv.amount,
        currency: inv.currency, refunded_at: inv.createdAt,
      })),
      total,
      total_refunded_amount: records.reduce((s, r) => s + (r.amount ?? 0), 0),
      limit, offset,
    });
  } catch (err) {
    console.error('[payment] adminRefunds error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list refunds' });
  }
}

// ─── Admin — Coupons (source of truth: this service's own `coupons` table,        ───
// ─── the same table `validateCoupon`/`applyCoupon` check at real checkout) ──────

function mapCoupon(c: { id: string; code: string; discountType: string; value: number; expiresAt: Date; usageLimit: number | null; usageCount: number; createdAt: Date }) {
  return {
    id: c.id,
    code: c.code,
    discount_type: c.discountType,
    value: c.value,
    expires_at: c.expiresAt,
    usage_limit: c.usageLimit,
    usage_count: c.usageCount,
    is_expired: c.expiresAt < new Date(),
    created_at: c.createdAt,
  };
}

/** GET /v1/payment/admin/coupons — all non-deleted coupons (admin only) */
export async function adminListCoupons(_req: Request, res: Response): Promise<void> {
  try {
    const coupons = await prisma.coupon.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: coupons.map(mapCoupon) });
  } catch (err) {
    console.error('[payment] adminListCoupons error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list coupons' });
  }
}

/** POST /v1/payment/admin/coupons — create a coupon in the real checkout-validated table */
export async function adminCreateCoupon(req: Request, res: Response): Promise<void> {
  try {
    const { code, discount_type, value, expires_at, usage_limit } = req.body as {
      code?: string; discount_type?: 'percent' | 'fixed'; value?: number; expires_at?: string; usage_limit?: number;
    };
    if (!code || !discount_type || value === undefined || value === null || !expires_at) {
      res.status(400).json({ error: 'bad_request', message: 'code, discount_type, value, and expires_at are required' });
      return;
    }
    if (discount_type !== 'percent' && discount_type !== 'fixed') {
      res.status(400).json({ error: 'bad_request', message: "discount_type must be 'percent' or 'fixed'" });
      return;
    }
    const coupon = await prisma.coupon.create({
      data: {
        code: code.trim().toUpperCase(),
        discountType: discount_type,
        value,
        expiresAt: new Date(expires_at),
        usageLimit: usage_limit ?? null,
      },
    });
    res.status(201).json({ data: mapCoupon(coupon) });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'conflict', message: 'A coupon with this code already exists' });
      return;
    }
    console.error('[payment] adminCreateCoupon error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to create coupon' });
  }
}

/** POST /v1/payment/admin/coupons/:id/archive — soft-delete a coupon (admin only) */
export async function adminArchiveCoupon(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const coupon = await prisma.coupon.update({
      where: { id },
      data: { deletedAt: new Date() },
    }).catch(() => null);
    if (!coupon) {
      res.status(404).json({ error: 'not_found', message: `Coupon '${id}' not found` });
      return;
    }
    res.json({ data: mapCoupon(coupon) });
  } catch (err) {
    console.error('[payment] adminArchiveCoupon error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to archive coupon' });
  }
}

// ─── Admin — Trial Management ────────────────────────────────────────────────
// Reuses the existing Subscription model (status: 'trialing', gateway: 'trial')
// rather than a new table — currentPeriodStart/End already mean exactly
// "the trial window" for a trialing subscription, so no schema change is needed.
// Note: nothing here auto-expires a trial when currentPeriodEnd passes — there
// is no scheduled job in this codebase yet. An expired trial is flagged
// (`is_expired: true`) for an admin to act on via Extend or End.

function mapTrial(t: { id: string; userId: string; currentPeriodStart: Date; currentPeriodEnd: Date; status: string; plan: { name: string } }) {
  return {
    id: t.id,
    user_id: t.userId,
    plan: t.plan.name,
    status: t.status,
    started_at: t.currentPeriodStart,
    expires_at: t.currentPeriodEnd,
    is_expired: t.currentPeriodEnd < new Date(),
  };
}

/** GET /v1/payment/admin/trials — all trialing subscriptions (admin only) */
export async function adminListTrials(_req: Request, res: Response): Promise<void> {
  try {
    const trials = await prisma.subscription.findMany({
      where: { status: 'trialing' },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'asc' },
    });
    res.json({ data: trials.map(mapTrial) });
  } catch (err) {
    console.error('[payment] adminListTrials error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to list trials' });
  }
}

/** POST /v1/payment/admin/trials — start (or restart) a trial for a user (admin only) */
export async function adminStartTrial(req: Request, res: Response): Promise<void> {
  try {
    const { user_id, plan: planName, days } = req.body as { user_id?: string; plan?: string; days?: number };
    if (!user_id || !planName || !days || days <= 0) {
      res.status(400).json({ error: 'bad_request', message: 'user_id, plan, and a positive days value are required' });
      return;
    }
    const plan = await prisma.plan.findUnique({ where: { name: planName } });
    if (!plan) {
      res.status(404).json({ error: 'not_found', message: `Plan '${planName}' not found` });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 86_400_000);

    const trial = await prisma.subscription.upsert({
      where: { userId: user_id },
      create: {
        userId: user_id, planId: plan.id, gateway: 'trial', status: 'trialing',
        currentPeriodStart: now, currentPeriodEnd: expiresAt,
      },
      update: {
        planId: plan.id, gateway: 'trial', status: 'trialing',
        currentPeriodStart: now, currentPeriodEnd: expiresAt, cancelledAt: null,
      },
      include: { plan: true },
    });
    res.status(201).json({ data: mapTrial(trial) });
  } catch (err) {
    console.error('[payment] adminStartTrial error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to start trial' });
  }
}

/** PATCH /v1/payment/admin/trials/:id/extend — push a trial's expiry forward (admin only) */
export async function adminExtendTrial(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { days } = req.body as { days?: number };
    if (!days || days <= 0) {
      res.status(400).json({ error: 'bad_request', message: 'A positive days value is required' });
      return;
    }
    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing || existing.status !== 'trialing') {
      res.status(404).json({ error: 'not_found', message: `Trial '${id}' not found` });
      return;
    }
    const base = existing.currentPeriodEnd > new Date() ? existing.currentPeriodEnd : new Date();
    const newExpiry = new Date(base.getTime() + days * 86_400_000);
    const updated = await prisma.subscription.update({
      where: { id },
      data: { currentPeriodEnd: newExpiry },
      include: { plan: true },
    });
    res.json({ data: mapTrial(updated) });
  } catch (err) {
    console.error('[payment] adminExtendTrial error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to extend trial' });
  }
}

/** POST /v1/payment/admin/trials/:id/end — end a trial immediately (admin only) */
export async function adminEndTrial(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing || existing.status !== 'trialing') {
      res.status(404).json({ error: 'not_found', message: `Trial '${id}' not found` });
      return;
    }
    const updated = await prisma.subscription.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() },
      include: { plan: true },
    });
    res.json({ data: mapTrial(updated) });
  } catch (err) {
    console.error('[payment] adminEndTrial error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to end trial' });
  }
}
