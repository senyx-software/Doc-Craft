import { randomUUID } from 'node:crypto';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { modelToolText } from '../../../../shared/model-context.mjs';
import { env } from '../config/env.js';
import type { ConversationMessage, SSEEvent } from './claude.service.js';
import { hybridRequestsCounter, hybridLatency } from './metrics.service.js';

export interface HybridRuntime {
  enabled: boolean;
  version: number;
  plan?: string;
  policy?: {
    primary_model: string; secondary_model?: string | null; cloud_fallback_model?: string | null;
    deterministic_enabled: boolean; local_enabled: boolean; cloud_fallback_enabled: boolean;
    fallback_on: string[]; allowed_features: string[];
    language_correction_mode?:'suggest'|'safe_apply'|'off';
  };
  models?: Record<string, { id: string; locality: 'local' | 'cloud'; max_input_tokens: number }>;
  private_terms?: string[];
}
export interface HybridRequirements {
  requireMutation?: boolean;
  plan?: string;
  runtime?: HybridRuntime;
  feature?: 'chat' | 'document_edit' | 'visual_edit' | 'language_correction';
}

async function internal<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await serviceFetch('admin-api', `${env.ADMIN_API_SERVICE_URL}/api/v1/internal/ai/${path}`, {
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { 'Content-Type': 'application/json' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(body ? 115000 : 15000)]) : AbortSignal.timeout(body ? 115000 : 15000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as any;
    const code = typeof result.detail?.code === 'string' && /^[A-Z_]{1,60}$/.test(result.detail.code) ? result.detail.code : response.status === 403 ? 'ENTITLEMENT_DENIED' : 'POLICY_UNAVAILABLE';
    throw Object.assign(new Error('DocCraft AI request unavailable'), { code, statusCode: response.status, phase: 'provider', retryable: ![403, 422].includes(response.status) });
  }
  return await response.json() as T;
}

export async function getHybridRuntime(userId: string, signal?: AbortSignal): Promise<HybridRuntime> {
  return internal<HybridRuntime>('runtime/' + encodeURIComponent(userId), undefined, signal);
}

export function privateResponse(text: string, runtime: HybridRuntime): string {
  let result = text;
  for (const term of [...(runtime.private_terms || [])].sort((a, b) => b.length - a.length)) {
    if (term.length >= 3) result = result.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'DocCraft AI');
  }
  return result.replace(/\b(?:OpenAI|Anthropic|Ollama|Groq|Hugging Face|Claude)\b/gi, 'DocCraft AI');
}

function condition(error: any) {
  return error.code === 'PROVIDER_TIMEOUT' ? 'timeout' : error.code === 'PROVIDER_RATE_LIMITED' ? 'rate_limit' :
    ['PROVIDER_RESPONSE_INVALID', 'PROVIDER_TOOL_REJECTED', 'RESPONSE_INCOMPLETE'].includes(error.code) ? 'invalid_response' :
    ['PROVIDER_UNAVAILABLE', 'PROVIDER_UNCONFIGURED', 'AI_QUEUE_TIMEOUT', 'AI_QUEUE_FULL', 'LOCAL_RESOURCE_LIMIT'].includes(error.code) ? 'unavailable' : null;
}

