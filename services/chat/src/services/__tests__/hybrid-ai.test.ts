/* eslint-disable @typescript-eslint/no-explicit-any -- isolated service and model fixtures */
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Fastify from 'fastify';
import {configureServiceFixture} from '../../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('chat');
const state=vi.hoisted(()=>({calls:[] as any[],script:null as null|((body:any)=>Response),policy:{account_enabled:true,ai_enabled:true,plan:'free',ai_provider:'groq',max_model:'claude-haiku-4-5'}}));
vi.mock('../db.service.js',()=>({db:{}}));
vi.mock('../redis.service.js',()=>({redis:{}}));
vi.mock('../../middleware/concurrency.js',()=>({concurrencyLimiter:async()=>{}}));
vi.mock('../../config/env.js',()=>({env:{ADMIN_API_SERVICE_URL:'http://admin.invalid',TURN_TIMEOUT_MS:30000,MCP_TIMEOUT_MS:3000}}));
vi.mock('../../../../../shared/entitlements.mjs',async()=>({...await vi.importActual<any>('../../../../../shared/entitlements.mjs'),getEntitlements:async()=>state.policy}));
vi.mock('../../../../../shared/service-auth.mjs',async()=>({...await vi.importActual<any>('../../../../../shared/service-auth.mjs'),serviceFetch:async(_receiver:any,url:string,options:any)=>{
 if(!url.endsWith('/infer'))throw new Error('Unexpected outbound request');
 const body=JSON.parse(options.body);state.calls.push(body);return state.script?state.script(body):Response.json({message:{role:'assistant',content:'I can help explain those terms without changing your document.'},finish_reason:'stop'});
}}));
import {chatRoutes} from '../../routes/chat.routes.js';
import {ConversationRepository} from '../conversation.repository.js';
import {MemoryDatabase} from '../../testing/memory-db.js';
import {snapshot,metadata} from '../../../../../shared/conversation-state.mjs';
import type {HybridRuntime} from '../hybrid-ai.service.js';
const fields={businessName:'Nexora',clientName:'John',invoiceNumber:'INV-1',issueDate:'2026-10-20',dueDate:'2026-11-20',currency:'USD',lineItems:[{id:'laptops',description:'Laptops',quantity:3,unitPrice:500}]};
const context={elements:[{id:'header_title',type:'text',label:'Invoice',x:30,y:30,w:200,h:40,fontSize:24},{id:'client_name',type:'text',label:'John',x:30,y:100,w:150,h:20,fontSize:12}],selectedIds:[] as string[]};
let db:MemoryDatabase,repo:ConversationRepository,app:ReturnType<typeof Fastify>,runtime:HybridRuntime;
beforeEach(async()=>{
 state.calls=[];state.script=null;db=new MemoryDatabase();db.sessions.get('s').slots=structuredClone(fields);repo=new ConversationRepository(db);
 runtime={enabled:true,version:1,plan:'free',policy:{primary_model:'local',secondary_model:null,cloud_fallback_model:'cloud',deterministic_enabled:true,local_enabled:true,cloud_fallback_enabled:true,fallback_on:['unavailable','timeout','invalid_response'],allowed_features:['chat','document_edit','visual_edit','language_correction'],language_correction_mode:'suggest'},models:{local:{id:'local',locality:'local',max_input_tokens:30000},cloud:{id:'cloud',locality:'cloud',max_input_tokens:30000}},private_terms:['secret-model-identifier','Example Provider']};
 app=Fastify();app.addHook('onRequest',async(request:any)=>{request.user={id:'u',plan:'free'};});await app.register(chatRoutes,{repository:repo,db,limiter:async()=>{},runtimeLoader:async()=>structuredClone(runtime)});
});
afterEach(async()=>{await app.close();vi.clearAllMocks();});
async function send(message:string,extra:Record<string,unknown>={}) {
 const response=await app.inject({method:'POST',url:'/chat/session/s/message',payload:{message,turnId:crypto.randomUUID(),...extra}});
 const events=response.statusCode===200?response.body.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5))):[response.json()];
 return {done:events.find(event=>event.type==='done'),error:events.find(event=>event.type==='error'),events};
}
it('simple tax and item edits execute with zero inference requests',async()=>{
 const tax=await send('Change the tax to 10%.');expect(tax.done.state.slots.taxRate).toBe(10);expect(tax.done.state.slots.totalDue).toBe(1650);
 const item=await send('Add another item, a mouse quantity 1 for 25 USD.');expect(item.error).toBeUndefined();expect(item.done.state.slots.lineItems).toHaveLength(2);expect(state.calls).toHaveLength(0);
});
it('a compound field and heading edit commits both; undo/redo restore both after reload',async()=>{
 const changed=await send('Actually change the customer to Alex and make the invoice heading blue.',{editorContext:context,expectedLayoutRevision:0});
 expect(changed.error).toBeUndefined();expect(changed.done.state.slots.clientName).toBe('Alex');expect(changed.done.state.canvasLayout.elementOverrides.header_title.color).toBe('#0000ff');
 const restored=await app.inject({method:'GET',url:'/chat/session/s/messages'});expect(restored.json().state.canUndo).toBe(true);
 const undo=await send('Undo that.');expect(undo.done.state.slots.clientName).toBe('John');expect(undo.done.state.canvasLayout?.elementOverrides?.header_title?.color).toBeUndefined();
 const redo=await send('Redo that.');expect(redo.done.state.slots.clientName).toBe('Alex');expect(redo.done.state.canvasLayout.elementOverrides.header_title.color).toBe('#0000ff');expect(state.calls).toHaveLength(0);
});
it('ambiguous resizing asks once and uses the clarified heading rather than guessing',async()=>{
 const first=await send('Make it bigger.',{editorContext:context,expectedLayoutRevision:0});expect(first.done.response).toMatch(/Which element/);expect(first.done.state.canvasLayout).toBeNull();
 const next=await send('The heading.');expect(next.error).toBeUndefined();expect(next.done.state.canvasLayout.elementOverrides.header_title.fontSize).toBeCloseTo(28.8);expect(state.calls).toHaveLength(0);
});
it('selected element resizing persists and a replay does not enlarge it twice',async()=>{
 const turnId=crypto.randomUUID(),body={editorContext:{...context,selectedIds:['client_name']},expectedLayoutRevision:0,turnId};
 const first=await send('Make it bigger.',body);expect(first.done.state.canvasLayout.elementOverrides.client_name.fontSize).toBeCloseTo(14.4);
 const second=await send('Make it bigger.',body);expect(second.done.replayed).toBe(true);expect(second.done.state.canvasLayout.elementOverrides.client_name.fontSize).toBeCloseTo(14.4);
});
it('verified local side questions do not mutate confirmed document fields or call a model',async()=>{
 const before=snapshot(await repo.load('u','s')).slots;const answer=await send('What is the difference between an invoice and a quotation?');
 expect(answer.done.response).toContain('quotation');expect(answer.done.state.slots).toEqual(before);expect(state.calls).toHaveLength(0);
});
it('model-assisted side questions omit mutation schemas while keeping authorized state tools',async()=>{
 const answer=await send('How should I explain payment schedules to a new customer?');
 expect(answer.error).toBeUndefined();expect(state.calls).toHaveLength(1);
 const names=state.calls[0].tools.map((tool:any)=>tool.function.name);
 expect(names).toContain('get_session_state');
 expect(names).not.toContain('update_slots');expect(names).not.toContain('edit_canvas');expect(names).not.toContain('undo_document');
 expect(answer.done.state.slots.clientName).toBe('John');
});
it('spelling correction is contextual, durable and waits for a field choice',async()=>{
 const first=await send('Plase delivary the prodcts within seven days.');expect(first.done.response).toContain('Please deliver the products within seven days.');expect(first.done.state.slots.notesAndTerms).toBeUndefined();expect(first.done.state.pendingIntent.kind).toBe('language');
 const loaded=await app.inject({method:'GET',url:'/chat/session/s/messages'});expect(loaded.json().state.pendingLanguage).toBeTruthy();
 const accepted=await send('Notes');expect(accepted.done.state.slots.notesAndTerms).toContain('Please deliver the products within seven days.');expect(accepted.done.state.pendingLanguage).toBeNull();expect(state.calls).toHaveLength(0);
});
it('an undo of an unaccepted language suggestion dismisses it without undoing business facts',async()=>{
 await send('Change the customer to Alex.');await send('Plase delivary the prodcts within seven days.');const result=await send('Undo that.');expect(result.done.state.slots.clientName).toBe('Alex');expect(result.done.state.pendingLanguage).toBeNull();
});
it('local failure triggers only permitted cloud fallback and preserves the same context',async()=>{
 state.script=body=>body.model_id==='local'?Response.json({detail:{code:'PROVIDER_UNAVAILABLE'}},{status:503}):Response.json({message:{role:'assistant',content:'Payment terms describe when and how your customer should pay.'},finish_reason:'stop'});
 const result=await send('How should I explain payment terms to a new customer?');expect(result.error).toBeUndefined();expect(state.calls.map(call=>call.model_id)).toEqual(['local','cloud']);expect(state.calls[0].messages).toEqual(state.calls[1].messages);expect(result.done.state.slots.clientName).toBe('John');
});
it('cloud fallback can be disabled at runtime without redeployment',async()=>{
 runtime.policy!.cloud_fallback_enabled=false;state.script=()=>Response.json({detail:{code:'PROVIDER_UNAVAILABLE'}},{status:503});
 expect((await send('Explain typical payment terms.')).error).toBeTruthy();expect(state.calls.map(call=>call.model_id)).toEqual(['local']);
});
it('budget refusal never escalates to another provider',async()=>{
 state.script=()=>Response.json({detail:{code:'AI_BUDGET_EXCEEDED'}},{status:403});
 const response=await send('Explain typical payment terms.');expect(response.error.code).toBe('AI_BUDGET_EXCEEDED');expect(response.error.message).toContain('allowance');expect(state.calls).toHaveLength(1);
});
it('provider/model identifiers are removed from natural user-facing replies',async()=>{
 state.script=()=>Response.json({message:{role:'assistant',content:'Example Provider using secret-model-identifier can explain payment terms.'},finish_reason:'stop'});
 const result=await send('Can you explain payment terms?');expect(result.done.response).not.toMatch(/Example Provider|secret-model-identifier/);expect(JSON.stringify(result.done.state)).not.toMatch(/secret-model-identifier|admin.invalid/);
});
it('model changes preserve the current turn snapshot and take effect on the next turn',async()=>{
 state.script=()=>{runtime.version=2;runtime.policy!.primary_model='cloud';return Response.json({message:{role:'assistant',content:'Payment terms define the timing and method of payment.'},finish_reason:'stop'});};
 await send('Explain payment terms.');await send('What does a payment schedule mean?');expect(state.calls.map(call=>[call.policy_version,call.model_id])).toEqual([[1,'local'],[2,'cloud']]);
});
it('feature policy denies visual changes even when deterministic resolution succeeds',async()=>{
 runtime.policy!.allowed_features=['chat'];const result=await send('Make the invoice heading blue.',{editorContext:context,expectedLayoutRevision:0});expect(result.error.code).toBe('ENTITLEMENT_DENIED');expect(snapshot(await repo.load('u','s')).canvasLayout).toBeNull();expect(state.calls).toHaveLength(0);
});
it('cross-tenant access is denied before inference or tool work',async()=>{
 db.sessions.get('s').userId='another-tenant';const result=await send('Change the customer to Alex.');expect(result.error.status).toBe(403);expect(state.calls).toHaveLength(0);
});
it('model grammar tools persist a proposal and require confirmation for flexible rewrites',async()=>{
 db.sessions.get('s').slots.notesAndTerms='We will recieve payment within 7 days.';
 state.script=()=>Response.json({message:{role:'assistant',content:'',tool_calls:[{id:'grammar',type:'function',function:{name:'propose_language_correction',arguments:JSON.stringify({field:'notesAndTerms',original:'We will recieve payment within 7 days.',suggested:'We will receive payment within 7 days.',reason:'Correct spelling while preserving the payment term.'})}}]},finish_reason:'tool_calls'});
 const suggested=await send('Correct the grammar in my notes.');expect(suggested.error).toBeUndefined();expect(suggested.done.state.pendingLanguage.suggested).toContain('receive');expect(suggested.done.state.slots.notesAndTerms).toContain('recieve');
 const accepted=await send('Yes');expect(accepted.done.state.slots.notesAndTerms).toContain('receive');expect(accepted.done.state.slots.notesAndTerms).not.toContain('recieve');
});

