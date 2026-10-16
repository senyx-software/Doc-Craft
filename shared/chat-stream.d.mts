export const RECOVERABLE_CHAT_ERROR: string;
export class ChatStreamError extends Error { outcome: string; status: number; state?: any; code: string; phase: string; retryable: boolean; sourceSessionId?: string; retryAfter?: number;
    requestId?: string; constructor(outcome?: string, status?: number, state?: any, code?: string, details?: any); }
export function readChatStream(body: ReadableStream<Uint8Array> | null, expected?: {sessionId?: string; turnId?: string}): Promise<any>;

export function validSnapshot(state: any): boolean;
export function chatErrorFromHttp(body: any, status: number): ChatStreamError;
