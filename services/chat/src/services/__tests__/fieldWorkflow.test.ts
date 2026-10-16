import {afterEach,expect,it,vi} from 'vitest';
import Fastify from 'fastify';
import {execFileSync} from 'node:child_process';
vi.mock('../db.service.js',()=>({db:{}}));
vi.mock('../redis.service.js',()=>({redis:{}}));
vi.mock('../../middleware/concurrency.js',()=>({concurrencyLimiter:async()=>{}}));
vi.mock('../quotaClient.service.js',()=>({checkChatQuota:async()=>({allowed:true})}));
vi.mock('../../config/env.js',()=>({env:{TURN_TIMEOUT_MS:90000}}));
import {ConversationRepository} from '../conversation.repository.js';
import {MemoryDatabase} from '../../testing/memory-db.js';
import {chatRoutes} from '../../routes/chat.routes.js';
import {snapshot} from '../../../../../shared/conversation-state.mjs';
import {renderTemplate} from '../../../../../user-frontend/src/utils/templateRenderer';
import {getElementsForTemplate} from '../../../../../user-frontend/src/utils/invoiceElements';
let app:ReturnType<typeof Fastify>;
afterEach(async()=>app?.close());
async function fixture(templateId='invoice-minimal') {
 const db=new MemoryDatabase();db.sessions.get('s').templateId=templateId;db.sessions.get('s').slots={_chat:{version:2,templateId,documentType:'invoice',fields:{},turns:{}}};
 const repo=new ConversationRepository(db);const provider=vi.fn(async function*(){yield {type:'done',text:'What is your company name?'};});
 app=Fastify();app.addHook('onRequest',async(req:any)=>{req.user={id:'u',plan:'free'};});await app.register(chatRoutes,{db,repository:repo,provider,limiter:async()=>{}} as any);
 async function send(message:string){const id=crypto.randomUUID();const r=await app.inject({method:'POST',url:'/chat/session/s/message',payload:{message,turnId:id}});const events=r.body.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5)));expect(events.find(e=>e.type==='error')).toBeUndefined();return events.find(e=>e.type==='done');}
 return {db,repo,send,provider};
}
it('full chat → restored state → approval → HTML/canvas → Python validation workflow',async()=>{
 const {db,repo,send,provider}=await fixture('tmpl_invoice_odoo_community');
 const start=await send('my company name is nexora and client is john perera. invoice for website development 50000 lkr');expect(start.state.nextAction.component).toBe('quantity');
 await send('1');await send('invoice number is inv-001 and invoice date is 2026-10-13 and due date is 2026-11-13');
 await send('business address is 10 Software Road, Colombo and client address is 20 Client Road, Kandy');
 await send('business email is hello@NEXORA.COM and business phone is +94 771234567');
 const restored=await app.inject({url:'/chat/session/s/messages'});expect(restored.json().state.readyToGenerate).toBe(true);expect(restored.json().state.canGenerate).toBe(false);expect(restored.json().state.fieldStates.businessName.rawInput).toBe('nexora');
 const review=await send('Generate the invoice');expect(review.actions).toEqual([]);expect(review.response).toContain('confirm');expect(review.state.finalization.status).toBe('requested');
 const approved=await send('yes');expect(approved.state.canGenerate).toBe(true);expect(approved.actions[0]).toMatchObject({kind:'generate',sessionId:'s',revision:approved.state.revision});expect(provider).not.toHaveBeenCalled();
 const html=renderTemplate('tmpl_invoice_odoo_community',approved.state.slots,null,'#0097b2','invoice');expect(html).toContain('Nexora');expect(html).toContain('John Perera');expect(html).toContain('Website Development');expect(html).toContain('50,000.00');expect(html).not.toContain('PENTOS');
 const elements=getElementsForTemplate('tmpl_invoice_odoo_community',approved.state.slots,'#0097b2')!;const text=(id:string)=>{const el=elements.find(el=>el.id===id);return el?.type==='text'?el.text:'';};expect(text('client_name')).toBe('John Perera');expect(text('sender_name')).toBe('Nexora');expect(text('client_address')).toContain('20 Client Road');expect(text('sender_address')).toContain('10 Software Road');expect(text('footer_vat_val')).toBe('');
 const code="import json,sys,importlib.util; from pathlib import Path; p=Path('services/document/app/services/document_contract.py'); s=importlib.util.spec_from_file_location('contract',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); state=json.load(sys.stdin); print(json.dumps(m.validated_document(state['documentType'],state['slots'],state['templateId'],state['schema'])))";
 const validated=JSON.parse(execFileSync('python3',['-c',code],{input:JSON.stringify(approved.state),encoding:'utf8'}));expect(validated.totalDue).toBe(50000);expect(validated.businessName).toBe('Nexora');
 await send('Change company name to Nexora Technologies');expect(snapshot(await repo.load('u','s')).canGenerate).toBe(false);expect(db.messages.filter(m=>m.role==='USER')).toHaveLength(8);
});
it('UI approval rejects stale values and changing templates reopens collection',async()=>{
 const {repo,send}=await fixture();
 await send('my company is nexora and client is john perera. invoice for website development 50000 lkr');await send('1');await send('invoice number is inv-1 and invoice date is 2026-10-13 and due date is 2026-11-13');
 const state=snapshot(await repo.load('u','s'));await send('Change client name to Jane Perera');
 const stale=await app.inject({method:'POST',url:'/chat/session/s/confirm',payload:{fingerprint:state.finalization.fingerprint,expectedRevision:state.revision}});expect(stale.statusCode).toBe(409);
 const latest=snapshot(await repo.load('u','s'));const approved=await app.inject({method:'POST',url:'/chat/session/s/confirm',payload:{fingerprint:latest.finalization.fingerprint,expectedRevision:latest.revision}});expect(approved.statusCode).toBe(200);expect(approved.json().state.canGenerate).toBe(true);
 await repo.updateMetadata('u','s',{templateId:'tmpl_invoice_odoo_community'});const changed=snapshot(await repo.load('u','s'));expect(changed.canGenerate).toBe(false);expect(changed.missingRequired).toContain('senderEmail');
});
it('a stale provider question cannot repeat an accepted company field',async()=>{
 const {send}=await fixture();const answer=await send('my company is nexora and tell me how to add items');expect(answer.state.slots.businessName).toBe('Nexora');expect(answer.response).not.toContain('What is your company name?');expect(answer.state.nextAction.field).toBe('clientName');
});
it('chat edits persist distinct parties, notes and accounts and update Odoo HTML/canvas after refresh',async()=>{
 const {repo,send,provider}=await fixture('tmpl_invoice_odoo_community');
 await send('my company is SENYX and client is john perera. invoice for mobile app 99000 lkr');await send('1');
 await send('invoice number is inv-1234 and invoice date is 2026-10-13 and due date is 2026-11-13');
 await send('business address is senyx software, address no 40/20, sagabo mawatha, diggala, keselwatta, panadura and client address is no 2, mattakkuliya, colombo');
 await send('business email is tech@senyxsoftware.com and business phone is 0382298760 and client phone is 0741234567');
 const saved=await send('add note valid 30 days add my bank details boc panadura 007903232');
 expect(saved.response).toContain('Valid for 30 days');expect(saved.response).toContain('007903232');expect(provider).not.toHaveBeenCalled();
 const restored=await app.inject({url:'/chat/session/s/messages'});const state=restored.json().state;
 expect(state.slots).toMatchObject({senderPhone:'0382298760',clientPhone:'0741234567',notesAndTerms:'Valid for 30 days.',accountDetails:'BOC, Panadura, Account: 007903232',senderAddress:'SENYX Software, No. 40/20, Sagabo Mawatha, Diggala, Keselwatta, Panadura',clientAddress:'No. 2, Mattakkuliya, Colombo'});
 const elements=getElementsForTemplate('tmpl_invoice_odoo_community',state.slots,'#0097b2')!;
 const values=Object.fromEntries(elements.filter(e=>e.type==='text').map(e=>[e.id,e.type==='text'?e.text:'']));
 expect(values.sender_phone).toBe('0382298760');expect(values.client_phone).toBe('0741234567');
 expect(Object.values(values)).toContain('Valid for 30 days.');expect(Object.values(values)).toContain('BOC, Panadura, Account: 007903232');
 const html=renderTemplate('tmpl_invoice_odoo_community',state.slots,null,'#0097b2','invoice');expect(html).toContain('Valid for 30 days.');expect(html).toContain('007903232');expect(html).toContain('99,000.00');
 const corrected=await send('Change my business phone to 0771234567');expect(corrected.state.slots.senderPhone).toBe('0771234567');expect(corrected.state.slots.clientPhone).toBe('0741234567');
 await send('client phone is 0712345678');expect(snapshot(await repo.load('u','s')).fieldStates.clientPhone.status).toBe('conflicting');await app.inject({url:'/chat/session/s/messages'});await send('no');expect(snapshot(await repo.load('u','s')).slots.clientPhone).toBe('0741234567');
 const partial=await send('Change client phone to 123, change notes to payment within 30 days');expect(partial.state.slots.notesAndTerms).toBe('Payment within 30 days.');expect(partial.state.slots.clientPhone).toBe('0741234567');expect(partial.response).toContain("couldn't save the client phone");
 await send('Change client phone to 0741234567');await send('Remove the client phone number');const end=await repo.load('u','s');expect(end.slots.clientPhone).toBeUndefined();expect(end.slots.senderPhone).toBe('0771234567');
 const cleared=getElementsForTemplate('tmpl_invoice_odoo_community',snapshot(end).slots,'#0097b2')!;expect(cleared.find(e=>e.id==='client_phone')).toBeUndefined();expect(cleared.find(e=>e.id==='sender_phone')).toMatchObject({text:'0771234567'});
});
it('structured AI extraction handles an unlabeled banking clause without losing valid local edits',async()=>{
 const {send,provider}=await fixture();
 provider.mockImplementation(async function*(_messages:any,_system:any,mcp:any){
  const result=await mcp.callTool({name:'update_slots',arguments:{slots:{accountDetails:'Bank of Ceylon, Panadura branch, Account Number: 007903232'},evidence:{accountDetails:'BOC Panadura account 007903232'}}});expect(result.isError).not.toBe(true);
  yield {type:'done',text:'Saved bank account details.'};
 } as any);
 const result=await send('add note valid 30 days add BOC Panadura account 007903232');expect(provider).toHaveBeenCalled();
 expect(result.state.slots.notesAndTerms).toBe('Valid for 30 days.');expect(result.state.slots.accountDetails).toBe('BOC, Panadura, Account: 007903232');expect(result.state.fieldStates.accountDetails.rawInput).toBe('BOC Panadura account 007903232');expect(result.response).toContain('007903232');
});
it('repaired tool receipts acknowledge success and permit review in the same generation request',async()=>{
 const {send,provider}=await fixture();await send('my company is Nexora and client is John Perera. invoice for design 50000 lkr');await send('1');await send('invoice number is inv-1 and invoice date is 2026-10-13 and due date is 2026-11-13');
 provider.mockImplementation(async function*(_messages:any,_system:any,mcp:any){
  await mcp.callTool({name:'update_slots',arguments:{slots:{accountDetails:'Invented Bank, Account: 123456'},evidence:{accountDetails:'Invented Bank'}}});
  await mcp.callTool({name:'update_slots',arguments:{slots:{accountDetails:'BOC Panadura account 007903232'}}});
  yield {type:'done',text:'Saved bank account details.'};
 } as any);
 const reviewed=await send('add BOC Panadura account 007903232 and generate the invoice');expect(reviewed.state.slots.accountDetails).toBe('BOC, Panadura, Account: 007903232');expect(reviewed.response).not.toContain("couldn't save");expect(reviewed.state.finalization.status).toBe('requested');expect(reviewed.actions).toEqual([]);
 const approved=await send('yes');expect(approved.state.canGenerate).toBe(true);expect(approved.actions[0].kind).toBe('generate');
});

