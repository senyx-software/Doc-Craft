import {beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import {randomBytes} from 'node:crypto';
const m=vi.hoisted(()=>({resolver:null as any}));
vi.mock('jose',async original=>({...await original<any>(),createRemoteJWKSet:()=>(...args:any[])=>m.resolver(...args)}));
import {googleOAuthOptions,verifyOAuthIdentity} from './google-oauth.service.js';
let privateKey:any;const nonce=randomBytes(32).toString('hex');
beforeAll(async()=>{const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;m.resolver=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'local',alg:'RS256'}]});});
beforeEach(()=>{vi.stubEnv('GOOGLE_CLIENT_ID','unit-client');vi.stubEnv('GOOGLE_CLIENT_SECRET',randomBytes(32).toString('hex'));vi.stubEnv('GOOGLE_CALLBACK_URL','https://app.example.com/v1/auth/oauth/google/callback');vi.stubEnv('FRONTEND_URL','https://app.example.com');});
async function signed(patch:Record<string,unknown>={}){const now=Math.floor(Date.now()/1000);return new SignJWT({sub:'owned-google',iss:'https://accounts.google.com',aud:'unit-client',iat:now,exp:now+60,nonce,email:'Person@example.com',email_verified:true,...patch}).setProtectedHeader({alg:'RS256',kid:'local'}).sign(privateKey);}
it('requires configured credentials and exact trusted callback route',()=>{expect(googleOAuthOptions()).toMatchObject({pkce:'S256',scope:['openid','profile','email']});vi.stubEnv('GOOGLE_CALLBACK_URL','https://app.example.com/other');expect(()=>googleOAuthOptions()).toThrow();vi.stubEnv('GOOGLE_CLIENT_SECRET','');expect(googleOAuthOptions()).toBeNull();});
it('validates signed verified identity and normalizes email',async()=>{expect(await verifyOAuthIdentity(await signed(),nonce)).toMatchObject({email:'person@example.com'});});
it.each([{nonce:'wrong'},{iss:'https://other.example'},{aud:'other-client'},{exp:1},{email_verified:false},{sub:''},{azp:'other-client'},{iat:Date.now()/1000+3600}])('rejects invalid identity claims %j',async patch=>{await expect(verifyOAuthIdentity(await signed(patch),nonce)).rejects.toThrow();});
