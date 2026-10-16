import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelTaskState,modelToolText} from '../model-context.mjs';
import {snapshot} from '../conversation-state.mjs';

test('model state retains verified facts, ownership and pending decisions while removing repeated provenance',()=>{
    const state=snapshot({id:'s',status:'ACTIVE',documentTypeId:'invoice',slots:{businessName:'SENYX',senderPhone:'0382298760',clientPhone:'0741234567',accountDetails:'BOC, Panadura, Account: 007903232',_chat:{fields:{clientPhone:{status:'conflicting',proposed:'0712345678',sourceExcerpt:'private audit text '.repeat(300)},businessName:{status:'confirmed',formatting:'preserve',sourceExcerpt:'private audit text '.repeat(300)}}}}});
    const small=modelTaskState(state);
    assert.deepEqual(small.slots,state.slots);assert.equal(small.fieldStates.clientPhone.proposed,'0712345678');assert.equal(small.fieldStates.businessName.formatting,'preserve');
    assert.deepEqual(small.requiredFields,state.schema.required_keys);assert.deepEqual(small.nextAction,state.nextAction);
    assert.ok(!JSON.stringify(small).includes('private audit text'));assert.ok(!JSON.stringify(small).includes('fingerprint'));
    assert.ok(JSON.stringify(small).length<JSON.stringify(state).length/2);
});
test('MCP state is compacted without double JSON encoding or losing commit receipts and repair hints',()=>{
    const state={...snapshot({id:'s',status:'ACTIVE',documentTypeId:'invoice',slots:{senderPhone:'0382298760'}}),operationResults:[{field:'senderPhone',outcome:'committed'}],hint:'Repair remaining extraction'};
    const small=JSON.parse(modelToolText([{type:'text',text:JSON.stringify(state)}]));
    assert.equal(small.slots.senderPhone,'0382298760');assert.deepEqual(small.operationResults,state.operationResults);assert.equal(small.hint,state.hint);
    assert.equal(modelToolText([{type:'text',text:'{"code":"EVIDENCE_REJECTED","hint":"Use literal facts"}'}]),'{"code":"EVIDENCE_REJECTED","hint":"Use literal facts"}');
    assert.equal(modelToolText([{type:'text',text:'Storage unavailable'}]),'Storage unavailable');
});