it('pasted service table persists all rows, exact total and currency and restores the synchronized preview',async()=>{
 const {send,provider}=await fixture('tmpl_invoice_odoo_community');
 await send('my company name is nexora and client is john perera');
 const message='Item / Service\tQuantity\tUnit Price (LKR)\tTotal (LKR)\nWebsite Development\t1\t75,000.00\t75,000.00\nUI/UX Design\t2\t15,000.00\t30,000.00\nDomain Registration\t1\t4,500.00\t4,500.00\nWeb Hosting (1 Year)\t1\t12,000.00\t12,000.00';
 const result=await send(message);expect(provider).not.toHaveBeenCalled();
 expect(result.state.slots.lineItems).toHaveLength(4);expect(result.state.slots).toMatchObject({currency:'LKR',subtotal:121500,totalDue:121500,businessName:'Nexora',clientName:'John Perera'});
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;
 expect(restored.slots.lineItems).toEqual(result.state.slots.lineItems);
 const html=renderTemplate('tmpl_invoice_odoo_community',restored.slots,null,'#0097b2','invoice');
 for(const value of ['Website Development','UI/UX Design','Domain Registration','Web Hosting (1 Year)','121,500.00'])expect(html).toContain(value);
 const elements=getElementsForTemplate('tmpl_invoice_odoo_community',restored.slots,'#0097b2')!;
 expect(elements.some(element=>element.type==='text'&&element.text.includes('121,500.00'))).toBe(true);
});

