import {test} from 'node:test';import assert from 'node:assert/strict';
import {snapshot,extractExplicit,applyCandidates,isCorrection,planResponse,documentSummary} from '../conversation-state.mjs';
import {contract,documentData,resolveDate,validField,toolSchema,workflow} from '../document-contract.mjs';
import {validateToolProposal} from '../tool-proposal.mjs';import {parseAmount} from '../amounts.mjs';
const items=[{id:'dev',description:'Website Development',quantity:1,unitPrice:75000},{id:'ux',description:'UI/UX Design',quantity:2,unitPrice:15000},{id:'domain',description:'Domain Registration',quantity:1,unitPrice:4500},{id:'hosting',description:'Web Hosting (1 Year)',quantity:1,unitPrice:12000}];
const ready={businessName:'Nexora',clientName:'John Perera',invoiceNumber:'INV-1',issueDate:'2026-10-13',dueDate:'2026-12-12',lineItems:items,currency:'LKR'};
const session=(slots=ready,type='invoice',templateId='invoice-minimal')=>({id:'s',status:'ACTIVE',documentTypeId:type,templateId,slots:structuredClone(slots)});
function say(s,message){const p=extractExplicit(message,snapshot(s));const result=applyCandidates(s.documentTypeId,s.slots,p,{id:crypto.randomUUID(),kind:'user',message,correction:isCorrection(message),now:Date.parse('2026-10-13T10:00:00Z')});s.slots=result.raw;const state=snapshot(s);return {state,result,proposal:p,response:planResponse(state,result.changed,message,{intent:p.intent,results:result.results,clarification:p.clarification})};}
for(const [text,value]of [['1lak',100000],['1 lakh',100000],['1 lac',100000],['1.5 lakh',150000],['75k',75000]])test('informal amount '+text,()=>assert.equal(parseAmount(text),value));
for(const type of Object.keys(contract.documents))test(type+' requires every declared mandatory field without forcing optional contacts',()=>{const data={...ready,subject:'Project',paymentMethod:'Cash'};for(const key of contract.documents[type].required){const missing={...data};delete missing[key];assert.ok(workflow(type,missing).missingRequired.includes(key));assert.equal(workflow(type,missing).readyToGenerate,false);}const state=workflow(type,data);assert.equal(state.readyToGenerate,true);assert.equal(state.nextAction.kind,'offer_optional');assert.ok(state.nextAction.fields.includes('clientPhone'));});
test('active Odoo template collects mandatory sender/client contacts before optional review',()=>{const s=session(ready,'invoice','tmpl_invoice_odoo_community');const state=snapshot(s);for(const key of ['senderPhone','senderEmail','senderAddress','clientAddress'])assert.ok(state.missingRequired.includes(key));assert.equal(state.readyToGenerate,false);assert.doesNotMatch(planResponse(state),/required.*complete/i);});
test('optional offer can be declined without deleting saved information and can be revisited',()=>{const s=session();assert.equal(snapshot(s).stage,'optional');const skipped=say(s,'Skip all optional details');assert.equal(skipped.state.nextAction.kind,'review');assert.equal(skipped.state.slots.businessName,'Nexora');assert.equal(skipped.state.fieldStates.clientPhone.status,'skipped');const added=say(s,'Add client phone 0712345678');assert.equal(added.state.slots.clientPhone,'0712345678');assert.equal(added.state.fieldStates.clientPhone.status,'confirmed');});
test('yes to optional offer selects a useful missing field rather than acknowledging it',()=>{const s=session();const result=say(s,'yes');assert.equal(result.state.nextAction.field,'senderAddress');assert.match(result.response,/business address/);});
test('required bank details override a previously skipped optional account field',()=>{const s=session();say(s,'skip all optional details');say(s,'payment method is Bank Transfer');assert.ok(snapshot(s).missingRequired.includes('accountDetails'));assert.equal(snapshot(s).canGenerate,false);});
test('compound business/client contact clauses preserve ownership and leading zeros',()=>{const s=session();say(s,'My business email is hello@nexora.com, phone is 0771234567, and client email is yohan@example.com');assert.equal(s.slots.senderPhone,'0771234567');assert.equal(s.slots.senderEmail,'hello@nexora.com');assert.equal(s.slots.clientEmail,'yohan@example.com');say(s,'Client phone is 0712345678 and email is yohan@example.com');assert.equal(s.slots.clientPhone,'0712345678');assert.equal(s.slots.senderEmail,'hello@nexora.com');});
test('quantity and lakh price update the existing item, retaining its ID and unrelated fields',()=>{const s=session();const result=say(s,'update web development qty as 2 and cost per one is 1lak');assert.equal(result.state.slots.lineItems.length,4);assert.deepEqual(result.state.slots.lineItems[0],{...items[0],quantity:2,unitPrice:100000,total:200000});assert.equal(result.state.slots.totalDue,246500);assert.equal(result.state.slots.clientName,'John Perera');});
test('structured model quantity/amount evidence accepts lakh normalization without accepting an invented price',()=>{const message='update web development qty as 2 and cost per one is 1lak';const raw=structuredClone(ready);const source={kind:'model',id:'t',message,correction:true};const result=applyCandidates('invoice',raw,{itemOperations:[{operation:'update',id:'dev',item:{quantity:2,unitPrice:100000}}]},source);assert.equal(snapshot(session(result.raw)).slots.lineItems[0].total,200000);assert.throws(()=>applyCandidates('invoice',raw,{itemOperations:[{operation:'update',id:'dev',item:{unitPrice:200000}}]},source));assert.equal(raw.lineItems[0].unitPrice,75000);});
test('ambiguous target persists the proposed edit through refresh and applies only a chosen item',()=>{const s=session({...ready,lineItems:[...items,{id:'mobile',description:'Mobile Development',quantity:1,unitPrice:1000}]});say(s,'Update development quantity to 2');const restored=session(JSON.parse(JSON.stringify(s.slots)));assert.equal(snapshot(restored).pendingIntent.kind,'operation');assert.equal(say(restored,'yes').state.slots.lineItems[0].quantity,1);const resolved=say(restored,'first');assert.equal(resolved.state.slots.lineItems[0].quantity,2);assert.equal(resolved.state.slots.lineItems[4].quantity,1);assert.equal(resolved.state.pendingIntent,null);});
test('rename and remove operations target stable identities without duplicating rows',()=>{const s=session();say(s,'Rename Website Development to Landing Page Development');assert.equal(s.slots.lineItems[0].id,'dev');assert.equal(s.slots.lineItems[0].description,'Landing Page Development');say(s,'Remove web hosting');assert.equal(s.slots.lineItems.length,3);assert.equal(s.slots.lineItems.some(item=>item.id==='hosting'),false);});
test('percentage, fixed and removed discounts share one financial contract',()=>{const s=session();say(s,'Apply 10% discount');assert.equal(snapshot(s).slots.discountAmount,12150);assert.equal(snapshot(s).slots.totalDue,109350);say(s,'Apply LKR 10000 fixed discount');assert.equal(s.slots.discountRate,undefined);assert.equal(snapshot(s).slots.discountAmount,10000);assert.equal(snapshot(s).slots.totalDue,111500);say(s,'Set tax rate to 5%');assert.equal(snapshot(s).slots.taxAmount,5575);assert.equal(snapshot(s).slots.totalDue,117075);say(s,'Remove discount');assert.equal(snapshot(s).slots.discountAmount,0);assert.equal(snapshot(s).slots.totalDue,127575);});
test('a fixed discount cannot exceed the subtotal or silently coexist with a percentage',()=>{assert.equal(workflow('invoice',{...ready,discountFixedAmount:200000}).readyToGenerate,false);assert.equal(workflow('invoice',{...ready,discountFixedAmount:1000,discountRate:10}).readyToGenerate,false);});
test('supported line-item percentage discount changes its amount before document discounts and tax',()=>{const s=session();say(s,'Update Website Development discount to 10%');assert.equal(snapshot(s).slots.lineItems[0].total,67500);assert.equal(snapshot(s).slots.subtotal,114000);say(s,'Apply 10% discount');assert.equal(snapshot(s).slots.discountAmount,11400);assert.equal(snapshot(s).slots.totalDue,102600);});
test('notes append, replace and remove without modifying structured dates',()=>{const s=session({...ready,notesAndTerms:'Existing note.'});say(s,'add last valide date as 2026 -12-12 in the note');assert.equal(s.slots.notesAndTerms,'Existing note.\nLast valid date: 2026-12-12.');assert.equal(s.slots.dueDate,ready.dueDate);say(s,'Replace notes with payment received');assert.equal(s.slots.notesAndTerms,'Payment received.');say(s,'Append note Thank you');assert.equal(s.slots.notesAndTerms,'Payment received.\nThank you.');say(s,'Remove notes');assert.equal(s.slots.notesAndTerms,undefined);});
test('invalid note dates preserve a pending correction and cannot be confirmed blindly',()=>{const s=session();say(s,'Add note: Last valid date is 2026-02-30');assert.equal(snapshot(s).pendingIntent.action,'note_date');assert.equal(say(s,'yes').state.slots.notesAndTerms,undefined);const saved=say(s,'2026-02-28');assert.equal(saved.state.slots.notesAndTerms,'Last valid date: 2026-02-28.');assert.equal(saved.state.slots.dueDate,ready.dueDate);});
test('a structured pending note confirmation survives restoration and yes executes the validated operation',()=>{let s=session();const source={id:'proposal',kind:'model',message:'Add note valid 30 days',correction:false};const p={fieldOperations:[{operation:'append',field:'notesAndTerms',value:'valid 30 days',evidence:'valid 30 days'}],confirmBeforeApply:true,confirmationQuestion:'Add Valid for 30 days to the notes?'};validateToolProposal('invoice',p);s.slots=applyCandidates('invoice',s.slots,p,source).raw;assert.equal(s.slots.notesAndTerms,undefined);s=session(JSON.parse(JSON.stringify(s.slots)));const yes=say(s,'yes');assert.equal(yes.state.slots.notesAndTerms,'Valid for 30 days.');assert.equal(yes.state.pendingIntent,null);assert.doesNotMatch(yes.response,/welcome/);assert.equal(yes.state.fieldStates.notesAndTerms.confirmationSource!==undefined,true);});
test('rejected confirmation leaves previous note unchanged and unverified guesses cannot be staged',()=>{const s=session({...ready,notesAndTerms:'Original.'});const proposal={fieldOperations:[{operation:'append',field:'notesAndTerms',value:'valid 30 days',evidence:'valid 30 days'}],confirmBeforeApply:true,confirmationQuestion:'Add this note?'};s.slots=applyCandidates('invoice',s.slots,proposal,{id:'t',kind:'model',message:'Add note valid 30 days'}).raw;assert.equal(say(s,'no').state.slots.notesAndTerms,'Original.');assert.throws(()=>applyCandidates('invoice',ready,{...proposal,fieldOperations:[{operation:'append',field:'notesAndTerms',value:'Invented account 9999',evidence:'9999'}]},{id:'t',kind:'model',message:'hello'}));});
test('payment terms are an editable canonical field distinct from notes',()=>{const s=session();say(s,'Add payment terms: Payment due within 14 days');assert.equal(s.slots.paymentTerms,'Payment due within 14 days.');assert.equal(s.slots.notesAndTerms,undefined);say(s,'Append payment terms Bank transfer only');assert.equal(s.slots.paymentTerms,'Payment due within 14 days.\nBank transfer only.');});
test('all supported fields expose edit policy, binding and consistent tool definitions',()=>{for(const [field,def]of Object.entries(contract.fields)){assert.equal(def.editable,true);assert.equal(def.defaultPolicy,'never_invent');assert.equal(def.templateBinding,field);}for(const type of Object.keys(contract.documents)){const schema=toolSchema(type);for(const field of [...contract.documents[type].required,...contract.documents[type].optional])assert.ok(schema.properties.slots.properties[field]);}assert.throws(()=>validateToolProposal('invoice',{fieldOperations:[{field:'senderEmail',operation:'append',value:'invented'}]}));assert.throws(()=>validateToolProposal('invoice',{fieldOperations:[{field:'discountRate',operation:'set',value:'10%'}]}));});
test('weekday dates use the configured next occurrence, timezone reference and chronology checks',()=>{assert.equal(resolveDate('next Friday',new Date('2026-10-13T00:00:00Z')),'2026-10-16');assert.equal(resolveDate('next Friday',new Date('2026-10-16T00:00:00Z')),'2026-10-23');assert.equal(validField('issueDate','2026-02-30'),false);assert.equal(workflow('quotation',{...ready,dueDate:'2026-10-12'}).readyToGenerate,false);});
test('valid fields persist independently when a separate item operation is invalid',()=>{const result=applyCandidates('invoice',ready,{slots:{clientPhone:'0712345678'},itemOperations:[{operation:'update',id:'dev',item:{quantity:-1}}]},{kind:'user',id:'t',message:'Update client phone and item quantity',correction:true});assert.equal(result.raw.clientPhone,'0712345678');assert.equal(result.raw.lineItems[0].quantity,1);assert.ok(result.results.some(result=>result.outcome==='rejected'));});

