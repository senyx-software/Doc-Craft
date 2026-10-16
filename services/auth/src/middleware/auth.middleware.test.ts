vi.mock('../services/access-revocation.service.js',()=>({accessIsRevoked:async()=>false}));
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), find: vi.fn() }));
vi.mock('../services/jwt.service.js', () => ({ verifyAccessToken: mocks.verify }));
vi.mock('../db/prisma.js', () => ({ prisma: { user: { findUnique: mocks.find } } }));
import { requireAuth } from './auth.middleware.js';
beforeEach(() => { vi.resetAllMocks(); });
const reply = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }) as any;
it('does not authenticate forged user headers', async () => {
  const req: any = { headers: { 'x-user-id': 'victim', 'x-user-plan': 'pro' } }; const res = reply();
  await requireAuth(req, res);
  expect(res.status).toHaveBeenCalledWith(401); expect(mocks.find).not.toHaveBeenCalled(); expect(req.headers['x-user-id']).toBeUndefined();
});
it.each([null, { id: 'u', status: 'suspended' }, { id: 'u', status: 'banned' }, { id: 'u', status: 'active', deletedAt: new Date() }])('rejects unavailable accounts using a valid token', async account => {
  mocks.verify.mockResolvedValue({ sub: 'u' }); mocks.find.mockResolvedValue(account);
  const res = reply(); await requireAuth({ headers: { authorization: 'Bearer synthetic' } } as any, res);
  expect(res.status).toHaveBeenCalledWith(403);
});
it('uses current persisted identity and plan instead of injected or stale claims', async () => {
  mocks.verify.mockResolvedValue({ sub: 'u', plan: 'free' }); mocks.find.mockResolvedValue({ id: 'u', status: 'active', plan: 'max', email: 'fixture@example.test' });
  const req: any = { headers: { authorization: 'Bearer synthetic', 'x-user-id': 'other' } };
  await requireAuth(req, reply()); expect(req.headers).toMatchObject({ 'x-user-id': 'u', 'x-user-plan': 'max' });
});
it('fails closed if account persistence cannot be checked', async () => {
  mocks.verify.mockResolvedValue({ sub: 'u' }); mocks.find.mockRejectedValue(new Error('offline'));
  const res = reply(); await requireAuth({ headers: { authorization: 'Bearer synthetic' } } as any, res);
  expect(res.status).toHaveBeenCalledWith(503);
});
