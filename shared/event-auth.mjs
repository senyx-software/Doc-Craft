import {SignJWT} from 'jose';
import {randomUUID} from 'node:crypto';
import {serviceConfig} from './service-auth.mjs';
const allowed={payment:['payment.failed','subscription.cancelled'],quota:['quota.warning']};
export async function signedEvent(event,payload,config=serviceConfig()) {
 if(!allowed[config.identity]?.includes(event)||!config.event_send)throw new Error('Event producer is not authorized');
 const key=config.event_send;
 const authorization=await new SignJWT({event,payload}).setProtectedHeader({alg:'HS256',typ:'doccraft-event+jwt',kid:key.kid}).setIssuer('doccraft-events').setAudience('admin-api').setSubject(config.identity).setJti(randomUUID()).setIssuedAt().setExpirationTime('60s').sign(Buffer.from(key.secret,'base64url'));
 return JSON.stringify({authorization});
}