it('Retry reconciles a table saved with the old provider-only extraction plan without another AI call',async()=>{
 const {repo,db,provider}=await fixture('tmpl_invoice_odoo_community');
 const message='Description\tQty\tUnit Price (LKR)\tTotal (LKR)\nWebsite Development\t1\t75,000.00\t75,000.00';
 const turnId=crypto.randomUUID();const claim=await repo.claim('u','s',turnId,message);
 await repo.checkpoint('u','s',{turnId,token:claim.token},{localProposal:{slots:{},evidence:{},intent:{kind:'provide'},needsProvider:true}});
 await repo.finish('u','s',turnId,claim.token,'','failure',{code:'PROVIDER_FAILED',retryable:true});
 const response=await app.inject({method:'POST',url:'/chat/session/s/message',payload:{message,turnId}});
 const events=response.body.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5)));const done=events.find(event=>event.type==='done');
 expect(events.find(event=>event.type==='error')).toBeUndefined();expect(done.state.slots.lineItems).toHaveLength(1);expect(done.state.slots.totalDue).toBe(75000);
 expect(done.state.pendingTurn).toBeNull();expect(provider).not.toHaveBeenCalled();expect(db.messages.filter(message=>message.role==='USER')).toHaveLength(1);
});

const acceptanceTable='Item / Service\tQuantity\tUnit Price (LKR)\tTotal (LKR)\nWebsite Development\t1\t75,000.00\t75,000.00\nUI/UX Design\t2\t15,000.00\t30,000.00\nDomain Registration\t1\t4,500.00\t4,500.00\nWeb Hosting (1 Year)\t1\t12,000.00\t12,000.00';
async function acceptanceSetup(){const f=await fixture('tmpl_invoice_odoo_community');await f.send('my company name is nexora and client name is john perera');await f.send('invoice number is INV-ACCEPTANCE, invoice date is 2026-10-13 and due date is 2026-12-12');await f.send(acceptanceTable);await f.send('Business address is No 40/20, Panadura and client address is Colombo 05');return f;}
it('complete acceptance edits persist, offer optional contacts, restore and match preview and Python export data',async()=>{
 const {send,repo,provider}=await acceptanceSetup();const required=await send('Business phone is 0771234567 and email is hello@nexora.com');expect(required.state.missingRequired).toEqual([]);expect(required.response).toContain('client email');expect(required.state.nextAction.kind).toBe('offer_optional');
 await send('Client phone is 0712345678 and email is yohan@example.com');await send('Update Website Development quantity to 2 and price to 1 lakh');await send('Apply 10% discount');await send('Add note: Last valid date is 2026-12-12');await send('Add payment terms: Payment due within 14 days');await send('Change client name to Yohan Maha');
 const summary=await send('Show document summary');expect(summary.response).toContain('Yohan Maha');expect(summary.response).toContain('221,850.00');expect(summary.response).toContain('Last valid date: 2026-12-12.');expect(provider).not.toHaveBeenCalled();
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;expect(restored.slots).toMatchObject({businessName:'Nexora',clientName:'Yohan Maha',senderPhone:'0771234567',senderEmail:'hello@nexora.com',clientPhone:'0712345678',clientEmail:'yohan@example.com',discountRate:10,subtotal:246500,discountAmount:24650,totalDue:221850,notesAndTerms:'Last valid date: 2026-12-12.',paymentTerms:'Payment due within 14 days.'});expect(restored.slots.lineItems[0]).toMatchObject({id:'item-0',quantity:2,unitPrice:100000,total:200000});expect(restored.slots.lineItems).toHaveLength(4);
 const html=renderTemplate('tmpl_invoice_odoo_community',restored.slots,null,'#0097b2','invoice');for(const text of ['Yohan Maha','221,850.00','Last valid date','Payment due within 14 days'])expect(html).toContain(text);
 const canvas=getElementsForTemplate('tmpl_invoice_odoo_community',restored.slots,'#0097b2')!;expect(canvas.some(e=>e.type==='text'&&e.text.includes('221,850.00'))).toBe(true);expect(canvas.some(e=>e.type==='text'&&e.text.includes('Payment due within 14 days'))).toBe(true);
 const py="import json,sys,importlib.util; s=importlib.util.spec_from_file_location('c','services/document/app/services/document_contract.py'); c=importlib.util.module_from_spec(s); s.loader.exec_module(c); a=json.load(sys.stdin); print(json.dumps(c.validated_document(a['documentType'],a['slots'],a['templateId'],a['schema'])))";const exported=JSON.parse(execFileSync('python3',['-c',py],{input:JSON.stringify(restored),encoding:'utf8'}));expect(exported.totalDue).toBe(restored.slots.totalDue);expect(exported.notesAndTerms).toBe(restored.slots.notesAndTerms);expect(exported.lineItems).toEqual(restored.slots.lineItems);
 expect(snapshot(await repo.load('u','s')).canGenerate).toBe(false);await send('Generate the invoice');const confirmed=await send('yes');expect(confirmed.state.canGenerate).toBe(true);
});
it('optional offer stays pending after refresh and is not repeated after accepting or skipping it',async()=>{
 const {send}=await acceptanceSetup();await send('Business phone is 0771234567 and email is hello@nexora.com');expect((await app.inject({url:'/chat/session/s/messages'})).json().state.nextAction.kind).toBe('offer_optional');
 const yes=await send('yes');expect(yes.state.nextAction.field).toBe('clientEmail');expect(yes.response).not.toContain('welcome');await send('yohan@example.com');const skip=await send('Skip all optional details');expect(skip.state.nextAction.kind).toBe('review');const updated=await send('Update Website Development quantity to 2');expect(updated.response).not.toContain('Would you like to add');expect(updated.state.slots.lineItems[0].quantity).toBe(2);
});
it('validated pending tool proposal survives a later tool failure and yes executes it after refresh',async()=>{
 const {send,provider,repo}=await fixture();provider.mockImplementation(async function*(_messages:any,_system:any,mcp:any){const r=await mcp.callTool({name:'update_slots',arguments:{fieldOperations:[{operation:'append',field:'notesAndTerms',value:'validity date 2026-12-12',evidence:'validity date 2026-12-12'}],confirmBeforeApply:true,confirmationQuestion:'Add the validity date to the notes?'}});expect(r.isError).not.toBe(true);yield {type:'error',code:'TOOL_FAILED',phase:'tool'};} as any);
 const turnId=crypto.randomUUID();const failed=await app.inject({method:'POST',url:'/chat/session/s/message',payload:{message:'Please put the validity date 2026-12-12 somewhere appropriate',turnId}});expect(failed.body).toContain('"type":"error"');expect(snapshot(await repo.load('u','s')).pendingIntent.kind).toBe('operation');
 expect((await app.inject({url:'/chat/session/s/messages'})).json().state.pendingIntent.kind).toBe('operation');const yes=await send('yes');expect(yes.state.slots.notesAndTerms).toBe('Validity date 2026-12-12.');expect(yes.state.pendingIntent).toBeNull();expect(yes.response).not.toContain('welcome');
});
it('append retry after storage interruption executes once and preserves earlier notes',async()=>{
 const {repo,db}=await fixture();await repo.apply('u','s',{slots:{notesAndTerms:'Original.'}},{id:'seed',kind:'user',message:'Original.'});const finish=vi.spyOn(repo,'finish');finish.mockRejectedValueOnce(Object.assign(new Error('Storage interruption'),{code:'STORAGE_UNAVAILABLE'}));
 const turnId=crypto.randomUUID(),payload={message:'Append note Thank you',turnId};const failed=await app.inject({method:'POST',url:'/chat/session/s/message',payload});expect(failed.body).toContain('STORAGE_UNAVAILABLE');const retried=await app.inject({method:'POST',url:'/chat/session/s/message',payload});expect(retried.body).toContain('"type":"done"');expect(snapshot(await repo.load('u','s')).slots.notesAndTerms).toBe('Original.\nThank you.');expect(db.messages.filter(message=>message.role==='USER')).toHaveLength(1);
});
it('fixed discount and payment terms render without undefined percentage labels and remain editable',async()=>{
 const {send}=await acceptanceSetup();await send('Business phone is 0771234567 and email is hello@nexora.com');await send('Apply 10% discount');const fixed=await send('Apply LKR 10000 fixed discount');expect(fixed.state.slots.discountRate).toBeUndefined();expect(fixed.state.slots.totalDue).toBe(111500);await send('Add payment terms: Net 14 days');const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;
 const html=renderTemplate('tmpl_invoice_odoo_community',restored.slots,null,'#0097b2','invoice');expect(html).toContain('Discount (fixed)');expect(html).not.toContain('undefined%');expect(html).toContain('Net 14 days');const removed=await send('Remove discount');expect(removed.state.slots.discountAmount).toBe(0);expect(removed.state.slots.totalDue).toBe(121500);
});

