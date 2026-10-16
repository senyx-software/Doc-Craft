import { serviceFetch } from '../../../../shared/service-auth.mjs';
/** Reads admin model policy; failed lookups stop provider calls instead of escalating. */

import { env } from "../config/env.js";
import { ALLOWED_MODELS, type ModelId } from "./model-router.service.js";

const CACHE_TTL_MS = 5_000;
const DEFAULT_MAX_MODEL: ModelId = "claude-sonnet-4-5";

type RoutingPolicy = { max_model?: string; groq_models?: string[] };
let cached: { data: Record<string, RoutingPolicy>; expiresAt: number } | null = null;

async function fetchRoutingConfig(): Promise<Record<string, RoutingPolicy>> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  try {
    const res = await serviceFetch('admin-api', `${env.ADMIN_API_SERVICE_URL}/api/v1/internal/config/ai_model_routing`, {
      headers: { 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`admin-api returned ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, RoutingPolicy> };
    const data = body.data || {};
    cached = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  } catch {
    throw Object.assign(new Error('AI model policy unavailable'), { code: 'PROVIDER_UNCONFIGURED', statusCode: 503, retryable: true });
  }
}

/** Provider fallback is restricted to the intersection of deployment and plan policy. */
export function resolveGroqModels(available: string[], configured?: string[]): string[] {
  if (configured === undefined) return [...available];
  if (!Array.isArray(configured) || configured.some(model => typeof model !== 'string')) return [];
  return available.filter(model => configured.includes(model));
}

export async function getGroqModelsForPlan(plan: string, available: string[]): Promise<string[]> {
  const policy = await fetchRoutingConfig();
  const allowed = resolveGroqModels(available, policy[plan]?.groq_models);
  if (!allowed.length) throw Object.assign(new Error('No configured AI model is allowed for this plan'), { code: 'PROVIDER_UNCONFIGURED', statusCode: 403, retryable: false });
  return allowed;
}

/** Resolve the most capable model a given plan is allowed to use. */
export async function getMaxModelForPlan(plan: string): Promise<ModelId> {
  const config = await fetchRoutingConfig();
  const maxModel = config[plan]?.max_model;
  if (maxModel && ALLOWED_MODELS.includes(maxModel as ModelId)) {
    return maxModel as ModelId;
  }
  return DEFAULT_MAX_MODEL;
}
