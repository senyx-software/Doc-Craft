import {createHash,randomUUID} from 'node:crypto';
import type {Queue} from 'bullmq';
import {signedJob} from '../../../../shared/queue-auth.mjs';
import {getDbPool} from './db.service.js';

/** PostgreSQL acceptance, not Redis enqueue, is the downstream delivery receipt. */
export async function acceptDelivery(caller:string,type:string,payload:Record<string,unknown>,key?:string) {
  const id=createHash('sha256').update(JSON.stringify([caller,key||randomUUID()])).digest('hex');
  const fingerprint=createHash('sha256').update(JSON.stringify({type,payload})).digest('hex');
  const result=await getDbPool().query(
    `INSERT INTO "NotificationDelivery" (id,type,payload,fingerprint) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id RETURNING fingerprint,"completedAt"`,
    [id,type,JSON.stringify(payload),fingerprint]);
  if(result.rows[0].fingerprint!==fingerprint)throw Object.assign(new Error('Idempotency key reused with different notification'),{statusCode:409});
  return {id,completed:!!result.rows[0].completedAt};
}

/** Read the durable payload; a stale signed Redis envelope cannot change it. */
export async function pendingDelivery(id:string) {
  const result=await getDbPool().query('SELECT id,type,payload FROM "NotificationDelivery" WHERE id=$1 AND "completedAt" IS NULL',[id]);
  return result.rows[0] as {id:string;type:string;payload:Record<string,any>}|undefined;
}
export async function completeDelivery(id:string) {
  await getDbPool().query(`UPDATE "NotificationDelivery" SET "completedAt"=NOW(),payload='{}'::jsonb WHERE id=$1 AND "completedAt" IS NULL`,[id]);
}
/** Provider keys expire after 24h: hold uncertain old attempts for reconciliation. */
export async function beginDeliveryAttempt(id:string) {
  const result=await getDbPool().query(`UPDATE "NotificationDelivery" SET
    "attemptStartedAt"=COALESCE("attemptStartedAt",NOW()),
    "requiresReview"="requiresReview" OR COALESCE("attemptStartedAt"<NOW()-INTERVAL '23 hours',false)
    WHERE id=$1 AND "completedAt" IS NULL RETURNING "requiresReview"`,[id]);
  if(!result.rows.length || result.rows[0].requiresReview)throw new Error('Notification requires provider receipt reconciliation');
}

/** Rebuild lost queue jobs. Pending rows survive crashes, queue loss and retries. */
export async function projectDeliveries(queue:Queue) {
  const rows=await getDbPool().query('SELECT id,type FROM "NotificationDelivery" WHERE "completedAt" IS NULL AND NOT "requiresReview" AND "nextAttemptAt"<=NOW() ORDER BY "nextAttemptAt",id LIMIT 50');
  for(const row of rows.rows) {
    try {
      const old=await queue.getJob(row.id);
      if(old) {
        const state=await old.getState();
        if(state!=='failed' && state!=='completed')continue;
        await old.remove();
      }
      const signed=await signedJob('email_queue_notification',row.type,{durableDeliveryId:row.id},row.id);
      await queue.add(row.type,signed.data,{...signed.opts,attempts:3,backoff:{type:'exponential',delay:1000}});
    } finally {
      // Bound retry and rotate through the backlog even on queue failure.
      await getDbPool().query('UPDATE "NotificationDelivery" SET "nextAttemptAt"=NOW()+INTERVAL \'15 seconds\' WHERE id=$1 AND "completedAt" IS NULL',[row.id]);
    }
  }
}
export function startDeliveryRecovery(queue:Queue) {
  let active:Promise<void>|undefined;
  const tick=()=>{if(!active)active=projectDeliveries(queue).catch(()=>{console.warn('[Notification Service] Durable queue reconstruction will retry');}).finally(()=>{active=undefined;});};
  const timer=setInterval(tick,5000);timer.unref();tick();
  return async()=>{clearInterval(timer);await active;};
}
