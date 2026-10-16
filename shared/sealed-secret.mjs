import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { serviceConfig } from './service-auth.mjs';

function keyring() {
  const config=serviceConfig(),ring=config.totp_encryption;
  if(!ring?.active_kid || !ring.keys?.[ring.active_kid])throw new Error('TOTP encryption keyring unavailable');
  return {ring,identity:config.identity};
}
export function sealSecret(secret,accountId) {
  if(!secret)return secret;
  const {ring,identity}=keyring(),kid=ring.active_kid,nonce=randomBytes(12),key=Buffer.from(ring.keys[kid],'base64url');
  if(key.length!==32 || !/^[a-zA-Z0-9_-]{1,40}$/.test(kid))throw new Error('Invalid encryption key');
  const cipher=createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(Buffer.from(`doccraft-totp:${identity}:${accountId}`));
  const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final(),cipher.getAuthTag()]);
  return ['enc','v1',kid,nonce.toString('base64url'),encrypted.toString('base64url')].join(':');
}
export function openSecret(value,accountId) {
  if(!value)return value;
  const {ring,identity}=keyring(),[prefix,version,kid,nonce,body,...extra]=value.split(':');
  if(prefix!=='enc'||version!=='v1'||extra.length||!ring.keys[kid])throw new Error('TOTP secret requires encryption migration or a retained key');
  const bytes=Buffer.from(body,'base64url'),decipher=createDecipheriv('aes-256-gcm',Buffer.from(ring.keys[kid],'base64url'),Buffer.from(nonce,'base64url'));
  decipher.setAAD(Buffer.from(`doccraft-totp:${identity}:${accountId}`));decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString('utf8');
}
