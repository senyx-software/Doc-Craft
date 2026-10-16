import {it,expect,vi,afterEach} from 'vitest';
vi.mock('../client',()=>({getToken:()=> 'synthetic',get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
import {sendChatMessage} from '../ai';
import {snapshot} from '../../../../shared/conversation-state.mjs';
import {ChatStreamError} from '../../../../shared/chat-stream.mjs';
afterEach(()=>vi.unstubAllGlobals());
it('T18/T46 adapter preserves terminal text and verifies full snapshot',async()=>{
 const state=snapshot({id:'s',userId:'u',documentTypeId:'invoice',status:'ACTIVE',slots:{businessName:'Nexora'}});
 const answer='Your unit price is the amount for one unit.';
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('data: '+JSON.stringify({type:'done',outcome:'success',turnId:'t',state,response:answer})+'\n\n')));
 const response=await sendChatMessage({session_id:'s',turn_id:'t',message:'Explain unit price',document_type:'invoice',current_field:'',conversation_history:[]});expect(response.ai_message).toBe(answer);expect(response.collected_slots.businessName).toBe('Nexora');
});
it('T34 adapter retains non-2xx safe error code, retryability and committed state',async()=>{
 const state=snapshot({id:'s',documentTypeId:'invoice',status:'ACTIVE',slots:{businessName:'Nexora'}});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({code:'STORAGE_UNAVAILABLE',phase:'storage',retryable:true,state},{status:503})));
 try {await sendChatMessage({session_id:'s',message:'Address',document_type:'invoice',current_field:'',conversation_history:[]});throw new Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(ChatStreamError);const failure=error as ChatStreamError;expect(failure.code).toBe('STORAGE_UNAVAILABLE');expect(failure.phase).toBe('storage');expect(failure.state.slots.businessName).toBe('Nexora');}
});
it('legacy generic throttling is displayed as a retryable rate limit',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({code:'UPSTREAM_ERROR',retryAfter:45},{status:429})));
 await expect(sendChatMessage({session_id:'s',turn_id:'t',message:'nexora',document_type:'invoice',current_field:'',conversation_history:[]})).rejects.toMatchObject({code:'CHAT_RATE_LIMITED',retryable:true,retryAfter:45,message:expect.stringContaining('Too many requests')});
});
it('network failures have an actionable category rather than the generic response error',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('Failed to fetch');}));
 await expect(sendChatMessage({session_id:'s',turn_id:'t',message:'nexora',document_type:'invoice',current_field:'',conversation_history:[]})).rejects.toMatchObject({code:'NETWORK_UNAVAILABLE',retryable:true,message:expect.stringContaining('Check your connection')});
});
it('cancelled fetch retains cancellation instead of reporting a network outage',async()=>{
 const controller=new AbortController();controller.abort();vi.stubGlobal('fetch',vi.fn(async()=>{throw new DOMException('aborted','AbortError');}));
 await expect(sendChatMessage({session_id:'s',turn_id:'t',message:'nexora',document_type:'invoice',current_field:'',conversation_history:[],signal:controller.signal})).rejects.toMatchObject({code:'REQUEST_CANCELLED',outcome:'cancelled'});
});
