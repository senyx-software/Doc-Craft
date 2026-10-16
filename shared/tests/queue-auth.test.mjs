import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signedJob,verifiedJob} from '../queue-auth.mjs';
import {fixtureConfig} from './service-fixtures.mjs';
async function job(queue='email_queue_auth',caller='auth'){const e=await signedJob(queue,'verify_email',{email:'fixture@example.test'},'fixture',fixtureConfig(caller));return {name:'verify_email',id:e.opts.jobId,data:e.data};}
test('Auth email producer interoperates with Notification consumer',async()=>assert.equal((await verifiedJob('email_queue_auth',await job(),fixtureConfig('notification'))).email,'fixture@example.test'));
for(const kind of ['unsigned','wrong-queue','wrong-id','wrong-name','signature'])test('queue worker rejects '+kind,async()=>{const j=await job();if(kind==='unsigned')j.data={email:'victim@example.test'};if(kind==='wrong-id')j.id='replay';if(kind==='wrong-name')j.name='password_reset';if(kind==='signature'){const parts=j.data.authorization.split('.');parts[1]=Buffer.from(JSON.stringify({data:{email:'victim@example.test'}})).toString('base64url');j.data.authorization=parts.join('.');}await assert.rejects(verifiedJob(kind==='wrong-queue'?'payment-webhook':'email_queue_auth',j,fixtureConfig('notification')));});
test('Chat cannot publish email or payment payloads with its service keys',async()=>{for(const queue of ['email_queue_auth','payment-webhook'])await assert.rejects(signedJob(queue,'forge',{},'fixture',fixtureConfig('chat')));});
