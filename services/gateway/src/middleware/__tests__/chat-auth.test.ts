import {configureServiceFixture, userToken} from '../../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('gateway');
import {it,expect,vi,beforeEach,afterEach} from 'vitest';

vi.mock('../../config/env.js',()=>({env:{JWT_SECRET:'isolated-test-secret'}}));
import {authMiddleware} from '../auth.middleware.js';
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async()=>Response.json({valid:true,user:{id:'guest_private',plan:'guest'}}))));
afterEach(()=>vi.unstubAllGlobals());
async function run(token?:string,subject='guest_private',type='access'){
 const signed=token==='signed'?await userToken(subject,type,{plan:'guest'}):token;
 const req:any={method:'GET',path:'/v1/chat/api/chat/sessions',headers:{'x-user-id':'victim','x-user-plan':'pro','x-internal-secret':'spoof',...(signed?{authorization:'Bearer '+signed}:{})}};
 const res:any={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await authMiddleware(req,res,next);return {req,res,next};
}
it('unsigned identity headers cannot access conversations',async()=>{const r=await run();expect(r.res.status).toHaveBeenCalledWith(401);expect(r.req.headers['x-user-id']).toBeUndefined();expect(r.req.headers['x-internal-secret']).toBeUndefined();expect(r.next).not.toHaveBeenCalled();});
it('signed guests retain their unique identity',async()=>{const r=await run('signed');expect(r.next).toHaveBeenCalledOnce();expect(r.req.headers['x-user-id']).toBe('guest_private');expect(r.req.headers['x-user-plan']).toBe('guest');});
it('invalid, shared guest and MFA tokens are rejected rather than anonymized',async()=>{for(const args of [['bad'],['signed','guest_user'],['signed','u','mfa']]){const r=await run(...args as [string,string,string]);expect(r.res.status).toHaveBeenCalledWith(401);expect(r.next).not.toHaveBeenCalled();}});
it('existing browser tokens stop at the gateway after an admin suspends the account',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({valid:false,user:{id:'guest_private',plan:'guest'}})));const r=await run('signed');expect(r.res.status).toHaveBeenCalledWith(403);expect(r.next).not.toHaveBeenCalled();});
it('a changed plan replaces the stale plan embedded in a browser token',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({valid:true,user:{id:'guest_private',plan:'max'}})));const r=await run('signed');expect(r.next).toHaveBeenCalledOnce();expect(r.req.headers['x-user-plan']).toBe('max');});
it('account-service outages return a retryable failure without mislabeling a valid token',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline')}));const r=await run('signed');expect(r.res.status).toHaveBeenCalledWith(503);expect(r.next).not.toHaveBeenCalled();});
