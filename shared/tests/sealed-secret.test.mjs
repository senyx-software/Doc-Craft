import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureServiceFixture,fixtureConfig} from './service-fixtures.mjs';
import {sealSecret,openSecret} from '../sealed-secret.mjs';
test('authenticator ciphertext is authenticated and account/service bound',()=>{
 configureServiceFixture('auth');
 const one=sealSecret('SYNTHETIC-TOTP','one'),two=sealSecret('SYNTHETIC-TOTP','one');
 assert.notEqual(one,two);assert.equal(openSecret(one,'one'),'SYNTHETIC-TOTP');
 assert.throws(()=>openSecret(one,'two'));assert.throws(()=>openSecret('PLAINTEXT','one'));
 configureServiceFixture('admin-api');assert.throws(()=>openSecret(one,'one'));
 const config=fixtureConfig('auth');config.totp_encryption.active_kid='v2';config.totp_encryption.keys.v2=Buffer.alloc(32,7).toString('base64url');process.env.SERVICE_AUTH_CONFIG_JSON=JSON.stringify(config);
 assert.equal(openSecret(one,'one'),'SYNTHETIC-TOTP');assert.match(sealSecret('key','one'),/^enc:v1:v2:/);
 delete config.totp_encryption.keys.v1;process.env.SERVICE_AUTH_CONFIG_JSON=JSON.stringify(config);assert.throws(()=>openSecret(one,'one'));
});
