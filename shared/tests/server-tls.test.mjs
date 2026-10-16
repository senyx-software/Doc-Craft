import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serverTlsOptions} from '../server-tls.mjs';
test('TLS listeners fail closed on partial keys and mandatory TLS without certificates',()=>{
 const names=['SERVICE_TLS_CERT_FILE','SERVICE_TLS_KEY_FILE','SERVICE_REQUIRE_TLS'];const before=names.map(n=>process.env[n]);
 try {
  names.forEach(n=>delete process.env[n]);assert.equal(serverTlsOptions(),undefined);
  process.env.SERVICE_REQUIRE_TLS='true';assert.throws(serverTlsOptions,/required/);
  process.env.SERVICE_TLS_CERT_FILE='/nonexistent';assert.throws(serverTlsOptions,/Both/);
 } finally {names.forEach((n,i)=>before[i]===undefined?delete process.env[n]:process.env[n]=before[i]);}
});
