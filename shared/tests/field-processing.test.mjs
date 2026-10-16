import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, extractExplicit, applyCandidates, planResponse } from '../conversation-state.mjs';
import { documentData, workflow, templateSchema, validField } from '../document-contract.mjs';
import { formatMoney, formatDate } from '../field-processing.mjs';
const base={businessName:'Nexora',clientName:'John Perera',invoiceNumber:'inv-001',issueDate:'2026-10-13',dueDate:'2026-11-13',currency:'LKR',lineItems:[{id:'website',description:'Website Development',quantity:1,unitPrice:50000}]};
function session(slots={},templateId='invoice-minimal'){return {id:'s',userId:'u',documentTypeId:'invoice',templateId,status:'ACTIVE',slots:{...slots,_chat:{...slots._chat,templateId}}};}
function say(s,message){const proposal=extractExplicit(message,snapshot(s)),result=applyCandidates('invoice',s.slots,proposal,{kind:'user',id:'message-'+Math.random(),message,now:Date.parse('2026-10-13T12:00:00Z'),correction:/change|correct|update|remove/i.test(message)});s.slots=result.raw;const state=snapshot(s);return {state,response:planResponse(state,result.changed,message,{results:result.results}),proposal};}
test('lowercase names get field-specific formatting and durable provenance',()=>{
 const s=session();const r=say(s,'nexora software solutions');assert.equal(r.state.slots.businessName,'Nexora Software Solutions');assert.equal(r.state.fieldStates.businessName.rawInput,'nexora software solutions');assert.equal(r.state.fieldStates.businessName.normalizedValue,'Nexora Software Solutions');assert.equal(r.state.fieldStates.businessName.validationStatus,'valid');assert.equal(r.state.fieldStates.businessName.confirmationStatus,'confirmed');assert.ok(r.state.fieldStates.businessName.sourceMessage);assert.equal(r.state.fieldStates.businessName.updatedAt,'2026-10-13T12:00:00.000Z');assert.equal(r.state.nextAction.field,'clientName');
});
test('mixed-case brands, acronyms, email local parts and identifiers retain meaning',()=>{
 const s=session();say(s,'my company is iPhone eBay OpenAI SENYX AI API');say(s,'client is john perera');say(s,'business email is Hello@NEXORA.COM');say(s,'invoice number is inv-001');assert.equal(snapshot(s).slots.businessName,'iPhone eBay OpenAI SENYX AI API');assert.equal(snapshot(s).slots.clientName,'John Perera');assert.equal(snapshot(s).slots.senderEmail,'Hello@nexora.com');assert.equal(snapshot(s).slots.invoiceNumber,'inv-001');
});
test('contextual adjacent-letter spelling error is a proposal until confirmed',()=>{
 const s=session(base);const pending=say(s,'Change company name to Nexroa');assert.equal(pending.state.slots.businessName,'Nexora');assert.equal(pending.state.fieldStates.businessName.status,'awaiting_confirmation');assert.match(pending.response,/Nexroa.*Nexora/);assert.equal(pending.state.readyToGenerate,false);
 const restored=JSON.parse(JSON.stringify(s));const chosen=say(restored,'Nexroa');assert.equal(chosen.state.slots.businessName,'Nexroa');assert.equal(chosen.state.fieldStates.businessName.confirmationStatus,'confirmed');
});
test('unfamiliar valid brands are accepted without dictionary renaming',()=>{const s=session();say(s,'Zyqvexa');assert.equal(snapshot(s).slots.businessName,'Zyqvexa');assert.equal(snapshot(s).fieldStates.businessName.status,'confirmed');});
test('compound user example extracts every fact and asks only for missing quantity',()=>{
 const s=session();const result=say(s,'my company name is nexora and client is john perera. invoice for website development 50000 lkr');assert.equal(result.state.slots.businessName,'Nexora');assert.equal(result.state.slots.clientName,'John Perera');assert.equal(result.state.slots.currency,'LKR');assert.equal(result.state.nextAction.component,'quantity');assert.equal(result.state.slots.lineItems,undefined);assert.equal(result.proposal.needsProvider,false);
 const complete=say(s,'2');assert.equal(complete.state.slots.lineItems[0].description,'Website Development');assert.equal(complete.state.slots.totalDue,100000);assert.equal(complete.state.nextAction.field,'invoiceNumber');
});
test('compact recipient answer collects name, email and city without mixing parties',()=>{const s=session({businessName:'Nexora'});const r=say(s,'John Perera, john@gmail.com, Colombo');assert.equal(r.state.slots.clientName,'John Perera');assert.equal(r.state.slots.clientEmail,'john@gmail.com');assert.equal(r.state.slots.clientAddress,'Colombo');assert.equal(r.state.slots.senderEmail,undefined);assert.equal(r.state.slots.senderAddress,undefined);});
test('template requirements and conditional bank/tax fields cannot be bypassed',()=>{
 const s=session(base,'tmpl_invoice_odoo_community');assert.deepEqual(snapshot(s).missingRequired,['senderAddress','clientAddress','senderEmail','senderPhone']);assert.throws(()=>say(s,'skip business email'));
 s.templateId='invoice-minimal';s.slots._chat.templateId='invoice-minimal';assert.equal(snapshot(s).readyToGenerate,true);say(s,'payment method is bank transfer');assert.ok(snapshot(s).missingRequired.includes('accountDetails'));say(s,'tax status is taxable');assert.ok(snapshot(s).missingRequired.includes('taxRate'));
 const declared=templateSchema('invoice','invoice-minimal',{type:'object',properties:{notes:{type:'string'}},required:['notes']});assert.ok(workflow('invoice',base,{},declared).missingRequired.includes('notesAndTerms'));
 const conditional=workflow('invoice',{...base,taxStatus:'taxable'}, {},templateSchema('invoice','tmpl_invoice_odoo_community'));assert.equal(conditional.schema.required_fields,conditional.schema.required_keys.length);
});
test('invalid dates, contacts, money and chronological contradictions remain unresolved',()=>{
 for(const [field,value] of [['senderEmail','bad@'],['senderPhone','12345'],['issueDate','2026-02-30'],['discountRate',-1],['taxRate',101]])assert.equal(validField(field,value),false);
 const s=session(base);const r=say(s,'Change invoice date to 2026-02-30');assert.equal(r.state.fieldStates.issueDate.validationStatus,'invalid');assert.equal(r.state.readyToGenerate,false);assert.equal(r.state.slots.issueDate,base.issueDate);say(s,'2026-10-13');assert.equal(snapshot(s).fieldStates.issueDate.status,'confirmed');
 say(s,'Change due date to 2026-10-01');assert.equal(snapshot(s).fieldStates.dueDate.validationStatus,'invalid');assert.match(snapshot(s).nextAction.question,/before the issue date/);
});
test('locale/date settings are explicit and ambiguous numeric dates are never guessed',()=>{
 const s=session(base);say(s,'Change issue date to 04/05/2026');assert.equal(snapshot(s).fieldStates.issueDate.status,'invalid');say(s,'date format is DD/MM/YYYY');say(s,'04/05/2026');assert.equal(snapshot(s).slots.issueDate,'2026-05-04');assert.equal(formatDate('2026-05-04','DD/MM/YYYY'),'04/05/2026');assert.equal(formatMoney(1500,'LKR','en-US'),'1,500.00');assert.equal(formatMoney(1500,'EUR','de-DE'),'1.500,00');assert.equal(formatMoney(1500,'JPY'),'1,500');
 const combined=session();say(combined,'date format is DD/MM/YYYY and invoice date is 04/05/2026 and due date is in 30 days');assert.equal(snapshot(combined).slots.dueDate,'2026-06-03');
});
test('decimal-safe totals, discounts and currency precision match accounting rules',()=>{
 const values=documentData({...base,lineItems:[{description:'Design',quantity:3,unitPrice:2.675}],discountRate:10,taxRate:7.5});assert.equal(values.subtotal,8.03);assert.equal(values.discountAmount,0.80);assert.equal(values.taxableAmount,7.23);assert.equal(values.taxAmount,0.54);assert.equal(values.totalDue,7.77);
 const yen=documentData({...base,currency:'JPY',lineItems:[{description:'Design',quantity:1,unitPrice:1500.5}]});assert.equal(yen.totalDue,1501);
});
test('out-of-order values survive refresh and previously accepted fields are not asked again',()=>{
 const s=session();say(s,'client is john perera and currency is lkr');say(s,'invoice number is inv-22');say(s,'nexora');const restored=JSON.parse(JSON.stringify(s));assert.equal(snapshot(restored).slots.clientName,'John Perera');assert.equal(snapshot(restored).slots.invoiceNumber,'inv-22');assert.equal(snapshot(restored).nextAction.field,'issueDate');const r=say(restored,'Change company name to OpenAI');assert.equal(r.state.slots.businessName,'OpenAI');assert.notEqual(r.state.nextAction.field,'businessName');
});
test('model spelling suggestions are durable but unsupported guesses never enter the template',()=>{
 const s=session();s.slots=applyCandidates('invoice',s.slots,{clarifications:[{field:'businessName',rawValue:'Nexroa',suggestedValue:'Nexora',reason:'Possible transposition in contextual brand spelling'}]},{kind:'model',id:'m',message:'Our business is Nexroa',correction:false}).raw;assert.equal(snapshot(s).slots.businessName,undefined);assert.equal(snapshot(s).fieldStates.businessName.confirmationStatus,'awaiting');const accepted=say(s,'Nexora');assert.equal(accepted.state.slots.businessName,'Nexora');
});
test('a model cannot place explicitly declared sender contacts into recipient fields',()=>{
 const s=session();const r=applyCandidates('invoice',s.slots,{slots:{clientEmail:'hello@nexora.com'},evidence:{clientEmail:'hello@nexora.com'}},{kind:'model',id:'m',message:'My business email is hello@nexora.com'});assert.equal(r.raw.clientEmail,undefined);assert.equal(r.results[0].code,'EVIDENCE_REJECTED');
});
test('email syntax, ambiguous symbols and contradictory tax details need targeted clarification',()=>{
 for(const address of ['john..perera@gmail.com','.john@gmail.com','john@-gmail.com','john@gmail..com'])assert.equal(validField('clientEmail',address),false);
 assert.equal(validField('issueDate','0000-01-01'),false);
 const s=session(base);delete s.slots.currency;const currency=say(s,'currency is $');assert.equal(currency.state.slots.currency,undefined);assert.equal(currency.state.fieldStates.currency.validationStatus,'ambiguous');say(s,'LKR');assert.equal(snapshot(s).slots.currency,'LKR');
 say(s,'tax rate is 10');const conflict=say(s,'tax status is exempt');assert.equal(conflict.state.nextAction.field,'taxRate');assert.match(conflict.state.nextAction.question,/remove the tax/);say(s,'yes');assert.equal(snapshot(s).slots.taxRate,0);assert.equal(snapshot(s).fieldStates.taxRate.status,'confirmed');
});
