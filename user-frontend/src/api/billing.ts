/**
 * Billing / Subscription API endpoints
 * Maps to: GET /quota, GET /subscription, POST /billing/checkout, POST /billing/portal
 */

import { get } from './client';
import * as payment from './payment';
import type { Quota, Subscription, CheckoutResponse, PortalResponse } from '../types';

/** GET /quota/me — Get daily generation quota status */
export async function getQuota(): Promise<Quota> {
  // Quota service exposes GET /me (via /v1/quota/me through gateway)
  const res = await get<Record<string, unknown>>('/quota/me');
  // Fail closed (0), never guess a plausible-looking limit, if the backend
  // response is malformed and neither real field name is present — matches
  // the Quota Service's own "never fabricate a business quota value" policy
  // (see quotaConfigClient.service.ts). A fake "3" here previously masked a
  // real backend bug (a corrupted plan cache) as if quota were working fine.
  const limit = typeof res.limit === 'number' ? res.limit : (typeof res.daily_limit === 'number' ? res.daily_limit : 0);
  const used = typeof res.used === 'number' ? res.used : (typeof res.used_today === 'number' ? res.used_today : 0);
  const remaining = typeof res.remaining === 'number' ? res.remaining : Math.max(0, limit - used);

  return {
    plan:        (typeof res.plan === 'string' ? res.plan : 'free') as Quota['plan'],
    daily_limit: limit,
    used_today:  used,
    remaining:   remaining,
    resets_at:   (typeof res.resets_at === 'string' ? res.resets_at : new Date(new Date().setHours(24, 0, 0, 0)).toISOString()),
  };
}


/** GET /subscription — Get subscription status */
export async function getSubscription(): Promise<Subscription | null> {
  const { subscription, plan } = await payment.getSubscription();
  if (!subscription) return null;
  return {
    plan,
    status: subscription.status === 'cancelled' ? 'canceled' : subscription.status === 'past_due' ? 'past_due' : subscription.status === 'trialing' ? 'trialing' : 'active',
    current_period_end: subscription.currentPeriodEnd,
    stripe_customer_id: '',
  };
}

export function createCheckout(plan: 'pro_monthly' | 'pro_annual'): Promise<CheckoutResponse> {
  return payment.createCheckoutSession(plan === 'pro_annual' ? 'yearly' : 'monthly');
}

export async function createPortal(): Promise<PortalResponse> {
  const result = await payment.getBillingPortal();
  if (!result.available || !result.portal_url) throw new Error(result.message || 'Billing portal is unavailable');
  return { portal_url: result.portal_url };
}
