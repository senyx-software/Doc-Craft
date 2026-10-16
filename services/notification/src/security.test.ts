import { expect, it, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { authorizeNotification, validResendSignature, approvedStatusWebhook } from './security.js';
it('status relays require an approved HTTPS destination without embedded credentials',()=>{
 expect(approvedStatusWebhook('https://status.example.test/hook',['status.example.test']).hostname).toBe('status.example.test');
 for(const url of ['http://status.example.test/hook','https://unapproved.example.test/hook','https://user:secret@status.example.test/hook','https://status.example.test:8443/hook'])expect(()=>approvedStatusWebhook(url,['status.example.test'])).toThrow();
});
afterEach(() => vi.unstubAllGlobals());
it('preference ownership comes from Auth rather than caller-supplied target IDs', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({user:{id:'owner'}})));
  const request: any = { url:'/notification/preferences?userId=victim', headers:{authorization:'Bearer synthetic'}, query:{userId:'victim'}, body:{userId:'victim'} };
  const reply: any = { status: vi.fn().mockReturnThis(), send: vi.fn() };
  await authorizeNotification(request, reply);
  expect(reply.status).not.toHaveBeenCalled();
  expect(request.query.userId).toBe('owner'); expect(request.body.userId).toBe('owner');
});
it('rejects arbitrary unauthenticated email dispatch', async () => {
  const reply: any = { status: vi.fn().mockReturnThis(), send: vi.fn() };
  await authorizeNotification({ url: '/notification/send', headers: {} } as any, reply);
  expect(reply.status).toHaveBeenCalledWith(401);
});
it('checks exact webhook bytes, timestamp freshness and the provider signature', () => {
  const body = '{ "type": "email.delivered" }', id = 'msg_fixture', timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from('synthetic-webhook-signing-key');
  const secret = 'whsec_' + key.toString('base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  const headers = { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` };
  expect(validResendSignature(body, headers, secret)).toBe(true);
  expect(validResendSignature(JSON.stringify(JSON.parse(body)), headers, secret)).toBe(false);
  expect(validResendSignature(body, headers, secret, Date.now() + 600000)).toBe(false);
  expect(validResendSignature(body, {}, secret)).toBe(false);
});
