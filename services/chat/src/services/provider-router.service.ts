import { getEntitlements, requireEntitlement } from '../../../../shared/entitlements.mjs';
import { runGroqAgenticLoop } from './groq.service.js';
import { runAgenticLoop } from './claude.service.js';
import { capModel, selectModel, type ModelId } from './model-router.service.js';
import {getHybridRuntime,runHybridAgenticLoop,type HybridRequirements} from './hybrid-ai.service.js';
import type {ConversationMessage,SSEEvent} from './claude.service.js';
import type {Client} from '@modelcontextprotocol/sdk/client/index.js';

/** Admin-selected provider; no credential fallback can cross the selected boundary. */
export async function* runConfiguredAgenticLoop(messages:ConversationMessage[], system:string, mcp:Client, sessionId:string, signal?:AbortSignal, userId='', requirements:HybridRequirements={}):AsyncGenerator<SSEEvent> {
  const policy = await getEntitlements(userId || '');
  requireEntitlement(policy, 'ai_enabled');
  const runtime=requirements.runtime||await getHybridRuntime(userId,signal);
  if(runtime.enabled){yield* runHybridAgenticLoop(messages,system,mcp,sessionId,signal,userId,{...requirements,runtime});return;}
  const provider = policy.ai_provider || 'groq';
  if (provider === 'groq') { yield* runGroqAgenticLoop(messages, system, mcp, sessionId, signal, userId, requirements); return; }
  if (provider !== 'claude' || !policy.max_model) throw Object.assign(new Error('AI routing is unavailable'), {statusCode:503});
  const model = capModel(selectModel(messages.at(-1)?.content || '', messages.length, false), policy.max_model as ModelId);
  yield* runAgenticLoop(messages, model, system, mcp, sessionId, signal, userId);
}
