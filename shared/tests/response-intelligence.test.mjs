import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCandidates,snapshot,extractExplicit,planResponse,documentSummary} from '../conversation-state.mjs';
import {identifyIntent} from '../conversation-intent.mjs';
import {validateToolProposal} from '../tool-proposal.mjs';
import {readChatStream,chatErrorFromHttp,validSnapshot} from '../chat-stream.mjs';
const ready={businessName:'Nexora',clientName:'Acme Corp',invoiceNumber:'INV-1',issueDate:'2026-10-13',dueDate:'2026-11-13',currency:'LKR',taxRate:0,lineItems:[{id:'app',description:'mobile app',quantity:1,unitPrice:99000}]};
const session=(slots=ready)=>({id:'s',userId:'u',status:'ACTIVE',documentTypeId:'invoice',slots:structuredClone(slots)});
const source=(message,kind='user')=>({id:'t',kind,message,correction:/change|update|remove|delete|clear|actually/i.test(message),now:Date.parse('2026-10-13T10:00:00Z')});
function say(s,message){const p=extractExplicit(message,snapshot(s));const result=applyCandidates('invoice',s.slots,p,source(message));s.slots=result.raw;const state=snapshot(s);return {state,proposal:p,results:result.results,response:planResponse(state,result.changed,message,{intent:p.intent,results:result.results})};}

