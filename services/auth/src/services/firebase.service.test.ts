import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

vi.mock('../../../../shared/service-auth.mjs',()=>({serviceFetch:vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{allow_firebase:true}})})}));
process.env.FIREBASE_PROJECT_ID='doc-craft-57643';
const state = vi.hoisted(() => ({ resolver: null as any }));
vi.mock('jose', async (original) => ({
  ...await original<typeof import('jose')>(),
  createRemoteJWKSet: () => (...args: any[]) => state.resolver(...args),
}));
import { verifyGoogleIdToken } from './firebase.service.js';

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  state.resolver = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'RS256' }] });
});

async function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: 'google-user', iss: 'https://securetoken.google.com/doc-craft-57643',
    aud: 'doc-craft-57643', iat: now, exp: now + 3600, auth_time: now,
    email: 'Person@example.com', email_verified: true,
    firebase: { sign_in_provider: 'google.com' }, name: 'Person', ...overrides,
  }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
}

describe('Firebase Google identity verification', () => {
  it('accepts a signed Google identity for this project', async () => {
    await expect(verifyGoogleIdToken(await token())).resolves.toMatchObject({ email: 'person@example.com', fullName: 'Person' });
  });
  it.each([
    { aud: 'other-project' }, { iss: 'https://example.com' }, { exp: 1 },
    { email_verified: false }, { firebase: { sign_in_provider: 'password' } },
    { sub: '' }, { auth_time: Math.floor(Date.now() / 1000) + 3600 },
  ])('rejects unsafe claims %j', async (claims) => {
    await expect(verifyGoogleIdToken(await token(claims))).rejects.toThrow();
  });
  it('rejects a forged signature', async () => {
    const valid = await token();
    const parts = valid.split('.');
    parts[2] = 'A'.repeat(parts[2].length);
    await expect(verifyGoogleIdToken(parts.join('.'))).rejects.toThrow();
  });
});

it('fails closed when Firebase is not configured', async()=>{vi.stubEnv('FIREBASE_PROJECT_ID','');try{await expect(verifyGoogleIdToken('untrusted')).rejects.toMatchObject({statusCode:503});}finally{vi.unstubAllEnvs();}});
