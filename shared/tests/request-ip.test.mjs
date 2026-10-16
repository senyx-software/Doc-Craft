import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {requestIp} from '../request-ip.mjs';
for(const trusted of [false,['loopback']])test('forwarded IP requires configured trusted proxy: '+JSON.stringify(trusted),async()=>{const app=express();app.set('trust proxy',trusted);app.get('/',(req,res)=>res.json({ip:requestIp(req)}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{const response=await fetch('http://127.0.0.1:'+server.address().port,{headers:{'x-forwarded-for':'203.0.113.10'}});const {ip}=await response.json();assert.equal(ip,trusted?'203.0.113.10':'127.0.0.1');}finally{await new Promise(resolve=>server.close(resolve));}});