it('the screenshot discount instruction commits the invoice discount without asking for scope and restores its preview',async()=>{
 const {send,provider,repo}=await acceptanceSetup();
 const previous=snapshot(await repo.load('u','s'));
 const providerCalls=provider.mock.calls.length;
 const applied=await send('add a discount 10%');
 expect(provider.mock.calls.length).toBe(providerCalls);
 expect(applied.state.slots.discountRate).toBe(10);
 expect(applied.state.slots.discountAmount).toBe(12150);
 expect(applied.state.slots.totalDue).toBe(109350);
 expect(applied.state.slots.lineItems).toEqual(previous.slots.lineItems);
 expect(applied.response).toContain('discount rate: 10%');
 expect(applied.response).not.toMatch(/rejected|confirm whether|specific line item/i);
 const stored=snapshot(await repo.load('u','s'));
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;
 expect(restored.slots).toEqual(stored.slots);
 const html=renderTemplate('tmpl_invoice_odoo_community',restored.slots,null,'#0097b2','invoice');
 expect(html).toContain('Discount (10%)');
 expect(html).toContain('12,150.00');
 expect(html).toContain('109,350.00');
});

it('screenshot declarative item edits commit, restore and update both preview rows without provider fallback',async()=>{
 const {send,provider,repo}=await acceptanceSetup();const before=snapshot(await repo.load('u','s'));const calls=provider.mock.calls.length;
 const qty=await send('web development qty is 2');expect(qty.state.slots.lineItems[0]).toMatchObject({id:before.slots.lineItems[0].id,quantity:2,total:150000});
 expect(qty.response).not.toMatch(/unable|confirm whether|rejected/);expect(qty.state.pendingIntent).toBeNull();
 const price=await send('ux ui design price is rs 20 000');expect(price.state.slots.lineItems[1]).toMatchObject({id:before.slots.lineItems[1].id,quantity:2,unitPrice:20000,total:40000});
 expect(provider.mock.calls.length).toBe(calls);expect(price.state.slots.totalDue).toBe(206500);
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;expect(restored.slots).toEqual(snapshot(await repo.load('u','s')).slots);
 const html=renderTemplate('tmpl_invoice_odoo_community',restored.slots,null,'#0097b2','invoice');for(const text of ['150,000.00','20,000.00','40,000.00','206,500.00'])expect(html).toContain(text);
});
it('an ambiguous declarative row edit persists its target choice through refresh and executes only the selected row',async()=>{
 const {repo,send}=await fixture();await repo.apply('u','s',{slots:{currency:'LKR',lineItems:[{id:'web-a',description:'Web Development',quantity:1,unitPrice:75000},{id:'web-b',description:'Web Design',quantity:1,unitPrice:15000}]}},{id:'seed',kind:'user',message:'Web Development quantity 1 price 75000 and Web Design quantity 1 price 15000',correction:false});
 const ambiguous=await send('web qty is 2');expect(ambiguous.state.pendingIntent.kind).toBe('operation');expect(ambiguous.state.slots.lineItems[0].quantity).toBe(1);
 expect((await app.inject({url:'/chat/session/s/messages'})).json().state.pendingIntent.kind).toBe('operation');
 const yes=await send('yes');expect(yes.state.slots.lineItems[0].quantity).toBe(1);expect(yes.state.pendingIntent.kind).toBe('operation');
 const selected=await send('first');expect(selected.state.slots.lineItems[0].quantity).toBe(2);expect(selected.state.slots.lineItems[1].quantity).toBe(1);expect(selected.state.pendingIntent).toBeNull();
});

