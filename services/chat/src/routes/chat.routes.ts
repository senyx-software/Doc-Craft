import {getEntitlements,requireEntitlement} from '../../../../shared/entitlements.mjs';
import { errorDetails } from '../../../../shared/chat-errors.mjs';
import { identifyIntent } from '../../../../shared/conversation-intent.mjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../services/db.service.js';
import { conversations } from '../services/conversation.repository.js';
import { SessionService } from '../services/session.service.js';
import { sessionController } from '../controllers/session.controller.js';
import { concurrencyLimiter } from '../middleware/concurrency.js';
import { runConfiguredAgenticLoop } from '../services/provider-router.service.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../services/mcp.service.js';
import { buildContext } from '../services/context.service.js';
import { checkChatQuota } from '../services/quotaClient.service.js';
import { detectPromptInjection } from '../security/prompt-injection.js';
import { sanitizeOutputChunk } from '../security/output-guardrails.js';
import { env } from '../config/env.js';
import { migrateGuestDrafts } from '../services/guest-migration.service.js';
import { snapshot, metadata, extractExplicit, isCorrection, planResponse, documentSummary, effectiveResults } from '../../../../shared/conversation-state.mjs';
import { chatTurnsCounter, contextRetrievalCounter, conversationIntentCounter, responseDecisionCounter, chatFailurePhaseCounter } from '../services/metrics.service.js';
const input = z.object({ message: z.string().trim().min(1).max(4000), turnId: z.string().uuid() });
export async function chatRoutes(fastify: FastifyInstance, options: any = {}) {
    const repo = options.repository || conversations, provider = options.provider || runConfiguredAgenticLoop, clientDb = options.db || db;
    const limiter = options.limiter || concurrencyLimiter;
    const quota = options.quota || checkChatQuota;
    const sessions = options.sessions || new SessionService(clientDb);
    fastify.post('/chat/guest-migration', async (req, reply) => {
        const body = z.object({guestToken:z.string().min(1).max(8192)}).strict().safeParse(req.body);
        if (!body.success) return reply.status(400).send({error:'A guest credential is required'});
        try { return reply.send(await migrateGuestDrafts((req as any).user?.id, body.data.guestToken, clientDb)); }
        catch (error:any) { return reply.status(error.statusCode || 503).send({error:error.statusCode ? error.message : 'Guest migration unavailable'}); }
    });
    fastify.post('/chat/session', (req, reply) => sessionController.create(req, reply));
    fastify.get('/chat/sessions', (req, reply) => sessionController.list(req, reply));
    fastify.patch('/chat/session/:sessionId', (req, reply) => sessionController.update(req, reply));
    fastify.delete('/chat/session/:sessionId', (req, reply) => sessionController.delete(req, reply));
    fastify.put('/chat/session/:sessionId/canvas', async (req,reply)=>{
        const body=z.object({layout:z.unknown(),expectedLayoutRevision:z.number().int().nonnegative()}).strict().safeParse(req.body);
        if(!body.success) return reply.status(400).send({error:'Invalid canvas request'});
        try {return reply.send({state:snapshot(await repo.saveCanvasLayout((req as any).user?.id,(req.params as any).sessionId,body.data.layout,body.data.expectedLayoutRevision))});}
        catch(error:any){return reply.status(error.statusCode||503).send({error:error.statusCode?error.message:'Canvas persistence unavailable'});}
    });
    fastify.get('/chat/session/:sessionId/messages', async (req, reply) => {
        try {
            const session = await repo.load((req as any).user?.id, (req.params as any).sessionId);
            const messages = await clientDb.chatMessage.findMany({ where: { sessionId: session.id, flaggedPromptInjection: false }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
            const state = snapshot(session);
            contextRetrievalCounter.inc({ outcome: 'success' });
            return reply.send({ userEmail: (req as any).user?.email || null, userPlan: (req as any).user?.plan || 'free', sessionId: session.id, documentTypeId: state.documentType, templateId: session.templateId, accentColor: session.accentColor, status: state.lifecycle, slots: state.slots, messages, state, summary: documentSummary(state), collected_data: state.slots, ready_to_generate: state.readyToGenerate });
        }
        catch (error: any) {
            contextRetrievalCounter.inc({ outcome: 'failure' });
            return reply.status(error.statusCode || 503).send({ error: 'Session information is unavailable or access is denied.' });
        }
    });
    fastify.post('/chat/session/:sessionId/confirm', async(req,reply)=>{
        const body=z.object({fingerprint:z.string().min(1).max(60000),expectedRevision:z.number().int().nonnegative()}).safeParse(req.body);
        if(!body.success)return reply.status(400).send({code:'INVALID_INPUT'});
        try {const saved=await repo.finalization((req as any).user?.id,(req.params as any).sessionId,true,body.data.fingerprint,undefined,body.data.expectedRevision);return reply.send({state:snapshot(saved)});}
        catch(error){const details=errorDetails(error,'storage');return reply.status(details.status).send(details);}
    });
    // Asset uploads are authenticated storage operations, independent of AI quotas.
    fastify.post('/chat/session/:sessionId/assets', async(req,reply)=>{
        const body=z.object({expectedRevision:z.number().int().nonnegative(),asset:z.object({
            id:z.string().min(1).max(80),role:z.enum(['logo','image','signature']),name:z.string().max(120),
            src:z.string().max(160000),width:z.number().int().min(1).max(1024),height:z.number().int().min(1).max(1024),
        }).strict()}).strict().safeParse(req.body);
        if(!body.success)return reply.status(400).send({code:'INVALID_INPUT',message:'Choose a supported image within the upload limit.'});
        try {if(body.data.asset.role==='logo')requireEntitlement(await getEntitlements((req as any).user?.id),'custom_logo');const saved=await repo.saveAsset((req as any).user?.id,(req.params as any).sessionId,body.data.asset,body.data.expectedRevision);return reply.send({state:snapshot(saved)});}
        catch(error){const details=errorDetails(error,'storage');if(details.code==='ENTITLEMENT_DENIED'&&body.data.asset.role==='logo')details.message='Business logos are a PRO feature and are not enabled for your account.';return reply.status(details.status).send(details);}
    });
    fastify.delete('/chat/session/:sessionId/assets', async(req,reply)=>{
        const body=z.object({expectedRevision:z.number().int().nonnegative(),ids:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)).min(1).max(6)}).strict().safeParse(req.body);
        if(!body.success)return reply.status(400).send({code:'INVALID_INPUT'});
        try {const saved=await repo.removeAssets((req as any).user?.id,(req.params as any).sessionId,body.data.ids,body.data.expectedRevision);return reply.send({state:snapshot(saved)});}
        catch(error){const details=errorDetails(error,'storage');return reply.status(details.status).send(details);}
    });
    for (const [action, status] of [['complete', 'COMPLETED'], ['abandon', 'ABANDONED']] as const)
        fastify.post('/chat/session/:sessionId/' + action, async (req, reply) => {
            try {
                const session = await repo.lifecycle((req as any).user?.id, (req.params as any).sessionId, status);
                return reply.send({ state: snapshot(session) });
            }
            catch (error: any) {
                return reply.status(error.statusCode || 503).send({ error: 'Cannot ' + action + ' this session. Validate its state first.' });
            }
        });
    fastify.post('/chat/session/:sessionId/resolve', async (req, reply) => {
        const parsed = z.object({ field: z.string(), accept: z.boolean() }).safeParse(req.body);
        if (!parsed.success)
            return reply.status(400).send({ error: 'Invalid resolution' });
        try {
            const session = await repo.apply((req as any).user?.id, (req.params as any).sessionId, { resolve: parsed.data }, { kind: 'user', id: 'resolve:' + Date.now(), message: '', correction: true });
            return reply.send({ state: snapshot(session) });
        }
        catch (error: any) {
            return reply.status(error.statusCode || 422).send({ error: 'Could not resolve this field' });
        }
    });
    fastify.post('/chat/session/:sessionId/message', { preHandler: [limiter] }, async (req, reply) => {
        let lease: any, session: any, reuseResolved = false, providerText = '', mcpClient: Client | undefined, mcpServer: ReturnType<typeof createMcpServer> | undefined;
        let phase='input', turnId:string|undefined;
        const requestId=String(req.headers['x-request-id']||req.id);
        const controller = new AbortController();
        const userId = (req as any).user?.id, sourceSessionId = (req.params as any).sessionId;
        let sessionId = sourceSessionId, transition: any;
        const disconnected = () => { if (!reply.raw.writableEnded)
            controller.abort(); };
        reply.raw.once('close', disconnected);
        req.raw.once('aborted', disconnected);
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(env.TURN_TIMEOUT_MS)]);
        const send = (event: any) => { if (!reply.raw.destroyed)
            reply.raw.write('data: ' + JSON.stringify(event) + '\n\n'); };
        try {
            const body = input.safeParse(req.body);
            if (!body.success)
                throw Object.assign(new Error('Invalid input'),{code:'INVALID_INPUT',statusCode:400,retryable:false});
            const { message } = body.data;
            turnId=body.data.turnId;
            phase='session';
            session = await repo.load(userId, sessionId);
            const flagged = detectPromptInjection(message);
            const initial = snapshot(session), initialIntent = identifyIntent(message, initial);
            if (!flagged && initial.lifecycle === 'COMPLETED' && (initialIntent.allowsMutation || initialIntent.kind === 'change_type')) {
                const target = initialIntent.kind === 'change_type' && initialIntent.targetType ? initialIntent.targetType : initial.documentType;
                phase = 'storage';
                session = await sessions.forkSession(userId, sessionId, target, turnId);
                sessionId = session.id;
                transition = { kind: 'open_session', id: turnId, sessionId, sourceSessionId, documentType: target, reason: 'revision' };
            } else if (!flagged && initial.lifecycle === 'COMPLETED' && initialIntent.kind === 'summary') {
                reply.hijack();
                reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' });
                send({ type: 'done', outcome: 'success', turnId, state: initial, response: documentSummary(initial), actions: [] });
                return;
            }
            session = await repo.load(userId, sessionId, true);
            contextRetrievalCounter.inc({ outcome: 'success' });
            // Deduplication/claim occurs before quota reservation or any provider/tool effect.
            phase='storage';
            const claim = await repo.claim(userId, sessionId, turnId, message, flagged);
            session = claim.session;
            if (!claim.cached)
                lease = { turnId, token: claim.token };
            reply.hijack();
            reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
            if (claim.cached) {
                const state = snapshot(session);
                send({ type: 'done', outcome: 'success', turnId, state, response: metadata(session.slots).turns[turnId].response, actions:metadata(session.slots).turns[turnId].actions||[], sourceSessionId, replayed: true });
                return;
            }
            if (flagged)
                throw Object.assign(new Error('Rejected input'), { code: 'INPUT_REJECTED', statusCode: 400 });
            signal.throwIfAborted();
            const savedTurn = metadata(session.slots).turns[turnId];
            let proposed = savedTurn.localProposal || extractExplicit(message, snapshot(session));
            // Existing interrupted turns retain their old extraction plan. A
            // newly supported explicit table can reconcile its previously
            // unprocessed data without retrying the failed provider request.
            if(proposed.needsProvider && !savedTurn.providerCompleted) {
                const parsed = extractExplicit(message, snapshot(session));
                if(Array.isArray(parsed.slots.lineItems) && parsed.needsProvider===false && !proposed.slots.lineItems)proposed=parsed;
            }
            const intent=proposed.intent||identifyIntent(message,snapshot(session));
            const reuseFrom=message.match(/\bfrom (?:session|conversation) ([0-9a-f-]{36})\b/i);
            if(intent.kind==='reuse'&&reuseFrom) {
                const original=snapshot(await repo.load(userId,reuseFrom[1]));
                for(const field of ['businessName','businessServices','senderAddress','senderEmail','senderPhone','accountDetails']) if(original.slots[field]!==undefined&&!['uncertain','conflicting'].includes(original.fieldStates[field]?.status))proposed.slots[field]=original.slots[field];
                reuseResolved=true;
            }
            if (Object.keys(proposed.slots).length || proposed.skip || proposed.clear || proposed.itemOperations || proposed.resolve || proposed.pendingAnswer || proposed.cancelPending || proposed.cancelField || proposed.requestField || proposed.unassignedContact || proposed.resolveContact || proposed.fieldOperations?.length || proposed.pendingItemEdit || proposed.resolveOperation || proposed.skipAllOptional || proposed.pendingDiscountMode || proposed.pendingDiscountCurrency)
                session = await repo.apply(userId, sessionId, proposed, { id: turnId, kind: 'user', message, correction: isCorrection(message), now: metadata(session.slots).turns[turnId].startedAt }, lease);
            session=await repo.checkpoint(userId,sessionId,lease,{intent,localProposal:proposed});
            const previousTurn=metadata(session.slots).turns[turnId];
            if(previousTurn.providerCompleted) providerText=previousTurn.providerText||'';
            // Extracted values and conversational intent are handled independently. Summary/action
            // requests can follow edits in the same message; answers are never replaced by readiness.
            if (proposed.needsProvider && !previousTurn.providerCompleted && !proposed.clarification) {
                phase='quota';
                if(provider!==runConfiguredAgenticLoop && !previousTurn.quotaReserved) {
                    const allowed = await quota(userId, (req as any).user?.plan || 'free',sessionId+':'+turnId);
                    if (!allowed.allowed) throw Object.assign(new Error('Quota exceeded'), { statusCode: 403, code: 'QUOTA_EXCEEDED',retryable:false });
                    session=await repo.checkpoint(userId,sessionId,lease,{quotaReserved:allowed.reserved!==false});
                }
                signal.throwIfAborted(); phase='context';
                const context = await buildContext(session, message, clientDb,signal,turnId);
                signal.throwIfAborted(); phase='tool';
                const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
                mcpServer = createMcpServer(sessionId, userId, { ...lease, message, now: metadata(session.slots).turns[turnId].startedAt,history:context.evidence },repo);
                mcpClient = new Client({ name: 'doccraft-chat', version: '2.0.0' }, { capabilities: {} });
                await Promise.all([mcpServer.connect(serverTransport), mcpClient.connect(clientTransport)]);
                let completed = false;phase='provider';
                const requireMutation=intent.intents?.some((kind:string)=>['correct','add','remove'].includes(kind))||intent.kind==='provide'&&(isCorrection(message)||/\b(?:quantity|qty|units|unit price|price|rate|cost)\b/i.test(message)&&/\d/.test(message));
                for await (const event of provider(context.messages, context.system, mcpClient, sessionId, signal, userId,{requireMutation,plan:(req as any).user?.plan || 'free'})) {
                    signal.throwIfAborted();
                    if (event.type === 'error') throw Object.assign(new Error('AI response unavailable'), { code:event.code||'PROVIDER_FAILED',phase:event.phase||'provider',statusCode:event.status||503,retryable:event.retryable });
                    if (event.type === 'token') providerText += event.text;
                    if (event.type === 'done') {if(event.text)providerText=event.text;completed=true;}
                }
                if (!completed) throw Object.assign(new Error('Incomplete provider response'), { code: 'RESPONSE_INCOMPLETE',phase:'provider' });
                phase='storage';
                session=await repo.checkpoint(userId,sessionId,lease,{providerCompleted:true,providerText});
            }
            signal.throwIfAborted();
            session = await repo.load(userId, sessionId);
            let state = snapshot(session);const turn=metadata(session.slots).turns[turnId], changed = turn?.changed || [],outcomes=effectiveResults(turn?.results||[]);
            if(['generate','confirm_document'].includes(intent.kind)&&state.dataValid&&!state.pendingIntent&&!outcomes.some((result:any)=>result.outcome==='rejected')) {
                const approve=intent.kind==='confirm_document'&&state.finalization.status==='requested';
                if(!state.canGenerate) {session=await repo.finalization(userId,sessionId,approve,approve?state.finalization.fingerprint:undefined,lease);state=snapshot(session);}
            }
            let actions:any[]=['generate','confirm_document'].includes(intent.kind)&&state.dataValid&&state.finalization.status==='confirmed'&&!state.pendingIntent&&!outcomes.some((result:any)=>result.outcome==='rejected') ? [{kind:'generate',id:turnId,sessionId,documentType:state.documentType,revision:state.revision+1}] : [];
            let draftState: any;
            if (intent.kind === 'change_type' && !transition) {
                if (intent.targetType && intent.targetType !== state.documentType) {
                    const draft = await sessions.forkSession(userId, sessionId, intent.targetType, turnId);
                    draftState = snapshot(draft);
                    actions = [{ kind: 'open_session', id: turnId, sessionId: draft.id, sourceSessionId: sessionId, documentType: draftState.documentType, reason: 'type_change' }];
                }
            } else if (transition) actions = [transition, ...actions];
            const response = sanitizeOutputChunk(planResponse(state, changed, message, { providerText,intent,results:turn.results||[],clarification:proposed.clarification,reuseResolved,draftState,revisionDraft:!!transition }));
            session = await repo.finish(userId, sessionId, turnId, lease.token, response,'success',{actions,retryable:false,optionalOffered:state.nextAction.kind==='offer_optional'&&response.includes(state.nextAction.question)});
            lease = undefined;
            chatTurnsCounter.inc({ outcome: 'success' });
            const intentOutcome=(turn.results||[]).some((result:any)=>result.outcome==='rejected')?'rejected':(turn.results||[]).some((result:any)=>['conflicting','needs_value'].includes(result.outcome))||proposed.clarification?'clarification':!changed.length&&!state.pendingIntent&&['add','correct','remove'].includes(intent.kind)&&!(turn.results||[]).length?'unresolved':'fulfilled';
            conversationIntentCounter.inc({intent:intent.kind,outcome:intentOutcome});
            responseDecisionCounter.inc({decision:providerText.trim()===response?'provider_preserved':providerText?'provider_constrained':'deterministic'});
            req.log.info({ sessionId, turnId, intent:intent.kind, operationOutcomes:(turn.results||[]).map((result:any)=>({field:result.field,outcome:result.outcome,code:result.code})),revision: snapshot(session).revision, nextField: state.nextAction.field }, 'chat turn committed');
            send({ type: 'token', text: response });
            send({ type: 'done', outcome: 'success', turnId, state: snapshot(session), response,actions,sourceSessionId,version:2 });
        }
        catch (error: any) {
            const outcome = controller.signal.aborted ? 'cancelled' : signal.aborted || error.code === 'RESPONSE_INCOMPLETE' ? 'incomplete' : 'failure';
            const details=errorDetails(signal.aborted ? signal.reason : error,phase);
            chatFailurePhaseCounter.inc({phase:['input','session','storage','quota','context','provider','tool','transport'].includes(details.phase)?details.phase:'unknown',retryable:String(details.retryable)});
            req.log.warn({requestId,sessionId,turnId,...details,message:undefined},'chat turn failed');
            if (lease) {
                try {
                    session = await repo.finish(userId, sessionId, lease.turnId, lease.token, '', outcome,{retryable:details.retryable,code:details.code,phase:details.phase});
                }
                catch { /* No save acknowledgement: retry will reconcile the fenced lease. */ }
            }
            chatTurnsCounter.inc({ outcome });
            const event = {type:'error',outcome,...details,requestId,sessionId,sourceSessionId,turnId, ...(session ? { state: snapshot(session) } : {}) };
            if (reply.raw.headersSent)
                send(event);
            else
                return reply.status(details.status).send(event);
        }
        finally {
            if (reply.raw.headersSent && !reply.raw.writableEnded)
                reply.raw.end();
            await Promise.allSettled([mcpClient?.close(), mcpServer?.close()]);
            (req as any).releaseConcurrencyPermit?.();
            reply.raw.off('close', disconnected);
            req.raw.off('aborted', disconnected);
        }
    });
}
