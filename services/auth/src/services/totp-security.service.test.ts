import {it,expect,vi} from 'vitest';
import {authenticator} from 'otplib';
import {configureServiceFixture} from '../../../../shared/tests/service-fixtures.mjs';
import {sealSecret} from '../../../../shared/sealed-secret.mjs';
const update=vi.hoisted(()=>vi.fn());
vi.mock('../db/prisma.js',()=>({prisma:{user:{updateMany:update}}}));
import {claimTotp} from './totp-security.service.js';
it('allows one concurrent use of an encrypted, account-bound TOTP and rejects plaintext',async()=>{
 configureServiceFixture('auth');const secret=authenticator.generateSecret(),stored=sealSecret(secret,'owner');let step=-1n;
 update.mockImplementation(async({where,data})=>{if(where.lastTotpStep.lt>step&&where.totpSecret===stored){step=data.lastTotpStep;return {count:1};}return {count:0};});
 const results=await Promise.all(Array.from({length:12},()=>claimTotp('owner',stored,authenticator.generate(secret))));
 expect(results.filter(Boolean)).toHaveLength(1);
 await expect(claimTotp('another',stored,authenticator.generate(secret))).rejects.toThrow();
 await expect(claimTotp('owner',secret,authenticator.generate(secret))).rejects.toThrow();
});
