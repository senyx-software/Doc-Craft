import { PrismaClient } from '../generated/prisma/index.js';
import { db } from './db.service.js';
import { ConversationRepository, ConversationError } from './conversation.repository.js';
import { documentType, contract, documentData, validField,templateSchema,templates } from '../../../../shared/document-contract.mjs';
import { metadata, snapshot } from '../../../../shared/conversation-state.mjs';
import { createHash } from 'node:crypto';
import { requirePublishedTemplate } from './template-policy.service.js';
export class SessionService {
    constructor(private prisma: PrismaClient = db) { }
    // Stable, owner-scoped identity makes retrying a transition return the same draft.
    async forkSession(userId: string, sourceId: string, targetType: string, operationId: string) {
        const source = await new ConversationRepository(this.prisma).load(userId, sourceId);
        if (source.expiresAt && new Date(source.expiresAt).getTime() <= Date.now())
            throw new ConversationError(410, 'Session expired', 'SESSION_EXPIRED', false);
        const kind = documentType(targetType), state = snapshot(source);
        const digest = createHash('sha256').update(JSON.stringify(['draft-v1', userId, sourceId, operationId, kind])).digest('hex');
        const id = digest.slice(0, 8) + '-' + digest.slice(8, 12) + '-4' + digest.slice(13, 16) + '-a' + digest.slice(17, 20) + '-' + digest.slice(20, 32);
        const existing = await this.prisma.chatSession.findUnique({ where: { id } });
        if (existing) {
            if (existing.userId !== userId || metadata(existing.slots).origin?.sessionId !== sourceId)
                throw new ConversationError(409, 'Draft transition conflict', 'REVISION_CONFLICT', false);
            return existing;
        }
        const targetId = kind === state.documentType ? source.documentTypeId : kind;
        let doc = await this.prisma.documentType.findUnique({ where: { id: targetId } });
        if (!doc) doc = await this.prisma.documentType.upsert({ where: { id: targetId }, create: { id: targetId, name: contract.documents[kind].label, slotSchema: contract.documents[kind].required.map((name: string) => ({ name, required: true })) }, update: {} });
        const templateId = kind === state.documentType ? source.templateId : ({ invoice: 'tmpl_invoice_2023_01', quotation: 'tmpl_quotation_modern', receipt: 'tmpl_receipt_official', proposal: 'tmpl_proposal_corporate', purchase_order: 'tmpl_purchase_order_classic' }[kind] || kind + '-classic');
        await requirePublishedTemplate(templateId,userId);
        let template = await this.prisma.template.findUnique({ where: { id: templateId } });
        if (!template) template = await this.prisma.template.upsert({ where: { id: templateId }, create: { id: templateId, documentTypeId: doc.id, name: 'Classic', thumbnailUrl: '', htmlPath: '' }, update: {} });
        if (template.documentTypeId && template.documentTypeId !== doc.id)
            throw new ConversationError(409, 'Incompatible draft template', 'VALIDATION_FAILED', false);
        const fields: Record<string, any> = {}, slots: Record<string, any> = {};
        for (const key of [...contract.documents[kind].required, ...contract.documents[kind].optional]) {
            if (validField(key, state.slots[key]) && !['uncertain', 'conflicting'].includes(state.fieldStates[key]?.status)) {
                slots[key] = structuredClone(state.slots[key]);
                if (key === 'lineItems') slots[key] = slots[key].map(({ total, ...item }: any) => item);
                fields[key] = { status: 'confirmed', kind: 'authorized_reuse', source: sourceId, revision: state.revision };
            }
        }
        slots._chat = { version: 2, revision: 0, documentType: kind, templateId,documentSchema:doc.slotSchema||[],timezone: metadata(source.slots).timezone || 'UTC', profileAvailable: metadata(source.slots).profileAvailable, fields, turns: {}, origin: { sessionId: sourceId, revision: state.revision, operationId, kind: kind === state.documentType ? 'revision' : 'type_change' } };
        slots._chat.assets=structuredClone((state.assets||[]).filter((asset:any)=>kind===state.documentType||asset.role==='logo'));
        const data = { id, userId, documentTypeId: doc.id, templateId: template.id, title: (kind === state.documentType ? 'Revision: ' : 'Draft: ') + contract.documents[kind].label, status: 'ACTIVE' as const, modelPreference: source.modelPreference || 'groq', isArchived: false, accentColor: source.accentColor, slots: JSON.parse(JSON.stringify(slots)), expiresAt: source.expiresAt };
        try { return await this.prisma.chatSession.create({ data }); }
        catch (error) {
            // A concurrent identical transition may have won the unique-ID insert.
            const saved = await this.prisma.chatSession.findUnique({ where: { id } });
            if (saved?.userId === userId && metadata(saved.slots).origin?.sessionId === sourceId) return saved;
            throw Object.assign(new Error('Could not create draft'), { code: 'STORAGE_UNAVAILABLE', statusCode: 503, phase: 'storage', retryable: true });
        }
    }
    async createSession(userId: string, documentTypeId: string, templateId: string, title?: string, modelPreference = 'groq', reuseFromSessionId?: string,profile={timezone:'UTC',available:false}) {
        if (!userId || userId === 'guest_user')
            throw new ConversationError(401, 'Verified identity required');
        await requirePublishedTemplate(templateId,userId);
        let doc = await this.prisma.documentType.findUnique({ where: { id: documentTypeId } });
        let kind: string;
        try {
            kind = documentType(doc?.name || documentTypeId);
        }
        catch {
            throw new ConversationError(400, 'Unsupported document type');
        }
        if (!doc)
            doc = await this.prisma.documentType.upsert({ where: { id: documentTypeId }, create: { id: documentTypeId, name: contract.documents[kind].label, slotSchema: contract.documents[kind].required.map((name: string) => ({ name, required: true })) }, update: {} });
        let template = await this.prisma.template.findUnique({ where: { id: templateId } });
        if (!template)
            template = await this.prisma.template.upsert({ where: { id: templateId }, create: { id: templateId, documentTypeId: doc.id, name: templateId, thumbnailUrl: '', htmlPath: '' }, update: {} });
        templateSchema(kind,templateId,doc.slotSchema);
        const slots: Record<string, any> = { _chat: { version: 2, revision: 0, documentType: kind,templateId,documentSchema:doc.slotSchema||[], timezone:profile.timezone,profileAvailable:profile.available, fields: {}, turns: {} } };
        if (reuseFromSessionId) {
            const original = await new ConversationRepository(this.prisma).load(userId, reuseFromSessionId), state = snapshot(original);
            slots._chat.assets=structuredClone((state.assets||[]).filter((asset:any)=>asset.role==='logo'));
            for (const key of ['businessName', 'businessServices', 'senderAddress', 'senderEmail', 'senderPhone', 'accountDetails']) {
                if (validField(key, state.slots[key]) && !['uncertain', 'conflicting'].includes(state.fieldStates[key]?.status)) {
                    slots[key] = state.slots[key];
                    slots._chat.fields[key] = { status: 'confirmed', source: reuseFromSessionId, kind: 'authorized_reuse' };
                }
            }
        }
        return this.prisma.chatSession.create({ data: { userId, documentTypeId: doc.id, templateId: template.id, title: title || 'Draft: ' + contract.documents[kind].label, status: 'ACTIVE', modelPreference, isArchived: false, slots, expiresAt: userId.startsWith('guest_') ? new Date(Date.now() + 86400000) : null } });
    }
    async listSessions(userId: string, archived = false) {
        if (!userId || userId === 'guest_user')
            throw new ConversationError(401, 'Verified identity required');
        const sessions = await this.prisma.chatSession.findMany({ where: { userId, isArchived: archived }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { messages: true } } } });
        return sessions.map(session => ({ ...session, slots: documentData(session.slots as any) }));
    }
    private ownership(userId: string, sessionId: string) { return new ConversationRepository(this.prisma).load(userId, sessionId); }
    async renameSession(userId: string, sessionId: string, title: string) { return new ConversationRepository(this.prisma).updateMetadata(userId,sessionId,{title}); }
    async updateTemplate(userId: string, sessionId: string, templateId: string) { const session=await new ConversationRepository(this.prisma).load(userId,sessionId,true);await requirePublishedTemplate(templateId,userId);let template=await this.prisma.template.findUnique({where:{id:templateId}});
        const kind=snapshot(session).documentType;
        if(!template&&templates[templateId]?.documentTypes.includes(kind))template=await this.prisma.template.upsert({where:{id:templateId},create:{id:templateId,documentTypeId:session.documentTypeId,name:templates[templateId].name,thumbnailUrl:'',htmlPath:templates[templateId].variant},update:{}});
        if(!template || (template.documentTypeId!==session.documentTypeId&&!templates[templateId]?.documentTypes.includes(kind)))throw new ConversationError(400,'Unknown or incompatible template');
        templateSchema(kind,templateId,metadata(session.slots).documentSchema);
        return new ConversationRepository(this.prisma).updateMetadata(userId,sessionId,{templateId}); }
    async updateAccentColor(userId: string, sessionId: string, accentColor: string) { if(!/^#[a-f0-9]{3,8}$/i.test(accentColor))throw new ConversationError(400,'Invalid accent color');return new ConversationRepository(this.prisma).updateMetadata(userId,sessionId,{accentColor}); }
    async updateSlots(userId: string, sessionId: string, slots: Record<string, unknown>, expectedRevision?: number) {
        return new ConversationRepository(this.prisma).apply(userId, sessionId, { slots }, { kind: 'canvas', id: 'canvas:' + Date.now(), message: '', correction: true, expectedRevision });
    }
    async archiveSession(userId: string, sessionId: string, isArchived: boolean) { await this.ownership(userId, sessionId); return this.prisma.chatSession.update({ where: { id: sessionId }, data: { isArchived } }); }
    async deleteSession(userId: string, sessionId: string) { await this.ownership(userId, sessionId); return this.prisma.chatSession.delete({ where: { id: sessionId } }); }
}
export const sessionService = new SessionService();
