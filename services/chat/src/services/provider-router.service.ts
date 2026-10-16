import { getEntitlements, requireEntitlement } from '../../../../shared/entitlements.mjs';
import { runGroqAgenticLoop } from './groq.service.js';
import { runAgenticLoop } from './claude.service.js';
import { capModel, selectModel, type ModelId } from './model-router.service.js';

/** Admin-selected provider; no credential fallback can cross the selected boundary. */
export const runConfiguredAgenticLoop: typeof runGroqAgenticLoop = async function* (messages, system, mcp, sessionId, signal, userId, requirements) {
  const policy = await getEntitlements(userId || '');
  requireEntitlement(policy, 'ai_enabled');
  const provider = policy.ai_provider || 'groq';
  if (provider === 'groq') { yield* runGroqAgenticLoop(messages, system, mcp, sessionId, signal, userId, requirements); return; }
  if (provider !== 'claude' || !policy.max_model) throw Object.assign(new Error('AI routing is unavailable'), {statusCode:503});
  const model = capModel(selectModel(messages.at(-1)?.content || '', messages.length, false), policy.max_model as ModelId);
  yield* runAgenticLoop(messages, model, system, mcp, sessionId, signal, userId);
};
