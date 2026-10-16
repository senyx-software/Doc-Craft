import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pgConnectionOptions} from '../pg-tls.mjs';
test('remote database cannot disable certificate verification through DSN parameters',()=>{for(const mode of ['disable','no-verify','require']){const options=pgConnectionOptions('postgresql://fixture:unused@db.example.test/app?sslmode='+mode+'&ssl=false');assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(new URL(options.connectionString).searchParams.has('sslmode'),false);assert.equal(new URL(options.connectionString).searchParams.has('ssl'),false);}});
test('isolated loopback PostgreSQL remains available and TLS can be required explicitly',()=>{assert.equal(pgConnectionOptions('postgresql://fixture@127.0.0.1:55432/test').ssl,undefined);assert.equal(pgConnectionOptions('postgresql://fixture@127.0.0.1:55432/test',{requireTls:true}).ssl.rejectUnauthorized,true);});
