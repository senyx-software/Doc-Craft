import { identifyIntent } from '../../../../shared/conversation-intent.mjs';
import { validateToolProposal } from '../../../../shared/tool-proposal.mjs';
import { errorDetails } from '../../../../shared/chat-errors.mjs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { conversations } from './conversation.repository.js';
import { snapshot, isCorrection, extractExplicit } from '../../../../shared/conversation-state.mjs';
import { toolSchema, normalizeSlots, resolveDate, documentData } from '../../../../shared/document-contract.mjs';
export const normalizeSlotMap = documentData;
export const parseFlexibleDate = resolveDate;
export const normalizeCurrencySymbol = (value: unknown) => documentData({ currency: value }).currencySymbol || '';
export function createMcpServer(sessionId?: string, userId?: string, turn?: {
    turnId: string;
    token: string;
    message: string;
    now?: number; history?:Record<string,{content:string;createdAt?:string|Date}>;
}, repository = conversations) {
    const server = new Server({ name: 'doccraft-mcp-server', version: '2.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        if (!sessionId || !userId)
            throw new Error('Authenticated session required');
        const session = await repository.load(userId, sessionId);
        return { tools: [{ name: 'update_slots', description: 'Propose document field updates supported by literal evidence from the current user message. No inferred quantities or prices. Only explicit corrections may replace confirmed facts. Use requestField with literal field-label evidence to persist a user request for an optional/existing field before asking its value. Use itemOperations for add/update/remove with stable IDs; fieldOperations supports set/append/clear/skip. Notes and payment terms are distinct. Persist genuine pending operations using confirmBeforeApply before asking yes/no.', inputSchema: toolSchema(snapshot(session).documentType) },
                { name: 'get_session_state', description: 'Get the authorized committed document state.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        try {
            if (!sessionId || !userId)
                throw new Error('Authenticated session required');
            const args = request.params.arguments || {};
            if (args.sessionId !== undefined && args.sessionId !== sessionId)
                throw new Error('Cross-session operation denied');
            if (request.params.name === 'get_session_state') {
                if(Object.keys(args).length)throw Object.assign(new Error('State getter takes no arguments'),{code:'TOOL_SCHEMA_INVALID',statusCode:422});
                return { content: [{ type: 'text', text: JSON.stringify(snapshot(await repository.load(userId, sessionId))) }] };
            }
            if (request.params.name !== 'update_slots')
                throw new Error('Tool not allowed');
            if (!turn)
                throw new Error('External MCP edits must use the authorized revision-checked session PATCH API');
            const state=snapshot(await repository.load(userId,sessionId));
            validateToolProposal(state.documentType,args);
            const intent=identifyIntent(turn?.message||'',state),explicit=extractExplicit(turn?.message||'',state);
            if(['question','summary','acknowledge'].includes(intent.kind) && !Object.keys(explicit.slots).length && !intent.allowsMutation && !args.requestField) throw Object.assign(new Error('This message does not request a document edit'),{code:'EVIDENCE_REJECTED',statusCode:422,retryable:false});
            const allowed = new Set(['slots', 'evidence', 'evidenceSource', 'skip', 'clear', 'itemOperations','requestField','clarifications','fieldOperations','confirmBeforeApply','confirmationQuestion']);
            if (Object.keys(args).some(key => !allowed.has(key)))
                throw new Error('Unsupported tool argument');
            if (Array.isArray(args.itemOperations) && args.itemOperations.some(operation =>
                !operation || typeof operation !== 'object' || Object.keys(operation).some(key =>
                    !['operation', 'id', 'item'].includes(key))))
                throw new Error('Unsupported item operation');
            // Canonicalization rejects alias conflicts and reserved metadata keys never pass through.
            normalizeSlots((args.slots || {}) as Record<string, unknown>);
            const session = await repository.apply(userId, sessionId, args, { kind: 'model', id: turn.turnId, message: turn.message, correction: isCorrection(turn.message), now: turn.now,history:turn.history }, turn);
            const saved=snapshot(session);
            return { content: [{ type: 'text', text: JSON.stringify({...saved,...(saved.operationResults.some((result:any)=>result.outcome==='rejected'&&['EVIDENCE_REJECTED','OWNERSHIP_UNRESOLVED'].includes(result.code))?{hint:'Repair the rejected extraction using an EXACT literal substring of the current message as evidence, retaining leading zeros, punctuation and spaces. Do not use normalized display text as evidence. Extract every remaining supplied fact before finishing.'}:{})}) }] };
        }
        catch (error) {
            const details=errorDetails(error,'tool');
            return { content: [{ type: 'text', text: JSON.stringify({...details,outcome:'failure',...(['EVIDENCE_REJECTED','TOOL_SCHEMA_INVALID','VALIDATION_FAILED'].includes(details.code)?{hint:'Correct the tool arguments using the literal current user facts. Preserve leading zeros. Extract supplied values instead of requestField when a value is present. Do not invent or expand bank names. Unrelated valid changes are already saved.'}:{})}) }], isError: true };
        }
    });
    return server;
}
