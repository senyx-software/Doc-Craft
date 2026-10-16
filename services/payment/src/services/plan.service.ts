/** Admin configuration is authoritative for benefits and currency-specific prices. */
import {serviceFetch} from '../../../../shared/service-auth.mjs';
import { prisma } from '../db/prisma.js';
import { paymentConfigClient } from './paymentConfigClient.service.js';

export interface PlanFeatures {
  windowHours?:number;
  documentsPerDay: number | 'unlimited';
  watermark: boolean;
  customLogo: boolean;
  allTemplates: boolean;
  priorityQueue: boolean;
  shareLinkMaxDays: number;
}
interface PlanConfig {
  name?: string; description?: string; status?: string; monthly_quota?: number; billing_currency?: 'USD' | 'LKR';
  price_usd_monthly?: number; price_usd_yearly?: number;
  price_lkr_monthly?: number; price_lkr_yearly?: number;
  paddle_price_id?: string; paddle_price_yearly_id?: string;
  feature_flags?: Record<string, unknown>;
}
interface StoredPlan { id: string; name: string; paddlePriceMonthlyId?: string | null; paddlePriceYearlyId?: string | null }
function money(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}
export function configuredPlan(stored: StoredPlan, config: PlanConfig) {
  const flags = config.feature_flags || {};
  const quota = typeof config.monthly_quota === 'number' ? config.monthly_quota : 0;
  const boolean = (key: string, fallback = false) => typeof flags[key] === 'boolean' ? flags[key] as boolean : fallback;
  const features: PlanFeatures = {
    documentsPerDay: quota === -1 ? 'unlimited' : quota,
    watermark: boolean('watermark', !boolean('watermark_removal')),
    customLogo: boolean('customLogo'),
    allTemplates: boolean('allTemplates'),
    priorityQueue: boolean('priority_pdf_rendering', boolean('priorityQueue')),
    shareLinkMaxDays: typeof flags.shareLinkMaxDays === 'number' ? flags.shareLinkMaxDays : 7,
  };
  return {
    ...stored, displayName: config.name || stored.name, description: config.description || '',
    currency: config.billing_currency || 'USD',
    priceMonthly: money(config.billing_currency === 'LKR' ? config.price_lkr_monthly : config.price_usd_monthly),
    priceYearly: money(config.billing_currency === 'LKR' ? config.price_lkr_yearly : config.price_usd_yearly),
    prices: {
      USD: { monthly: money(config.price_usd_monthly), yearly: money(config.price_usd_yearly) },
      LKR: { monthly: money(config.price_lkr_monthly), yearly: money(config.price_lkr_yearly) },
    },
    paddlePriceMonthlyId: config.paddle_price_id || stored.paddlePriceMonthlyId || null,
    paddlePriceYearlyId: config.paddle_price_yearly_id || stored.paddlePriceYearlyId || null,
    features,
  };
}

/** Physical payment rows provide stable subscription foreign keys; no restart resets benefits. */
export async function seedPlans(): Promise<void> {
  for (const name of ['free', 'pro', 'max']) {
    await prisma.plan.upsert({ where: { name }, create: { name, features: {} }, update: {} });
  }
}
export async function listPlans() {
  const configs = await paymentConfigClient.getPlansConfig();
  if (!Object.keys(configs).length) throw new Error('Authoritative plan configuration unavailable');
  const response=await serviceFetch('admin-api',`${process.env.ADMIN_API_SERVICE_URL || 'http://localhost:3018'}/api/v1/internal/entitlement-plans`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Plan policy unavailable');
  const policies=await response.json() as Record<string,any>;
  const stored = await prisma.plan.findMany({ orderBy: { name: 'asc' } });
  return stored.filter(plan => configs[plan.name] && (!configs[plan.name].status || configs[plan.name].status === 'active'))
    .map(plan => {
      const result=configuredPlan(plan,configs[plan.name]),policy=policies[plan.name];
      if(!policy || policy.version!==1)throw new Error('Invalid plan policy');
      return {...result,features:{...result.features,documentsPerDay:policy.daily_quota===-1?'unlimited' as const:policy.daily_quota,
        windowHours:policy.quota_policy.window_hours,watermark:policy.pdf_watermark,customLogo:policy.custom_logo,allTemplates:policy.premium_templates,priorityQueue:policy.priority_processing}};
    });
}
export async function getPlanByName(name: string) {
  const config = await paymentConfigClient.getPlan(name);
  if (!config || config.status && config.status !== 'active') return null;
  const stored = await prisma.plan.findUnique({ where: { name } });
  return stored ? configuredPlan(stored, config) : null;
}
export async function getPlanByPaddleMonthlyPrice(priceId: string) {
  const plans = await listPlans();
  const matches = plans.filter(plan => plan.paddlePriceMonthlyId === priceId);
  if (matches.length > 1) throw new Error('Ambiguous provider price mapping');
  return matches[0] || null;
}
export async function getPlanByPaddleYearlyPrice(priceId: string) {
  const plans = await listPlans();
  const matches = plans.filter(plan => plan.paddlePriceYearlyId === priceId);
  if (matches.length > 1) throw new Error('Ambiguous provider price mapping');
  return matches[0] || null;
}
