import {applyDurableDelivery,dispatchPaymentOutbox} from '../services/payment-outbox.service.js';
import {signedJob,verifiedJob} from '../../../../shared/queue-auth.mjs';
/**
 * payment-webhook.queue.ts — BullMQ producer + worker for async webhook processing.
 *
 * Architecture:
 *   - Producer (enqueueWebhookJob): called by the webhook handlers immediately after
 *     returning 200 to the gateway. Jobs are keyed by idempotency ID so BullMQ
 *     deduplicates redelivered webhooks before they even reach the processor.
 *
 *   - Worker (startWebhookWorker): started once at app boot. Routes jobs to the
 *     correct processor (Paddle or PayHere) based on the gateway field.
 *
 * Retry policy (per SRS):
 *   - 3 attempts total
 *   - Exponential backoff: 2^(attempt - 1) × 1 000 ms  → 1s, 2s, 4s
 *
 * Dead-letter behaviour:
 *   - After all retries exhausted, the 'failed' event fires and the job lands in
 *     BullMQ's built-in failed set (queryable via Bull Board or redis-cli).
 *   - We log a structured DLQ entry so it surfaces in the admin dashboard.
 */

import { Queue, Worker, type Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { getRedis } from '../db/redis.js';
import { prisma } from '../db/prisma.js';
import { processPaddleEvent } from '../services/paddle.service.js';
import { processPayhereWebhook, type PayhereWebhookPayload } from '../services/payhere.service.js';

// ─── Queue name constant ──────────────────────────────────────────────────────

export const PAYMENT_WEBHOOK_QUEUE = 'payment-webhook';

// ─── Job payload types ────────────────────────────────────────────────────────

export interface PaddleWebhookJob {
  gateway: 'paddle';
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
  occurredAt?: string;
}

export interface PayhereWebhookJob extends PayhereWebhookPayload {
  gateway: 'payhere';
}

export type WebhookJob = PaddleWebhookJob | PayhereWebhookJob;

// ─── Producer ─────────────────────────────────────────────────────────────────

let queue: any = null;

function getQueue(): any {
  if (!queue) {
    const q = new Queue<WebhookJob>(PAYMENT_WEBHOOK_QUEUE, {
      connection: getRedis() as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1_000, // 1s → 2s → 4s
        },
        // Keep completed jobs for 24 h for observability; failed jobs kept for 7 days
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 604_800 },
      },
    });

    q.on('error', (err) => {
      console.error('[payment/queue] Queue error:', err);
    });

    queue = q;
  }
  return queue;
}

/**
 * enqueueWebhookJob — adds a webhook event to the processing queue.
 *
 * Uses the idempotency key as the BullMQ job ID. BullMQ will silently discard
 * duplicate job IDs while the original is pending/active/completed, providing
 * a first layer of deduplication before the processor's DB-level idempotency check.
 *
 * @param job        Structured webhook job payload
 * @param idempotencyKey  Unique key for this event (Paddle eventId or payhere:order:status)
 */
