import type { FastifyRequest, FastifyReply } from 'fastify';
import { Semaphore } from 'redis-semaphore';
import { redis } from '../services/redis.service.js';
import { env } from '../config/env.js';
import { activeRequestsGauge, queueSizeGauge, requestWaitTimeSummary, rejectedRequestsCounter } from '../services/metrics.service.js';
export function onceRelease(release: () => Promise<unknown>, onReleased = () => { }) {
    let released = false;
    return () => { if (released)
        return; released = true; onReleased(); void release().catch(() => { }); };
}
export async function concurrencyLimiter(req: FastifyRequest, reply: FastifyReply) {
    const semaphore = new Semaphore(redis, 'chat-concurrency', env.MAX_CONCURRENT_REQUESTS, { acquireTimeout: env.QUEUE_TIMEOUT_MS });
    let queued = false, acquired = false;
    const start = Date.now();
    try {
        const count = await redis.incr('chat-queue-size');
        queued = true;
        queueSizeGauge.set(count);
        if (count > env.MAX_QUEUE_SIZE) {
            rejectedRequestsCounter.inc({ reason: 'queue_full' });
            return reply.status(429).send({type:'error',outcome:'failure',code:'CAPACITY_BUSY',phase:'capacity',status:429,retryable:true,message:'Server is busy. Please retry.'});
        }
        await semaphore.acquire();
        acquired = true;
        activeRequestsGauge.inc();
        const release = onceRelease(() => semaphore.release(), () => activeRequestsGauge.dec());
        (req as any).releaseConcurrencyPermit = release;
        reply.raw.once('finish', release);
        reply.raw.once('close', release);
        req.raw.once('aborted', release);
        if (reply.raw.destroyed || req.raw.aborted)
            release();
        requestWaitTimeSummary.observe(Date.now() - start);
    }
    catch {
        if (acquired)
            (req as any).releaseConcurrencyPermit?.();
        return reply.status(503).send({type:'error',outcome:'failure',code:'CAPACITY_UNAVAILABLE',phase:'capacity',status:503,retryable:true,message:'Capacity unavailable. Please retry.'});
    }
    finally {
        if (queued) {
            try {
                queueSizeGauge.set(Math.max(0, await redis.decr('chat-queue-size')));
            }
            catch {
                req.log.warn('Queue counter update failed');
            }
        }
    }
}
