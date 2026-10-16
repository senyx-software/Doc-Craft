import {configureServiceFixture, userToken} from '../../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('chat');
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

vi.mock('../../config/env.js', () => ({ env: { RATE_LIMIT_MAX: 2, API_RATE_LIMIT_MAX: 20, RATE_LIMIT_WINDOW: 60000 } }));
import { chatRateLimitOptions } from '../rate-limit.js';
import { requireAuth } from '../auth.middleware.js';

let app: ReturnType<typeof Fastify>;
const secret = 'synthetic-rate-limit-test-secret';
beforeEach(() => { vi.stubEnv('JWT_SECRET', secret); vi.stubGlobal('fetch', vi.fn(async (_url:any, options:any) => Response.json({valid:true,user:{id:JSON.parse(options.body).userId,plan:'free'}}))); });
afterEach(async () => { await app?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
    app = Fastify();
    await app.register(rateLimit, chatRateLimitOptions);
    app.addHook('onRequest', requireAuth);
    app.get('/v1/chat/api/chat/session/s/messages', async () => ({ messages: [] }));
    for (const prefix of ['/api', '/v1/chat/api']) {
        app.post(prefix + '/chat/session/s/message', async () => ({ saved: 'nexora' }));
    }
}
async function headers(user = 'alice') {
    const token = await userToken(user,'access',{plan:'free'});
    return { authorization: 'Bearer ' + token };
}
it('history bursts do not consume the company reply budget, while reads stay limited', async () => {
    await setup(); const auth = await headers();
    for (let i = 0; i < 20; i++) expect((await app.inject({ url: '/v1/chat/api/chat/session/s/messages', headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ url: '/v1/chat/api/chat/session/s/messages', headers: auth })).statusCode).toBe(429);
    const reply = await app.inject({ method: 'POST', url: '/v1/chat/api/chat/session/s/message', headers: auth, payload: { message: 'nexora' } });
    expect(reply.statusCode).toBe(200); expect(reply.json().saved).toBe('nexora');
});
it('verified users behind one gateway IP have separate limits; identity headers cannot bypass them', async () => {
    await setup(); const auth = await headers();
    for (let i = 0; i < 2; i++) expect((await app.inject({ method: 'POST', url: '/api/chat/session/s/message', headers: auth })).statusCode).toBe(200);
    const rejected = await app.inject({ method: 'POST', url: '/v1/chat/api/chat/session/s/message', headers: { ...auth, 'x-user-id': 'spoofed' } });
    expect(rejected.statusCode).toBe(429);
    expect(rejected.json()).toMatchObject({ code: 'CHAT_RATE_LIMITED', status: 429, phase: 'capacity', retryable: true });
    expect(rejected.json().retryAfter).toBeGreaterThan(0);
    expect(rejected.headers['retry-after']).toBeDefined();
    expect((await app.inject({ method: 'POST', url: '/v1/chat/api/chat/session/s/message', headers: await headers('bob') })).statusCode).toBe(200);
});
it('invalid authentication is rejected before using a verified user budget', async () => {
    await setup();
    expect((await app.inject({ method: 'POST', url: '/api/chat/session/s/message', headers: { 'x-user-id': 'alice' } })).statusCode).toBe(401);
    for (let i = 0; i < 2; i++) expect((await app.inject({ method: 'POST', url: '/api/chat/session/s/message', headers: await headers() })).statusCode).toBe(200);
});
