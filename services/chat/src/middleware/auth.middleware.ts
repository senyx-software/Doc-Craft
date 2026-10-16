import { serviceFetch } from '../../../../shared/service-auth.mjs';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyUserToken } from '../../../../shared/user-auth.mjs';
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    for (const key of ['x-user-id', 'x-user-plan', 'x-user-email', 'x-user-role'])
        delete request.headers[key];
    const bearer = request.headers.authorization;
    if (!bearer?.startsWith('Bearer '))
        return reply.status(401).send({ error: 'Verified access token required' });
    try {
        const payload = await verifyUserToken(bearer.slice(7));
        if (!payload.sub || payload.sub === 'guest_user' || payload.type !== 'access')
            throw new Error('Invalid token');
        const accountResponse = await serviceFetch('auth', `${process.env.AUTH_SERVICE_URL || 'http://localhost:3011'}/internal/verify-token`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET || '' },
            body: JSON.stringify({ userId: payload.sub,token: bearer.slice(7) }), signal: AbortSignal.timeout(3000),
        });
        if ([401,403,404].includes(accountResponse.status)) return reply.status(403).send({ error: 'Account unavailable' });
        if (!accountResponse.ok) return reply.status(503).send({ error: 'Account verification unavailable' });
        const account = await accountResponse.json() as { valid?: boolean; user?: { id?: string; plan?: string } };
        if (!account.valid || account.user?.id !== payload.sub) return reply.status(403).send({ error: 'Account unavailable' });
        request.headers['x-user-id'] = payload.sub;
        request.headers['x-user-plan'] = typeof account.user?.plan === 'string' ? account.user.plan : 'free';
        (request as any).user = { id: payload.sub, plan: request.headers['x-user-plan'], email: typeof payload.email === 'string' ? payload.email : undefined };
    }
    catch (error) {
        const invalidToken = error instanceof Error && (error.name.startsWith('JWT') || error.name.startsWith('JWS') || ['Invalid token', 'JWT configuration unavailable'].includes(error.message));
        return reply.status(invalidToken ? 401 : 503).send({ error: invalidToken ? 'Invalid or expired access token' : 'Account verification unavailable' });
    }
}
