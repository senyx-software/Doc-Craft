import { create } from 'zustand';
import type { DocumentType, ChatMessage, SpellCorrection, SchemaSummary, ChatStatus, ConversationSnapshot } from '../types';
import * as aiApi from '../api/ai';
import { ChatStreamError, RECOVERABLE_CHAT_ERROR } from '../../../shared/chat-stream.mjs';
import { snapshot, extractExplicit, applyCandidates, isCorrection, planResponse } from '../../../shared/conversation-state.mjs';
import { getToken } from '../api/client';
import type { DocumentAsset } from '../../../shared/document-assets.mjs';
export interface ChatSessionMeta {
    id: string;
    title?: string;
    documentTypeId?: string;
    updatedAt?: string;
    status?: string;
}
interface ChatState {
    assets: DocumentAsset[];
    saveDocumentAsset: (asset:DocumentAsset) => Promise<void>;
    removeDocumentAssets: (ids:string[]) => Promise<void>;
    sessionId: string | null;
    documentType: DocumentType | null;
    schemaSummary: SchemaSummary | null;
    userSessions: ChatSessionMeta[];
    messages: ChatMessage[];
    currentField: string | null;
    status: ChatStatus | null;
    collectedSlots: Record<string, unknown>;
    pendingRequired: string[];
    pendingOptional: string[];
    readyToGenerate: boolean;
    canGenerate: boolean;
    finalization: ConversationSnapshot['finalization'];
    confirmDocument: () => Promise<void>;
    spellCorrections: SpellCorrection[];
    pendingCorrection: SpellCorrection | null;
    summary: string | null;
    collectedData: Record<string, unknown> | null;
    isLoading: boolean;
    isLoadingSessions: boolean;
    error: string | null;
    demoFieldIndex: number;
    revision: number;
    workflowStage: string;
    lifecycle: string;
    readOnly: boolean;
    fieldStates: ConversationSnapshot['fieldStates'];
    pendingIntent: ConversationSnapshot['pendingIntent'];
    pendingTurn: {
        id: string;
        message: string;
    } | null;
    startSession: (type: DocumentType, options?: {
        reuseFromSessionId?: string;
    }) => Promise<void>;
    sendMessage: (message: string) => Promise<void>;
    retryMessage: () => Promise<void>;
    confirmCorrection: (accept: boolean) => Promise<void>;
    fetchMissingFields: () => Promise<void>;
    fetchSummary: () => Promise<void>;
    loadSessionFromDb: (id: string) => Promise<void>;
    fetchUserSessions: () => Promise<void>;
    deleteSessionById: (id: string) => Promise<void>;
    resetChat: () => void;
    reconcileSnapshot: (state:ConversationSnapshot) => void;
    updateSemanticFields: (fields: Record<string, unknown>) => Promise<void>;
}
const empty = { assets:[] as DocumentAsset[],canGenerate:false,finalization:undefined as ConversationSnapshot['finalization'],sessionId: null, documentType: null, schemaSummary: null, userSessions: [], messages: [], currentField: null, status: null, collectedSlots: {}, pendingRequired: [], pendingOptional: [], readyToGenerate: false, spellCorrections: [], pendingCorrection: null, summary: null, collectedData: null, isLoading: false, isLoadingSessions: false, error: null, demoFieldIndex: 0, revision: 0, workflowStage: 'collecting', lifecycle: 'ACTIVE', readOnly: false, fieldStates: {}, pendingIntent: null, pendingTurn: null };
let generation = 0, request: AbortController | undefined;
const demo = () => getToken() === 'demo_token_for_testing';
function pointer(id: string) { if (typeof window === 'undefined')
    return; const url = new URL(window.location.href); url.searchParams.delete('new'); url.searchParams.delete('type'); url.searchParams.set('sessionId', id); window.history.replaceState({}, '', url); }
