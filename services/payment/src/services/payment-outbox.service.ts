import { prisma, paymentDatabase } from '../db/prisma.js';
import { paymentTransaction } from '../db/transaction-context.js';
import { getEntitlements } from '../../../../shared/entitlements.mjs';

export async function deferPaymentEffect(kind:string, payload:Record<string,unknown>):Promise<boolean> {
  const context=paymentTransaction.getStore();
  if(!context) return false;
  const id=kind==='entitlements' ? `entitlements:${payload.userId}` : kind==='receipt' ? `receipt:${payload.invoiceId}` : `${context.eventId}:${context.sequence++}:${kind}`;
  // A receipt belongs to an invoice, even when several verified events mention
  // that invoice. Preserve its original facts and delivery acknowledgement.
  await prisma.paymentOutbox.upsert({where:{id},create:{id,kind,payload:payload as any},update:kind==='receipt'?{}:{payload:payload as any,completedAt:null,attempts:0,nextAttemptAt:new Date()}});
  return true;
}

/** A DB lock serializes reducers across replicas, including the processed claim.
 * Delivery completion, business writes, event claim and outbox commit together.
 */
export async function applyDurableDelivery(id:string, process:()=>Promise<void>) {
  await paymentDatabase.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(48070001)`;
    const delivery=await tx.webhookDelivery.findUnique({where:{id}});
    if(!delivery) throw new Error('No durable verified webhook delivery');
    if(delivery.completedAt)return;
    await paymentTransaction.run({tx,eventId:id,sequence:0},process);
    await tx.webhookDelivery.update({where:{id},data:{completedAt:new Date()}});
  },{timeout:20000,maxWait:20000});
}

/** Failed rows are retained. Retry timing prevents a failing dependency spin. */
export async function dispatchPaymentOutbox() {
  const pending=await prisma.paymentOutbox.findMany({where:{completedAt:null,nextAttemptAt:{lte:new Date()}},orderBy:{updatedAt:'asc'},take:50});
  const helpers=await import('./subscription.service.js');
  for(const row of pending) {
    try {
      await paymentDatabase.$transaction(async tx=>{
        // Same lock as reducers: an old HTTP update cannot finish after a newer reducer.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(48070001)`;
        const fresh=await tx.paymentOutbox.findUnique({where:{id:row.id}});
        if(!fresh || fresh.completedAt)return;
        const data=fresh.payload as Record<string,any>;
        if(fresh.kind==='receipt'&&!data.email) {
          // Commit the resolved recipient before the first send. A profile edit
          // or worker crash can then never change a retry's fingerprint.
          const email=await helpers.resolveReceiptRecipient(data.userId);
          await tx.paymentOutbox.update({where:{id:row.id},data:{payload:{...data,email}}});
          return;
        }
        if(fresh.kind==='entitlements') {
          const policy=await getEntitlements(data.userId);
          await helpers.syncPlanEntitlements(data.userId,policy.plan);
        } else if(fresh.kind==='receipt')await helpers.deliverPaymentReceipt(data,row.id);
        else if(fresh.kind==='notification')await helpers.queueNotification(data.userId,data.type,row.id);
        else if(fresh.kind==='automation')await helpers.emitAutomationEvent(data.event,data.payload,row.id);
        else if(fresh.kind==='analytics')await helpers.deliverProductEvent(data.userId,data.eventName,data.properties);
        else throw new Error('Unknown payment outbox effect');
        await tx.paymentOutbox.update({where:{id:row.id},data:{completedAt:new Date()}});
      },{timeout:25000,maxWait:5000});
    } catch {
      await prisma.paymentOutbox.updateMany({where:{id:row.id,completedAt:null,updatedAt:row.updatedAt},data:{attempts:{increment:1},nextAttemptAt:new Date(Date.now()+Math.min(3600000,1000*2**Math.min(row.attempts,12)))}});
    }
  }
}
