/** Synthetic deterministic keys for isolated tests only. Never import from application code. */
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { serviceToken } from '../service-auth.mjs';
import { signUserToken } from '../user-auth.mjs';
const policy = JSON.parse(readFileSync(new URL('../service-permissions.json', import.meta.url)));
const hash = label => createHash('sha256').update('doccraft-test-only:' + label).digest();
export const userPrivateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),hash('user')]), format:'der', type:'pkcs8' });
const publicKey = createPublicKey(userPrivateKey).export({format:'der',type:'spki'}).toString('base64');
export function fixtureConfig(identity) {
  const result={version:1,identity,send:{},receive:{},user_jwt:{public_keys:{v1:publicKey}}};
  if(['auth','admin-api'].includes(identity))result.totp_encryption={active_kid:'v1',keys:{v1:hash('totp:'+identity).toString('base64url')}};
  if(identity==='auth') Object.assign(result.user_jwt,{kid:'v1',private_key:userPrivateKey.export({format:'der',type:'pkcs8'}).toString('base64')});
  for(const producer of ['payment','quota']) {
    const secret=hash('event:'+producer).toString('base64url');
    if(identity===producer) result.event_send={kid:'v1',secret};
    if(identity==='admin-api') (result.event_receive??={})[producer]={v1:secret};
  }
  for(const [target,rules] of Object.entries(policy)) for(const caller of new Set(rules.flatMap(rule=>rule.callers))) {
    const secret=hash(caller+'>'+target).toString('base64url');
    if(caller===identity)result.send[target]={kid:'v1',secret};
    if(target===identity)result.receive[caller]={v1:secret};
  }
  for(const [queue,consumer,producers] of [['document','document',['document']],['payment-webhook','payment',['payment']],['email_queue_auth','notification',['auth']],['email_queue_document','notification',['document']],['email_queue_notification','notification',['notification']],['analytics','analytics',['analytics']]])for(const producer of producers){
    const secret=hash('queue:'+queue+':'+producer).toString('base64url');
    if(identity===producer)(result.queue_send??={})[queue]={kid:'v1',secret};
    if(identity===consumer)((result.queue_receive??={})[queue]??={})[producer]={v1:secret};
  }
  return result;
}
export function configureServiceFixture(identity){ process.env.SERVICE_AUTH_CONFIG_JSON=JSON.stringify(fixtureConfig(identity)); }
export function userToken(subject='u',type='access',claims={}) { return signUserToken(type,{sub:subject,...claims},'1h',fixtureConfig('auth')); }
export async function serviceHeaders(caller,target,method,path,body='') {
 return {'x-doccraft-service-token':await serviceToken(target,method,path,body,fixtureConfig(caller))};
}