test('a document identifier cannot be used as evidence for a missing item quantity',()=>{
 const source={id:'t',kind:'model',message:'Invoice number INV-1, Website Development price 1 lakh',correction:false};
 assert.throws(()=>applyCandidates('invoice',{}, {itemOperations:[{operation:'add',item:{description:'Website Development',quantity:1,unitPrice:100000}}]},source));
});

test('an unspecified small discount persists a mode choice rather than guessing percentage or amount',()=>{const s=session();say(s,'Apply 10 discount');assert.equal(snapshot(s).pendingIntent.action,'discount_mode');assert.equal(s.slots.discountRate,undefined);assert.equal(say(s,'yes').state.slots.discountFixedAmount,undefined);say(s,'percentage');assert.equal(s.slots.discountRate,10);assert.equal(snapshot(s).slots.totalDue,109350);});
test('a foreign-currency discount needs explicit approval and never converts or relabels prices silently',()=>{const s=session();say(s,'Apply USD 1000 fixed discount');assert.equal(s.slots.currency,'LKR');assert.equal(s.slots.discountFixedAmount,undefined);assert.equal(snapshot(s).pendingIntent.kind,'operation');say(s,'no');assert.equal(s.slots.currency,'LKR');assert.equal(s.slots.discountFixedAmount,undefined);});

