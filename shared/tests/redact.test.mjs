import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redact} from '../redact.mjs';
test('notification metadata retains useful context without reset codes or signing credentials',()=>{const input={type:'password_reset',token:'test-private',payload:{verification_code:'123456',accessToken:'jwt',documentUrl:'http://fixture.invalid/capability',items:[{amount:10,authorization:'Bearer jwt'}]},text:'https://fixture.invalid/reset?token=abc&mode=reset'};const output=redact(input);assert.equal(output.type,input.type);assert.equal(output.payload.items[0].amount,10);for(const secret of ['test-private','123456','Bearer jwt','token=abc','capability'])assert.equal(JSON.stringify(output).includes(secret),false);assert.equal(input.token,'test-private');});
