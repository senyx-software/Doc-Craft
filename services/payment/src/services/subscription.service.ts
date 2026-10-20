import {deferPaymentEffect} from './payment-outbox.service.js';
import {paymentTransaction} from '../db/transaction-context.js';
import { serviceFetch } from '../../../../shared/service-auth.mjs';
import {randomUUID} from 'node:crypto';
/**
 * subscription.service.ts — persistence layer for the payment domain.
 *
 * This service owns all Postgres reads/writes for Subscription and
 * BillingInvoice, the webhook idempotency store, and the downstream sync
 * side-effects (quota service + notification service) that both gateways
 * share once an event has been verified.
 *
 * It is gateway-agnostic: paddle.service.ts and payhere.service.ts call into
 * the helpers here after they have normalised a gateway event into a DocCraft
 * action. It imports the Paddle client only for the cancellation API call
 * (from the leaf paddle.client.ts, so there is no circular dependency).
 */

import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { paddle } from './paddle.client.js';
import { paymentConfigClient } from './paymentConfigClient.service.js';

/**
 * Billing automation is deferred in the reducer transaction. Dispatch only
 * acknowledges a durable Admin inbox receipt, using a stable outbox identity.
 */
export async function emitAutomationEvent(event: string, payload: Record<string, unknown>,deliveryId?:string): Promise<void> {
  if(await deferPaymentEffect('automation',{event,payload}))return;
  try {
    const response=await serviceFetch('admin-api',`${env.ADMIN_API_SERVICE_URL}/api/v1/internal/automation/events`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delivery_id:deliveryId||randomUUID(),event,payload}),signal:AbortSignal.timeout(5000),
    });
    if(!response.ok)throw new Error('Automation durable intake unavailable');
    const receipt=await response.json() as {durably_accepted?:boolean};
    if(receipt.durably_accepted!==true)throw new Error('Automation receipt missing');
  } catch (err) {
    throw new Error('Automation delivery unavailable');
  }
}

/**
 * trackProductEvent — reports a real billing lifecycle event to PostHog via
 * the Analytics Service's /v1/analytics/event endpoint (the one place that
 * holds the real API key; payment never talks to PostHog directly). Separate
 * from emitAutomationEvent above: that one drives the Admin Automation
 * Engine, this one is purely for the product-analytics dashboard. Both are
 * fire-and-forget — neither may affect webhook processing.
 */
export async function trackProductEvent(userId:string,eventName:string,properties:Record<string,unknown>):Promise<void> {
  if(await deferPaymentEffect('analytics',{userId,eventName,properties}))return;
  try {await deliverProductEvent(userId,eventName,properties);} catch {console.warn('[payment] Analytics delivery unavailable');}
}
export async function deliverProductEvent(userId:string,eventName:string,properties:Record<string,unknown>):Promise<void> {
  const response=await serviceFetch('analytics',`${env.ANALYTICS_SERVICE_URL}/v1/analytics/event`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,eventName,properties}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Analytics delivery unavailable');
}

/**
 * resolvePlanQuota — the Admin-managed daily generation cap for a plan code
 * (the `monthly_quota` field name is kept for wire compatibility with
 * admin-api/Quota Service, while reset semantics come from current policy), via the same config-client path the Quota Service itself reads
 * (config:domain:plans / quota:plan:{code}). The active quota ledger uses the
 * approved first-use rolling window. Never hardcodes a business
 * number here: if the plan isn't resolvable at all, returns 0 so a broken
 * lookup fails loudly (denied generations) rather than silently granting or
 * revoking access.
 */
async function resolvePlanQuota(planCode: string): Promise<number> {
  const plan = await paymentConfigClient.getPlan(planCode);
  const quota = plan?.monthly_quota;
  if (typeof quota !== 'number') {
    console.warn(`[payment] No Admin-managed monthly_quota resolved for plan '${planCode}' — defaulting to 0`);
    throw new Error('Plan quota configuration unavailable');
  }
  return quota;
}

// ─── Downstream HTTP helpers ──────────────────────────────────────────────────

export async function callQuotaReset(userId: string): Promise<void> {
    const response = await serviceFetch('quota', `${env.QUOTA_SERVICE_URL}/v1/quota/reset`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify({ userId }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Quota reset failed');
}

export async function callQuotaOverride(userId: string, overrideLimit: number): Promise<void> {
    const response = await serviceFetch('quota', `${env.QUOTA_SERVICE_URL}/v1/quota/override`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
      },
      signal: AbortSignal.timeout(5000), body: JSON.stringify({
        userId,
        overrideLimit,
        reason:  'Automatic plan change from payment webhook',
        adminId: 'system',
      }),
    });
    if (!response.ok) throw new Error('Quota override failed');
}

