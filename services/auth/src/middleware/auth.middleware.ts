import {accessIsRevoked} from '../services/access-revocation.service.js';
import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../services/jwt.service.js';
import { prisma } from '../db/prisma.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  for (const key of ['x-user-id', 'x-user-plan', 'x-user-email']) delete request.headers[key];
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return reply.status(401).send({ error: 'Verified access token required' });
  let decoded;
  try {
    decoded = await verifyAccessToken(authHeader.slice(7));
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired access token' });
  }
  try {
    if(await accessIsRevoked(authHeader.slice(7)))return reply.status(401).send({error:'Access token revoked'});
    const account = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!account || account.deletedAt || account.status !== 'active') {
      return reply.status(403).send({ error: 'Account unavailable' });
    }
    request.headers['x-user-id'] = account.id;
    request.headers['x-user-plan'] = account.plan;
    request.headers['x-user-email'] = account.email;
    (request as any).user = { id: account.id };
  } catch {
    return reply.status(503).send({ error: 'Account verification unavailable' });
  }
}
