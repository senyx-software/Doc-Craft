import { randomUUID, createHash } from 'node:crypto';
import { db } from './db.service.js';
import { metadata, latestTurn, snapshot, applyCandidates, stableStringify } from '../../../../shared/conversation-state.mjs';
import { documentType } from '../../../../shared/document-contract.mjs';
import { sanitizeOutputChunk } from '../security/output-guardrails.js';
import { validAsset, documentAssets, MAX_DOCUMENT_ASSETS } from '../../../../shared/document-assets.mjs';
import { canvasLayout } from '../../../../shared/canvas-layout.mjs';
import {editorContext,applyEditorOperations,recordHistory,historySnapshot} from '../../../../shared/editor-commands.mjs';
import {validateLanguageCorrection} from '../../../../shared/language-corrections.mjs';
export class ConversationError extends Error {
    constructor(public statusCode: number, message: string, public code?: string, public retryable?: boolean) { super(message); }
}
export class ConversationRepository {
    constructor(private client: any = db) { }
    async load(userId: string, sessionId: string, writable = false) {
        if (!userId || userId === 'guest_user')
            throw new ConversationError(401, 'Verified identity required');
        let session;
        try {session = await this.client.chatSession.findUnique({ where: { id: sessionId } });}
        catch {throw Object.assign(new ConversationError(503,'Document storage is unavailable','STORAGE_UNAVAILABLE',true),{phase:'storage'});}
        if (!session)
            throw new ConversationError(404, 'Session not found');
        if (session.userId !== userId)
            throw new ConversationError(403, 'Session access denied');
        if (!metadata(session.slots).documentType) {
            try {
                session._resolvedDocumentType = documentType(session.documentTypeId);
            }
            catch {
                const doc = await this.client.documentType.findUnique({ where: { id: session.documentTypeId } });
                session._resolvedDocumentType = documentType(doc?.name || '');
            }
        }
        if (writable && snapshot(session).readOnly)
            throw new ConversationError(session.status === 'ACTIVE' ? 410 : 409, 'Session is read-only',session.status==='ACTIVE'?'SESSION_EXPIRED':'SESSION_READ_ONLY',false);
        return session;
    }
    // Short optimistic transactions only. No provider call runs inside a transaction.
    async mutate(userId: string, sessionId: string, change: (session: any, tx: any) => Promise<any>, writable = true) {
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                return await this.client.$transaction(async (tx: any) => {
                    const repo = new ConversationRepository(tx);
                    const session = await repo.load(userId, sessionId, writable);
                    const next = await change(structuredClone(session), tx);
                    if(next._noMutation)return session;
                    const meta = metadata(next.slots);
                    meta.revision = metadata(session.slots).revision + 1;
                    if (session._resolvedDocumentType)
                        meta.documentType = session._resolvedDocumentType;
                    next.slots = { ...next.slots, _chat: meta };
                    const update = await tx.chatSession.updateMany({ where: { id: sessionId, userId, slots: { equals: session.slots } }, data: { slots: next.slots, ...(next.status ? { status: next.status } : {}), ...(next.completedAt ? { completedAt: next.completedAt } : {}), ...Object.fromEntries(['title','templateId','accentColor','isArchived'].filter(key=>next[key]!==undefined).map(key=>[key,next[key]])) } });
                    if (update.count !== 1)
                        throw new ConversationError(409, 'REVISION_RETRY');
                    return { ...session, ...next };
                },{timeout:10000,maxWait:2000});
            }
            catch (error) {
                if (error instanceof ConversationError && error.message === 'REVISION_RETRY')
                    continue;
                if(error instanceof ConversationError || (error as any)?.statusCode)throw error;
                throw Object.assign(new Error('Document storage operation failed'),{code:'STORAGE_UNAVAILABLE',statusCode:503,phase:'storage',retryable:true});
            }
        }
        throw new ConversationError(409, 'Concurrent update; please retry');
    }
    assertLease(meta: any, turnId: string, token: string) {
        if (!meta.lease || meta.lease.turnId !== turnId || meta.lease.token !== token || meta.lease.until < Date.now())
            throw new ConversationError(409, 'Turn was superseded; retry to reconcile');
    }
    async claim(userId: string, sessionId: string, turnId: string, message: string, flagged = false) {
        const token = randomUUID();
        const digest = createHash('sha256').update(message).digest('hex');
        const session = await this.mutate(userId, sessionId, async (session, tx) => {
            const meta = metadata(session.slots), old = meta.turns[turnId];
            if (old && old.digest !== digest)
                throw new ConversationError(409, 'Turn ID already belongs to a different message');
            if (old?.status === 'success')
                return {_noMutation:true};
            if (old && latestTurn(meta)?.[0] !== turnId)
                throw new ConversationError(409, 'This interrupted turn was superseded by a newer message');
            if (meta.lease && meta.lease.until > Date.now())
                throw new ConversationError(409, 'Another turn is still running. Please retry.');
            if (!old) {
                if (Object.keys(meta.turns).length >= 500)
                    throw new ConversationError(409, 'Conversation turn limit reached; create a new document from these saved facts','TURN_LIMIT',false);
                await tx.chatMessage.create({ data: { id: this.messageId(sessionId, turnId, 'user'), sessionId, role: 'USER', content: message, flaggedPromptInjection: flagged, metadata: { turnId } } });
            }
            meta.turns[turnId] = { ...old, digest, startedAt: old?.startedAt || Date.now(), message, flagged, status: 'running', operations: old?.operations || {}, changed: old?.changed || [] };
            meta.latestTurnId = turnId;
            meta.lease = { turnId, token, until: Date.now() + 120000 };
            return { slots: { ...session.slots, _chat: meta } };
        });
        return { session, token, cached: metadata(session.slots).turns[turnId]?.status === 'success' };
    }
    messageId(sessionId: string, turnId: string, role: string) { const h = createHash('sha256').update(sessionId + ':' + turnId + ':' + role).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32); }
    async apply(userId: string, sessionId: string, proposal: any, source: any, lease?: {
        turnId: string;
        token: string;
    }) {
        return this.mutate(userId, sessionId, async (session) => {
            const meta = metadata(session.slots);
            if (source.expectedRevision !== undefined && source.expectedRevision !== meta.revision)
                throw new ConversationError(409, 'State changed; reload before editing');
            if (lease)
                this.assertLease(meta, lease.turnId, lease.token);
            else if (meta.lease && meta.lease.until > Date.now())
                throw new ConversationError(409, 'A turn is running; retry your edit');
            const identity = {...proposal,itemOperations:proposal.itemOperations?.map((op:any)=>op.operation==='add'?{operation:op.operation,item:op.item}:op)};
            delete identity.intent; delete identity.needsProvider;
            const opId = createHash('sha256').update(stableStringify(identity)).digest('hex');
            const legacyId=createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
            if (lease && (meta.turns[lease.turnId].operations[opId] || meta.turns[lease.turnId].operations[legacyId]))
                return { slots: session.slots };
            const applied = applyCandidates(meta.documentType || session._resolvedDocumentType || session.documentTypeId, {...session.slots,_chat:{...meta,templateId:session.templateId}}, proposal, source);
            const nextMeta = metadata(applied.raw);
            if(applied.changed.length)recordHistory(nextMeta,session,lease?.turnId||source.id||randomUUID());
            if (lease) {
                const turn = nextMeta.turns[lease.turnId];
                turn.operations[opId] = true;
                if(source.kind==='user')turn.localProposal=JSON.parse(JSON.stringify(proposal));
                turn.results = [...(turn.results||[]),...applied.results];
                turn.changed = [...new Set([...turn.changed, ...applied.changed])];
            }
            return { slots: { ...applied.raw, _chat: nextMeta } };
        });
    }
    async updateMetadata(userId:string,sessionId:string,patch:any,expectedRevision?:number) {
        await this.load(userId,sessionId,true);
        return this.mutate(userId,sessionId,async(session)=>{
            const meta=metadata(session.slots);
            if(meta.lease&&meta.lease.until>Date.now())throw new ConversationError(409,'A turn is running','TURN_BUSY');
            if(expectedRevision!==undefined&&expectedRevision!==meta.revision)throw new ConversationError(409,'State changed; reload before editing','REVISION_CONFLICT');
            if(patch.templateId) {meta.templateId=patch.templateId;delete meta.finalization;}
            if(patch.accentColor)delete meta.finalization;
            return {slots:{...session.slots,_chat:meta},...patch};
        });
    }
    async saveCanvasLayout(userId:string,sessionId:string,input:unknown,expectedRevision:number,context?:unknown) {
        let layout;
        try { layout=canvasLayout(input); }
        catch { throw new ConversationError(400,'Invalid canvas layout','INVALID_INPUT',false); }
        return this.mutate(userId,sessionId,async session=>{
            const meta=metadata(session.slots);
            if(meta.lease&&meta.lease.until>Date.now())throw new ConversationError(409,'A turn is running','TURN_BUSY');
            if ((meta.layoutRevision || 0)!==expectedRevision) throw new ConversationError(409,'Canvas changed; reload before saving','REVISION_CONFLICT',false);
            if(JSON.stringify(meta.canvasLayout||canvasLayout({}))!==JSON.stringify(layout))recordHistory(meta,session,'canvas:'+randomUUID());
            meta.canvasLayout=layout;meta.layoutRevision=expectedRevision+1;
            if(context)meta.editorContext=editorContext(context);
            return {slots:{...session.slots,_chat:meta}};
        });
    }
    async saveEditorContext(userId:string,sessionId:string,context:unknown,expectedLayoutRevision:number,lease:{turnId:string;token:string}) {
        const validated=editorContext(context);
        return this.mutate(userId,sessionId,async session=>{
            const meta=metadata(session.slots);this.assertLease(meta,lease.turnId,lease.token);
            if((meta.layoutRevision||0)!==expectedLayoutRevision)throw new ConversationError(409,'Canvas changed; reload before sending the edit','REVISION_CONFLICT',false);
            const turn=meta.turns[lease.turnId];
            if(turn.editorSelection)validated.selectedIds=turn.editorSelection.filter((id:string)=>validated.elements.some((el:any)=>el.id===id));
            else turn.editorSelection=[...validated.selectedIds];
            meta.editorContext=validated;
            return {slots:{...session.slots,_chat:meta}};
        });
    }
    async editCanvas(userId:string,sessionId:string,operations:any[],message:string,lease:{turnId:string;token:string}) {
        return this.mutate(userId,sessionId,async session=>{
            const meta=metadata(session.slots);this.assertLease(meta,lease.turnId,lease.token);
            const operationId=createHash('sha256').update(stableStringify(operations)).digest('hex');
            const turn=meta.turns[lease.turnId];
            if(turn.editorOperations?.[operationId])return {_noMutation:true};
            const result=applyEditorOperations(meta.canvasLayout,meta.editorContext,operations,message,lease.turnId);
            recordHistory(meta,session,lease.turnId);
            meta.canvasLayout=result.layout;meta.editorContext=result.context;meta.layoutRevision=(meta.layoutRevision||0)+1;
            delete meta.editorClarification;delete meta.finalization;
            turn.editorOperations={...turn.editorOperations,[operationId]:true};turn.editorApplied=true;turn.editorResponse=result.response;
            return {slots:{...session.slots,_chat:meta}};
        });
    }
    async clarifyEditor(userId:string,sessionId:string,pending:any,lease:{turnId:string;token:string}) {
        return this.mutate(userId,sessionId,async session=>{
            const meta=metadata(session.slots);this.assertLease(meta,lease.turnId,lease.token);
            meta.editorClarification=pending;
            return {slots:{...session.slots,_chat:meta}};
        });
    }
    async undoDocument(userId:string,sessionId:string,direction:'undo'|'redo',lease:{turnId:string;token:string}) {
        return this.mutate(userId,sessionId,async session=>{
            const meta=metadata(session.slots);this.assertLease(meta,lease.turnId,lease.token);
            const turn=meta.turns[lease.turnId];if(turn.historyApplied)return {_noMutation:true};
            const history=structuredClone(meta.documentHistory||{past:[],future:[]}),from=direction==='undo'?history.past:history.future,to=direction==='undo'?history.future:history.past;
            const previous=from.pop();
            if(!previous){turn.editorResponse='There are no saved changes to '+direction+'.';turn.historyApplied=true;return {slots:{...session.slots,_chat:meta}};}
            to.push({turnId:lease.turnId,state:historySnapshot(session)});
            for(const key of ['fields','canvasLayout','editorContext','pendingField','pendingContact','pendingIntent','pendingAction','collection','finalization','editorClarification','pendingLanguage'])delete meta[key];
            Object.assign(meta,previous.state.meta);meta.documentHistory=history;meta.layoutRevision=(meta.layoutRevision||0)+1;
            turn.editorApplied=true;turn.historyApplied=true;turn.editorResponse=direction==='undo'?'Done. I’ve restored the previous change.':'Done. I’ve reapplied the change.';
            return {slots:{...previous.state.slots,_chat:meta},templateId:previous.state.templateId,accentColor:previous.state.accentColor};
        });
    }
    async proposeLanguage(userId:string,sessionId:string,input:any,message:string,mode:string,lease:{turnId:string;token:string}) {
        const saved=await this.mutate(userId,sessionId,async session=>{
            const meta=metadata(session.slots);this.assertLease(meta,lease.turnId,lease.token);
            const proposal=validateLanguageCorrection(input,snapshot(session),message,mode);
            meta.pendingLanguage=proposal;meta.turns[lease.turnId].languageResponse=proposal.question;
            return {slots:{...session.slots,_chat:meta}};
        });
        return metadata(saved.slots).pendingLanguage?.automatic?this.resolveLanguage(userId,sessionId,'yes',lease):saved;
    }
    async resolveLanguage(userId:string,sessionId:string,answer:string,lease:{turnId:string;token:string}) {
        return this.mutate(userId,sessionId,async session=>{
            const meta=metadata(session.slots);this.assertLease(meta,lease.turnId,lease.token);
            const pending=meta.pendingLanguage,turn=meta.turns[lease.turnId];if(turn.languageResolved||!pending)return {_noMutation:true};
            if(/^(?:no|cancel|dismiss|keep (?:it|the original))[.!]?$/i.test(answer.trim())){delete meta.pendingLanguage;turn.languageResolved=true;turn.languageResponse='Kept your original wording. Your document is unchanged.';return {slots:{...session.slots,_chat:meta}};}
            const field=pending.field||(/\bnotes?\b/i.test(answer)?'notesAndTerms':/\bsubject\b/i.test(answer)?'subject':null);
            if(!field){turn.languageResponse='Where should I use the corrected wording: the notes or the subject?';return {slots:{...session.slots,_chat:meta}};}
            if(pending.field&&JSON.stringify(snapshot(session).slots[field]??null)!==JSON.stringify(pending.previousValue))throw new ConversationError(409,'The text changed. Ask for a new correction.','REVISION_CONFLICT',false);
            const proposal=field==='notesAndTerms'&&!pending.editingSaved?{fieldOperations:[{operation:'append',field,value:pending.suggested}]}:{slots:{[field]:pending.suggested}};
            const applied=applyCandidates(snapshot(session).documentType,session.slots,proposal,{kind:'user',id:lease.turnId,message:pending.suggested,correction:true});
            if(applied.results.some((result:any)=>result.outcome==='rejected'))throw new ConversationError(422,'The corrected text is not valid for this field.','VALIDATION_FAILED',false);
            const nextMeta=metadata(applied.raw);recordHistory(nextMeta,session,lease.turnId);delete nextMeta.pendingLanguage;delete nextMeta.finalization;
            Object.assign(nextMeta.turns[lease.turnId],{languageResolved:true,languageResponse:'Saved the corrected wording in the '+(field==='notesAndTerms'?'notes':'subject')+'.',changed:[...new Set([...(turn.changed||[]),...applied.changed])],results:[...(turn.results||[]),...applied.results]});
            return {slots:{...applied.raw,_chat:nextMeta}};
        });
    }
    async checkpoint(userId: string, sessionId: string, lease: {turnId:string;token:string}, patch: {providerCompleted?:boolean;providerText?:string;quotaReserved?:boolean;intent?:any;actions?:any[];localProposal?:any;routingSnapshot?:any}) {
        return this.mutate(userId,sessionId,async(session)=>{
            const meta=metadata(session.slots);this.assertLease(meta,lease.turnId,lease.token);
            if(patch.intent&&meta.collection?.offerPending)meta.collection={...meta.collection,offerPending:false};
            Object.assign(meta.turns[lease.turnId],JSON.parse(JSON.stringify(patch)));
            return {slots:{...session.slots,_chat:meta}};
        });
    }
    async saveAsset(userId:string, sessionId:string, input:any, expectedRevision:number) {
        if (!validAsset(input)) throw new ConversationError(400,'Upload a PNG image within the supported size','INVALID_INPUT',false);
        const bytes=Buffer.from(input.src.split(',')[1], 'base64');
        if (bytes.length < 33 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
            bytes.toString('ascii',12,16)!=='IHDR' || bytes.readUInt32BE(16)!==input.width || bytes.readUInt32BE(20)!==input.height) {
            throw new ConversationError(400,'Invalid image dimensions or format','INVALID_INPUT',false);
        }
        const asset={id:input.id,role:input.role,name:input.name,src:input.src,width:input.width,height:input.height,hash:createHash('sha256').update(bytes).digest('hex')};
        return this.mutate(userId,sessionId,async(session,tx)=>{
            const meta=metadata(session.slots), assets=documentAssets(meta.assets), existing=assets.find(a=>a.id===asset.id);
            if(existing?.hash===asset.hash && existing.role===asset.role) return {_noMutation:true};
            if(existing)throw new ConversationError(409,'This upload identifier belongs to a different image','REVISION_CONFLICT',false);
            if(meta.lease&&meta.lease.until>Date.now())throw new ConversationError(409,'Wait for the current message to finish saving','TURN_BUSY',true);
            if(meta.revision!==expectedRevision)throw new ConversationError(409,'Document changed; retry the upload','REVISION_CONFLICT',true);
            const next=assets.filter(a=>asset.role==='image'||a.role!==asset.role);
            if(next.length>=MAX_DOCUMENT_ASSETS)throw new ConversationError(422,'A document can contain up to six uploaded images','ASSET_LIMIT',false);
            meta.assets=[...next,asset];delete meta.finalization;
            const content=`Added your ${asset.role}. It has been resized proportionally and placed in available document space. You can move or resize it in the preview.`;
            await tx.chatMessage.create({data:{id:this.messageId(sessionId,asset.id,'asset'),sessionId,role:'ASSISTANT',content,metadata:{assetId:asset.id}}});
            return {slots:{...session.slots,_chat:meta}};
        });
    }
    async removeAssets(userId:string,sessionId:string,ids:string[],expectedRevision:number) {
        return this.mutate(userId,sessionId,async(session)=>{
            const meta=metadata(session.slots),assets=documentAssets(meta.assets);
            if(meta.lease&&meta.lease.until>Date.now())throw new ConversationError(409,'Wait for the current message to finish saving','TURN_BUSY',true);
            if(meta.revision!==expectedRevision)throw new ConversationError(409,'Document changed; retry removing the image','REVISION_CONFLICT',true);
            const remaining=assets.filter(asset=>!ids.includes(asset.id));
            if(remaining.length===assets.length)return {_noMutation:true};
            meta.assets=remaining;delete meta.finalization;
            return {slots:{...session.slots,_chat:meta}};
        });
    }
    async finish(userId: string, sessionId: string, turnId: string, token: string, response: string, outcome = 'success', details: any = {}) {
        return this.mutate(userId, sessionId, async (session, tx) => {
            const meta = metadata(session.slots);
            this.assertLease(meta, turnId, token);
            if (outcome === 'success')
                await tx.chatMessage.create({ data: { id: this.messageId(sessionId, turnId, 'assistant'), sessionId, role: 'ASSISTANT', content: sanitizeOutputChunk(response), metadata: { turnId,...(details.processingRoute?{processingRoute:details.processingRoute,editorAttempt:details.editorAttempt===true,editorApplied:details.editorApplied===true,documentReady:details.documentReady===true}:{}) } } });
            meta.turns[turnId].status = outcome;
            Object.assign(meta.turns[turnId],details);
            if(details.optionalOffered)meta.collection={...meta.collection,optionalOffered:true,offerPending:true};
            meta.turns[turnId].response = outcome === 'success' ? sanitizeOutputChunk(response) : undefined;
            delete meta.lease;
            // Strip undefined before storing JSON.
            return { slots: JSON.parse(JSON.stringify({ ...session.slots, _chat: meta })) };
        });
    }
    async lifecycle(userId: string, sessionId: string, status: 'COMPLETED' | 'ABANDONED') {
        return this.mutate(userId, sessionId, async (session) => {
            const meta = metadata(session.slots);
            if (meta.lease && meta.lease.until > Date.now())
                throw new ConversationError(409, 'A turn is running');
            if (status === 'COMPLETED' && !snapshot(session).readyToGenerate)
                throw new ConversationError(422, 'Required fields are incomplete');
            if (status === 'COMPLETED' && !snapshot(session).canGenerate)throw new ConversationError(422,'Review and confirm document details before finalizing','CONFIRMATION_REQUIRED',false);
            return { slots: session.slots, status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) };
        });
    }
    async finalization(userId:string,sessionId:string,confirm:boolean,expectedFingerprint?:string,lease?:{turnId:string;token:string},expectedRevision?:number) {
        return this.mutate(userId,sessionId,async(session)=>{
            const meta=metadata(session.slots),state=snapshot(session);
            if(lease)this.assertLease(meta,lease.turnId,lease.token);
            else if(meta.lease&&meta.lease.until>Date.now())throw new ConversationError(409,'A turn is running','TURN_BUSY');
            if(expectedRevision!==undefined&&expectedRevision!==meta.revision)throw new ConversationError(409,'Document changed; review the current details','REVISION_CONFLICT');
            if(!state.dataValid||state.pendingIntent)throw new ConversationError(422,'Required or uncertain values are unresolved','VALIDATION_FAILED',false);
            if(confirm&&expectedFingerprint!==state.finalization.fingerprint)throw new ConversationError(409,'Document changed; review the current details','REVISION_CONFLICT');
            meta.collection={...meta.collection,optionalOffered:true,offerPending:false};
            meta.finalization={status:confirm?'confirmed':'requested',fingerprint:state.finalization.fingerprint,...(confirm?{confirmedAt:new Date().toISOString()}:{})};
            return {slots:{...session.slots,_chat:meta}};
        });
    }
}
export const conversations = new ConversationRepository();
