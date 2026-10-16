/**
 * quota-reset.queue.ts — BullMQ cron producer + worker for the daily reset.
 *
 * Per the SRS this is the one queue that is explicitly NOT retried: a missed
 * reset is reconciled by the next scheduled run, not retried mid-cycle. Each
 * run clears the Redis counters, resets the persisted Quota rows, and writes a
 * QuotaResetLog audit entry. A failed run is logged loudly so it surfaces in
 * the admin infrastructure dashboard.
 *
 *   Queue:    "quota-reset"
 *   Schedule: cron "0 0 * * *" (midnight UTC)
 *   Retry:    none (attempts = 1)
 */

import { Worker, Queue, type Job } from 'bullmq';
import { env } from '../config/env.js';
import { resetAllRecords, logReset } from '../services/quota-sync.service.js';

const QUEUE_NAME = 'quota-reset';
const CRON_MIDNIGHT_UTC = '0 0 * * *';
const REPEATABLE_JOB_ID = 'quota-daily-reset';

let queue: Queue | null = null;
let worker: Worker | null = null;

function connection() {
  const url = new URL(env.REDIS_URL);
  return {
    host:     url.hostname,
    port:     parseInt(url.port || '6379', 10),
    password: decodeURIComponent(url.password) || undefined,
    username: decodeURIComponent(url.username) || undefined,
    ...(url.protocol==='rediss:'?{tls:{}}:{}),
  };
}

/**
 * runDailyReset — the actual reset work. Exported so it can be unit-tested and
 * invoked manually. Clears Redis counters, resets Postgres rows, logs the run.
 */
export async function runDailyReset(triggeredBy = 'cron'): Promise<{ deletedKeys: number; usersReset: number }> {
  // Redis expires each counter at midnight. A delayed cron must never delete
  // reservations made after midnight (or resurrect their refund receipts).
  const deletedKeys = 0;
  const usersReset  = await resetAllRecords();
  await logReset(usersReset, triggeredBy);
  console.log(`[quota-reset] Reset ${usersReset} rows, deleted ${deletedKeys} Redis keys`);
  return { deletedKeys, usersReset };
}

/**
 * startQuotaResetWorker — registers the midnight cron and starts the worker.
 * Call once at app boot.
 */
export async function startQuotaResetWorker(): Promise<void> {
  const conn = connection();

  queue = new Queue(QUEUE_NAME, {
    connection: conn,
    // No retries: a failed run is picked up by the next day's schedule.
    defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
  });

  // Idempotent: the stable jobId dedupes the repeatable across restarts.
  await queue.add('midnight-reset', {}, {
    repeat:   { pattern: CRON_MIDNIGHT_UTC },
    jobId:    REPEATABLE_JOB_ID,
    attempts: 1,
  });
  console.log(`[quota-reset] Cron scheduled: "${CRON_MIDNIGHT_UTC}" (midnight UTC)`);

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      console.log(`[quota-reset] Job ${job.id} triggered — starting daily reset`);
      return runDailyReset('cron');
    },
    { connection: conn },
  );

  worker.on('completed', (job) => {
    console.log(`[quota-reset] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    // Not retried — surface loudly for the admin infrastructure dashboard.
    console.error(JSON.stringify({
      level:        'ERROR',
      source:       'quota-reset',
      jobId:        job?.id,
      failedReason: err?.message,
      note:         'Daily quota reset FAILED — not retried; next run reconciles.',
    }));
  });
}

/** stopQuotaResetWorker — graceful drain on shutdown. */
export async function stopQuotaResetWorker(): Promise<void> {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}
