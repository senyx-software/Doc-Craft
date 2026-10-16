import {verifiedJob} from '../../../shared/queue-auth.mjs';
import { Worker, Job, DelayedError } from 'bullmq';
import { Redis } from 'ioredis';
import { sendEmail, fetchAdminConfig } from './services/email.service.js';
import { logNotification, checkNotificationPreference } from './services/db.service.js';
import dotenv from 'dotenv';
import path from 'path';
import {pendingDelivery,completeDelivery,beginDeliveryAttempt} from './services/delivery-inbox.service.js';

dotenv.config({ path: path.resolve(process.cwd(), 'notification.env') });

const RATE_LIMIT_KEY = 'notification:email_rate_window';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_RETRY_DELAY_MS = 10_000;

/**
 * Real send-rate throttling for the admin-configured "Rate Limit
 * (emails/min)" setting — a Redis sliding window, same pattern as the
 * Gateway's rateLimiterMiddleware. Admin's `rate_limit_per_minute` used to be
 * stored and displayed but never actually enforced anywhere; this makes it
 * genuinely cap outbound send rate instead of being decorative.
 */
export async function isUnderRateLimit(connection: Redis, limitPerMinute: number): Promise<boolean> {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  const multi = connection.multi();
  multi.zremrangebyscore(RATE_LIMIT_KEY, 0, cutoff);
  multi.zcard(RATE_LIMIT_KEY);
  multi.zadd(RATE_LIMIT_KEY, now, `${now}-${Math.random()}`);
  multi.expire(RATE_LIMIT_KEY, 60);
  const results = await multi.exec();
  if (!results || results.some(([error]) => error) || typeof results[1]?.[1] !== 'number') {
    throw new Error('Email rate limit unavailable');
  }

  const countBeforeThisSend = results[1]?.[1] as number;
  return countBeforeThisSend < limitPerMinute;
}

export function startEmailWorker() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  console.log(`Starting Email Worker for email_queue...`);

  const workers=['email_queue_auth','email_queue_document','email_queue_notification'].map(queueName=>new Worker(queueName, async (job: Job, token?: string) => {
    let data=await verifiedJob(queueName,job);
    const deliveryId=queueName==='email_queue_notification' && typeof data.durableDeliveryId==='string'?data.durableDeliveryId:undefined;
    if(deliveryId) {
      const durable=await pendingDelivery(deliveryId);
      if(!durable)return {skipped:true,reason:'Durable receipt already completed'};
      if(durable.type!==job.name)throw new Error('Durable notification type mismatch');
      data=durable.payload;
    }
    const {userId}=data;

    const adminConfig = await fetchAdminConfig();
    const rateLimitPerMinute = adminConfig?.settings?.rate_limit_per_minute;
    if (typeof rateLimitPerMinute === 'number' && rateLimitPerMinute > 0) {
      const allowed = await isUnderRateLimit(connection, rateLimitPerMinute);
      if (!allowed) {
        console.log(`[Job ${job.id}] Admin-configured rate limit (${rateLimitPerMinute}/min) reached — delaying ${RATE_LIMIT_RETRY_DELAY_MS}ms.`);
        await job.moveToDelayed(Date.now() + RATE_LIMIT_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }
    }

    if (userId) {
      const allowed = await checkNotificationPreference(userId, job.name);
      if (!allowed) {
        console.log(`[Job ${job.id}] User ${userId} opted out of ${job.name}. Skipping.`);
        if(deliveryId)await completeDelivery(deliveryId);
        return { skipped: true, reason: 'User preference opted out' };
      }
    }

    console.log(`[Job ${job.id}] Processing ${job.name}`);

    try {
      const result = await sendEmail(job.name, data, 'doccraft-'+queueName+'-'+job.id,deliveryId?()=>beginDeliveryAttempt(deliveryId):undefined);

      await logNotification({
        userId: userId || 'system',
        type: job.name,
        channel: 'email',
        status: (result as {skipped?:boolean}|null)?.skipped?'skipped':'sent',
        payload: data,
        dedupeKey: job.id || String(Date.now())
      });

      if(deliveryId)await completeDelivery(deliveryId);

      return result;
    } catch (error: any) {
      console.error(`[Job ${job.id}] Delivery failed; retained for retry`);

      await logNotification({
        userId: userId || 'system',
        type: job.name,
        channel: 'email',
        status: 'failed',
        payload: data,
        dedupeKey: job.id || String(Date.now())
      });

      throw error;
    }
  }, { connection: connection as any  }));
  return {close:async()=>{await Promise.all(workers.map(worker=>worker.close()));await connection.quit();}};
}
