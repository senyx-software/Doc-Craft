/** Signed queue payloads bound to queue, job name and immutable BullMQ job ID. */
import {SignJWT,jwtVerify,decodeJwt,decodeProtectedHeader} from 'jose';
import {randomUUID} from 'node:crypto';
import {serviceConfig} from './service-auth.mjs';
const emailTypes={auth:['welcome','verify_email','password_reset'],document:['document_ready','invoice_ready']};
export const queueProducers={document:['document'],'payment-webhook':['payment'],email_queue_auth:['auth'],email_queue_document:['document'],email_queue_notification:['notification'],analytics:['analytics']};
export async function signedJob(queue,name,data,jobId=randomUUID(),config=serviceConfig()) {
 const key=config.queue_send?.[queue];if(!key || !queueProducers[queue]?.includes(config.identity) || (queue.startsWith('email_queue_')&&emailTypes[config.identity]&&!emailTypes[config.identity].includes(name)))throw new Error('Queue producer is not authorized');
 const authorization=await new SignJWT({data,name,jobId}).setProtectedHeader({alg:'HS256',typ:'doccraft-job+jwt',kid:key.kid}).setIssuer('doccraft-queues').setSubject(config.identity).setAudience(queue).setJti(randomUUID()).setIssuedAt().setExpirationTime('7d').sign(Buffer.from(key.secret,'base64url'));
 return {data:{authorization},opts:{jobId}};
}
export async function verifiedJob(queue,job,config=serviceConfig()) {
 const token=job.data?.authorization;if(typeof token!=='string')throw new Error('Signed queue job required');
 const hint=decodeJwt(token),header=decodeProtectedHeader(token),key=config.queue_receive?.[queue]?.[hint.sub]?.[header.kid];
 if(!key || !queueProducers[queue]?.includes(hint.sub) || (queue.startsWith('email_queue_')&&emailTypes[hint.sub]&&!emailTypes[hint.sub].includes(job.name)))throw new Error('Queue producer is not authorized');
 const {payload}=await jwtVerify(token,Buffer.from(key,'base64url'),{algorithms:['HS256'],issuer:'doccraft-queues',audience:queue,requiredClaims:['sub','iat','exp','jti','data','name','jobId']});
 if(header.typ!=='doccraft-job+jwt'||payload.name!==job.name||payload.jobId!==String(job.id)||payload.exp-payload.iat>604801||payload.iat>Date.now()/1000+3||!payload.data||Array.isArray(payload.data)||typeof payload.data!=='object')throw new Error('Invalid queue job binding');
 return payload.data;
}
