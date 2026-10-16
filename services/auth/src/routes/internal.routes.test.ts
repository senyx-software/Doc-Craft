import {configureServiceFixture,serviceHeaders} from '../../../../shared/tests/service-fixtures.mjs';
import {serviceNonceStore} from '../../../../shared/service-auth.mjs';
import { beforeEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
vi.mock('../controllers/internal.controller.js', () => {
  const handler = async (_request: unknown, reply: any) => reply.send({ fixture: true });
  return Object.fromEntries(['listUsers','getUserById','updateUserStatus','updateUserPlan','verifyInternalToken','listReferrals','createReferral','convertReferral','getUserCountsByPlan'].map(name => [name, handler]));
});
import { internalRoutes } from './internal.routes.js';
beforeEach(() => { configureServiceFixture('auth');vi.spyOn(serviceNonceStore,'claim').mockResolvedValue(true); });
it('internal account mutations require scoped service credentials', async () => {
  const app = Fastify(); await app.register(internalRoutes, { prefix: '/internal' });
  try {
    expect((await app.inject({ method: 'PATCH', url: '/internal/users/victim/plan', payload: { plan: 'pro' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/internal/users', headers: { 'x-internal-secret': 'wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/internal/users', headers: await serviceHeaders('admin-api','auth','GET','/internal/users') })).statusCode).toBe(200);
  } finally { await app.close(); }
});
