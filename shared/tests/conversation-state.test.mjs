import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workflow,normalizeSlots,validField,documentData,toolSchema,contract} from '../document-contract.mjs';
import {snapshot,applyCandidates,extractExplicit,isCorrection,planResponse} from '../conversation-state.mjs';
import {semanticCanvasPatch} from '../canvas-fields.mjs';
const session=(slots={},type='invoice')=>({id:'s',userId:'u',status:'ACTIVE',documentTypeId:type,slots});
const source=(message='',correction=false)=>({kind:'user',id:'t',message,correction});
function say(s,message){const proposal=extractExplicit(message,snapshot(s));s.slots=applyCandidates(s.documentTypeId,s.slots,proposal,source(message,isCorrection(message))).raw;return snapshot(s);}
const complete={businessName:'Nexora',clientName:'Acme Corp',invoiceNumber:'INV-1',issueDate:'2026-10-12',dueDate:'2026-11-12',currency:'LKR',lineItems:[{id:'design',description:'Design',quantity:2,unitPrice:100}],taxRate:0};
test('required conversation retains confirmed values and applies explicit correction',()=>{const s=session();say(s,'Nexora');say(s,'Client name is Acme Corp.');const state=say(s,'Actually, change the company name to Nexora Technologies.');assert.equal(state.slots.businessName,'Nexora Technologies');assert.equal(state.slots.clientName,'Acme Corp');assert.equal(state.nextAction.field,'invoiceNumber');assert.doesNotMatch(planResponse(state),/business.*name/i);});
test('natural business description saves multiple facts, no fabricated items',()=>{const s=session();const state=say(s,'My business is SENYX Software, and we specialize in software development, AI services, and production.');assert.equal(state.slots.businessName,'SENYX Software');assert.equal(state.slots.businessServices,'Software Development, AI Services, And Production');assert.equal(state.slots.lineItems,undefined);});
for(const name of ['Broadway Software','Roadrunner Labs','Hello World Studio','SENYX Software','Nexora LLC'])test('preserves unusual business spelling '+name,()=>{const s=session();assert.equal(say(s,name).slots.businessName,name);});
test('extracts multiple labeled fields before choosing a question',()=>{const s=session();const state=say(s,'Business name is Nexora, client name is Acme, business email is info@nexora.test');assert.equal(state.slots.businessName,'Nexora');assert.equal(state.slots.clientName,'Acme');assert.equal(state.slots.senderEmail,'info@nexora.test');assert.equal(state.nextAction.field,'invoiceNumber');});
for(const message of ['hello','Please make an invoice','Use this email for contact','Why are you asking?'])test('unrelated text does not become name '+message,()=>{assert.equal(say(session(),message).slots.businessName,undefined);});
test('alias normalization is shared and currency/symbol preserve code',()=>{assert.deepEqual(normalizeSlots({companyName:'Nexora',senderName:'Nexora',currency:'USD',currencySymbol:'$'}),{businessName:'Nexora',currency:'USD'});assert.equal(normalizeSlots({vendorName:'Acme'}).clientName,'Acme');assert.throws(()=>normalizeSlots({companyName:'A',business_name:'B'}));});
test('zero tax is valid; null and empty items are missing',()=>{assert.equal(validField('taxRate',0),true);assert.equal(validField('taxRate',null),false);assert.equal(validField('lineItems',[]),false);assert.equal(workflow('invoice',complete).readyToGenerate,true);assert.equal(workflow('invoice',{...complete,lineItems:[]}).readyToGenerate,false);});
test('missing prices/quantities never get invented',()=>{const normalized=normalizeSlots({lineItems:[{description:'Design'}]});assert.equal(normalized.lineItems[0].quantity,undefined);assert.equal(normalized.lineItems[0].unitPrice,undefined);assert.equal(validField('lineItems',normalized.lineItems),false);assert.equal(documentData(normalized).totalDue,undefined);});
test('numeric validation rejects nonfinite, booleans and negative prices',()=>{for(const value of [NaN,Infinity,true,-1])assert.equal(validField('lineItems',[{description:'x',quantity:1,unitPrice:value}]),false);});
test('relative dates are independent of key order and use issue date',()=>{const x=normalizeSlots({dueDate:'in 14 days',issueDate:'2026-10-12'});const y=normalizeSlots({issueDate:'2026-10-12',dueDate:'in 14 days'});assert.equal(x.dueDate,'2026-10-26');assert.deepEqual(x,y);assert.equal(validField('issueDate','2026-02-30'),false);});
test('uncertain/model values cannot erase confirmed data',()=>{let s=session({businessName:'Nexora'});s.slots=applyCandidates('invoice',s.slots,{slots:{businessName:null}},source()).raw;assert.equal(snapshot(s).slots.businessName,'Nexora');s.slots=applyCandidates('invoice',s.slots,{slots:{businessName:'Invented'},evidence:{businessName:'Invented'}},{kind:'model',id:'t',message:'hello',correction:true}).raw;assert.equal(snapshot(s).slots.businessName,'Nexora');});
test('conflict retains confirmed value and resolves explicitly',()=>{let s=session({businessName:'Nexora'});s.slots=applyCandidates('invoice',s.slots,{slots:{businessName:'Other'}},source()).raw;assert.equal(snapshot(s).slots.businessName,'Nexora');assert.equal(snapshot(s).nextAction.kind,'clarify');s.slots=applyCandidates('invoice',s.slots,{resolve:{field:'businessName',accept:true}},source('yes',true)).raw;assert.equal(snapshot(s).slots.businessName,'Other');});
test('optional skips are tracked; required/conditional fields cannot be skipped',()=>{const s=session(complete);s.slots=applyCandidates('invoice',s.slots,{skip:['senderEmail']},source()).raw;assert.equal(snapshot(s).fieldStates.senderEmail.status,'skipped');assert.ok(!snapshot(s).pendingOptional.includes('senderEmail'));assert.throws(()=>applyCandidates('invoice',s.slots,{skip:['businessName']},source()));});
for(const type of Object.keys(contract.documents))test('type-specific readiness and tool schema '+type,()=>{const slots={...complete,subject:'Software project',paymentMethod:'Cash'};assert.equal(workflow(type,slots).readyToGenerate,true);assert.ok(toolSchema(type).properties.slots.properties.lineItems);if(type==='receipt'){assert.ok(!workflow(type,{}).missingRequired.includes('dueDate'));assert.ok(workflow(type,{}).missingRequired.includes('paymentMethod'));}});
test('bank-transfer receipt requires a reference',()=>{const state=workflow('receipt',{...complete,paymentMethod:'Bank Transfer'});assert.ok(state.missingRequired.includes('referenceNumber'));});
test('line-item operations update and remove rather than append a correction',()=>{const s=session(complete);s.slots=applyCandidates('invoice',s.slots,{itemOperations:[{operation:'update',id:'design',item:{unitPrice:200}}]},source('change price',true)).raw;assert.equal(snapshot(s).slots.lineItems.length,1);assert.equal(snapshot(s).slots.totalDue,400);s.slots=applyCandidates('invoice',s.slots,{itemOperations:[{operation:'remove',id:'design'}]},source('remove',true)).raw;assert.equal(snapshot(s).readyToGenerate,false);});
test('canvas semantic name and item edits map to validated fields; visual labels stay visual',()=>{assert.deepEqual(semanticCanvasPatch('header_name','Nexora Technologies',complete),{businessName:'Nexora Technologies'});assert.equal(semanticCanvasPatch('custom_text','x',complete),null);const patch=semanticCanvasPatch('item_0_rate','Rs. 250',complete);assert.equal(patch.lineItems[0].unitPrice,250);});
test('restart snapshot reconstructs readiness, conflict and lifecycle without stale frontend state',()=>{const raw=applyCandidates('invoice',{businessName:'Nexora'},{slots:{businessName:'Other'}},source()).raw;const state=snapshot(session(JSON.parse(JSON.stringify(raw))));assert.equal(state.readyToGenerate,false);assert.equal(state.stage,'clarifying');assert.equal(snapshot({...session(complete),expiresAt:new Date(0)}).readOnly,true);assert.equal(snapshot({...session(complete),status:'COMPLETED'}).stage,'read_only');});