test('T01-T04/T16/T23/T26 optional edits work after readiness and unchanged answers clear intent',()=>{
 const s=session();assert.match(say(s,'add my business address').response,/business address/);
 const address='No. 40/20, Sagabo Mawatha, Diggala, Keselwatta, Panadura';
 const saved=say(s,address);assert.equal(saved.state.slots.senderAddress,address);assert.match(saved.response,/^Saved business address\./);assert.equal(saved.state.nextAction.kind,'offer_optional');assert.equal(saved.state.readyToGenerate,true);
 assert.match(say(s,'add my business address').response,/already saved/);const unchanged=say(s,address);assert.equal(unchanged.state.pendingIntent,null);assert.equal(unchanged.state.readyToGenerate,true);assert.match(unchanged.response,/already saved/);
 say(s,'Change the business name to Nexora Technologies');assert.equal(snapshot(s).slots.businessName,'Nexora Technologies');assert.equal(snapshot(s).slots.clientName,'Acme Corp');
 say(s,'change my business address');say(s,'cancel address edit');assert.equal(snapshot(s).pendingIntent,null);assert.equal(snapshot(s).slots.senderAddress,address);
});
test('T02 exact reported informal address is preserved conservatively',()=>{const s=session();say(s,'add my business address');assert.equal(say(s,'address no 40/20, sagabo mawatha, diggala keselwattapanadura').state.slots.senderAddress,'No. 40/20, Sagabo Mawatha, Diggala Keselwattapanadura');});
for(const message of ['Tell me a joke','What is VAT?','thanks','summarize this','remove the second item','cancel','No changes needed'])test('T10/T25 unrelated input does not fill pending name/address: '+message,()=>{
 const s=session({});assert.equal(extractExplicit(message,snapshot(s)).slots.businessName,undefined);
 const addressed=session();say(addressed,'add my business address');assert.equal(extractExplicit(message,snapshot(addressed)).slots.senderAddress,undefined);
});
test('T05-T07 local item add/remove/price/quantity edit never duplicates the existing item',()=>{
 const s=session();say(s,'change the mobile app price to 120000');assert.equal(snapshot(s).slots.lineItems.length,1);assert.equal(snapshot(s).slots.totalDue,120000);
 say(s,'add another service for 25000');assert.equal(snapshot(s).nextAction.component,'description');say(s,'Consulting');assert.equal(snapshot(s).nextAction.component,'quantity');say(s,'1');assert.equal(snapshot(s).slots.lineItems.length,2);
 say(s,'Change the first item quantity to 2');assert.equal(snapshot(s).slots.totalDue,265000);say(s,'Remove the second item');assert.equal(snapshot(s).slots.lineItems.length,1);assert.equal(snapshot(s).slots.totalDue,240000);
});
test('T11/T24 multiple labeled fields and summary remain independent intents',()=>{
 const s=session({});const result=say(s,'My company is Nexora, client name is Acme Corp, business phone is 0771234567 and email is hello@example.com');
 assert.equal(result.state.slots.businessName,'Nexora');assert.equal(result.state.slots.clientName,'Acme Corp');assert.equal(result.state.slots.senderPhone,'0771234567');assert.equal(result.state.slots.senderEmail,'hello@example.com');
 const multi=say(s,'Change business name to Nexora Technologies and client name is Acme Corp, summarize the document');
 assert.equal(multi.state.slots.businessName,'Nexora Technologies');assert.equal(multi.state.slots.clientName,'Acme Corp');assert.match(multi.response,/Invoice summary/);assert.match(multi.response,/Nexora Technologies/);
});
for(const message of ['summarize the document','show me the document summary','review','show what we have so far'])test('T08/T17/T38 summary uses committed facts: '+message,()=>{const s=session();const result=say(s,message);assert.match(result.response,/mobile app/);assert.match(result.response,/99,000\.00/);assert.doesNotMatch(result.response,/All required details/);});
test('T18 provider explanations survive, unsupported save claims do not',()=>{
 const state=snapshot(session()),text='Unit price means the amount charged for one unit of the service.';
 assert.equal(planResponse(state,[],'What did you mean by unit price?',{providerText:text}),text);
 assert.doesNotMatch(planResponse(state,[],'What is my address?',{providerText:'Your address has been saved.'}),/has been saved/);
});
test('T19/T31 scalar removal clears optional fields and protects mandatory fields and truthful skip retains known value',()=>{
 const s=session({...ready,senderAddress:'40/20, Road'});assert.equal(say(s,'remove my business address').state.slots.senderAddress,undefined);say(s,'clear due date');assert.equal(snapshot(s).slots.dueDate,ready.dueDate);assert.equal(snapshot(s).readyToGenerate,true);
 const existing=session({...ready,senderAddress:'40/20, Road'});const skipped=say(existing,'skip business address');assert.equal(skipped.state.slots.senderAddress,'40/20, Road');assert.match(skipped.response,/kept/);
});
test('T20/T22/T33 workflow decisions clarify without guessing or bypassing read-only state',()=>{
 const s=session();assert.equal(identifyIntent('Change this to a receipt',snapshot(s)).kind,'change_type');assert.match(say(s,'Change this to a receipt').response,/Which document type/);
 assert.match(say(s,'Use the same company details as before').response,/Choose the saved conversation/);
 assert.equal(snapshot({...s,status:'COMPLETED'}).readOnly,true);assert.equal(snapshot({...s,expiresAt:new Date(0)}).readOnly,true);
});
test('T27 readiness and recovery share one snapshot invariant',()=>{
 const s=session();s.slots._chat={turns:{t:{message:'What is VAT?',status:'failure',retryable:true}}};
 const a=snapshot(s),b=snapshot(JSON.parse(JSON.stringify(s)));assert.equal(a.dataValid,true);assert.equal(a.canGenerate,false);assert.equal(a.stage,'recovering');assert.deepEqual(a.pendingTurn,b.pendingTurn);assert.equal(a.readyToGenerate,b.readyToGenerate);
});
test('T28 rejected candidates return typed outcomes; conservative punctuation preserves source text',()=>{
 let result=applyCandidates('invoice',ready,{slots:{senderAddress:'40/20, Sagabo Mawatha'},evidence:{senderAddress:'no 40/20 sagabo mawatha'}},source('my business address is no 40/20 sagabo mawatha','model'));assert.equal(result.raw.senderAddress,'No. 40/20 Sagabo Mawatha');assert.equal(result.results[0].outcome,'committed');
 result=applyCandidates('invoice',ready,{slots:{senderAddress:'Invented'},evidence:{senderAddress:'hello'}},source('hello','model'));assert.equal(result.raw.senderAddress,undefined);assert.equal(result.results[0].code,'EVIDENCE_REJECTED');
});
test('T29 ambiguous weekday asks a precise question and tomorrow uses the stable turn date',()=>{
 const s=session();const r=say(s,'Change the due date to Friday');assert.match(r.response,/unambiguous|YYYY-MM-DD/);assert.equal(r.state.slots.dueDate,ready.dueDate);say(s,'2026-10-16');assert.equal(snapshot(s).slots.dueDate,'2026-10-16');
 const older=session({...ready,issueDate:'2026-09-01'});assert.equal(say(older,'Change due date to tomorrow').state.slots.dueDate,'2026-10-14');
});
test('T30 full item projection and component roles validated before commit',()=>{
 const hundred={...ready,lineItems:Array.from({length:100},(_,i)=>({id:'i'+i,description:'item',quantity:1,unitPrice:1}))};
 assert.throws(()=>applyCandidates('invoice',hundred,{itemOperations:[{operation:'add',item:{description:'new',quantity:1,unitPrice:1}}]},source('add new')),/limits/);assert.equal(hundred.lineItems.length,100);
 assert.throws(()=>applyCandidates('invoice',ready,{itemOperations:[{operation:'update',id:'app',item:{description:'Invented service'}}]},source('Change first item price to 100','model')),/evidence/);
 const swapped=applyCandidates('invoice',{}, {slots:{lineItems:[{description:'Design',quantity:25000,unitPrice:1}]},evidence:{lineItems:'Design quantity 1 price 25000'}},source('Design quantity 1 price 25000','model'));assert.equal(swapped.raw.lineItems,undefined);assert.equal(swapped.results[0].outcome,'rejected');
});
test('T43 shared runtime tool validator rejects unknown/type-specific/reserved/forged operations',()=>{
 assert.throws(()=>validateToolProposal('receipt',{slots:{dueDate:'2026-11-13'}}),error=>error.code==='TOOL_SCHEMA_INVALID');
 for(const proposal of [{slots:{unknown:'x'}},{slots:{_chat:{}}},{pendingAnswer:{quantity:1}},{itemOperations:[{operation:'add',fromPending:true,item:{description:'X'}}]}])assert.throws(()=>validateToolProposal('invoice',proposal),error=>error.code==='TOOL_SCHEMA_INVALID');
 assert.doesNotThrow(()=>validateToolProposal('invoice',{slots:{company_name:'Nexora'},evidence:{company_name:'Nexora'}}));
});
test('T34/T46 HTTP error details survive and incomplete snapshots are rejected',async()=>{
 const state=snapshot(session()),error=chatErrorFromHttp({code:'STORAGE_UNAVAILABLE',phase:'storage',retryable:true,state},503);assert.equal(error.phase,'storage');assert.equal(error.state.slots.businessName,'Nexora');assert.equal(chatErrorFromHttp({},401).retryable,false);
 assert.equal(validSnapshot({sessionId:'s'}),false);
 for(const event of [{type:'done',outcome:'success',turnId:'t',response:'ok',state:{sessionId:'s'}},{type:'done',outcome:'success',turnId:'t',response:42,state}]) {
  const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));c.close();}});await assert.rejects(readChatStream(body,{sessionId:'s',turnId:'t'}));
 }
});

