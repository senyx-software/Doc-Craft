import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractItemTable} from '../item-table.mjs';
import {snapshot,extractExplicit,applyCandidates,latestTurn} from '../conversation-state.mjs';

export const table='Item / Service\tQuantity\tUnit Price (LKR)\tTotal (LKR)\nWebsite Development\t1\t75,000.00\t75,000.00\nUI/UX Design\t2\t15,000.00\t30,000.00\nDomain Registration\t1\t4,500.00\t4,500.00\nWeb Hosting (1 Year)\t1\t12,000.00\t12,000.00';
const session=slots=>({id:'s',status:'ACTIVE',documentTypeId:'invoice',slots});
test('pasted LKR item table extracts all rows and currency without an AI request',()=>{
    const proposal=extractExplicit(table,snapshot(session({businessName:'Nexora'})));
    assert.equal(proposal.needsProvider,false);
    assert.equal(proposal.slots.lineItems.length,4);
    const result=applyCandidates('invoice',{businessName:'Nexora'},proposal,{kind:'user',id:'t',message:table});
    const state=snapshot(session(result.raw));
    assert.equal(state.slots.businessName,'Nexora');assert.equal(state.slots.currency,'LKR');
    assert.equal(state.slots.subtotal,121500);assert.equal(state.slots.totalDue,121500);
    assert.equal(state.slots.lineItems[1].quantity,2);assert.equal(state.slots.lineItems[1].unitPrice,15000);
});
test('markdown item tables use declared columns and decimal-safe supplied amount validation',()=>{
    const result=extractItemTable('| Description | Unit Price (USD) | Qty | Amount (USD) |\n| --- | ---: | ---: | ---: |\n| API integration | 0.10 | 3 | 0.30 |');
    assert.deepEqual(result,{currency:'USD',lineItems:[{description:'API integration',quantity:3,unitPrice:0.1}]});
});
test('inconsistent totals, malformed grouping and conflicting currency require semantic clarification',()=>{
    assert.equal(extractItemTable(table.replace('30,000.00','31,000.00')),undefined);
    assert.equal(extractItemTable(table.replace('75,000.00','75,00.00')),undefined);
    assert.equal(extractItemTable(table.replace('Total (LKR)','Total (USD)')),undefined);
    assert.equal(extractExplicit(table.replace('30,000.00','31,000.00'),snapshot(session({}))).needsProvider,true);
});
test('missing quantity, invalid values and unsupported columns are never guessed or silently discarded',()=>{
    for(const message of ['Description\tUnit Price (LKR)\nDesign\t1500','Description\tQty\tUnit Price (LKR)\nDesign\t\t1500','Description\tQty\tUnit Price (LKR)\nDesign\t1\t-1500','Description\tQty\tUnit Price (LKR)\tTax\nDesign\t1\t1500\t5'])assert.equal(extractItemTable(message),undefined);
});
test('three-column table does not invent a currency and a changed existing table requires confirmation',()=>{
    const message='Description\tQty\tUnit Price\nDesign\t1\t1500';
    assert.equal(extractItemTable(message).currency,undefined);
    const result=applyCandidates('invoice',{lineItems:[{description:'Original',quantity:1,unitPrice:100}]},extractExplicit(message,snapshot(session({}))),{kind:'user',id:'t',message});
    assert.equal(snapshot(session(result.raw)).slots.lineItems[0].description,'Original');
    assert.equal(snapshot(session(result.raw)).fieldStates.lineItems.status,'conflicting');
});
test('PostgreSQL object-key ordering does not change the latest interrupted turn or reference date',()=>{
    const turns={a:{startedAt:Date.parse('2026-10-13T10:00:00Z'),status:'failure',message:'latest items',retryable:true},z:{startedAt:Date.parse('2026-10-12T10:00:00Z'),status:'success',message:'older date'}};
    assert.equal(latestTurn({turns})[0],'a');
    const state=snapshot(session({_chat:{turns}}));
    assert.equal(state.pendingTurn.id,'a');assert.equal(state.referenceDate,'2026-10-13');
});
test('persisted latest-turn pointer disambiguates turns with the same millisecond timestamp',()=>{
    const turns={a:{startedAt:1,status:'success'},z:{startedAt:1,status:'failure',message:'old failure'}};
    assert.equal(latestTurn({turns,latestTurnId:'a'})[0],'a');
    assert.equal(snapshot(session({_chat:{turns,latestTurnId:'a'}})).pendingTurn,null);
});
