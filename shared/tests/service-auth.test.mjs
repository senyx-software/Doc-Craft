import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT,decodeJwt} from 'jose';
import {createHash,randomUUID} from 'node:crypto';
import {authorizeService,serviceToken,captureRawServiceBody} from '../service-auth.mjs';
import {signUserToken,verifyUserToken} from '../user-auth.mjs';
import {fixtureConfig,userPrivateKey} from './service-fixtures.mjs';
const receiver=fixtureConfig('quota'), caller=fixtureConfig('chat');
const setReceiver=()=>{process.env.SERVICE_AUTH_CONFIG_JSON=JSON.stringify(receiver);};
const nonce=()=>{const seen=new Set();return async(...parts)=>{const id=parts.slice(0,4).join(':');if(seen.has(id))return false;seen.add(id);return true;};};
async function request(path='/v1/quota/check',body='{"userId":"fixture"}',credentials=caller){const r={method:'POST',url:path,headers:{'x-doccraft-service-token':await serviceToken('quota','POST',path,body,credentials)}};captureRawServiceBody(r,Buffer.from(body));return r;}
test('valid request is caller-bound and exact replay is rejected',async()=>{setReceiver();const claim=nonce(),r=await request();assert.equal(await authorizeService('quota',r,claim),'chat');await assert.rejects(authorizeService('quota',r,claim),{statusCode:409});});
for(const kind of ['missing','global-secret','body','path','method','audience','signature','expired','issuer','type','long-lifetime']) test('rejects '+kind,async()=>{
 setReceiver();const r=await request();
 if(kind==='missing')r.headers={};
 else if(kind==='global-secret')r.headers={'x-internal-secret':'legacy-secret','x-user-role':'admin'};
 else if(kind==='body')captureRawServiceBody(r,Buffer.from('{"userId":"victim"}'));
 else if(kind==='path')r.url='/v1/quota/refund';
 else if(kind==='method')r.method='GET';
 else {
  const key=Buffer.from(caller.send.quota.secret,'base64url'),p=decodeJwt(r.headers['x-doccraft-service-token']);
  if(kind==='audience')p.aud='payment';if(kind==='expired')p.exp=Math.floor(Date.now()/1000)-5;if(kind==='issuer')p.iss='attacker';if(kind==='long-lifetime')p.exp=p.iat+3600;
  r.headers['x-doccraft-service-token']=await new SignJWT(p).setProtectedHeader({alg:'HS256',typ:kind==='type'?'JWT':'doccraft-service+jwt',kid:'v1'}).sign(kind==='signature'?createHash('sha256').update('forged').digest():key);
 }
 await assert.rejects(authorizeService('quota',r,nonce()),{statusCode:401});
});
test('authenticated Chat cannot administer quotas',async()=>{setReceiver();await assert.rejects(authorizeService('quota',await request('/v1/quota/override'),nonce()),{statusCode:403});});
test('replay storage outages fail closed',async()=>{setReceiver();await assert.rejects(authorizeService('quota',await request(),async()=>{throw Object.assign(new Error('offline'),{statusCode:503});}),{statusCode:503});});
test('payment credential cannot sign as Admin API to Quota',async()=>{setReceiver();const forged=fixtureConfig('payment');forged.identity='admin-api';await assert.rejects(authorizeService('quota',await request('/v1/quota/plan/sync','{}',forged),nonce()),{statusCode:401});});
test('signer rotates kid while receiver accepts old and new keys',async()=>{const next=structuredClone(caller);next.send.quota={kid:'v2',secret:createHash('sha256').update('rotation-test').digest('base64url')};const config=structuredClone(receiver);config.receive.chat.v2=next.send.quota.secret;process.env.SERVICE_AUTH_CONFIG_JSON=JSON.stringify(config);assert.equal(await authorizeService('quota',await request('/v1/quota/check','{}',next),nonce()),'chat');assert.equal(await authorizeService('quota',await request(),nonce()),'chat');});
test('only Auth has user signing authority and refresh/MFA cannot authenticate as access',async()=>{const auth=fixtureConfig('auth');for(const type of ['refresh','mfa'])await assert.rejects(verifyUserToken(await signUserToken(type,{sub:'u'},'1h',auth),'access',receiver));await assert.rejects(signUserToken('access',{sub:'u'},'1h',receiver));assert.equal((await verifyUserToken(await signUserToken('access',{sub:'u'},'1h',auth),'access',receiver)).sub,'u');});
for(const invalid of ['audience','issuer','expired','algorithm'])test('user boundary rejects wrong '+invalid,async()=>{const now=Math.floor(Date.now()/1000),claims={sub:'u',type:'access',aud:invalid==='audience'?'doccraft-admin-api':'doccraft-user',iss:invalid==='issuer'?'attacker':'doccraft-auth',iat:now,exp:invalid==='expired'?now-1:now+60,jti:randomUUID()};const token=await new SignJWT(claims).setProtectedHeader({alg:invalid==='algorithm'?'HS256':'EdDSA',typ:'doccraft-access+jwt',kid:'v1'}).sign(invalid==='algorithm'?Buffer.alloc(32,1):userPrivateKey);await assert.rejects(verifyUserToken(token,'access',receiver));});