test('T09/T24 action verbs inside values and negated generation never trigger generation',()=>{
 assert.notEqual(identifyIntent('My company is Generate Invoice LLC',snapshot(session())).kind,'generate');
 assert.notEqual(identifyIntent("Don't generate the invoice yet",snapshot(session())).kind,'generate');
 assert.equal(identifyIntent('Please generate the invoice',snapshot(session())).kind,'generate');
 assert.equal(identifyIntent('Generate a receipt',snapshot(session())).kind,'change_type');
});
test('T24 correction scope and sentence/conjunction boundaries preserve multiple values',()=>{
 const s=session();say(s,'Change company name to Nexora Technologies and update the client name to Updated Client');assert.equal(snapshot(s).slots.businessName,'Nexora Technologies');assert.equal(snapshot(s).slots.clientName,'Updated Client');
 const another=session();say(another,'Change company name to Nexora Technologies. Client name is Different Client');assert.equal(snapshot(another).slots.businessName,'Nexora Technologies');assert.equal(snapshot(another).slots.clientName,'Acme Corp');assert.equal(snapshot(another).fieldStates.clientName.status,'conflicting');
});

test('T03/T24 unparsed clauses reach semantic extraction while compound explicit removal persists',()=>{
 const s=session();s.slots.lineItems.push({id:'other',description:'Consulting',quantity:1,unitPrice:10});
 const compound=say(s,'My company is Nexora and remove the second item');assert.equal(compound.state.slots.businessName,'Nexora');assert.equal(compound.state.slots.lineItems.length,1);assert.equal(compound.proposal.needsProvider,false);
 const p=extractExplicit('My company is Nexora and explain what quantity means',snapshot(s));assert.equal(p.slots.businessName,'Nexora');assert.equal(p.needsProvider,true);assert.match(p.residual,/explain/);
});
test('T46 draft transitions require matching source, destination, and original turn',async()=>{
 const state=snapshot({...session(),id:'new'});
 const read=event=>readChatStream(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));c.close();}}),{sessionId:'s',turnId:'t'});
 const base={type:'done',outcome:'success',turnId:'t',sourceSessionId:'s',response:'Revision saved.',state,actions:[{kind:'open_session',id:'t',sourceSessionId:'s',sessionId:'new'}]};
 assert.equal((await read(base)).state.sessionId,'new');await assert.rejects(read({...base,actions:[]}));await assert.rejects(read({...base,sourceSessionId:'other'}));
});