test('legacy alias collisions remain recoverable instead of losing the current conversation',()=>{const s=session({businessName:'Nexora',companyName:'Other'});const state=snapshot(s);assert.equal(state.slots.businessName,'Nexora');assert.equal(state.nextAction.kind,'clarify');s.slots=applyCandidates('invoice',s.slots,{resolve:{field:'businessName',accept:false}},source('no',true)).raw;assert.equal(snapshot(s).slots.businessName,'Nexora');assert.equal(snapshot(s).nextAction.field,'clientName');});
test('known-name and total questions use committed facts rather than re-collecting',()=>{const state=snapshot(session(complete));assert.match(planResponse(state,[], 'What is our business name?'),/Nexora/);assert.match(planResponse(state,[], 'Calculate the total'),/Total: LKR 200.00/);});

test('model scalar numeric values need literal evidence and cannot invent a tax rate',()=>{const s=session(complete);const proposal={slots:{taxRate:25},evidence:{taxRate:'Please calculate the total'}};const result=applyCandidates('invoice',s.slots,proposal,{kind:'model',id:'t',message:'Please calculate the total',correction:true});assert.equal(snapshot(session(result.raw)).slots.taxRate,0);});
test('model item operations cannot invent zero price from a larger number containing zero',()=>{assert.throws(()=>applyCandidates('invoice',{}, {itemOperations:[{operation:'add',item:{description:'Design',quantity:2,unitPrice:0}}]}, {kind:'model',id:'t',message:'Design quantity 2 price 200',correction:false}));});