it('the natural singular item command uses existing currency and backend totals without inference',async()=>{
 const result=await send('Add another item, a mouse for 25 dollars.');expect(result.error).toBeUndefined();
 expect(result.done.state.slots.lineItems.at(-1)).toMatchObject({description:'Mouse',quantity:1,unitPrice:25,total:25});
 expect(result.done.state.slots.currency).toBe('USD');expect(result.done.state.slots.totalDue).toBe(1525);expect(state.calls).toHaveLength(0);
});
it('every deterministic item/field mutation respects document feature permissions',async()=>{
 runtime.policy!.allowed_features=['chat'];
 for(const message of ['Remove the second item.','Add a mouse for 25 USD.','Clear notes.']) {
  const result=await send(message);expect(result.error.code).toBe('ENTITLEMENT_DENIED');
 }
 expect(snapshot(await repo.load('u','s')).slots.lineItems).toHaveLength(1);expect(state.calls).toHaveLength(0);
});
it('undo cannot restore visual changes when the current policy has revoked visual access',async()=>{
 await send('Make the invoice heading blue.',{editorContext:context,expectedLayoutRevision:0});
 runtime.policy!.allowed_features=['chat','document_edit'];
 const result=await send('Undo that.');expect(result.error.code).toBe('ENTITLEMENT_DENIED');
 expect(snapshot(await repo.load('u','s')).canvasLayout.elementOverrides.header_title.color).toBe('#0000ff');
});
it('internal identifiers are redacted regardless of provider response capitalization',async()=>{
 state.script=()=>Response.json({message:{role:'assistant',content:'EXAMPLE PROVIDER uses SECRET-MODEL-IDENTIFIER.'},finish_reason:'stop'});
 const result=await send('Explain payment terms.');expect(result.done.response).not.toMatch(/example provider|secret-model-identifier/i);
});