test('T30/T43 item identities and advertised scalar schemas cannot be bypassed',()=>{
 assert.throws(()=>validateToolProposal('invoice',{slots:{senderAddress:null}}));
 assert.throws(()=>validateToolProposal('invoice',{itemOperations:[{operation:'update',id:'app',item:{id:'forged',unitPrice:1}}]}));
 assert.throws(()=>applyCandidates('invoice',ready,{itemOperations:[{operation:'update',id:'app',item:{id:'forged',unitPrice:1}}]},source('Change app price to 1')),/identity/);
});

test('T02/T09/T20 action words inside document values do not change conversation intent',()=>{
 for(const value of ['Summary Labs','Review Technologies','Change to Invoice LLC','Same Company as Before']) {
  const p=extractExplicit('My company is '+value,snapshot(session({})));
  assert.equal(p.intent.kind,'provide');assert.equal(p.slots.businessName,value);
 }
 const compound=extractExplicit('My company is Invoice Solutions and change this to a quotation',snapshot(session({})));assert.equal(compound.intent.targetType,'quotation');
 assert.equal(identifyIntent('My company is Nexora and explain what quantity means',snapshot(session())).kind,'question');
});

test('T17/T18 generic and stale collection replies cannot override a current question',()=>{
 const state=snapshot(session());
 for(const providerText of ['All required details are saved and valid. You can review your document or add optional details.','What currency should this document use?']) {
  assert.notEqual(planResponse(state,[],'What does unit price mean?',{providerText}),providerText);
 }
});

test('T07/T30 wrong item targets and implicit optional-field skips are rejected',()=>{
 const items={...ready,lineItems:[...ready.lineItems,{id:'other',description:'Design',quantity:1,unitPrice:10}]};
 assert.throws(()=>applyCandidates('invoice',items,{itemOperations:[{operation:'update',id:'other',item:{unitPrice:120000}}]},source('Change the first item price to 120000','model')),/target/);
 assert.throws(()=>applyCandidates('invoice',ready,{itemOperations:[{operation:'remove',id:'app'}]},source('Remove my business address','model')),/target/);
 assert.throws(()=>applyCandidates('invoice',ready,{skip:['senderAddress']},source('My address is 40/20 Road','model')),/intent/);
});

test('T18 valid committed provider acknowledgements also retain relevant explanation text',()=>{
 const state=snapshot(session({...ready,senderAddress:'40/20 Road'}));const text='Saved business address. This will appear in the sender details.';
 assert.equal(planResponse(state,['senderAddress'],'My business address is 40/20 Road',{providerText:text,results:[{field:'senderAddress',outcome:'committed'}]}),text);
 assert.notEqual(planResponse(state,[],'My business address is 40/20 Road',{providerText:text,results:[{field:'senderAddress',outcome:'rejected'}]}),text);
});
