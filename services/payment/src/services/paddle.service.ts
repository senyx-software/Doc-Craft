/**
 * paddle.service.ts — Paddle integration (non-Sri-Lankan customers).
 *
 * Responsibilities:
 *   - Paddle checkout session creation
 *   - Paddle customer portal sessions (with graceful PayHere handling)
 *   - Webhook signature verification (Paddle-Signature, HMAC-SHA256 via SDK)
 *   - Event mapping: normalise Paddle events into DocCraft subscription actions
 *
 * Persistence and downstream sync (quota + notifications) live in
 * subscription.service.ts; this module only owns the Paddle-specific logic.
 */

import type { EventEntity } from '@paddle/paddle-node-sdk';
import { paddle } from './paddle.client.js';
import { paymentTransaction } from '../db/transaction-context.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import {
  getPlanByPaddleMonthlyPrice,
  getPlanByPaddleYearlyPrice,
} from './plan.service.js';
import {
  isAlreadyProcessed,
  markProcessed,
  activateProSubscription,
  downgradeToFree,
  upsertInvoice,
  syncPlanEntitlements,
  queueNotification,
  emitAutomationEvent,
  trackProductEvent,
} from './subscription.service.js';

export { paddle };

// ─── Checkout ──────────────────────────────────────────────────────────────────

export interface CheckoutSessionResult {
  checkoutUrl: string;
  gateway: 'paddle';
}

/**
 * createPaddleCheckout — creates a Paddle checkout session for the given price
 * ID and returns the hosted checkout URL.
 */
export async function createPaddleCheckout(
  userId: string,
  priceId: string,
  _email: string,
  expected?: { amount: number | null; billingCycle: 'monthly' | 'yearly' },
): Promise<CheckoutSessionResult> {
  if (expected) {
    if (expected.amount === null || expected.amount <= 0) throw new Error('An explicit USD price is required');
    const price = await paddle.prices.get(priceId);
    const interval = expected.billingCycle === 'yearly' ? 'year' : 'month';
    if (price.unitPrice.currencyCode !== 'USD' || price.unitPrice.amount !== String(Math.round(expected.amount * 100)) || price.billingCycle?.interval !== interval || price.billingCycle.frequency !== 1 || price.status !== 'active') {
      throw new Error('Provider price does not match the configured currency, amount, or billing cycle');
    }
  }
  const transaction = await paddle.transactions.create({
    items: [{ priceId, quantity: 1 }],
    customData: { userId },
  });

  const checkoutUrl = transaction.checkout?.url;
  if (!checkoutUrl) {
    throw new Error('Paddle did not return a checkout URL');
  }

  return { checkoutUrl, gateway: 'paddle' };
}

// ─── Billing portal ─────────────────────────────────────────────────────────────

export interface PortalSessionResult {
  available: boolean;
  portalUrl?: string;
  message?: string;
}

/**
 * getPortalSession — returns a Paddle customer portal URL for self-service
 * billing management.
 *
 * PayHere has no equivalent portal, so PayHere subscribers get a clear
 * `available: false` response rather than an error. Returns null when the user
 * has no subscription at all (caller maps that to 404).
 */
export async function getPortalSession(userId: string): Promise<PortalSessionResult | null> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return null;

  if (sub.gateway === 'payhere') {
    return {
      available: false,
      message:
        'A self-service billing portal is not available for PayHere subscriptions. ' +
        'Please manage your subscription through your PayHere account.',
    };
  }

  if (!sub.paddleCustomerId) return null;

  const session = await paddle.customerPortalSessions.create(
    sub.paddleCustomerId,
    sub.paddleSubscriptionId ? [sub.paddleSubscriptionId] : [],
  );

  return { available: true, portalUrl: session.urls.general.overview };
}

// ─── Signature verification ──────────────────────────────────────────────────

/**
 * verifyPaddleSignature — verifies a raw webhook body against the
 * Paddle-Signature header using the official SDK. Returns the parsed event on
 * success, or null when verification fails.
 */
export async function verifyPaddleSignature(
  rawBody: string,
  signature: string,
): Promise<EventEntity | null> {
  return paddle.webhooks.unmarshal(rawBody, env.PADDLE_WEBHOOK_SECRET, signature);
}

