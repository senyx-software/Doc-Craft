import { snapshot } from '../conversation-state.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readChatStream, ChatStreamError } from '../chat-stream.mjs';
const stream = events => new ReadableStream({ start(c) { for(const e of events) c.enqueue(new TextEncoder().encode(typeof e === 'string' ? e : `data: ${JSON.stringify(e)}\n\n`)); c.close(); } });
for (const events of [[{type:'error',message:'outage'}], [], [{type:'token',text:'partial'}], ['event: error\ndata: {"code":"UPSTREAM_ERROR","status":403}\n\n'], [{type:'done',outcome:'incomplete'}], ['data: broken\n\n']]) {
  test('failed/incomplete stream cannot become a business-name question '+JSON.stringify(events), async () => {
    const existing={businessName:'Nexora'};
    await assert.rejects(readChatStream(stream(events)), error => error instanceof ChatStreamError && !error.message.includes('What is your business'));
    assert.equal(existing.businessName,'Nexora');
  });
}
test('successful terminal preserves authoritative state and identity', async()=>{
  const done={type:'done',outcome:'success',turnId:'t',state:snapshot({id:'s',status:'ACTIVE',documentTypeId:'invoice',slots:{businessName:'Nexora'}}),response:'Next question'};
  assert.deepEqual((await readChatStream(stream([done]),{sessionId:'s',turnId:'t'})).state,JSON.parse(JSON.stringify(done.state)));
  await assert.rejects(readChatStream(stream([done]),{sessionId:'other'}));
});
