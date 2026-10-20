import {beforeEach,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({verify:vi.fn(),revoked:vi.fn(),find:vi.fn()}));
vi.mock('../services/jwt.service.js',()=>({verifyAccessToken:mocks.verify}));
vi.mock('../services/access-revocation.service.js',()=>({accessIsRevoked:mocks.revoked}));
vi.mock('../db/prisma.js',()=>({prisma:{user:{findUnique:mocks.find}}}));
import {verifyInternalToken} from './internal.controller.js';

const request={body:{userId:'owner',token:'synthetic'}} as any;
const reply=()=>({status:vi.fn().mockReturnThis(),send:vi.fn().mockReturnThis()}) as any;
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue({sub:'owner'});
  mocks.revoked.mockResolvedValue(false);
  mocks.find.mockResolvedValue({id:'owner',status:'active',plan:'pro',deletedAt:null});
});
it('checks current account and revocation concurrently without returning profile secrets',async()=>{
  let finish!:(value:boolean)=>void;
  mocks.revoked.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const response=reply(),pending=verifyInternalToken(request,response);
  await vi.waitFor(()=>expect(mocks.find).toHaveBeenCalledOnce());
  expect(response.send).not.toHaveBeenCalled();
  finish(false);await pending;
  expect(response.send).toHaveBeenCalledWith({valid:true,user:{id:'owner',status:'active',plan:'pro'}});
});
it('a revoked token remains rejected',async()=>{
  mocks.revoked.mockResolvedValue(true);
  const response=reply();await verifyInternalToken(request,response);
  expect(response.status).toHaveBeenCalledWith(401);
  expect(response.send).toHaveBeenCalledWith({valid:false});
});
it.each([{status:'banned'},{status:'suspended'},{status:'active',deletedAt:new Date()}])('rejects an unavailable account',async account=>{
  mocks.find.mockResolvedValue({id:'owner',plan:'pro',...account});
  const response=reply();await verifyInternalToken(request,response);
  expect(response.send.mock.calls[0][0].valid).toBe(false);
});
it('storage failure stays unavailable instead of authorizing a stale token',async()=>{
  mocks.find.mockRejectedValue(new Error('private database details'));
  const response=reply();await verifyInternalToken(request,response);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(response.send).toHaveBeenCalledWith({valid:false,error:'Account verification unavailable'});
});
