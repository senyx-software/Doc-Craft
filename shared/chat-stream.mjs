import { errorMessage } from './chat-errors.mjs';
import { contract } from './document-contract.mjs';
export const RECOVERABLE_CHAT_ERROR = "I couldn't complete that response. Your previously saved information is still available. Please retry.";
export class ChatStreamError extends Error {
    constructor(outcome = 'failure', status = 503, state, code = 'CHAT_FAILED', details = {}) {
        super(errorMessage(outcome==='cancelled'?'REQUEST_CANCELLED':code));
        this.name = 'ChatStreamError';
        this.outcome = outcome;
        this.status = status;
        this.state = state;
        this.code = code;
        this.phase=details.phase||'transport';
        this.retryable=details.retryable??![400,401,403,404,410,422].includes(status);
        this.requestId=details.requestId;
        this.sourceSessionId=details.sourceSessionId;
        this.retryAfter=Number.isFinite(details.retryAfter)&&details.retryAfter>0?details.retryAfter:undefined;
    }
}
export async function readChatStream(body, expected = {}) {
    if (!body)
        throw new ChatStreamError('incomplete', 502, undefined, 'STREAM_INTERRUPTED');
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', terminal, text = '', eventName = '';
    const consume = line => {
        if (!line.trim()) {
            eventName = '';
            return;
        }
        if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            return;
        }
        if (!line.startsWith('data:'))
            return;
        let event;
        try {
            event = JSON.parse(line.slice(5).trim());
        }
        catch {
            throw new ChatStreamError('incomplete', 502, undefined, 'INVALID_STREAM');
        }
        if (eventName === 'error' || event.type === 'error' || ['failure', 'incomplete', 'cancelled'].includes(event.outcome)) {
            throw new ChatStreamError(event.outcome || 'failure', event.status || 503, validSnapshot(event.state)?event.state:undefined, event.code, event);
        }
        if (terminal)
            throw new ChatStreamError('incomplete', 502, undefined, 'MULTIPLE_TERMINALS');
        if (event.type === 'token')
            text += event.text || '';
        if (event.type === 'done') {
            const transitioned = event.sourceSessionId===expected.sessionId && event.actions?.some(action=>action.kind==='open_session'&&action.sourceSessionId===expected.sessionId&&action.sessionId===event.state?.sessionId&&action.id===expected.turnId);
            if (event.outcome !== 'success' || !validSnapshot(event.state) || typeof event.response!=='string' || !event.response.trim() ||
                (expected.sessionId && event.state.sessionId !== expected.sessionId && !transitioned) ||
                (expected.turnId && event.turnId !== expected.turnId))
                throw new ChatStreamError('incomplete', 502, undefined, 'INVALID_COMPLETION');
            terminal = event;
        }
    };
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines)
                consume(line.replace(/\r$/, ''));
        }
        buffer += decoder.decode();
        if (buffer.trim())
            for (const line of buffer.split('\n'))
                consume(line);
        if (!terminal)
            throw new ChatStreamError('incomplete', 502, undefined, 'STREAM_INTERRUPTED');
        return { ...terminal, text: terminal.response || text };
    }
    catch (error) {
        await reader.cancel().catch(() => { });
        if (error instanceof ChatStreamError)
            throw error;
        throw new ChatStreamError(error?.name === 'AbortError' ? 'cancelled' : 'incomplete', 502,undefined,error?.name==='AbortError'?'REQUEST_CANCELLED':'STREAM_INTERRUPTED');
    }
    finally {
        reader.releaseLock();
    }
}

export function validSnapshot(s) {
    const obj=value=>value&&typeof value==='object'&&!Array.isArray(value);
    return !!(obj(s)&&typeof s.sessionId==='string'&&Number.isInteger(s.revision)&&s.revision>=0&&contract.documents[s.documentType]&&obj(s.slots)&&obj(s.fieldStates)&&Array.isArray(s.missingRequired)&&s.missingRequired.every(key=>typeof key==='string')&&Array.isArray(s.pendingOptional)&&obj(s.nextAction)&&typeof s.nextAction.question==='string'&&typeof s.nextAction.kind==='string'&&(s.nextAction.field===null||typeof s.nextAction.field==='string')&&typeof s.readyToGenerate==='boolean'&&typeof s.readOnly==='boolean'&&typeof s.stage==='string'&&typeof s.lifecycle==='string'&&obj(s.schema)&&Number.isInteger(s.schema.required_fields));
}
export function chatErrorFromHttp(body, status) {
    const error=body&&typeof body==='object'?body:{};
    const nested=typeof error.error==='object'?error.error:{};
    const upstreamCode=error.code||nested.code;
    const fallback=status===410?'SESSION_EXPIRED':status===403?'ACCESS_DENIED':status===404?'SESSION_NOT_FOUND':status===422?'VALIDATION_FAILED':status===429?'CHAT_RATE_LIMITED':status===400?'INVALID_INPUT':status===409?'REVISION_CONFLICT':'CHAT_FAILED';
    const code=status===401?'AUTH_REQUIRED':upstreamCode==='RATE_LIMIT_EXCEEDED'?'CHAT_RATE_LIMITED':!upstreamCode||upstreamCode==='UPSTREAM_ERROR'?fallback:upstreamCode;
    return new ChatStreamError(error.outcome||'failure',status,validSnapshot(error.state)?error.state:undefined,code,{...nested,...error});
}
