vi.mock('../../services/template-policy.service.js',()=>({requirePublishedTemplate:vi.fn(async()=>{})}));
import {it,expect,vi} from 'vitest';
import Fastify from 'fastify';
vi.mock('../../services/db.service.js',()=>({db:{}}));
vi.mock('../../middleware/concurrency.js',()=>({concurrencyLimiter:async()=>{}}));
vi.mock('../../services/redis.service.js',()=>({redis:{}}));
vi.mock('../../services/quotaClient.service.js',()=>({checkChatQuota:async()=>({allowed:true})}));
vi.mock('../../config/env.js',()=>({env:{TURN_TIMEOUT_MS:90000}}));
import {chatRoutes} from '../chat.routes.js';
import {sessionService} from '../../services/session.service.js';
it('session create returns its full authoritative snapshot',async()=>{const create=vi.spyOn(sessionService,'createSession').mockResolvedValue({id:'s',userId:'u',documentTypeId:'invoice',templateId:'t',status:'ACTIVE',slots:{}} as any);const f=Fastify();f.addHook('onRequest',async(req:any)=>{req.user={id:'u'};});await f.register(chatRoutes);const r=await f.inject({method:'POST',url:'/chat/session',payload:{documentTypeId:'invoice',templateId:'t'}});expect(r.statusCode).toBe(201);expect(r.json().state.missingRequired).toContain('businessName');expect(r.json().state.readyToGenerate).toBe(false);await f.close();create.mockRestore();});
it('invalid session creation is rejected without writing',async()=>{const create=vi.spyOn(sessionService,'createSession');const f=Fastify();await f.register(chatRoutes);const r=await f.inject({method:'POST',url:'/chat/session',payload:{documentTypeId:'',templateId:'t'}});expect(r.statusCode).toBe(400);expect(create).not.toHaveBeenCalled();await f.close();create.mockRestore();});

it('validated browser timezone is persisted when the profile has no configured timezone',async()=>{const create=vi.spyOn(sessionService,'createSession').mockResolvedValue({id:'s',userId:'u',documentTypeId:'invoice',templateId:'t',status:'ACTIVE',slots:{}} as any);const f=Fastify();f.addHook('onRequest',async(req:any)=>{req.user={id:'u'};});await f.register(chatRoutes);const response=await f.inject({method:'POST',url:'/chat/session',payload:{documentTypeId:'invoice',templateId:'t',timezone:'Asia/Colombo'}});expect(response.statusCode).toBe(201);expect(create.mock.calls[0][6]).toMatchObject({timezone:'Asia/Colombo'});await f.close();create.mockRestore();});
it('invalid document timezone is rejected before session persistence',async()=>{const create=vi.spyOn(sessionService,'createSession');const f=Fastify();f.addHook('onRequest',async(req:any)=>{req.user={id:'u'};});await f.register(chatRoutes);const response=await f.inject({method:'POST',url:'/chat/session',payload:{documentTypeId:'invoice',templateId:'t',timezone:'invented/zone'}});expect(response.statusCode).toBe(400);expect(create).not.toHaveBeenCalled();await f.close();create.mockRestore();});