test('skipping optional details dismisses a rejected optional correction while retaining the verified old value',()=>{const s=session({...ready,clientPhone:'0712345678'});say(s,'Change client phone to 123');assert.equal(snapshot(s).readyToGenerate,false);say(s,'Skip all optional details');assert.equal(snapshot(s).readyToGenerate,true);assert.equal(s.slots.clientPhone,'0712345678');});
test('skipping optional details dismisses an invalid note-date addition without inventing the date',()=>{const s=session();say(s,'Add note Last valid date 2026-02-30');assert.equal(snapshot(s).pendingIntent.action,'note_date');say(s,'Skip all optional details');assert.equal(snapshot(s).pendingIntent,null);assert.equal(s.slots.notesAndTerms,undefined);assert.equal(snapshot(s).readyToGenerate,true);});
test('a complete reply resolves earlier pending item information without duplicating or asking it again',()=>{const s=session({...ready,lineItems:[]});say(s,'invoice for website development 50000 lkr');assert.equal(snapshot(s).nextAction.component,'quantity');say(s,'Website Development quantity 2 price 1 lakh');assert.equal(snapshot(s).slots.lineItems.length,1);assert.equal(snapshot(s).fieldStates.lineItems.status,'confirmed');assert.equal(snapshot(s).slots.totalDue,200000);});
test('correcting an invalid existing row quantity targets its original ID',()=>{const raw=applyCandidates('invoice',ready,{slots:{lineItems:[{...items[0],quantity:0}]}},{kind:'user',id:'bad',message:'Set quantity to zero',correction:true}).raw;const s=session(raw);say(s,'2');assert.equal(s.slots.lineItems.length,4);assert.equal(s.slots.lineItems[0].id,'dev');assert.equal(s.slots.lineItems[0].quantity,2);});
test('sentence formatting preserves intentional brand casing and embedded email meaning',()=>{const s=session();say(s,'Add note iPhone integration');assert.equal(s.slots.notesAndTerms,'iPhone integration.');say(s,'Replace note with api@example.com');assert.equal(s.slots.notesAndTerms,'api@example.com.');});
test('compact address and contact replies collect each entity field without capitalizing an embedded email',()=>{const s=session();say(s,'Add business address');say(s,'No 40/20, Panadura, hello@nexora.com, 0771234567');assert.equal(s.slots.senderAddress,'No. 40/20, Panadura');assert.equal(s.slots.senderEmail,'hello@nexora.com');assert.equal(s.slots.senderPhone,'0771234567');assert.equal(s.slots.clientEmail,undefined);});

