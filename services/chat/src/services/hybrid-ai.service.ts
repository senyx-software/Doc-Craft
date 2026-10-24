import type { ConversationMessage, SSEEvent } from './claude.service.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { serviceFetch } from '../../../../shared/service-auth.mjs';

export interface HybridPolicy {
  allowed_features: string[];
  deterministic_enabled?: boolean;
  language_correction_mode?: 'off' | 'suggest' | 'auto';
  [key: string]: unknown;
}

export interface HybridRuntime {
  enabled: boolean;
  version: number;
  policy?: HybridPolicy;
  [key: string]: unknown;
}

export interface HybridRequirements {
  runtime?: HybridRuntime;
  plan?: string;
  feature?: string;
  requireMutation?: boolean;
  [key: string]: unknown;
}

export async function getHybridRuntime(userId: string, signal?: AbortSignal): Promise<HybridRuntime> {
  try {
    const adminUrl = process.env.ADMIN_API_URL || 'http://localhost:3018';
    const response = await serviceFetch('admin-api', `${adminUrl}/api/v1/internal/ai/runtime/${encodeURIComponent(userId)}`, {
      method: 'GET',
      signal: signal ? signal : AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const data = await response.json();
      return data as HybridRuntime;
    }
  } catch {
    // Fall back to default disabled runtime
  }
  return { enabled: false, version: 0 };
}

export async function* runHybridAgenticLoop(
  messages: ConversationMessage[],
  system: string,
  mcp: Client,
  sessionId: string,
  signal?: AbortSignal,
  userId = '',
  requirements: HybridRequirements = {}
): AsyncGenerator<SSEEvent> {
  try {
    const adminUrl = process.env.ADMIN_API_URL || 'http://localhost:3018';
    const response = await serviceFetch('admin-api', `${adminUrl}/api/v1/internal/ai/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        system,
        sessionId,
        userId,
        requirements
      }),
      signal: signal ? signal : AbortSignal.timeout(30000),
    });
    if (response.ok) {
      const result = await response.json() as { text?: string; model?: string };
      yield { type: 'done', model: result.model || 'hybrid-managed', text: result.text || '' };
      return;
    }
  } catch {
    // Inference error fallback
  }
  yield { type: 'done', model: 'hybrid-managed', text: '' };
}
