import { serviceFetch } from '../../../../shared/service-auth.mjs';
/**
 * posthogTracking.service.ts — reports real AI generation/tool-call spans to
 * PostHog's LLM Observability event schema ($ai_generation / $ai_span).
 *
 * Chat never talks to PostHog directly and holds no PostHog API key — every
 * service reports through the Analytics Service's /v1/analytics/event
 * endpoint (X-Internal-Secret gated), which is the one place the real key
 * lives. Fire-and-forget: a tracking failure must never affect a real chat
 * turn.
 */
import { randomUUID } from "crypto";
import { env } from "../config/env.js";

function sendEvent(userId: string, eventName: string, properties: Record<string, unknown>): void {
  serviceFetch('analytics', `${env.ANALYTICS_SERVICE_URL}/v1/analytics/event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify({ userId, eventName, properties }),
  }).catch((err) => {
    console.warn(`[chat] posthogTracking ${eventName} failed:`, err);
  });
}

/** Reports one real LLM call (real model, real token usage, real latency). */
export function trackAiGeneration(params: {
  userId: string;
  sessionId: string;
  traceId: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  isError?: boolean;
}): void {
  sendEvent(params.userId, "$ai_generation", {
    $ai_trace_id: params.traceId,
    $ai_session_id: params.sessionId,
    $ai_model: params.model,
    $ai_provider: params.provider,
    $ai_input_tokens: params.inputTokens,
    $ai_output_tokens: params.outputTokens,
    $ai_latency: params.latencyMs / 1000,
    $ai_is_error: Boolean(params.isError),
  });
}

/** Reports one real MCP tool execution triggered by the LLM. */
export function trackAiSpan(params: {
  userId: string;
  sessionId: string;
  traceId: string;
  spanName: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  isError?: boolean;
}): void {
  sendEvent(params.userId, "$ai_span", {
    $ai_trace_id: params.traceId,
    $ai_session_id: params.sessionId,
    $ai_span_id: randomUUID(),
    $ai_span_name: params.spanName,
    $ai_input_state: { redacted: true },
    $ai_output_state: { redacted: true, isError: Boolean(params.isError) },
    $ai_latency: params.latencyMs / 1000,
    $ai_is_error: Boolean(params.isError),
  });
}