function statePatch(s: ConversationSnapshot) {
    return { assets:s.assets||[],summary:null,canGenerate:s.canGenerate===true,finalization:s.finalization,sessionId: s.sessionId, documentType: s.documentType, schemaSummary: s.schema, collectedSlots: s.slots, collectedData: s.slots, pendingRequired: s.missingRequired, pendingOptional: s.pendingOptional, currentField: s.nextAction.field, readyToGenerate: s.readyToGenerate, status: (s.readyToGenerate ? 'complete' : 'ok') as ChatStatus, revision: s.revision, workflowStage: s.stage, lifecycle: s.lifecycle, readOnly: s.readOnly, fieldStates: s.fieldStates, pendingIntent:s.pendingIntent || null, pendingTurn: s.pendingTurn || null, pendingCorrection: null, spellCorrections: [] };
}
export const useChatStore = create<ChatState>((set, get) => ({
    ...empty,
    canGenerate:false,finalization:undefined,
    removeDocumentAssets:async(ids)=>{
        const state=get(),epoch=generation;
        if(!state.sessionId||state.readOnly||state.isLoading)throw new Error('Wait for the current message to finish and open an editable draft.');
        const response=await aiApi.removeDocumentAssets(state.sessionId,ids,state.revision);
        if(epoch!==generation||get().sessionId!==state.sessionId)return;
        if(response.state.revision<get().revision)throw new Error('Your document changed. Refresh the preview to see the saved changes.');
        set(statePatch(response.state));
        (await import('./documentStore')).useDocumentStore.getState().refreshCanvasElements({documentType:response.state.documentType,...response.state.slots});
    },
    saveDocumentAsset:async(asset)=>{
        const state=get(), epoch=generation;
        if(!state.sessionId||state.readOnly||state.isLoading)throw new Error('Open an editable document and wait for the current message to finish.');
        const response=await aiApi.saveDocumentAsset(state.sessionId,asset,state.revision);
        if(epoch!==generation||get().sessionId!==state.sessionId) return;
        if(response.state.revision<get().revision)throw new Error('Your document changed. Refresh the preview to see the saved upload.');
        set({...statePatch(response.state),messages:[...get().messages,{role:'assistant',content:`Added your ${asset.role}. Resized it proportionally and placed it in available document space.`}]});
        (await import('./documentStore')).useDocumentStore.getState().refreshCanvasElements({documentType:response.state.documentType,...response.state.slots});
    },
    confirmDocument:async()=>{
        const state=get(),epoch=generation;if(!state.sessionId||!state.finalization||!state.readyToGenerate||state.isLoading)return;
        set({isLoading:true,error:null});
        try {const result=await aiApi.confirmDocument(state.sessionId,state.finalization.fingerprint,state.revision);if(epoch===generation&&get().sessionId===state.sessionId){if(result.state.revision>=get().revision)set({...statePatch(result.state),summary:state.summary,isLoading:false});else set({isLoading:false});}}
        catch(error){if(epoch===generation)set({isLoading:false,error:error instanceof Error?error.message:'Review the current document before confirming.'});}
    },
    reconcileSnapshot: (state) => {if(state.sessionId===get().sessionId&&state.revision>=get().revision)set(statePatch(state));},
    resetChat: () => { generation++; request?.abort(); set({ ...empty }); },
    startSession: async (type, options) => {
        if (!getToken()) {
            try {
                await (await import('./authStore')).useAuthStore.getState().guestLogin();
            }
            catch {
                set({ error: 'Guest authentication is unavailable. Please sign in or retry.' });
                return;
            }
        }
        const epoch = ++generation;
        request?.abort();
        set({ ...empty, isLoading: true });
        try {
            if (demo()) {
                const s = snapshot({ id: 'demo_' + crypto.randomUUID(), documentTypeId: type, status: 'ACTIVE', slots: {} }) as ConversationSnapshot;
                set({ ...statePatch(s), messages: [{ role: 'assistant', content: 'Demo: ' + planResponse(s) }], isLoading: false });
                return;
            }
            const doc = (await import('./documentStore')).useDocumentStore.getState();
            const response = await aiApi.startSession({ document_type: type, template_id: doc.selectedTemplate || 'tmpl_invoice_2023_01', reuse_from_session_id: options?.reuseFromSessionId });
            if (epoch !== generation)
                return;
            set({ ...statePatch(response.state), messages: [{ role: 'assistant', content: response.opening_message }], isLoading: false });
            doc.hydrateConversation(response.state);
            pointer(response.session_id);
            void get().fetchUserSessions();
        }
        catch (error) {
            if (epoch === generation)
                set({ error: error instanceof Error ? error.message : 'Could not start a session. Please retry.', isLoading: false });
        }
    },
    sendMessage: async (message) => {
        const state = get();
        if (!state.sessionId || !state.documentType || state.isLoading || state.readOnly && state.lifecycle !== 'COMPLETED')
            return;
        const epoch = generation, id = state.sessionId;
        const retry = state.pendingTurn?.message === message, turn = retry ? state.pendingTurn! : { id: crypto.randomUUID(), message };
        if (state.pendingTurn && !retry) {
            set({ error: 'Retry or finish the previous message before sending another.' });
            return;
        }
        const messages = retry ? state.messages : [...state.messages, { role: 'user' as const, content: message }];
        set({ messages, isLoading: true, error: null, pendingTurn: turn });
        request = new AbortController();
        try {
            let response;
            if (demo()) {
                const s = snapshot({ id, documentTypeId: state.documentType, status: 'ACTIVE', slots: { ...state.collectedSlots, _chat: { fields: state.fieldStates, pendingField:state.pendingIntent?.field } } });
                const result = applyCandidates(state.documentType, { ...state.collectedSlots, _chat: { fields: state.fieldStates, pendingField:state.pendingIntent?.field } }, extractExplicit(message, s), { kind: 'user', id: turn.id, message, correction: isCorrection(message) });
                const next = snapshot({ id, documentTypeId: state.documentType, status: 'ACTIVE', slots: result.raw });
                response = { state: next, ai_message: 'Demo: ' + planResponse(next, result.changed,message,{results:result.results}) };
            }
            else
                response = await aiApi.sendChatMessage({ session_id: id, document_type: state.documentType, message, turn_id: turn.id, signal: request.signal, current_field: '', conversation_history: [] });
            if (epoch !== generation || get().sessionId !== id)
                return;
            if(response.state.sessionId===id&&response.state.revision<get().revision) {
                set({messages:[...messages,{role:'assistant',content:response.ai_message}],pendingTurn:null,isLoading:false});
                return;
            }
            set({ ...statePatch(response.state), messages: [...messages, { role: 'assistant', content: response.ai_message }], pendingTurn: null, isLoading: false });
            const document = (await import('./documentStore')).useDocumentStore.getState();
            if (epoch === generation && get().sessionId === response.state.sessionId && response.state.revision>=get().revision) {
                if(response.state.sessionId!==id) {pointer(response.state.sessionId);document.hydrateConversation(response.state);}
                document.refreshCanvasElements({ documentType: response.state.documentType, ...response.state.slots });
                for(const action of response.actions||[]) {
                    if(epoch!==generation)break;
                    if(action.kind==='generate'&&action.sessionId===response.state.sessionId) await document.generateDocument(action.sessionId,action.documentType,response.state.slots,action.id,action.revision);
                    if(action.kind==='open_session'&&action.sessionId!==response.state.sessionId) {
                        await get().loadSessionFromDb(action.sessionId);
                        if(get().sessionId===action.sessionId && !get().messages.length) set({messages:[{role:'assistant',content:response.ai_message}]});
                        else if(get().sessionId!==action.sessionId) set({pendingTurn:turn,error:get().error||'The new draft is saved. Retry to open it.'});
                    }
                }
            }
        }
        catch (error) {
            if (epoch !== generation || get().sessionId !== id)
                return;
            // A failure can contain a newer committed snapshot; it never supplies an invented question.
            const transitionError = error instanceof ChatStreamError && error.sourceSessionId===id;
            let committed = error instanceof ChatStreamError ? error.state : undefined;
            if (!transitionError && error instanceof ChatStreamError && [409, 410].includes(error.status)) {
                try {
                    const restored = await aiApi.getSummary(id);
                    committed = restored.state;
                }
                catch { /* Unavailable is not empty state. */ }
            }
            if (epoch !== generation || get().sessionId !== id)
                return;
            const permanent = error instanceof ChatStreamError && !error.retryable;
            set({ ...(committed && (committed.sessionId===id&&committed.revision>=get().revision || error instanceof ChatStreamError && error.sourceSessionId===id) ? statePatch(committed) : {}), pendingTurn: committed?.readOnly || permanent ? null : turn, error: committed?.readOnly ? 'This conversation is read-only. Your saved information is still available.' : error instanceof ChatStreamError ? error.message : RECOVERABLE_CHAT_ERROR, isLoading: false, ...(committed?.readOnly || permanent ? { pendingTurn: null } : {}) });
            if(transitionError&&committed) {pointer(committed.sessionId);(await import('./documentStore')).useDocumentStore.getState().hydrateConversation(committed);}
        }
    },
    retryMessage: async () => { const turn = get().pendingTurn; if (turn)
        await get().sendMessage(turn.message); },
    loadSessionFromDb: async (id) => {
        const previous=get();
        const epoch = ++generation;
        request?.abort();
        set({ ...empty, isLoading: true });
        try {
            const response = await aiApi.getSummary(id);
            if (epoch !== generation)
                return;
            const s = response.state;
            set({ ...statePatch(s), messages: (response.messages || []).map(m => ({ role: m.role.toLowerCase() as 'user' | 'assistant', content: m.content })), summary: response.summary || null, error: s.pendingTurn ? 'An interrupted response is ready to retry. Your saved information is still available.' : null, isLoading: false });
            pointer(id);
            const document = (await import('./documentStore')).useDocumentStore.getState();
            if (epoch !== generation)
                return;
            document.hydrateConversation(s);
        }
        catch (error) {
            if (epoch === generation)
                set({ ...previous,error: error instanceof Error ? error.message : 'Could not retrieve saved information.', isLoading: false });
        }
    },
    fetchUserSessions: async () => { const epoch = generation; set({ isLoadingSessions: true }); try {
        const sessions = await aiApi.listUserSessions();
        if (epoch === generation)
            set({ userSessions: sessions, isLoadingSessions: false });
    }
    catch {
        if (epoch === generation)
            set({ isLoadingSessions: false, error: 'Conversation history is unavailable. Please retry.' });
    } },
    deleteSessionById: async (id) => { await aiApi.deleteUserSession(id); if (get().sessionId === id)
        get().resetChat();
    else
        set({ userSessions: get().userSessions.filter(s => s.id !== id) }); },
    fetchMissingFields: async () => { const id = get().sessionId, epoch = generation; if (!id || demo())
        return; try {
        const r = await aiApi.getSummary(id);
        if (epoch === generation && id === get().sessionId && r.state.revision>=get().revision)
            set(statePatch(r.state));
    }
    catch {
        if(epoch===generation&&id===get().sessionId)set({ error: 'Could not retrieve document progress. Saved information is still available.' });
    } },
    fetchSummary: async () => { const id = get().sessionId, epoch = generation; if (!id)
        return; set({ isLoading: true }); try {
        const r = await aiApi.getSummary(id);
        if (epoch === generation && r.state.revision>=get().revision)
            set({ ...statePatch(r.state), summary: r.summary, collectedData: r.state.slots, isLoading: false });
    }
    catch {
        if (epoch === generation)
            set({ error: 'Could not retrieve the summary.', isLoading: false });
    } },
    confirmCorrection: async (accept) => { const state = get(); if (!state.sessionId || !state.currentField)
        return; await aiApi.confirmCorrection({ session_id: state.sessionId, field: state.currentField, accept, original_value: '', suggested_value: '' }); await get().fetchMissingFields(); },
    updateSemanticFields: async (fields) => {
        const state = get(), epoch = generation;
        if (!state.sessionId || state.readOnly)
            return;
        try {
            const r = await aiApi.updateSemanticFields(state.sessionId, fields, state.revision);
            if (epoch !== generation || get().sessionId !== state.sessionId || r.state.revision<get().revision)
                return;
            set(statePatch(r.state));
            const d = (await import('./documentStore')).useDocumentStore.getState();
            if (epoch === generation && get().sessionId===r.state.sessionId && r.state.revision>=get().revision)
                d.refreshCanvasElements({ documentType: r.state.documentType, ...r.state.slots });
        }
        catch {
            if (epoch === generation) {
                set({ error: 'This edit was not saved. Refresh the document state and retry.' });
                await get().fetchMissingFields();
            }
        }
    },
}));
