/** Request-bound service JWTs. Keys are independent for every source/destination pair. */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Transform } from 'node:stream';
import { SignJWT, jwtVerify, decodeProtectedHeader, decodeJwt } from 'jose';
import { Redis } from 'ioredis';

const policy = JSON.parse(readFileSync(new URL('./service-permissions.json', import.meta.url), 'utf8'));
const rawDigests = new WeakMap();
const digest = body => createHash('sha256').update(body || '').digest('hex');
const error = (message, statusCode = 403) => Object.assign(new Error(message), { statusCode });
let nonceRedis;

export function serviceConfig() {
  const text = process.env.SERVICE_AUTH_CONFIG_JSON || (process.env.SERVICE_AUTH_CONFIG_FILE ? readFileSync(process.env.SERVICE_AUTH_CONFIG_FILE, 'utf8') : '');
  if (!text) throw error('Service identity is not configured', 503);
  const config = JSON.parse(text);
  if (config.version !== 1 || typeof config.identity !== 'string') throw error('Invalid service identity configuration', 503);
  return config;
}

export function permitted(receiver, caller, method, pathname) {
  return (policy[receiver] || []).some(rule => rule.methods.includes(method.toUpperCase()) && rule.callers.includes(caller) && new RegExp(rule.path).test(pathname));
}

export async function serviceToken(receiver, method, url, body = '', config = serviceConfig()) {
  const key = config.send?.[receiver];
  if (!key || Buffer.from(key.secret, 'base64url').length < 32) throw error('No credential for destination service', 503);
  const target = new URL(url, 'http://request.invalid');
  return new SignJWT({ method: method.toUpperCase(), target: target.pathname + target.search, body_sha256: digest(body) })
    .setProtectedHeader({ alg: 'HS256', typ: 'doccraft-service+jwt', kid: key.kid })
    .setIssuer('doccraft-services').setAudience(receiver).setSubject(config.identity)
    .setJti(randomUUID()).setIssuedAt().setExpirationTime('60s')
    .sign(Buffer.from(key.secret, 'base64url'));
}

export async function serviceFetch(receiver, url, options = {}) {
  const headers = new Headers(options.headers);
  headers.delete('x-internal-secret');
  headers.set('X-DocCraft-Service-Token', await serviceToken(receiver, options.method || 'GET', String(url), options.body || ''));
  return fetch(url, { ...options, headers, redirect: 'error', signal: options.signal || AbortSignal.timeout(5000) });
}

export function captureRawServiceBody(request, buffer) { rawDigests.set(request, digest(buffer)); }
export function captureServiceBody(request, _reply, payload, done) {
  const hash = createHash('sha256');
  const stream = new Transform({
    transform(chunk, _encoding, callback) { hash.update(chunk); this.receivedEncodedLength = (this.receivedEncodedLength || 0) + chunk.length; callback(null, chunk); },
    final(callback) { rawDigests.set(request, hash.digest('hex')); callback(); },
  });
  payload.on('error', err => stream.destroy(err));
  done(null, payload.pipe(stream));
}

export async function claimServiceNonce(receiver, caller, kid, nonce, seconds, issuedAt) {
  if (!nonceRedis) {
    if (!process.env.REDIS_URL) throw error('Service replay protection unavailable', 503);
    nonceRedis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: true, connectTimeout: 2000, commandTimeout: 2000 });
    nonceRedis.on('error', () => {});
  }
  try {
    if (nonceRedis.status === 'wait') await nonceRedis.connect();
    const script=readFileSync(new URL('./service-nonce.lua',import.meta.url),'utf8');
    const result=await nonceRedis.eval(script,1,`service-auth:${receiver}:${caller}:${kid}:${nonce}`,seconds,issuedAt ?? -1);
    if(Number(result)===-1)throw error('Service credential predates replay-store recovery',503);
    return Number(result)===1;
  } catch { throw error('Service replay protection unavailable', 503); }
}

export const serviceNonceStore = {claim: claimServiceNonce};

export async function authorizeService(receiver, request, claim = serviceNonceStore.claim) {
  const token = request.headers['x-doccraft-service-token'];
  if (typeof token !== 'string' || token.length > 8192) throw error('Service credential required', 401);
  const config = serviceConfig();
  if (config.identity !== receiver) throw error('Wrong receiving service configuration', 503);
  let payload, protectedHeader;
  try {
    const hint = decodeJwt(token), header = decodeProtectedHeader(token);
    const key = config.receive?.[hint.sub]?.[header.kid];
    if (!key || Buffer.from(key, 'base64url').length < 32) throw error('Unknown service credential');
    ({ payload, protectedHeader } = await jwtVerify(token, Buffer.from(key, 'base64url'), {
      algorithms: ['HS256'], issuer: 'doccraft-services', audience: receiver,
      requiredClaims: ['sub', 'jti', 'iat', 'exp', 'method', 'target', 'body_sha256'], clockTolerance: 3,
    }));
    if (protectedHeader.typ !== 'doccraft-service+jwt' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.jti) || payload.exp - payload.iat > 65 || payload.iat > Date.now()/1000 + 3) throw error('Invalid service credential');
  } catch { throw error('Invalid service credential', 401); }
  const rawUrl = request.originalUrl || request.raw?.url || request.url;
  const target = new URL(rawUrl, 'http://request.invalid');
  const actualDigest = rawDigests.get(request) || digest(request.rawBody || '');
  if (payload.method !== request.method || payload.target !== target.pathname + target.search || payload.body_sha256 !== actualDigest) throw error('Service request binding failed', 401);
  if (!permitted(receiver, payload.sub, request.method, target.pathname)) throw error('Service operation is not authorized');
  if (!await claim(receiver, payload.sub, protectedHeader.kid, payload.jti, Math.max(1, payload.exp - Math.floor(Date.now()/1000) + 4),payload.iat)) throw error('Service request replayed', 409);
  return payload.sub;
}

export async function closeServiceAuth() { if (nonceRedis) { await nonceRedis.quit().catch(() => nonceRedis.disconnect()); nonceRedis = undefined; } }
