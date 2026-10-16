vi.mock('../template-policy.service.js',()=>({requirePublishedTemplate:vi.fn(async()=>{})}));
import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../db.service.js',()=>({db:{}}));
import {SessionService} from '../session.service.js';
import {MemoryDatabase} from '../../testing/memory-db.js';
import {snapshot} from '../../../../../shared/conversation-state.mjs';
import {ConversationRepository} from '../conversation.repository.js';
import {requirePublishedTemplate} from '../template-policy.service.js';
function client(){return {documentType:{findUnique:vi.fn(async()=>({id:'invoice',name:'Invoice'}))},template:{findUnique:vi.fn(async()=>({id:'t'}))},chatSession:{create:vi.fn(async({data}:any)=>({id:'s',...data})),findMany:vi.fn(async()=>[]),findUnique:vi.fn(async()=>({id:'original',userId:'u',documentTypeId:'invoice',status:'ACTIVE',slots:{businessName:'Nexora',clientName:'Private client'}})),update:vi.fn(async({data}:any)=>({id:'s',...data})),delete:vi.fn()}};}
it('canvas layouts survive storage while ownership and stale writes remain protected',async()=>{
 const db=new MemoryDatabase(),repo=new ConversationRepository(db);
 const saved=await repo.saveCanvasLayout('u','s',{elementOverrides:{heading:{x:42,text:'cannot replace canonical text'}}},0);
 expect(snapshot(saved).canvasLayout.elementOverrides.heading).toEqual({x:42});
 expect(snapshot(await repo.load('u','s')).layoutRevision).toBe(1);
 await expect(repo.saveCanvasLayout('other','s',{},1)).rejects.toMatchObject({statusCode:403});
 await expect(repo.saveCanvasLayout('u','s',{},0)).rejects.toMatchObject({statusCode:409});
});
it('authenticated creation uses authoritative fields and no expiry for registered users',async()=>{const c=client(),service=new SessionService(c as any),s=await service.createSession('u','invoice','t');expect(snapshot(s).readyToGenerate).toBe(false);expect(snapshot(s).nextAction.field).toBe('businessName');expect(s.expiresAt).toBeNull();});
it('explicit reusable business source is authorized and does not copy clients',async()=>{const c=client(),service=new SessionService(c as any),s=await service.createSession('u','invoice','t',undefined,'groq','original');expect(snapshot(s).slots.businessName).toBe('Nexora');expect(snapshot(s).slots.clientName).toBeUndefined();await expect(service.createSession('other','invoice','t',undefined,'groq','original')).rejects.toThrow(/denied/);});
it('listing is read-only, scoped and does not purge records',async()=>{const c=client(),service=new SessionService(c as any);await service.listSessions('u');expect(c.chatSession.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'u',isArchived:false}}));expect(c.chatSession.delete).not.toHaveBeenCalled();});
it('shared anonymous identities and unknown templates cannot update another session',async()=>{const c=client(),service=new SessionService(c as any);await expect(service.createSession('guest_user','invoice','t')).rejects.toThrow();await expect(service.renameSession('other','original','new')).rejects.toThrow(/denied/);});

it('compatible draft copy authorizes source, excludes uncertain fields, and retries one ID',async()=>{
 const db=new MemoryDatabase(),service=new SessionService(db as any);db.sessions.get('s').slots={businessName:'Nexora',clientName:'Acme',senderAddress:'40/20, Road',_chat:{fields:{senderAddress:{status:'conflicting',candidate:'Other'}}}};
 const draft=await service.forkSession('u','s','quotation','op');expect(snapshot(draft).slots.businessName).toBe('Nexora');expect(snapshot(draft).slots.senderAddress).toBeUndefined();expect(snapshot(draft).documentType).toBe('quotation');
 expect((await service.forkSession('u','s','quotation','op')).id).toBe(draft.id);await expect(service.forkSession('intruder','s','quotation','op')).rejects.toThrow(/denied/);
});

it('withdrawn templates cannot be selected by copying a draft',async()=>{
 const db=new MemoryDatabase(),service=new SessionService(db as any);
 vi.mocked(requirePublishedTemplate).mockRejectedValueOnce(new Error('Template unavailable'));
 await expect(service.forkSession('u','s','quotation','withdrawn-copy')).rejects.toThrow('Template unavailable');
 expect(db.sessions.size).toBe(1);
});
