import { authorizeService } from '../../../shared/service-auth.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

export function approvedStatusWebhook(value:string, allowedHosts=(process.env.NOTIFICATION_WEBHOOK_ALLOWED_HOSTS||'').split(',').map(host=>host.trim()).filter(Boolean)):URL {
  const url=new URL(value);
  if(url.protocol!=='https:' || url.username || url.password || !allowedHosts.includes(url.hostname) || (url.port && url.port!=='443'))throw new Error('Status webhook destination is not approved');
  return url;
}

export async function authorizeNotification(request: FastifyRequest, reply: FastifyReply) {
  const pathname = request.url.split('?')[0];
  if (pathname.endsWith('/webhooks/resend-status')) return;
  if (pathname.endsWith('/send') || pathname.endsWith('/logs/admin')) {
    try {
      const caller=await authorizeService('notification', request);
      (request as any).serviceCaller=caller;
      if(pathname.endsWith('/send')){
        const type=(request.body as {type?:string})?.type || 'verify_email';
        const allowed:Record<string,string[]>={auth:['welcome','verify_email','password_reset'],document:['document_ready','invoice_ready'],payment:['welcome','renewal','payment_failed','cancellation','payment_receipt']};
        if(allowed[caller]&&!allowed[caller].includes(type))return reply.status(403).send({error:'Notification type is not authorized for this service'});
      }
    }
    catch (error) {return reply.status((error as {statusCode?:number}).statusCode || 503).send({error:'Service authorization rejected'});}
    return;
  }
  const bearer = request.headers.authorization;
  if (!bearer?.startsWith('Bearer ')) return reply.status(401).send({ error: 'Verified access token required' });
  try {
    const response = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3011'}/v1/auth/me`, {
      headers: { Authorization: bearer }, signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return reply.status(response.status >= 500 ? 503 : 401).send({ error: 'Account verification failed' });
    const { user } = await response.json() as { user?: { id?: string; plan?: string } };
    if (!user?.id) return reply.status(401).send({ error: 'Invalid account' });
    // User-controlled target IDs cannot override the authenticated identity.
    request.headers['x-user-id'] = user.id;
    request.headers['x-user-plan'] = user.plan || 'free';
    if (request.query && typeof request.query === 'object') (request.query as any).userId = user.id;
    if (request.body && typeof request.body === 'object') (request.body as any).userId = user.id;
  } catch {
    return reply.status(503).send({ error: 'Account verification unavailable' });
  }
}

/** Svix signs id.timestamp.rawBody; check age and every v1 signature. */
export function validResendSignature(body: string, headers: Record<string, unknown>, secret: string, now = Date.now()): boolean {
  const id = headers['svix-id'], timestamp = headers['svix-timestamp'], signatures = headers['svix-signature'];
  if (typeof id !== 'string' || typeof timestamp !== 'string' || typeof signatures !== 'string' || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300 || !secret.startsWith('whsec_')) return false;
  const expected = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(' ').some(value => {
    const [version, encoded] = value.split(',');
    if (version !== 'v1' || !encoded) return false;
    const received = Buffer.from(encoded, 'base64');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