test('model cannot invent a date or currency from unrelated evidence',()=>{for(const [key,value]of [['dueDate','2030-01-01'],['currency','USD']]){const result=applyCandidates('invoice',{}, {slots:{[key]:value},evidence:{[key]:'please help'}},{kind:'model',id:'t',message:'please help',correction:false});assert.equal(snapshot(session(result.raw)).slots[key],undefined);}});
test('model-proposed names retain literal user casing',()=>{const result=applyCandidates('invoice',{}, {slots:{businessName:'Senyx Software'},evidence:{businessName:'SENYX Software'}},{kind:'model',id:'t',message:'We are SENYX Software',correction:false});assert.equal(snapshot(session(result.raw)).slots.businessName,'SENYX Software');});
test('ambiguous correction retains the old value and asks targeted clarification',()=>{const s=session(complete);s.slots=applyCandidates('invoice',s.slots,{slots:{dueDate:'sometime next month'}},source('change due date',true)).raw;assert.equal(snapshot(s).slots.dueDate,'2026-11-12');assert.equal(snapshot(s).nextAction.field,'dueDate');assert.equal(snapshot(s).nextAction.kind,'clarify');assert.equal(say(s,'2026-12-12').slots.dueDate,'2026-12-12');});

test('legacy optional skips and empty values agree with generation readiness',()=>{const state=snapshot(session({...complete,senderEmail:'skip',clientPhone:null,notesAndTerms:''}));assert.equal(state.readyToGenerate,true);assert.equal(state.fieldStates.senderEmail.status,'skipped');assert.equal(state.slots.senderEmail,undefined);assert.equal(state.slots.clientPhone,undefined);});
test('invalid nonempty optional values require clarification before generation',()=>{const state=snapshot(session({...complete,senderEmail:'not-an-email'}));assert.equal(state.readyToGenerate,false);assert.equal(state.nextAction.field,'senderEmail');assert.equal(workflow('invoice',{...complete,senderEmail:'not-an-email'}).readyToGenerate,false);});

test('today uses authorized timezone and stable original turn reference',()=>{const time=Date.parse('2026-10-12T20:00:00Z');const s=session({_chat:{timezone:'Asia/Colombo',turns:{t:{startedAt:time}}}});const state=snapshot(s);assert.equal(state.referenceDate,'2026-10-13');const result=applyCandidates('invoice',s.slots,{slots:{issueDate:'today'}},{...source(),now:time});assert.equal(snapshot(session(result.raw)).slots.issueDate,'2026-10-13');});
test('unambiguous natural-language date formats normalize without re-asking',()=>{assert.equal(normalizeSlots({issueDate:'21 August 2026'}).issueDate,'2026-08-21');assert.equal(normalizeSlots({issueDate:'August 21, 2026'}).issueDate,'2026-08-21');});

test('authorized historical evidence recovers a missing fact but cannot overwrite a confirmed correction',()=>{const history={old:{content:'We are SENYX Software',createdAt:'2026-10-12T10:00:00Z'}};const proposal={slots:{businessName:'Senyx Software'},evidence:{businessName:'SENYX Software'},evidenceSource:{businessName:'old'}};const src={kind:'model',id:'t',message:'Remember the company we discussed',history,correction:true};const recovered=applyCandidates('invoice',{},proposal,src);assert.equal(snapshot(session(recovered.raw)).slots.businessName,'SENYX Software');const protectedState=applyCandidates('invoice',{businessName:'Nexora Technologies'},proposal,src);assert.equal(snapshot(session(protectedState.raw)).slots.businessName,'Nexora Technologies');const forged=applyCandidates('invoice',{},proposal,{...src,history:{}});assert.equal(snapshot(session(forged.raw)).slots.businessName,undefined);});

