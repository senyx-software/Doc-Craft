import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authorizedProfile } from '../services/profileClient.service.js';
import { sessionService } from '../services/session.service.js';
import { snapshot, planResponse } from '../../../../shared/conversation-state.mjs';
const start = z.object({ documentTypeId: z.string().min(1), templateId: z.string().min(1), title: z.string().min(1).max(100).optional(), reuseFromSessionId: z.string().optional(), timezone:z.string().max(100).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true;}catch{return false;}},'Invalid timezone').optional() });
const patch = z.object({ title: z.string().min(1).max(100).optional(), isArchived: z.boolean().optional(), templateId: z.string().min(1).optional(), accentColor: z.string().optional(), slots: z.record(z.string(), z.unknown()).optional(), expectedRevision: z.number().int().nonnegative().optional() });
function user(req: FastifyRequest) { const id = (req as any).user?.id; if (!id)
    throw Object.assign(new Error('Verified identity required'), { statusCode: 401 }); return id; }
async function failure(reply: FastifyReply, error: any) { return reply.status(error.statusCode || 503).send({ error: error.statusCode ? error.message : 'Session information is unavailable. Please retry.' }); }
export class SessionController {
    async create(req: FastifyRequest, reply: FastifyReply) {
        const parsed = start.safeParse(req.body);
        if (!parsed.success)
            return reply.status(400).send({ error: 'Invalid session request' });
        try {
            const body = parsed.data;
            const profile=await authorizedProfile(user(req),req.headers.authorization);
            if(body.timezone&&(!profile.available||profile.timezoneConfigured===false))profile.timezone=body.timezone;
            const session = await sessionService.createSession(user(req), body.documentTypeId, body.templateId, body.title, 'groq', body.reuseFromSessionId,profile);
            const state = snapshot(session);
            return reply.status(201).send({ sessionId: session.id, title: session.title, status: session.status, state, opening_message: planResponse(state) });
        }
        catch (e) {
            return failure(reply, e);
        }
    }
    async list(req: FastifyRequest, reply: FastifyReply) { try {
        return reply.send({ sessions: await sessionService.listSessions(user(req), (req.query as any).archived === 'true') });
    }
    catch (e) {
        return failure(reply, e);
    } }
    async update(req: FastifyRequest, reply: FastifyReply) {
        const parsed = patch.safeParse(req.body);
        if (!parsed.success || !Object.keys(parsed.data).length)
            return reply.status(400).send({ error: 'Invalid update' });
        try {
            const id = user(req), sessionId = (req.params as any).sessionId, body = parsed.data;
            let session;
            if (body.slots)
                session = await sessionService.updateSlots(id, sessionId, body.slots, body.expectedRevision);
            if (body.title !== undefined)
                session = await sessionService.renameSession(id, sessionId, body.title);
            if (body.templateId !== undefined)
                session = await sessionService.updateTemplate(id, sessionId, body.templateId);
            if (body.accentColor !== undefined)
                session = await sessionService.updateAccentColor(id, sessionId, body.accentColor);
            if (body.isArchived !== undefined)
                session = await sessionService.archiveSession(id, sessionId, body.isArchived);
            if (!session)
                return reply.status(400).send({ error: 'No update supplied' });
            return reply.send({ sessionId, state: snapshot(session) });
        }
        catch (e) {
            return failure(reply, e);
        }
    }
    async delete(req: FastifyRequest, reply: FastifyReply) { try {
        await sessionService.deleteSession(user(req), (req.params as any).sessionId);
        return reply.send({ success: true });
    }
    catch (e) {
        return failure(reply, e);
    } }
}
export const sessionController = new SessionController();