for (const message of ['add a discount 10%', 'Add a discount of 10%.', 'apply a discount 10 percent', 'add a 10% discount']) test('general invoice discount applies without a scope confirmation: '+message,()=>{
 const s=session({...ready,discountFixedAmount:5000});
 const result=say(s,message);
 assert.equal(result.proposal.needsProvider,false);
 assert.equal(result.state.slots.discountRate,10);
 assert.equal(result.state.slots.discountFixedAmount,undefined);
 assert.equal(result.state.slots.discountAmount,12150);
 assert.equal(result.state.slots.totalDue,109350);
 assert.deepEqual(result.state.slots.lineItems.map(item=>item.total),[75000,30000,4500,12000]);
 assert.equal(result.state.pendingIntent,null);
 assert.match(result.response,/discount rate: 10%/i);
 assert.doesNotMatch(result.response,/rejected|specific line item|confirm whether/i);
});

test('screenshot declarative quantity and spaced price edit the named original rows without confirmation',()=>{
 const s=session();const qty=say(s,'web development qty is 2');
 assert.equal(qty.proposal.needsProvider,false);assert.equal(qty.state.pendingIntent,null);
 assert.equal(qty.state.slots.lineItems[0].quantity,2);assert.equal(qty.state.slots.lineItems[0].total,150000);
 const price=say(s,'ux ui design price is rs 20 000');assert.equal(price.proposal.needsProvider,false);
 assert.equal(price.state.slots.lineItems[1].id,'ux');assert.equal(price.state.slots.lineItems[1].quantity,2);
 assert.equal(price.state.slots.lineItems[1].unitPrice,20000);assert.equal(price.state.slots.lineItems[1].total,40000);
 assert.equal(price.state.slots.lineItems.length,4);assert.equal(price.state.slots.totalDue,206500);
 assert.match(qty.response,/Updated Website Development: quantity 2/);assert.match(price.response,/Updated UI\/UX Design/);
});
for(const text of ['Rs 20 000','20,000','20\u00a0000','20\u202f000'])test('strict grouped amount '+text,()=>assert.equal(parseAmount(text),20000));
test('invalid spaced grouping and unrelated questions cannot become item edits',()=>{
 assert.equal(parseAmount('20 00'),undefined);const s=session();
 assert.equal(extractExplicit('Why is web development qty 2?',snapshot(s)).itemOperations,undefined);
 assert.equal(extractExplicit('my phone is 077 123 4567',snapshot(s)).itemOperations,undefined);
});
test('comma grouped price and a second quantity clause update one row',()=>{
 const s=session();say(s,'ux ui design price is Rs 20,000, qty is 3');
 assert.equal(s.slots.lineItems[1].unitPrice,20000);assert.equal(s.slots.lineItems[1].quantity,3);
});
test('structured declarative edits require exact targeted roles and cannot authorize removal or extra changes',()=>{
 const source={id:'t',kind:'model',message:'ux ui design price is rs 20 000',correction:false};
 const result=applyCandidates('invoice',ready,{itemOperations:[{operation:'update',id:'ux',item:{unitPrice:20000}}]},source);
 assert.equal(result.raw.lineItems[1].unitPrice,20000);
 assert.throws(()=>applyCandidates('invoice',ready,{itemOperations:[{operation:'update',id:'dev',item:{unitPrice:20000}}]},source));
 assert.throws(()=>applyCandidates('invoice',ready,{itemOperations:[{operation:'update',id:'ux',item:{unitPrice:20000,quantity:3}}]},source));
 assert.throws(()=>applyCandidates('invoice',ready,{itemOperations:[{operation:'remove',id:'ux'}]},source));
});