// ─── Event mapping ──────────────────────────────────────────────────────────────

/**
 * processPaddleEvent — maps a verified Paddle event to DocCraft actions.
 * Idempotent: duplicate event IDs are skipped.
 *
 * Event → action (per tech spec section 10.6):
 *   transaction.completed / subscription.activated → activate, welcome email
 *   subscription.updated                           → update plan/period, resync quota
 *   invoice.payment_succeeded                      → renew, reset quota, renewal email
 *   subscription.past_due / invoice.payment_failed → mark past_due, failed email
 *   subscription.cancelled                         → downgrade to free, cancellation email
 */
export async function processPaddleEvent(event: {
  eventId:   string;
  eventType: string;
  data:      Record<string, unknown>;
  occurredAt?: string;
}): Promise<void> {
  const { eventId, eventType, data } = event;

  if (await isAlreadyProcessed(eventId)) {
    console.log(`[payment/paddle] Skipping duplicate event: ${eventId}`);
    return;
  }

  const subscriptionId = (eventType.startsWith('subscription.') ? data.id : data.subscriptionId ?? data.subscription_id) as string|undefined;
  let staleState=false;
  if(paymentTransaction.getStore() && subscriptionId) {
    const occurredAt=new Date(event.occurredAt||'');
    if(!Number.isFinite(occurredAt.getTime())) throw new Error('Missing signed provider occurrence time');
    const key='paddle:'+subscriptionId;
    const cursor=await prisma.providerCursor.findUnique({where:{id:key}});
    if(cursor && cursor.occurredAt.getTime()===occurredAt.getTime() && cursor.eventId!==eventId) throw new Error('Ambiguous provider event ordering; reconcile with provider snapshot');
    staleState=!!cursor && cursor.occurredAt>occurredAt;
    if(!staleState)await prisma.providerCursor.upsert({where:{id:key},create:{id:key,occurredAt,eventId},update:{occurredAt,eventId}});
    if(staleState && !eventType.startsWith('transaction.')) {await markProcessed(eventId,'paddle',eventType);return;}
  }
  console.log(`[payment/paddle] Processing event: ${eventType} (${eventId})`);

  switch (eventType) {
    // ─── ACTIVATION: first successful checkout ─────────────────────────────
    case 'transaction.completed':
    case 'subscription.activated': {
      const customData = (data.customData ?? data.custom_data) as Record<string, string> | undefined;
      const userId = customData?.userId;
      if (!userId) break;

      const items = data.items as Array<{ price: { id: string } }> | undefined;
      const priceId = items?.[0]?.price?.id;
      if (!priceId) break;

      const plan =
        (await getPlanByPaddleMonthlyPrice(priceId)) ??
        (await getPlanByPaddleYearlyPrice(priceId));
      if (!plan) {
        console.warn(`[payment/paddle] No plan found for priceId: ${priceId}`);
        break;
      }

      const paddleSubId = subscriptionId;
      const customerId=(data.customerId ?? data.customer_id) as string|undefined;
      const transactionId=eventType==='transaction.completed'?data.id as string:undefined;
      const period=(data.currentBillingPeriod ?? data.current_billing_period ?? data.billingPeriod ?? data.billing_period) as any;
      const now=new Date(period?.startsAt ?? period?.starts_at ?? '');
      const periodEnd=new Date(period?.endsAt ?? period?.ends_at ?? '');
      if(!Number.isFinite(now.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodEnd<=now)throw new Error('Valid provider billing period is required');
      const isYearly=plan.paddlePriceYearlyId===priceId;

      if(!staleState)await activateProSubscription({
        userId,
        planId:               plan.id,
        planName:             plan.name,
        gateway:              'paddle',
        paddleCustomerId:     customerId,
        paddleSubscriptionId: paddleSubId,
        periodStart:          now,
        periodEnd,
        ...(Number.isSafeInteger(Number((data.details as any)?.totals?.total)) && (data.details as any)?.totals?.total !== undefined ? {
          billingAmountMinor: Number((data.details as any).totals.total),
          billingCurrency: String(data.currencyCode ?? data.currency_code ?? ''),
          billingCycle: isYearly ? 'yearly' as const : 'monthly' as const,
        } : {}),
      });

      // Record invoice for the first charge
      if (transactionId) {
        const details  = data.details as { totals?: { total?: string; currencyCode?: string } } | undefined;
        const amount   = parseFloat(details?.totals?.total ?? '0') / 100; // Paddle amounts are in cents
        const currency = String(data.currencyCode ?? data.currency_code ?? '');
        if(!['USD','LKR'].includes(currency) || !Number.isFinite(amount) || amount<0)throw new Error('Invalid invoice amount/currency');
        const sub = await prisma.subscription.findUnique({ where: { userId } });
        if (sub) {
          await upsertInvoice({
            userId, subscriptionId: sub.id, gatewayInvoiceId: transactionId,
            gateway: 'paddle', amount, currency, status: 'paid', paidAt: new Date(),
          });
        }
      }

      await trackProductEvent(userId, 'subscription_activated', { gateway: 'paddle', plan: plan.name, billing_cycle: isYearly ? 'yearly' : 'monthly' });

      await queueNotification(userId, 'welcome');
      break;
    }

    // ─── PLAN UPDATE: upgrade/downgrade or billing period change ────────────
    case 'subscription.updated': {
      const paddleSubId = data.id as string | undefined;
      if (!paddleSubId) break;

      const sub = await prisma.subscription.findFirst({
        where: { paddleSubscriptionId: paddleSubId },
      });
      if (!sub) throw new Error('Subscription predecessor not yet reconciled');

      const currentBillingPeriod = (data.currentBillingPeriod ?? data.current_billing_period) as {
        startsAt: string; endsAt: string;
      } | undefined;

      const updatedItems=data.items as Array<{price:{id:string}}> | undefined;
      const updatedPrice=updatedItems?.[0]?.price?.id;
      const updatedPlan=updatedPrice ? (await getPlanByPaddleMonthlyPrice(updatedPrice)) ?? (await getPlanByPaddleYearlyPrice(updatedPrice)) : null;
      if(updatedPrice && !updatedPlan)throw new Error('Unknown provider plan price');
      if (currentBillingPeriod) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data:  {
            status:             typeof data.status==='string'?data.status:'active',
            ...(updatedPlan?{planId:updatedPlan.id,billingCycle:updatedPlan.paddlePriceYearlyId===updatedPrice?'yearly':'monthly'}:{}),
            currentPeriodStart: new Date(currentBillingPeriod.startsAt ?? (currentBillingPeriod as any).starts_at),
            currentPeriodEnd:   new Date(currentBillingPeriod.endsAt ?? (currentBillingPeriod as any).ends_at),
            updatedAt:          new Date(),
          },
        });
      }

      const currentPlan = await prisma.plan.findUnique({ where: { id: updatedPlan?.id || sub.planId } });
      if (!currentPlan) throw new Error('Subscription plan is unavailable');
      await syncPlanEntitlements(sub.userId, currentPlan.name);
      break;
    }

    // ─── RENEWAL: successful recurring charge ───────────────────────────────
    case 'invoice.payment_succeeded': {
      const paddleSubId   = (data.subscriptionId ?? data.subscription_id) as string | undefined;
      const transactionId = (data.id ?? data.transactionId) as string | undefined;
      if (!paddleSubId) break;

      const sub = await prisma.subscription.findFirst({
        where: { paddleSubscriptionId: paddleSubId },
      });
      if (!sub) throw new Error('Subscription predecessor not yet reconciled');

      const currentBillingPeriod = data.billingPeriod as {
        startsAt: string; endsAt: string;
      } | undefined;

      await prisma.subscription.update({
        where: { id: sub.id },
        data:  {
          status:             'active',
          currentPeriodStart: currentBillingPeriod ? new Date(currentBillingPeriod.startsAt) : undefined,
          currentPeriodEnd:   currentBillingPeriod ? new Date(currentBillingPeriod.endsAt ?? (currentBillingPeriod as any).ends_at) : undefined,
          cancelAtPeriodEnd:  false,
          updatedAt:          new Date(),
        },
      });

      if (transactionId) {
        const details  = data.details as { totals?: { total?: string; currencyCode?: string } } | undefined;
        const amount   = parseFloat(details?.totals?.total ?? '0') / 100;
        const currency = String(data.currencyCode ?? data.currency_code ?? '');
        if(!['USD','LKR'].includes(currency) || !Number.isFinite(amount) || amount<0)throw new Error('Invalid invoice amount/currency');
        await upsertInvoice({
          userId: sub.userId, subscriptionId: sub.id, gatewayInvoiceId: transactionId,
          gateway: 'paddle', amount, currency, status: 'paid', paidAt: new Date(),
        });
      }

      // Billing cadence does not reset the daily AI/PDF allowance.
      await queueNotification(sub.userId, 'renewal');
      break;
    }

    case 'adjustment.created':
    case 'adjustment.updated': {
      if(data.action!=='refund' || data.status!=='approved')break;
      const transactionId=String(data.transactionId ?? data.transaction_id ?? '');
      const invoice=await prisma.billingInvoice.findUnique({where:{gatewayInvoiceId:transactionId}});
      if(!invoice)throw new Error('Refund invoice predecessor not yet reconciled');
      const totals=data.totals as any;
      const minor=Number(totals?.total);
      if(!Number.isSafeInteger(minor)||minor<0||String(data.currencyCode ?? data.currency_code)!==invoice.currency)throw new Error('Invalid refund amount/currency');
      await prisma.billingAdjustment.upsert({where:{providerId:String(data.id)},create:{providerId:String(data.id),invoiceId:invoice.id,amountMinor:minor,currency:invoice.currency},update:{}});
      const refunds=await prisma.billingAdjustment.aggregate({where:{invoiceId:invoice.id},_sum:{amountMinor:true}});
      if((refunds._sum.amountMinor||0)>=Math.round(invoice.amount*100))await prisma.billingInvoice.update({where:{id:invoice.id},data:{status:'refunded'}});
      break;
    }
    // ─── PAYMENT FAILED ─────────────────────────────────────────────────────
    case 'subscription.past_due':
    case 'invoice.payment_failed': {
      const paddleSubId = (data.subscriptionId ?? data.subscription_id ?? data.id) as string | undefined;
      if (!paddleSubId) break;

      const sub = await prisma.subscription.findFirst({
        where: { paddleSubscriptionId: paddleSubId },
      });
      if (!sub) throw new Error('Subscription predecessor not yet reconciled');

      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { status: 'past_due', updatedAt: new Date() },
      });

      // The admin-configurable automation engine owns this notification (see
      // rule_payment_failed_alert) — Paddle/PayHere stay authoritative for the
      // payment event itself, but its downstream reaction is Admin-managed.
      await emitAutomationEvent('payment.failed', { user_id: sub.userId, gateway: 'paddle', subscription_id: sub.id });
      await trackProductEvent(sub.userId, 'payment_failed', { gateway: 'paddle' });
      break;
    }

    // ─── CANCELLATION ───────────────────────────────────────────────────────
    case 'subscription.canceled':
    case 'subscription.cancelled': {
      const paddleSubId = data.id as string | undefined;
      if (!paddleSubId) break;

      const sub = await prisma.subscription.findFirst({
        where: { paddleSubscriptionId: paddleSubId },
      });
      if (!sub) throw new Error('Subscription predecessor not yet reconciled');

      // Quota reset stays a direct call — account-state correctness can't
      // depend on the automation engine/Redis being healthy. The cancellation
      // email is the admin-configurable side effect (rule_subscription_cancelled).
      await downgradeToFree(sub.userId);
      await emitAutomationEvent('subscription.cancelled', { user_id: sub.userId, gateway: 'paddle', subscription_id: sub.id });
      await trackProductEvent(sub.userId, 'subscription_cancelled', { gateway: 'paddle' });
      break;
    }

    default:
      console.log(`[payment/paddle] Unhandled event type: ${eventType}`);
  }

  await markProcessed(eventId, 'paddle', eventType);
}
