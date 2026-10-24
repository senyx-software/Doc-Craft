import {serviceHeaders,configureServiceFixture} from '../../../../shared/tests/service-fixtures.mjs';
import {serviceNonceStore} from '../../../../shared/service-auth.mjs';
import { expect, it, vi } from 'vitest';
import { authenticateInternal, authenticateUser } from '../middleware/authenticate.js';
configureServiceFixture('quota');
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as any;
it('cannot authenticate an internal refund/reset using ordinary identity headers', async () => {
  const res = response(), next = vi.fn();
  await authenticateInternal({ headers: { 'x-user-id': 'attacker', 'x-user-plan': 'pro' }, body: { userId: 'victim' } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
it('rejects forged identity headers on quota reads', async () => {
  const res = response(), next = vi.fn();
  await authenticateUser({ headers: { 'x-user-id': 'victim', 'x-user-plan': 'max' } } as any, res, next);
  expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
});
it('internal service calls preserve configured tiers', async () => {
  vi.spyOn(serviceNonceStore,'claim').mockResolvedValueOnce(true);
  const body=JSON.stringify({userId:'u',plan:'max'});
  const req:any={method:'POST',url:'/v1/quota/check',rawBody:body,headers:await serviceHeaders('chat','quota','POST','/v1/quota/check',body),body:JSON.parse(body)}, next=vi.fn();
  await authenticateInternal(req,response(),next);expect(next).toHaveBeenCalledOnce();expect(req.userPlan).toBe('max');
});