test('word boundaries and punctuation resolve saved item names without renaming them',()=>{
 const s=session();say(s,'web site development qty is 2');
 assert.equal(s.slots.lineItems[0].quantity,2);assert.equal(s.slots.lineItems[0].description,'Website Development');assert.equal(snapshot(s).pendingIntent,null);
});
test('screenshot typo persists an exact proposed item and yes confirms it without changing other rows',()=>{
 const s=session();const requested=say(s,'web site developmnt qty is 2');
 assert.equal(s.slots.lineItems[0].quantity,1);assert.equal(requested.state.pendingIntent.allowYes,true);assert.match(requested.response,/Did you mean Website Development/);
 const restored=session(JSON.parse(JSON.stringify(s.slots)));const accepted=say(restored,'yes');assert.equal(accepted.state.slots.lineItems[0].quantity,2);assert.equal(accepted.state.slots.lineItems.length,4);assert.equal(accepted.state.pendingIntent,null);assert.doesNotMatch(accepted.response,/welcome/);
});
test('rejecting a suggested existing item preserves values and clears its proposal',()=>{const s=session();say(s,'web site developmnt qty is 2');say(s,'no');assert.equal(s.slots.lineItems[0].quantity,1);assert.equal(snapshot(s).pendingIntent,null);});
test('typo matches never choose between several possible saved items',()=>{
 const s=session({...ready,lineItems:[{id:'a',description:'Website Development',quantity:1,unitPrice:100},{id:'b',description:'Web Site Development',quantity:1,unitPrice:200}]});
 say(s,'web site developmnt qty is 2');assert.equal(snapshot(s).pendingIntent.allowYes,false);say(s,'yes');assert.equal(s.slots.lineItems[0].quantity,1);assert.equal(s.slots.lineItems[1].quantity,1);say(s,'second');assert.equal(s.slots.lineItems[0].quantity,1);assert.equal(s.slots.lineItems[1].quantity,2);
});
test('legacy rows without IDs show their correct confirmation label and retain positional identity',()=>{
 const s=session({...ready,lineItems:items.map(({id,...item})=>item)});const requested=say(s,'web site developmnt qty is 2');assert.match(requested.response,/Did you mean Website Development/);say(s,'yes');assert.equal(s.slots.lineItems[0].id,'item-0');assert.equal(s.slots.lineItems[0].quantity,2);assert.equal(s.slots.lineItems.length,4);
});
test('item-shaped replies cannot be saved as a missing business name',()=>{const state=snapshot(session({currency:'LKR',lineItems:items}));const p=extractExplicit('unrecognized service qty is 2',state);assert.equal(p.slots.businessName,undefined);assert.equal(p.needsProvider,true);});