export async function syncPlanEntitlements(userId: string, planName: string): Promise<void> {
  if(await deferPaymentEffect('entitlements',{userId,planName}))return;
  await resolvePlanQuota(planName);
  const response = await serviceFetch('auth', `${env.AUTH_SERVICE_URL}/internal/users/${encodeURIComponent(userId)}/plan`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET },
    body: JSON.stringify({ plan: planName }), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Account plan synchronization failed');
  const synced = await serviceFetch('quota', `${env.QUOTA_SERVICE_URL}/v1/quota/plan/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET },
    body: JSON.stringify({ userId, plan: planName }), signal: AbortSignal.timeout(5000),
  });
  if (!synced.ok) throw new Error('Quota plan synchronization failed');
}

export async function queueNotification(
  userId: string,
  type: 'welcome' | 'renewal' | 'payment_failed' | 'cancellation',
  idempotencyKey?:string,
): Promise<void> {
  if(await deferPaymentEffect('notification',{userId,type}))return;
  try {
    const userResponse = await serviceFetch('auth', `${env.AUTH_SERVICE_URL}/internal/users/${encodeURIComponent(userId)}`, {
      headers: { 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET }, signal: AbortSignal.timeout(5000),
    });
    if (!userResponse.ok) throw new Error('Notification recipient unavailable');
    const user = await userResponse.json() as { email?: string; fullName?: string };
    if (!user.email) throw new Error('Notification recipient unavailable');
    const response = await serviceFetch('notification', `${env.NOTIFICATION_SERVICE_URL}/notification/send`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify({ userId, type, idempotencyKey, email: user.email, payload: { userId, email: user.email, fullName: user.fullName } }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Notification queue unavailable');
  } catch (err) {
    throw new Error('Notification delivery unavailable');
  }
}

// ─── Idempotency store ─────────────────────────────────────────────────────────

export async function isAlreadyProcessed(eventId: string): Promise<boolean> {
  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
  return existing !== null;
}

export async function markProcessed(eventId: string, gateway: string, eventType: string): Promise<void> {
  await prisma.webhookEvent.create({ data: { eventId, gateway, eventType } });
}

// ─── Subscription writes (shared by both gateways) ─────────────────────────────

export async function activateProSubscription(params: {
  userId:                 string;
  planId:                 string;
  planName:               string; // e.g. 'pro' — used to resolve the Admin-managed quota
  gateway:                'paddle' | 'payhere';
  paddleCustomerId?:      string;
  paddleSubscriptionId?:  string;
  payhereSubscriptionId?: string;
  payhereOrderId?:        string;
  periodStart:            Date;
  periodEnd:              Date;
  billingAmountMinor?:    number;
  billingCurrency?:       string;
  billingCycle?:          'monthly' | 'yearly';
}): Promise<void> {
  const { userId, planId, planName, gateway, periodStart, periodEnd, ...ids } = params;

  await prisma.subscription.upsert({
    where:  { userId },
    create: {
      userId,
      planId,
      gateway,
      ...ids,
      status:             'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd:   periodEnd,
      cancelAtPeriodEnd:  false,
    },
    update: {
      planId,
      gateway,
      ...ids,
      status:             'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd:   periodEnd,
      cancelAtPeriodEnd:  false,
      updatedAt:          new Date(),
    },
  });

  await syncPlanEntitlements(userId, planName);
}

export async function downgradeToFree(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data:  { status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() },
  });
  await syncPlanEntitlements(userId, 'free');
}

/**
 * upsertInvoice — records a BillingInvoice row for either gateway.
 * Invoice persistence and its receipt outbox commit in the verified reducer.
 * A failed write must retry the event rather than acknowledge partial billing.
 */
export async function upsertInvoice(params: {
  userId:           string;
  subscriptionId:   string;
  gatewayInvoiceId: string;
  gateway:          'paddle' | 'payhere';
  amount:           number;
  currency:         string;
  status:           'paid' | 'open' | 'failed' | 'refunded';
  pdfUrl?:          string;
  paidAt?:          Date;
}): Promise<void> {
  try {
    if(params.status==='paid'&&!paymentTransaction.getStore())throw new Error('Verified payment transaction required');
    const invoice = await prisma.billingInvoice.upsert({
      where:  { gatewayInvoiceId: params.gatewayInvoiceId },
      create: {
        userId:           params.userId,
        subscriptionId:   params.subscriptionId,
        gatewayInvoiceId: params.gatewayInvoiceId,
        gateway:          params.gateway,
        amount:           params.amount,
        currency:         params.currency,
        status:           params.status,
        pdfUrl:           params.pdfUrl,
        paidAt:           params.paidAt,
      },
      update: { status: params.status, paidAt: params.paidAt },
    });
    if(invoice.status==='paid') {
      const payload={invoiceId:invoice.id,userId:invoice.userId,amount:invoice.amount,currency:invoice.currency,
        gateway:invoice.gateway,transactionReference:invoice.gatewayInvoiceId,paidAt:invoice.paidAt?.toISOString() || null};
      if(!await deferPaymentEffect('receipt',payload))throw new Error('Paid invoice receipt requires the verified payment transaction');
    }
  } catch (err) {
    console.error('[payment] Invoice persistence or receipt scheduling failed');
    throw err; // Queue retry must repair billing history before marking the event processed.
  }
}

/** Trusted invoice snapshot only; no checkout redirect or unsigned client fields. */
export async function deliverPaymentReceipt(data:Record<string,any>,idempotencyKey:string):Promise<void> {
  if(!Number.isFinite(data.amount)||data.amount<0||!/^[A-Z]{3}$/.test(data.currency)||!data.invoiceId||!data.userId||!data.email)throw new Error('Invalid payment receipt');
  const amountFormatted=new Intl.NumberFormat('en-US',{style:'currency',currency:data.currency,currencyDisplay:'code'}).format(data.amount);
  const response=await serviceFetch('notification',`${env.NOTIFICATION_SERVICE_URL}/notification/send`,{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),
    body:JSON.stringify({userId:data.userId,email:data.email,type:'payment_receipt',idempotencyKey,
      payload:{...data,amountFormatted}}),
  });
  if(!response.ok)throw new Error('Receipt delivery unavailable');
  const receipt=await response.json() as {status?:string;deliveryId?:string};
  if(!receipt.deliveryId||!['durably_accepted','completed'].includes(receipt.status||''))throw new Error('Durable receipt acknowledgement missing');
}

export async function resolveReceiptRecipient(userId:string):Promise<string> {
  const recipient=await serviceFetch('auth',`${env.AUTH_SERVICE_URL}/internal/users/${encodeURIComponent(userId)}`,{signal:AbortSignal.timeout(5000)});
  if(!recipient.ok)throw new Error('Receipt recipient unavailable');
  const user=await recipient.json() as {email?:string;fullName?:string};
  if(!user.email)throw new Error('Receipt recipient unavailable');
  return user.email;
}

// ─── Subscription reads / lifecycle ────────────────────────────────────────────

/** Access decisions need only plan and lifecycle fields, independent of billing metadata. */
export async function getSubscriptionPolicy(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: { select: { name: true } },
      status: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });
  return sub ? {
    plan: sub.plan.name,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  } : null;
}

/** getSubscription — the user's current subscription with its plan. */
export async function getSubscription(userId: string) {
  return prisma.subscription.findUnique({
    where:   { userId },
    include: { plan: true },
  });
}

/**
 * cancelSubscription — schedules cancellation at the end of the current
 * billing period after provider acknowledgement. Provider outages never
 * become a misleading local cancellation success.
 */
export async function cancelSubscription(userId: string): Promise<{ message: string }> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) throw new Error('No active subscription found');

  if (sub.gateway === 'paddle' && sub.paddleSubscriptionId) {
    await paddle.subscriptions.cancel(sub.paddleSubscriptionId, {
      effectiveFrom: 'next_billing_period',
    });
    await prisma.subscription.update({
      where: { userId },
      data:  { cancelAtPeriodEnd: true, updatedAt: new Date() },
    });
    return { message: 'Subscription will cancel at end of billing period' };
  }

  if (sub.gateway === 'payhere') {
    if(!sub.payhereOrderId)throw new Error('Trusted PayHere checkout identity is missing');
    const { cancelPayhereOrder }=await import('./payhere-reconciliation.service.js');
    await cancelPayhereOrder(sub.payhereOrderId);
    await prisma.subscription.update({where:{userId},data:{cancelAtPeriodEnd:true,updatedAt:new Date()}});
    return {message:'Provider cancellation confirmed; access continues until the paid period ends'};
  }

  throw new Error('Unknown payment gateway on subscription');
}