it('a structured line-item confirmation remains executable by yes after session restoration',async()=>{
 const {send,provider,repo}=await acceptanceSetup();
 provider.mockImplementation(async function*(_messages:any,_system:any,mcp:any){
  const result=await mcp.callTool({name:'update_slots',arguments:{itemOperations:[{operation:'update',id:'item-0',item:{quantity:2}}],confirmBeforeApply:true,confirmationQuestion:'Change Website Development quantity to 2?'}});
  expect(result.isError).not.toBe(true);yield {type:'done',text:'Change Website Development quantity to 2?'};
 } as any);
 const pending=await send('Could you set Website Development quantity to 2 after I confirm?');
 expect(pending.state.slots.lineItems[0].quantity).toBe(1);expect(pending.state.pendingIntent.kind).toBe('operation');
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;expect(restored.pendingIntent.kind).toBe('operation');
 const yes=await send('yes');expect(yes.state.slots.lineItems[0].quantity).toBe(2);expect(yes.state.pendingIntent).toBeNull();expect(yes.response).not.toContain('welcome');
 expect(snapshot(await repo.load('u','s')).slots.lineItems[0].quantity).toBe(2);
});

it('an older conversation with stored rows and earlier unsuccessful edits accepts the screenshot typo and yes',async()=>{
 const {send,repo,db,provider}=await acceptanceSetup();const saved=await repo.load('u','s');
 saved.slots._chat.turns['earlier-failed-edit']={status:'success',startedAt:Date.now()-60000,providerCompleted:true,providerText:'I can only add items, not edit existing ones.',response:'I can only add items, not edit existing ones.'};db.sessions.set('s',saved);
 const requested=await send('web site developmnt qty is 2');expect(requested.state.slots.lineItems[0].quantity).toBe(1);expect(requested.response).toContain('Website Development');expect(requested.state.pendingIntent.allowYes).toBe(true);
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;expect(restored.pendingIntent.allowYes).toBe(true);
 const yes=await send('yes');expect(yes.state.slots.lineItems[0]).toMatchObject({id:'item-0',description:'Website Development',quantity:2,total:150000});expect(yes.response).not.toContain('welcome');expect(yes.state.slots.lineItems).toHaveLength(4);
 const price=await send('ux ui design price is rs 20 000');expect(price.state.slots.lineItems[1].unitPrice).toBe(20000);expect(provider).not.toHaveBeenCalled();
 expect(snapshot(await repo.load('u','s')).slots.clientName).toBe('John Perera');expect(db.sessions.has('s')).toBe(true);
});