export async function enqueueWebhookJob(
  job: WebhookJob,
  idempotencyKey: string,
): Promise<void> {
  const id = createHash('sha256').update(job.gateway+':'+idempotencyKey).digest('hex');
  const delivery = await prisma.webhookDelivery.upsert({
    where: { id }, create: { id, name: idempotencyKey, payload: job as any }, update: {},
  });
  if (delivery.completedAt) return;
  // PostgreSQL is the acknowledgement boundary. Redis clients used by BullMQ
  // deliberately wait through reconnects and must not hold a provider response.
  scheduleReconciliation();

  console.log(`[payment/queue] Enqueued ${job.gateway} job: ${idempotencyKey}`);
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let worker: any = null;
let dispatcher: ReturnType<typeof setInterval> | undefined;
let dispatching: Promise<void> | undefined;

function scheduleReconciliation() {
  if (!dispatching) dispatching = reconcileWebhookDeliveries()
    .catch(() => { console.warn('[payment/queue] Webhook reconciliation unavailable; durable rows retained'); })
    .finally(() => { dispatching = undefined; });
}

async function dispatchDelivery(delivery: {id:string;name:string;payload:unknown}) {
  const existing = await getQueue().getJob(delivery.id);
  if (existing) {
    const state = await existing.getState();
    // Automatic retries are bounded. Exhausted jobs and inbox rows remain for
    // operator reconciliation; never repeatedly replay poison provider data.
    if (state === 'failed' && existing.attemptsMade < 10) await existing.retry();
    return;
  }
  const envelope = await signedJob(PAYMENT_WEBHOOK_QUEUE, delivery.name, delivery.payload, delivery.id);
  await getQueue().add(delivery.name, envelope.data, envelope.opts);
}

export async function reconcileWebhookDeliveries(): Promise<void> {
  const pending = await prisma.webhookDelivery.findMany({where:{completedAt:null},orderBy:{createdAt:'asc'},take:100});
  for (const delivery of pending) await dispatchDelivery(delivery);
  await dispatchPaymentOutbox();
  if(process.env.PAYHERE_APP_ID && process.env.PAYHERE_APP_SECRET) {
    const {reconcilePayhereOrder}=await import('../services/payhere-reconciliation.service.js');
    const subs=await prisma.subscription.findMany({where:{gateway:'payhere',status:{in:['active','past_due']}},orderBy:{payhereSyncAt:{sort:'asc',nulls:'first'}},take:2});
    for(const sub of subs)if(sub.payhereOrderId){await prisma.subscription.update({where:{id:sub.id},data:{payhereSyncAt:new Date()}});try{await reconcilePayhereOrder(sub.payhereOrderId);}catch{console.warn('[payment] Trusted recurring reconciliation pending');}}
  }
}

/**
 * startWebhookWorker — starts the BullMQ worker. Call once at app startup.
 *
 * The worker runs in the same process for simplicity in v1.
 * At scale, extract to a separate worker process/container.
 */
export function startWebhookWorker(): void {
  if (worker) {
    console.warn('[payment/queue] Worker already started — skipping duplicate init');
    return;
  }

  const w = new Worker<WebhookJob>(
    PAYMENT_WEBHOOK_QUEUE,
    async (job: Job<WebhookJob>) => {
      const dataPayload=await verifiedJob(PAYMENT_WEBHOOK_QUEUE,job);
      const {gateway}=dataPayload;

      console.log(
        `[payment/queue] Processing job ${job.id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 3})`,
      );

      await applyDurableDelivery(String(job.id),async()=>{
      if (gateway === 'paddle') {
        const { eventId, eventType, data, occurredAt } = dataPayload as PaddleWebhookJob;
        await processPaddleEvent({ eventId, eventType, data, occurredAt });
      } else if (gateway === 'payhere') {
        const { gateway: _g, ...payload } = dataPayload as PayhereWebhookJob;
        await processPayhereWebhook(payload as PayhereWebhookPayload);
      } else {
        throw new Error(`[payment/queue] Unknown gateway in job ${job.id}: ${gateway}`);
      }
      });
      await dispatchPaymentOutbox();
    },
    {
      connection: getRedis() as any,
      concurrency: 5, // Process up to 5 webhook jobs in parallel
    },
  );

  // ── Event listeners ─────────────────────────────────────────────────────────

  w.on('completed', (job) => {
    console.log(`[payment/queue] Job completed: ${job.id}`);
  });

  w.on('failed', (job, err) => {
    // Structured DLQ log — surfaced in admin infrastructure dashboard
    const dlqEntry = {
      level: 'ERROR',
      source: 'payment-webhook-dlq',
      jobId: job?.id,
      jobName: job?.name,
      gateway: job?.data?.gateway,
      attempts: job?.attemptsMade,
      failedReason: err?.message,
      timestamp: new Date().toISOString(),
    };
    console.error('[payment/queue] DLQ — job exhausted all retries:', JSON.stringify(dlqEntry));
  });

  w.on('error', (err) => {
    console.error('[payment/queue] Worker error:', err);
  });

  worker = w;
  dispatcher = setInterval(scheduleReconciliation, 30_000);
  dispatcher.unref();
  scheduleReconciliation();

  console.log('[payment/queue] Webhook worker started');
}

/**
 * stopWebhookWorker — gracefully drains the worker. Call on SIGTERM.
 */
export async function stopWebhookWorker(): Promise<void> {
  if (dispatcher) clearInterval(dispatcher);
  await dispatching;
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[payment/queue] Worker stopped');
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
