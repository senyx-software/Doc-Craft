import { serviceFetch } from '../../../../shared/service-auth.mjs';
/**
 * quotaClient.service.ts — gates a chat message against the Quota Service,
 * the same daily generation quota the Document Service enforces for actual
 * PDF generation. Each actual outbound AI provider request reserves one unit, so a plan's admin-configured limit
 * (see admin-api's `plans` table / the Quota Service's `quota:plan:{code}`)
 * caps chat usage too, not just document generation.
 *
 * `/v1/quota/check` is a check-AND-reserve: a 200 response has already
 * atomically incremented the counter for this provider attempt, so callers must never
 * also call `/v1/quota/increment` for the same turn (see quota.service.ts's
 * own docstring on the Quota Service side for why).
 *
 * Quota failures stop provider work with a retryable service error; they must
 * never grant unmetered AI access or be mislabeled as an exhausted allowance.
 */

import { env } from "../config/env.js";

export interface QuotaCheckResult {
  allowed: boolean;
  reserved?: boolean;
  limit?: number;
  used?: number;
}

export async function checkChatQuota(userId: string, plan: string, reservationId?: string): Promise<QuotaCheckResult> {
  try {
    const res = await serviceFetch('quota', `${env.QUOTA_SERVICE_URL}/v1/quota/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify({ userId, plan, reservationId }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 200) {
      const body = (await res.json()) as { used?: number; limit?: number };
      return { allowed: true, reserved:true, used: body.used, limit: body.limit };
    }
    if (res.status === 403) {
      const body = (await res.json()) as { used?: number; limit?: number };
      return { allowed: false, used: body.used, limit: body.limit };
    }
    throw new Error('Quota verification unavailable');
  } catch {
    throw Object.assign(new Error('Quota verification is temporarily unavailable'), {
      code: 'QUOTA_UNAVAILABLE', phase: 'quota', statusCode: 503, status: 503, retryable: true,
    });
  }
}
