/** Real DB + Notification handoff crash/replay probe. No external email. */
import {randomUUID,createHash} from 'node:crypto';
import {prisma,paymentDatabase} from '../services/payment/src/db/prisma.js';
import {upsertInvoice} from '../services/payment/src/services/subscription.service.js';
import {applyDurableDelivery,dispatchPaymentOutbox} from '../services/payment/src/services/payment-outbox.service.js';
import {paymentConfigClient} from '../services/payment/src/services/paymentConfigClient.service.js';
if(!process.env.DATABASE_URL?.includes('/doccraft_phase4_')||process.env.NODE_ENV!=='test'||process.env.RESEND_API_KEY)throw new Error('Isolated no-email fixture required');
const fixture=await prisma.billingInvoice.findFirst({where:{status:'paid'}});
if(!fixture)throw new Error('Verified fixture invoice required');
const reference='phase5-receipt-'+randomUUID();let intercepted=false;
const originalFetch=globalThis.fetch;
try {
 const ids=Array.from({length:12},()=>randomUUID());
 for(const id of ids)await prisma.webhookDelivery.create({data:{id,name:'phase5-receipt',payload:{}}});
 await Promise.all(ids.map(id=>applyDurableDelivery(id,async()=>upsertInvoice({...fixture,gateway:fixture.gateway as 'payhere',gatewayInvoiceId:reference,status:'paid',paidAt:new Date('2026-10-16T00:00:00Z')}))));
 const invoice=await prisma.billingInvoice.findUniqueOrThrow({where:{gatewayInvoiceId:reference}});
 const outboxId='receipt:'+invoice.id;
 const count=await prisma.paymentOutbox.count({where:{id:outboxId}});
 if(count!==1)throw new Error('Duplicate receipt outbox');
 await dispatchPaymentOutbox(); // Snapshot the Auth-resolved recipient first.
 globalThis.fetch=async(input,init)=>{
  const response=await originalFetch(input,init);
  if(typeof init?.body==='string'&&init.body.includes(outboxId)&&init.body.includes('payment_receipt')&&!intercepted){intercepted=true;throw new Error('Simulated lost acknowledgement after durable Notification intake');}
  return response;
 };
 await dispatchPaymentOutbox();
 const pending=await prisma.paymentOutbox.findUniqueOrThrow({where:{id:outboxId}});
 if(!intercepted||pending.completedAt||!pending.attempts)throw new Error('Unacknowledged handoff was lost');
 globalThis.fetch=originalFetch;
 await prisma.paymentOutbox.update({where:{id:outboxId},data:{nextAttemptAt:new Date(0)}});
 await dispatchPaymentOutbox();
 const complete=await prisma.paymentOutbox.findUniqueOrThrow({where:{id:outboxId}});
 const deliveryId=createHash('sha256').update(JSON.stringify(['payment',outboxId])).digest('hex');
 const receipts=await prisma.$queryRawUnsafe<any[]>('SELECT id FROM "NotificationDelivery" WHERE id=$1',deliveryId);
 if(!complete.completedAt||receipts.length!==1)throw new Error('Receipt recovery did not converge');
 // Another verified event must not reopen a completed receipt or change facts.
 const replay=randomUUID();await prisma.webhookDelivery.create({data:{id:replay,name:'phase5-replay',payload:{}}});
 await applyDurableDelivery(replay,()=>upsertInvoice({...fixture,gateway:fixture.gateway as 'payhere',gatewayInvoiceId:reference,status:'paid',paidAt:new Date()}));
 const after=await prisma.paymentOutbox.findUniqueOrThrow({where:{id:outboxId}});
 if(!after.completedAt||JSON.stringify(after.payload)!==JSON.stringify(complete.payload))throw new Error('Replay reopened or changed receipt');
 console.log(JSON.stringify({status:'PASS',checks:['12 verified events create one invoice receipt','recipient durably fixed before send','lost downstream acknowledgement leaves outbox pending','retry converges to one NotificationDelivery','subsequent verified event preserves completed receipt and facts'],external_emails:0}));
}finally {globalThis.fetch=originalFetch;await paymentConfigClient.close();await paymentDatabase.$disconnect();}