export async function* runHybridAgenticLoop(messages: ConversationMessage[], system: string, mcp: Client, sessionId: string, signal: AbortSignal | undefined, userId: string, requirements: HybridRequirements): AsyncGenerator<SSEEvent> {
  const runtime = requirements.runtime!;
  const policy = runtime.policy!;
  const chain = [...new Set([policy.primary_model, policy.secondary_model, ...(policy.cloud_fallback_enabled ? [policy.cloud_fallback_model] : [])].filter((id): id is string => !!id))]
    .filter((id, index) => runtime.models?.[id] && (runtime.models[id].locality !== 'local' || policy.local_enabled) && (index === 0 || runtime.models[id].locality !== 'cloud' || policy.cloud_fallback_enabled));
  if (!chain.length) throw Object.assign(new Error('Assistant routing unavailable'), { code: 'PROVIDER_UNCONFIGURED', statusCode: 503 });
  const listed = await mcp.listTools(undefined, { signal });
  const tools = listed.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description || '', parameters: tool.inputSchema } }));
  const history: any[] = [{ role: 'system', content: system + '\nYou are DocCraft AI Assistant. Never reveal model/provider names, endpoints, pricing, policies or credentials. Answer side questions without changing document facts. For visual changes use edit_canvas and inspect its committed result. For grammar, propose meaning-changing or proper-name corrections through the existing clarification tools. Use undo_document/redo_document for reversals. Never claim a change without a successful validated tool result.' }, ...messages.map(({ role, content }) => ({ role, content }))];
  let index = 0, mutated = false;
  for (let iteration = 0; iteration < 8; iteration++) {
    signal?.throwIfAborted();
    let result: any;
    for (;;) {
      const modelId = chain[index], locality = runtime.models![modelId].locality, started = Date.now();
      try {
        result = await internal<any>('infer', { request_id: randomUUID(), user_id: userId, session_id: sessionId, policy_version: runtime.version,
          model_id: modelId, messages: history, tools, fallback: index > 0, feature: requirements.feature || 'chat' }, signal);
        if (!result.message || result.finish_reason === 'length') throw Object.assign(new Error('Incomplete assistant response'), { code: 'RESPONSE_INCOMPLETE' });
        hybridRequestsCounter.inc({ route: locality, outcome: 'success', fallback: String(index > 0) });
        hybridLatency.observe({ route: locality }, Date.now() - started);
        break;
      } catch (error: any) {
        signal?.throwIfAborted();
        hybridRequestsCounter.inc({ route: locality, outcome: 'failure', fallback: String(index > 0) });
        const reason = condition(error);
        if (!reason || !policy.fallback_on.includes(reason) || index + 1 >= chain.length) throw error;
        index++;
      }
    }
    const answer = result.message;
    history.push(answer);
    if (!answer.tool_calls?.length) {
      if (requirements.requireMutation && !mutated) {
        if (iteration >= 1 && policy.fallback_on.includes('unresolved') && index + 1 < chain.length) index++;
        history.push({ role: 'system', content: 'The requested edit is not committed. Execute the relevant evidenced document/editor tools or persist a targeted clarification. Do not claim success without a tool result.' });
        continue;
      }
      if (!answer.content?.trim()) throw Object.assign(new Error('Empty assistant response'), { code: 'RESPONSE_INCOMPLETE' });
      yield { type: 'done', model: 'managed', text: privateResponse(answer.content.trim(), runtime) };
      return;
    }
    let needsInput = false;
    for (const call of answer.tool_calls) {
      if (!tools.some(tool => tool.function.name === call.function?.name)) throw Object.assign(new Error('Unsupported tool'), { code: 'TOOL_SCHEMA_INVALID' });
      let args: Record<string, unknown>;
      try { args = JSON.parse(call.function.arguments); } catch { throw Object.assign(new Error('Invalid tool arguments'), { code: 'TOOL_SCHEMA_INVALID' }); }
      const toolResult = await mcp.callTool({ name: call.function.name, arguments: args }, undefined, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(env.MCP_TIMEOUT_MS)]) : AbortSignal.timeout(env.MCP_TIMEOUT_MS) });
      const text = modelToolText(toolResult.content);
      let payload: any = {}; try { payload = JSON.parse(text); } catch { /* Structured error feedback remains in context. */ }
      const outcomes = payload.operationResults || [];
      if (!toolResult.isError) {
        mutated ||= payload.editorApplied === true || payload.languagePending === true || outcomes.some((o: any) => ['committed', 'cleared', 'unchanged', 'retained', 'skipped', 'conflicting', 'needs_confirmation', 'needs_value'].includes(o.outcome));
        needsInput ||= !!args.requestField || !!payload.languagePending || !!payload.pendingLanguage || !!payload.editorClarification || outcomes.some((o: any) => ['conflicting', 'needs_confirmation', 'needs_value'].includes(o.outcome));
      } else if (!['EVIDENCE_REJECTED', 'TOOL_SCHEMA_INVALID', 'VALIDATION_FAILED', 'EDITOR_CLARIFICATION'].includes(payload.code)) {
        throw Object.assign(new Error('Document tool failed'), { code: payload.code || 'TOOL_FAILED', statusCode: payload.status || 503 });
      }
      history.push({ role: 'tool', tool_call_id: call.id, content: text });
    }
    if (needsInput) { yield { type: 'done', model: 'managed', ...(answer.content?.trim() ? { text: privateResponse(answer.content.trim(), runtime) } : {}) }; return; }
  }
  throw Object.assign(new Error('Assistant turn did not finish'), { code: 'RESPONSE_INCOMPLETE', statusCode: 503 });
}