test('decimal rounding matches server money calculations at half-cent boundaries',()=>{const totals=documentData({...complete,lineItems:[{description:'Design',quantity:3,unitPrice:2.675}],taxRate:7.5});assert.equal(totals.subtotal,8.03);assert.equal(totals.taxAmount,0.60);assert.equal(totals.totalDue,8.63);});
test('model evidence aliases normalize along with slot aliases',()=>{const result=applyCandidates('invoice',{}, {slots:{company_name:'Nexora'},evidence:{company_name:'Nexora'}},{kind:'model',id:'t',message:'We are Nexora',correction:false});assert.equal(snapshot(session(result.raw)).slots.businessName,'Nexora');});

test('partial line item remembers description and price while asking only for missing quantity',()=>{const s=session(complete);s.slots=applyCandidates('invoice',s.slots,{itemOperations:[{operation:'add',item:{description:'Consulting',unitPrice:500}}]},{kind:'model',id:'original',message:'Add Consulting at 500',correction:false}).raw;const pending=snapshot(s);assert.equal(pending.slots.lineItems.length,1);assert.equal(pending.nextAction.component,'quantity');assert.equal(pending.readyToGenerate,false);const restored=session(JSON.parse(JSON.stringify(s.slots)));const completed=say(restored,'2');assert.equal(completed.slots.lineItems.length,2);assert.equal(completed.slots.lineItems[1].description,'Consulting');assert.equal(completed.slots.lineItems[1].quantity,2);assert.equal(completed.slots.lineItems[1].unitPrice,500);assert.equal(completed.readyToGenerate,true);});
test('partial item can be explicitly cancelled without losing existing confirmed items',()=>{const s=session(complete);s.slots=applyCandidates('invoice',s.slots,{itemOperations:[{operation:'add',item:{description:'Consulting'}}]},source('Add Consulting')).raw;const next=say(s,'cancel addition');assert.equal(next.slots.lineItems.length,1);assert.equal(next.readyToGenerate,true);});

for (const reply of ['50days', '50 days', 'within 50days', 'with in 50days', 'Within 50 days.', 'in 50days', 'net 50days']) {
    test('due date reply is saved locally without provider fallback: ' + reply, () => {
        const s = session({...complete, dueDate: undefined});
        assert.equal(snapshot(s).nextAction.field, 'dueDate');
        const proposal = extractExplicit(reply, snapshot(s));
        assert.equal(proposal.slots.dueDate, reply);
        const state = say(s, reply);
        assert.equal(state.slots.dueDate, '2026-12-01');
        assert.equal(state.fieldStates.dueDate.status, 'confirmed');
        assert.equal(state.slots.businessName, 'Nexora');
        assert.notEqual(state.nextAction.field, 'dueDate');
    });
}
test('compact relative due date resolves a previously uncertain field', () => {
    const s = session({...complete, dueDate: undefined, _chat: {fields: {dueDate: {status: 'uncertain'}}}});
    assert.equal(snapshot(s).nextAction.kind, 'clarify');
    assert.equal(say(s, 'with in 50days').slots.dueDate, '2026-12-01');
});
test('out-of-range relative dates remain invalid without throwing', () => {
    const value = '999999999999999999999days';
    assert.equal(normalizeSlots({dueDate: value}, complete).dueDate, value);
    assert.equal(validField('dueDate', value), false);
});

test('optional business address request persists its pending intent and consumes a multi-part reply', () => {
    const s = session(complete);
    const requested = say(s, 'add my business address');
    assert.equal(requested.nextAction.field, 'senderAddress');
    assert.match(requested.nextAction.question, /address/i);
    assert.equal(requested.readyToGenerate, false);
    const restored = session(JSON.parse(JSON.stringify(s.slots)));
    const reply = 'address no 40/20, sagabo mawatha, diggala keselwattapandura';
    assert.equal(extractExplicit(reply, snapshot(restored)).slots.senderAddress, 'no 40/20, sagabo mawatha, diggala keselwattapandura');
    const saved = say(restored, reply);
    assert.equal(saved.slots.senderAddress, 'No. 40/20, Sagabo Mawatha, Diggala Keselwattapandura');
    assert.equal(saved.slots.businessName, 'Nexora');
    assert.equal(saved.readyToGenerate, true);
    assert.equal(saved.nextAction.kind, 'offer_optional');
});
test('explicit optional field edit updates its value without restarting required collection', () => {
    const s = session({...complete, senderAddress:'Old address'});
    say(s, 'change my business address');
    const saved = say(s, '40/20, Sagabo Mawatha, Diggala');
    assert.equal(saved.slots.senderAddress, '40/20, Sagabo Mawatha, Diggala');
    assert.equal(saved.fieldStates.senderAddress.status, 'confirmed');
    assert.equal(saved.readyToGenerate, true);
});
