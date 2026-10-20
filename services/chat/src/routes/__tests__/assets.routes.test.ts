import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
const mocks=vi.hoisted(()=>({entitlements:vi.fn(),saveAsset:vi.fn(),quota:vi.fn()}));
vi.mock('../../../../../shared/entitlements.mjs',async original=>({...await original<typeof import('../../../../../shared/entitlements.mjs')>(),getEntitlements:mocks.entitlements}));
vi.mock('../../services/db.service.js',()=>({db:{}}));
vi.mock('../../middleware/concurrency.js',()=>({concurrencyLimiter:async()=>{}}));
vi.mock('../../services/redis.service.js',()=>({redis:{}}));
vi.mock('../../services/quotaClient.service.js',()=>({checkChatQuota:vi.fn()}));
vi.mock('../../services/template-policy.service.js',()=>({requirePublishedTemplate:vi.fn()}));
vi.mock('../../config/env.js',()=>({env:{TURN_TIMEOUT_MS:90000}}));
import {chatRoutes} from '../chat.routes.js';

let app:FastifyInstance;
const asset={id:'asset_test',role:'image',name:'photo.png',src:'data:image/png;base64,iVBORw0KGgo=',width:10,height:10};
beforeEach(async()=>{
  vi.resetAllMocks();
  mocks.entitlements.mockResolvedValue({account_enabled:true,custom_logo:false});
  mocks.saveAsset.mockResolvedValue({id:'s',userId:'u',documentTypeId:'invoice',templateId:'t',status:'ACTIVE',slots:{}});
  app=Fastify();
  app.addHook('onRequest',async(request:any)=>{request.user={id:'u'};});
  await app.register(chatRoutes,{repository:{saveAsset:mocks.saveAsset},quota:mocks.quota});
});
afterEach(async()=>{await app.close();});

it('ordinary images save independently of PRO logo access and AI quota',async()=>{
  const response=await app.inject({method:'POST',url:'/chat/session/s/assets',payload:{asset,expectedRevision:2}});
  expect(response.statusCode).toBe(200);
  expect(mocks.saveAsset).toHaveBeenCalledWith('u','s',asset,2);
  expect(mocks.quota).not.toHaveBeenCalled();
  expect(mocks.entitlements).not.toHaveBeenCalled();
});

it('restricted logo uploads explain PRO access without suggesting a retry',async()=>{
  const response=await app.inject({method:'POST',url:'/chat/session/s/assets',payload:{asset:{...asset,role:'logo'},expectedRevision:2}});
  expect(response.statusCode).toBe(403);
  expect(response.json()).toMatchObject({code:'ENTITLEMENT_DENIED',retryable:false,message:expect.stringContaining('PRO')});
  expect(mocks.saveAsset).not.toHaveBeenCalled();
});

it('an enabled logo entitlement is checked before saving the logo',async()=>{
  mocks.entitlements.mockResolvedValue({account_enabled:true,custom_logo:true});
  const response=await app.inject({method:'POST',url:'/chat/session/s/assets',payload:{asset:{...asset,role:'logo'},expectedRevision:2}});
  expect(response.statusCode).toBe(200);
  expect(mocks.entitlements).toHaveBeenCalledWith('u');
  expect(mocks.saveAsset).toHaveBeenCalledOnce();
});

it('image capacity errors explain the six-image limit',async()=>{
  mocks.saveAsset.mockRejectedValue(Object.assign(new Error('Full'),{code:'ASSET_LIMIT',statusCode:422,retryable:false}));
  const response=await app.inject({method:'POST',url:'/chat/session/s/assets',payload:{asset,expectedRevision:2}});
  expect(response.statusCode).toBe(422);
  expect(response.json()).toMatchObject({retryable:false,message:expect.stringContaining('six uploaded images')});
});