it('the supplied creation conversation extracts names and word-number quantities without inventing required details',async()=>{
 db.sessions.get('s').slots={};
 const result=await send('Create an invoice for Nexora. Customer is John, and I sold three laptops for 500 each.');
 expect(result.error).toBeUndefined();expect(result.done.state.slots).toMatchObject({businessName:'Nexora',clientName:'John'});
 expect(result.done.state.slots.lineItems[0]).toMatchObject({description:'Laptops',quantity:3,unitPrice:500});
 expect(result.done.state.missingRequired).not.toContain('businessName');expect(result.done.state.missingRequired).not.toContain('clientName');
 expect(result.done.state.slots.currency).toBeUndefined();expect(state.calls).toHaveLength(0);
});

it('foreign item currency waits for a durable choice and never silently relabels existing prices',async()=>{
 db.sessions.get('s').slots.currency='GBP';
 const first=await send('Add another item, a mouse for 25 dollars.');expect(first.error).toBeUndefined();
 expect(first.done.state.slots.currency).toBe('GBP');expect(first.done.state.slots.lineItems).toHaveLength(1);
 expect(first.done.state.pendingIntent.action).toBe('item_currency');expect(first.done.response).toContain('will not be converted');
 const loaded=await app.inject({method:'GET',url:'/chat/session/s/messages'});expect(loaded.json().state.pendingIntent.action).toBe('item_currency');
 const chosen=await send('GBP');expect(chosen.done.state.slots.currency).toBe('GBP');expect(chosen.done.state.slots.lineItems.at(-1)).toMatchObject({quantity:1,unitPrice:25});expect(state.calls).toHaveLength(0);
});
it('an explicit foreign currency can change the document only after the user approves its scope',async()=>{
 const first=await send('Add a mouse quantity 1 price 25 GBP.');expect(first.error).toBeUndefined();expect(first.done.state.slots.currency).toBe('USD');
 const chosen=await send('GBP');expect(chosen.error).toBeUndefined();expect(chosen.done.state.slots.currency).toBe('GBP');
 expect(chosen.done.state.slots.lineItems[0].unitPrice).toBe(500);expect(chosen.done.state.slots.lineItems.at(-1).unitPrice).toBe(25);expect(state.calls).toHaveLength(0);
});