it('the screenshot should-be quantity correction persists existing rows and discount and refreshes preview',async()=>{
 const {send,repo,provider}=await acceptanceSetup();await send('add a discount 10%');
 const before=snapshot(await repo.load('u','s'));const result=await send('web development qty should be 2');
 expect(result.state.slots.lineItems[0]).toMatchObject({id:before.slots.lineItems[0].id,description:'Website Development',quantity:2,unitPrice:75000,total:150000});
 expect(result.state.slots.lineItems.slice(1)).toEqual(before.slots.lineItems.slice(1));expect(result.state.slots.discountRate).toBe(10);expect(result.state.slots.totalDue).toBe(176850);expect(result.state.pendingIntent).toBeNull();expect(provider).not.toHaveBeenCalled();expect(result.response).not.toMatch(/unsupported|couldn't|confirm|replace/i);
 const restored=(await app.inject({url:'/chat/session/s/messages'})).json().state;expect(restored.slots).toEqual(snapshot(await repo.load('u','s')).slots);const html=renderTemplate('tmpl_invoice_odoo_community',restored.slots,null,'#0097b2','invoice');expect(html).toContain('150,000.00');expect(html).toContain('176,850.00');
});
it('unparsed edit intent asks the provider for a structured mutation and validates its committed result',async()=>{
 const {send,provider,repo}=await acceptanceSetup();provider.mockImplementation(async function*(_messages:any,_system:any,mcp:any,_session:any,_signal:any,_user:any,requirements:any){expect(requirements.requireMutation).toBe(true);const result=await mcp.callTool({name:'update_slots',arguments:{itemOperations:[{operation:'update',id:'item-0',item:{quantity:2}}]}});expect(result.isError).not.toBe(true);yield {type:'done',text:'Updated Website Development quantity.'};} as any);
 const result=await send('Please adjust Website Development so there are 2 units instead of 1');expect(result.state.slots.lineItems[0].quantity).toBe(2);expect(snapshot(await repo.load('u','s')).slots.lineItems[0].quantity).toBe(2);
});
