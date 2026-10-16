vi.mock('../../../../../shared/entitlements.mjs',async()=>{
 const actual=await vi.importActual<any>('../../../../../shared/entitlements.mjs');
 return {...actual,getEntitlements:async(user_id:string)=>({version:1,user_id,account_enabled:true,plan:'pro',ai_enabled:true,claude_models:['claude-haiku-4-5','claude-sonnet-4-5'],groq_models:null,custom_logo:true})};
});
vi.mock('../template-policy.service.js',()=>({requirePublishedTemplate:vi.fn(async()=>{})}));
import {afterEach,expect,it,vi} from 'vitest';
import Fastify from 'fastify';
vi.mock('../db.service.js',()=>({db:{}}));
vi.mock('../redis.service.js',()=>({redis:{}}));
vi.mock('../../middleware/concurrency.js',()=>({concurrencyLimiter:async()=>{}}));
vi.mock('../quotaClient.service.js',()=>({checkChatQuota:async()=>({allowed:true})}));
vi.mock('../../config/env.js',()=>({env:{TURN_TIMEOUT_MS:90000}}));
import {ConversationRepository} from '../conversation.repository.js';
import {MemoryDatabase} from '../../testing/memory-db.js';
import {chatRoutes} from '../../routes/chat.routes.js';
import {SessionService} from '../session.service.js';
import {snapshot} from '../../../../../shared/conversation-state.mjs';
const asset={id:'asset_one',role:'logo',name:'logo.png',width:1,height:1,src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCzQAAAAASUVORK5CYII='};
let app:ReturnType<typeof Fastify>;
afterEach(async()=>app?.close());
async function fixture(){
 const db=new MemoryDatabase();db.sessions.get('s').slots={businessName:'Nexora',clientName:'Yohan',senderPhone:'0771234567',clientPhone:'0712345678'};
 const repo=new ConversationRepository(db),provider=vi.fn(),quota=vi.fn();app=Fastify();app.addHook('onRequest',async(req:any)=>{req.user={id:'u',plan:'free'};});await app.register(chatRoutes,{db,repository:repo,provider,quota,limiter:async()=>{}} as any);
 return {db,repo,provider,quota};
}
it('upload → atomic storage → refreshed snapshot preserves fields, media and provider allowance',async()=>{
 const {repo,provider,quota}=await fixture();const original=snapshot(await repo.load('u','s'));
 const response=await app.inject({method:'POST',url:'/chat/session/s/assets',payload:{asset,expectedRevision:0}});expect(response.statusCode).toBe(200);
 const saved=response.json().state;expect(saved.revision).toBe(1);expect(saved.assets[0]).toMatchObject(asset);expect(saved.assets[0].hash).toMatch(/^[a-f0-9]{64}$/);expect(saved.slots.senderPhone).toBe('0771234567');expect(saved.slots.clientPhone).toBe('0712345678');expect(saved.finalization.fingerprint).not.toBe(original.finalization.fingerprint);
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json();expect(restored.state.assets).toEqual(saved.assets);expect(restored.messages[0].content).toContain('Added your logo');expect(provider).not.toHaveBeenCalled();expect(quota).not.toHaveBeenCalled();
});
it('retrying a committed upload is idempotent and a replacement logo preserves other artwork',async()=>{
 const {repo,db}=await fixture();await repo.saveAsset('u','s',asset,0);await repo.saveAsset('u','s',asset,0);expect(db.messages).toHaveLength(1);expect(snapshot(await repo.load('u','s')).revision).toBe(1);
 await repo.saveAsset('u','s',{...asset,id:'asset_image',role:'image'},1);await repo.saveAsset('u','s',{...asset,id:'asset_logo2'},2);
 const state=snapshot(await repo.load('u','s'));expect(state.assets.map((a:any)=>a.id)).toEqual(['asset_image','asset_logo2']);expect(state.slots.businessName).toBe('Nexora');
});
it('cross-user, stale revision and completed-session uploads cannot modify the document',async()=>{
 const {repo,db}=await fixture();await expect(repo.saveAsset('other','s',asset,0)).rejects.toMatchObject({statusCode:403});await expect(repo.saveAsset('u','s',asset,1)).rejects.toMatchObject({statusCode:409});
 db.sessions.get('s').status='COMPLETED';await expect(repo.saveAsset('u','s',asset,0)).rejects.toMatchObject({statusCode:409});expect(db.messages).toHaveLength(0);
});
it('failed persistence rolls back both artwork and its success acknowledgement',async()=>{
 const {repo,db}=await fixture();db.failWrite=true;await expect(repo.saveAsset('u','s',asset,0)).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});expect(snapshot(await repo.load('u','s')).assets).toEqual([]);expect(db.messages).toHaveLength(0);
});
it('unsupported formats and spoofed image dimensions are rejected before storage',async()=>{
 const {repo,db}=await fixture();for(const patch of [{src:'data:image/svg+xml,<svg/>'},{width:1000},{src:'data:image/png;base64,AAAA'}])await expect(repo.saveAsset('u','s',{...asset,...patch},0)).rejects.toMatchObject({statusCode:400});expect(db.messages).toHaveLength(0);
});
it('uploading after an AI error preserves the pending retry and already saved information',async()=>{
 const {repo,db}=await fixture();db.sessions.get('s').slots._chat={latestTurnId:'turn',turns:{turn:{status:'failure',retryable:true,message:'Suggest wording'}}};await repo.saveAsset('u','s',asset,0);const state=snapshot(await repo.load('u','s'));expect(state.pendingTurn.id).toBe('turn');expect(state.assets).toHaveLength(1);
});
it('deleting artwork persists its removal and keeps business and client facts',async()=>{
 const {repo}=await fixture();await repo.saveAsset('u','s',asset,0);
 const result=await app.inject({method:'DELETE',url:'/chat/session/s/assets',payload:{ids:['asset_one'],expectedRevision:1}});
 expect(result.statusCode).toBe(200);expect(result.json().state.assets).toEqual([]);expect(result.json().state.slots.clientPhone).toBe('0712345678');
 expect((await app.inject({url:'/chat/session/s/messages'})).json().state.assets).toEqual([]);
});
it('editing a finalized document retains its artwork; reusing business details carries only its logo',async()=>{
 const {repo,db}=await fixture();await repo.saveAsset('u','s',asset,0);await repo.saveAsset('u','s',{...asset,id:'asset_photo',role:'image'},1);
 const sessions=new SessionService(db as any);db.sessions.get('s').status='COMPLETED';
 const revision=await sessions.forkSession('u','s','invoice',crypto.randomUUID());expect(snapshot(revision).assets.map((a:any)=>a.role)).toEqual(['logo','image']);
 const business=await sessions.createSession('u','invoice','t',undefined,'groq','s');expect(snapshot(business).assets.map((a:any)=>a.role)).toEqual(['logo']);expect(snapshot(await repo.load('u','s')).assets).toHaveLength(2);
});
it('direct approval includes the saved image hash and replacing a logo invalidates that approval',async()=>{
 const {repo,db}=await fixture();Object.assign(db.sessions.get('s').slots,{invoiceNumber:'INV-1',issueDate:'2026-10-14',dueDate:'2026-12-12',currency:'LKR',lineItems:[{description:'Design',quantity:1,unitPrice:100}]});
 await repo.saveAsset('u','s',asset,0);const saved=snapshot(await repo.load('u','s'));
 const approved=await app.inject({method:'POST',url:'/chat/session/s/confirm',payload:{fingerprint:saved.finalization.fingerprint,expectedRevision:saved.revision}});
 expect(approved.statusCode).toBe(200);expect(approved.json().state.canGenerate).toBe(true);expect(approved.json().state.assets[0].hash).toBe(saved.assets[0].hash);
 await repo.saveAsset('u','s',{...asset,id:'asset_replacement'},approved.json().state.revision);expect(snapshot(await repo.load('u','s')).canGenerate).toBe(false);
});
