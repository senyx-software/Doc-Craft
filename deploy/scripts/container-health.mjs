import https from 'node:https';
import {readFileSync} from 'node:fs';
const port=process.env.SIDECAR_PORT||process.env.PORT;
const request=https.get({hostname:'127.0.0.1',port,path:'/health',ca:readFileSync('/run/secrets/ca.crt'),servername:process.env.DOCCRAFT_SERVICE,timeout:4000},response=>{response.resume();process.exitCode=response.statusCode===200?0:1;});
request.on('timeout',()=>request.destroy());request.on('error',()=>{process.exitCode=1;});