for(const link of ['should be','must be','needs to be','has to be','ought to be'])test('shared item-value grammar accepts '+link+' in extraction and structured validation',()=>{
 const s=session({...ready,discountRate:10});const message=`web development qty ${link} 2`;
 const p=extractExplicit(message,snapshot(s));assert.equal(p.needsProvider,false);assert.equal(p.itemOperations[0].id,'dev');
 const raw=applyCandidates('invoice',s.slots,p,{id:'t',kind:'model',message,correction:false}).raw;
 assert.equal(raw.lineItems[0].quantity,2);assert.equal(raw.lineItems.length,4);assert.equal(snapshot(session(raw)).slots.totalDue,176850);
});
test('percentage input cannot be relabeled as a quantity',()=>{const message='Update Website Development qty should be 2%';assert.throws(()=>applyCandidates('invoice',ready,{itemOperations:[{operation:'update',id:'dev',item:{quantity:2}}]},{id:'t',kind:'model',message,correction:true}));});
test('saving the due date asks for genuinely missing invoice rows and accepts all table facts',()=>{
 const s=session({...ready,dueDate:undefined,lineItems:undefined,currency:undefined});const date=say(s,'2026-12-12');assert.equal(date.state.slots.dueDate,'2026-12-12');assert.equal(date.state.nextAction.field,'lineItems');assert.match(date.response,/items or services/);
 say(s,'Item / Service\tQuantity\tUnit Price (LKR)\tTotal (LKR)\nWebsite Development\t1\t75,000.00\t75,000.00');assert.equal(snapshot(s).slots.lineItems[0].description,'Website Development');assert.equal(snapshot(s).slots.totalDue,75000);assert.equal(snapshot(s).missingRequired.includes('dueDate'),false);
});

