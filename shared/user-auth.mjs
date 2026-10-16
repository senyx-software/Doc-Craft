/** Only Auth holds the private user-token signing key; consumers get public keys. */
import { createPrivateKey, createPublicKey, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, decodeProtectedHeader } from 'jose';
import { serviceConfig } from './service-auth.mjs';
const audience = type => type === 'access' ? 'doccraft-user' : `doccraft-${type}`;

export async function signUserToken(type, claims, expires = '1h', config = serviceConfig()) {
  if (config.identity !== 'auth' || !config.user_jwt?.private_key) throw new Error('User signing authority unavailable');
  const key = createPrivateKey({ key: Buffer.from(config.user_jwt.private_key, 'base64'), format: 'der', type: 'pkcs8' });
  return new SignJWT({ ...claims, type }).setProtectedHeader({alg:'EdDSA', typ:`doccraft-${type}+jwt`, kid:config.user_jwt.kid})
    .setIssuer('doccraft-auth').setAudience(audience(type)).setIssuedAt().setJti(randomUUID()).setExpirationTime(expires).sign(key);
}

export async function verifyUserToken(token, type = 'access', config = serviceConfig()) {
  const header = decodeProtectedHeader(token);
  const encoded = config.user_jwt?.public_keys?.[header.kid];
  if (!encoded || header.alg !== 'EdDSA' || header.typ !== `doccraft-${type}+jwt`) throw Object.assign(new Error('Invalid token profile'),{name:'JWTInvalid'});
  const key = createPublicKey({key: Buffer.from(encoded, 'base64'), format:'der', type:'spki'});
  const {payload} = await jwtVerify(token,key,{algorithms:['EdDSA'],issuer:'doccraft-auth',audience:audience(type),requiredClaims:['sub','exp','iat','jti']});
  if (typeof payload.sub !== 'string' || !payload.sub || payload.type !== type) throw Object.assign(new Error('Invalid token identity'),{name:'JWTInvalid'});
  return payload;
}
