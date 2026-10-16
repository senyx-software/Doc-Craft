/** Real PostgreSQL transaction boundary probe. Local isolated harness only. */
import {paymentDatabase,prisma} from '../services/payment/src/db/prisma.js';
import {applyDurableDelivery,deferPaymentEffect} from '../services/payment/src/services/payment-outbox.service.js';
import {paymentConfigClient} from '../services/payment/src/services/paymentConfigClient.service.js';
import {markProcessed} from '../services/payment/src/services/subscription.service.js';
const [mode,id,userId,planId]=process.argv.slice(2);
if(!process.env.DATABASE_URL?.includes('/doccraft_phase4_'))throw new Error('Task-owned database required');
try {
 if(mode==='crash') {
  await applyDurableDelivery(id,async()=>{
   await prisma.checkoutIntent.create({data:{orderId:id,userId,planId,billingCycle:'monthly',amountMinor:100,currency:'USD'}});
   await deferPaymentEffect('phase4-probe',{userId});await markProcessed(id,'probe','phase4-probe');
   process.exit(73); // Deliberate worker death before transaction commit.
  });
 } else {
  await Promise.all(Array.from({length:12},()=>applyDurableDelivery(id,async()=>{
   await prisma.checkoutIntent.create({data:{orderId:id,userId,planId,billingCycle:'monthly',amountMinor:100,currency:'USD'}});
   await deferPaymentEffect('phase4-probe',{userId});await markProcessed(id,'probe','phase4-probe');
  })));
 }
} finally {await paymentConfigClient.close();await paymentDatabase.$disconnect();}