test('polite and current-value wording uses the same typed update without guessing numbers',()=>{const s=session();say(s,'web development qty should now be 2 please');assert.equal(s.slots.lineItems[0].quantity,2);say(s,'ux ui design price needs to be Rs 20 000 now');assert.equal(s.slots.lineItems[1].unitPrice,20000);});
test('a semantically proposed edit without an imperative is dry-validated and awaits real user confirmation',()=>{
 const s=session();const message='Website Development quantity 2 for this invoice';
 const proposal={itemOperations:[{operation:'update',id:'dev',item:{quantity:2}}],confirmBeforeApply:true,confirmationQuestion:'Set Website Development quantity to 2?'};
 const pending=applyCandidates('invoice',s.slots,proposal,{id:'model-turn',kind:'model',message,correction:false});s.slots=pending.raw;assert.equal(s.slots.lineItems[0].quantity,1);assert.equal(snapshot(s).pendingIntent.kind,'operation');
 say(s,'yes');assert.equal(s.slots.lineItems[0].quantity,2);
 assert.throws(()=>applyCandidates('invoice',ready,{...proposal,itemOperations:[{operation:'update',id:'dev',item:{quantity:7}}]},{id:'bad',kind:'model',message,correction:false}));
});

test('semantic extraction accepts explicit word-number item evidence while retaining quantity/price roles',()=>{
 const message='I sold three laptops for 500 each.';
 const applied=applyCandidates('invoice',{}, {slots:{lineItems:[{description:'laptops',quantity:3,unitPrice:500}]},evidence:{lineItems:message}},{kind:'model',id:'word-number',message,correction:false});
 assert.equal(applied.raw.lineItems[0].quantity,3);assert.equal(applied.raw.lineItems[0].unitPrice,500);
 const forged=applyCandidates('invoice',{}, {slots:{lineItems:[{description:'laptops',quantity:500,unitPrice:3}]},evidence:{lineItems:message}},{kind:'model',id:'forged',message,correction:false});
 assert.equal(forged.raw.lineItems,undefined);
});
