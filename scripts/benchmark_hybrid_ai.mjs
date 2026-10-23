/** Offline resolver benchmark. This is not an LLM or complete-VPS benchmark. */
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import assert from 'node:assert/strict';
import {snapshot,extractExplicit,applyCandidates} from '../shared/conversation-state.mjs';
import {resolveEditorCommand,applyEditorOperations} from '../shared/editor-commands.mjs';
import {localKnowledge} from '../shared/assistant-knowledge.mjs';
import {commonLanguageProposal} from '../shared/language-corrections.mjs';
const context={elements:[{id:'header_title',type:'text',label:'Invoice',x:30,y:30,w:200,h:40,fontSize:24}],selectedIds:['header_title']};
const base={id:'offline',userId:'fixture',documentTypeId:'invoice',templateId:'tmpl_invoice_2023_01',status:'ACTIVE',slots:{businessName:'Nexora',clientName:'John',currency:'USD',invoiceNumber:'INV-1',issueDate:'2026-10-21',dueDate:'2026-11-21',lineItems:[{id:'laptops',description:'Laptops',quantity:3,unitPrice:500}],_chat:{editorContext:context}}};
const corpus=['Create an invoice for Nexora. Customer is John, and I sold three laptops for 500 each.','Change the tax to 10%.','Add another item, a mouse for 25 dollars.','Actually change the customer to Alex and make the invoice heading blue.','Make it bigger.','What is the difference between an invoice and a quotation?','Plase delivary the prodcts within seven days.'];
const iterations=100,samples=[];
for(const message of corpus){const durations=[];for(let index=0;index<iterations;index++){
 const session=structuredClone(base);if(message.startsWith('Create '))session.slots={};const started=performance.now(),state=snapshot(session);
 const editor=resolveEditorCommand(message,state),knowledge=localKnowledge(message),language=commonLanguageProposal(message,state);
 if(!knowledge&&!language){const proposed=editor.operations.length&&!editor.remaining?{slots:{},needsProvider:false}:extractExplicit(editor.operations.length?editor.remaining:message,state);assert(!proposed.needsProvider,message);session.slots=applyCandidates('invoice',session.slots,proposed,{kind:'user',id:'fixture',message,correction:true}).raw;if(editor.operations.length)applyEditorOperations(null,context,editor.operations,message);}
 durations.push(performance.now()-started);
 }durations.sort((a,b)=>a-b);samples.push({message,iterations,model_requests:0,p50_ms:durations[50],p95_ms:durations[95]});}
console.log(JSON.stringify({scope:'Offline deterministic resolver + validation + calculations only; excludes HTTP, database, Redis, LLM and full deployment load',node:process.version,platform:os.platform(),cpu:os.cpus()[0]?.model,logical_cpus:os.cpus().length,process_rss_mb:process.memoryUsage().rss/1048576,samples},null,2));
