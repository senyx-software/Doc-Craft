import {paymentConfigClient} from './services/paymentConfigClient.service.js';
import {createAppServer} from '../../../shared/server-tls.mjs';
import {env} from './config/env.js';
import {buildApp} from './app.js';
import {stopWebhookWorker} from './queues/payment-webhook.queue.js';
import {prisma} from './db/prisma.js';
import {closeRedis} from './db/redis.js';
import {closeServiceAuth} from '../../../shared/service-auth.mjs';
const app=buildApp();
const server=createAppServer(app).listen(env.PORT,'0.0.0.0',()=>console.log('Payment service listening'));
let closing=false;
async function shutdown(){
 if(closing)return;closing=true;
 const deadline=setTimeout(()=>{console.error('payment shutdown deadline exceeded');process.exit(1);},25000);deadline.unref();
 try{
   await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
   await stopWebhookWorker();
   await paymentConfigClient.close();
   await prisma.$disconnect();
   await closeRedis();
   await closeServiceAuth();
   clearTimeout(deadline);process.exit(0);
 }catch{console.error('payment graceful shutdown failed');process.exit(1);}
}
process.once('SIGTERM',()=>{void shutdown();});
process.once('SIGINT',()=>{void shutdown();});
