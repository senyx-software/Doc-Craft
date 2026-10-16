import {contract} from '../../../shared/document-contract.mjs';
import { get, post, patch, getToken, apiRequest } from './client';
import { ChatStreamError, readChatStream, chatErrorFromHttp, validSnapshot } from '../../../shared/chat-stream.mjs';
import type { SessionStartRequest, SessionStartResponse, ChatRequest, ChatResponse, AISummaryResponse, MissingFieldsRequest, MissingFieldsResponse, CorrectionConfirmRequest, CorrectionConfirmResponse, ConversationSnapshot } from '../types';
export { ChatStreamError };
const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/v1';
const path = (id: string) => '/chat/api/chat/session/' + encodeURIComponent(id);
export async function startSession(data: SessionStartRequest & {
    template_id?: string;
    reuse_from_session_id?: string;
}): Promise<SessionStartResponse> {
    if (!getToken())
        await (await import('../store/authStore')).useAuthStore.getState().guestLogin();
    const response = await post<{
        state: ConversationSnapshot;
        opening_message: string;
    }>('/chat/api/chat/session', { documentTypeId: data.document_type, templateId: data.template_id || 'tmpl_invoice_2023_01', reuseFromSessionId: data.reuse_from_session_id, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone });
    const s = response.state;
    if (!validSnapshot(s))
        throw new Error('Session state was not returned');
    return { state: s, session_id: s.sessionId, document_type: s.documentType, opening_message: response.opening_message, schema_summary: s.schema, collected_slots: s.slots, pending_required: s.missingRequired, pending_optional: s.pendingOptional };
}
export async function sendChatMessage(data: ChatRequest): Promise<ChatResponse> {
    const requestToken=getToken();
    const turnId = data.turn_id || crypto.randomUUID();
    let response: Response;
    try {
        response = await fetch(base + path(data.session_id) + '/message', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'Authorization': 'Bearer ' + (requestToken || '') }, body: JSON.stringify({ message: data.message, turnId }), signal: data.signal });
    } catch (error) {
        const cancelled = data.signal?.aborted || error instanceof Error && error.name === 'AbortError';
        throw new ChatStreamError(cancelled ? 'cancelled' : 'failure', cancelled ? 499 : 503, undefined, cancelled ? 'REQUEST_CANCELLED' : 'NETWORK_UNAVAILABLE');
    }
    if (!response.ok) {
        if (response.status === 401&&getToken()===requestToken)
            void import('../store/authStore').then(m => {if(getToken()===requestToken)m.useAuthStore.setState({ user:null,isAuthenticated:false,isGuest:false,guestSession:null });});
        let errorBody:unknown;try{errorBody=await response.json();}catch{ /* The status still yields a categorized transport error. */ }
        throw chatErrorFromHttp(errorBody,response.status);
    }
    const event = await readChatStream(response.body, { sessionId: data.session_id, turnId });
    const s = event.state as ConversationSnapshot;
    return { state: s, turn_id: turnId, session_id: s.sessionId, ai_message: event.response, actions:event.actions||[], current_field: s.nextAction.field, status: s.readyToGenerate ? 'complete' : 'ok', collected_slots: s.slots, pending_required: s.missingRequired, pending_optional: s.pendingOptional, ready_to_generate: s.readyToGenerate };
}
export async function getSummary(sessionId: string): Promise<AISummaryResponse> {const response=await get<AISummaryResponse>(path(sessionId)+'/messages');if(!validSnapshot(response.state)||response.state.sessionId!==sessionId)throw new ChatStreamError('incomplete',502,undefined,'INVALID_COMPLETION');return response;}
export async function confirmDocument(sessionId:string,fingerprint:string,expectedRevision:number) {return post<{state:ConversationSnapshot}>(path(sessionId)+'/confirm',{fingerprint,expectedRevision});}
export async function saveDocumentAsset(sessionId:string, asset:import('../../../shared/document-assets.mjs').DocumentAsset, expectedRevision:number) {
    const {id,role,name,src,width,height}=asset;
    const response=await post<{state:ConversationSnapshot}>(path(sessionId)+'/assets',{asset:{id,role,name,src,width,height},expectedRevision});
    if(!validSnapshot(response.state)||response.state.sessionId!==sessionId)throw new ChatStreamError('incomplete',502,undefined,'INVALID_COMPLETION');
    return response;
}
export async function removeDocumentAssets(sessionId:string, ids:string[],expectedRevision:number) {
    const response=await apiRequest<{state:ConversationSnapshot}>(path(sessionId)+'/assets',{method:'DELETE',body:{ids,expectedRevision}});
    if(!validSnapshot(response.state)||response.state.sessionId!==sessionId)throw new ChatStreamError('incomplete',502,undefined,'INVALID_COMPLETION');
    return response;
}
export async function getMissingFields(data: MissingFieldsRequest): Promise<MissingFieldsResponse> {
    const { state } = await getSummary(data.session_id);
    return { session_id: state.sessionId, document_type: state.documentType, collected_count: Object.values(state.fieldStates).filter((field)=>field.status==='confirmed').length, total_required: state.schema.required_fields, completion_percent: Math.round(100 * (state.schema.required_fields - state.missingRequired.length) / Math.max(1, state.schema.required_fields)), missing_required: state.missingRequired.map(key => ({ key, label: contract.fields[key].label, type: contract.fields[key].type })), missing_optional: state.pendingOptional.map(key => ({ key, label: contract.fields[key].label, type: contract.fields[key].type })), ready_to_generate: state.readyToGenerate };
}
export async function confirmCorrection(data: CorrectionConfirmRequest): Promise<CorrectionConfirmResponse> {
    const { state } = await post<{
        state: ConversationSnapshot;
    }>(path(data.session_id) + '/resolve', { field: data.field, accept: data.accept });
    return { session_id: state.sessionId, field: data.field, saved_value: String(state.slots[data.field] || ''), accepted_correction: data.accept, next_field: state.nextAction.field || '', ai_message: state.nextAction.question, collected_slots: state.slots, pending_required: state.missingRequired };
}
export async function listUserSessions() { const response = await get<{
    sessions: Array<{
        id: string;
        title?: string;
        documentTypeId?: string;
        updatedAt?: string;
        status?: string;
    }>;
}>('/chat/api/chat/sessions'); return response.sessions; }
export async function deleteUserSession(id: string) { await fetchOrThrow(path(id), 'DELETE'); return true; }
async function fetchOrThrow(endpoint: string, method: string) { const requestToken=getToken(); const r = await fetch(base + endpoint, { method, headers: { Authorization: 'Bearer ' + (requestToken || '') } }); if (!r.ok)
    throw new Error('Session operation failed. Please retry.'); }
export async function updateSessionTemplate(id: string, templateId: string) { const result=await patch<{state:ConversationSnapshot}>(path(id), { templateId });if(!validSnapshot(result.state))throw new ChatStreamError('incomplete',502,undefined,'INVALID_COMPLETION');return result; }
export async function updateSessionAccentColor(id: string, accentColor: string) { const result=await patch<{state:ConversationSnapshot}>(path(id), { accentColor });if(!validSnapshot(result.state))throw new ChatStreamError('incomplete',502,undefined,'INVALID_COMPLETION');return result; }
export async function updateSemanticFields(id: string, slots: Record<string, unknown>, expectedRevision: number) { return patch<{
    state: ConversationSnapshot;
}>(path(id), { slots, expectedRevision }); }
