import { expect, it, vi, beforeEach, afterEach } from 'vitest';
import {userToken} from '../../../../shared/tests/service-fixtures.mjs';
import { authenticateUser, requireInternalSecret } from '../middleware/authenticate.js';
beforeEach(() => vi.stubGlobal('fetch',vi.fn(async () => Response.json({valid:true,user:{id:'u',plan:'max'}}))));
afterEach(() => vi.unstubAllGlobals());
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as any;
it('admin billing operations cannot be authenticated with an ordinary user identity', async () => {
  const res = response(), next = vi.fn();
  await requireInternalSecret({ headers: { 'x-user-id': 'attacker', 'x-user-plan': 'pro' } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
it('rejects forged gateway identity headers without a bearer', async () => {
  const res = response(), next = vi.fn();
  await authenticateUser({ headers: { 'x-user-id': 'victim', 'x-user-plan': 'pro' } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
it.each(['mfa', 'refresh'])('rejects %s tokens at the payment boundary', async type => {
  const token = await userToken('u',type,{plan:'pro'});
  const res = response(), next = vi.fn(); await authenticateUser({ headers: { authorization: `Bearer ${token}` } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
it('preserves the max tier instead of silently converting it to free', async () => {
  const token = await userToken('u','access',{plan:'free'});
  const req: any = { headers: { authorization: `Bearer ${token}` } }, next = vi.fn(); await authenticateUser(req, response(), next);
  expect(next).toHaveBeenCalledOnce(); expect(req.userPlan).toBe('max');
});
