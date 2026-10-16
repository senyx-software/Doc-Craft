import {signedJob} from '../../../../shared/queue-auth.mjs';
import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { Queue } from 'bullmq';
import {Redis} from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'auth.env') });

const connection = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null}) : {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3012';

let emailQueue: Queue | null = null;
try {
  emailQueue = new Queue('email_queue_auth', { connection:connection as any });
} catch (err: any) {
  console.warn('[Auth email.service] Redis BullMQ queue initialization warning:', err.message);
}

async function dispatchNotification(type: string, payload: any) {
  let queued = false;
  if (emailQueue) {
    try {
      const envelope=await signedJob('email_queue_auth',type,payload);
      await emailQueue.add(type,envelope.data,envelope.opts);
      queued = true;
    } catch (err: any) {
      console.warn(`[Auth email.service] BullMQ queue add failed for ${type}:`, err.message);
    }
  }

  // If BullMQ add failed or queue not available, fallback to direct HTTP post to Notification service
  if (!queued) {
    try {
      await serviceFetch('notification', `${notificationServiceUrl}/notification/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET || '' },
        body: JSON.stringify({
          userId: payload.userId || 'system',
          type,
          email: payload.email,
          payload
        })
      });
      console.log(`[Auth email.service] Fallback HTTP notification sent for ${type} to ${payload.email}`);
    } catch (err: any) {
      console.error(`[Auth email.service] Direct HTTP dispatch error for ${type}:`, err.message);
    }
  }
}

export async function sendWelcomeEmail(email: string, name?: string) {
  await dispatchNotification('welcome', {
    email: email,
    fullName: name,
    userId: 'system'
  });
}

export async function sendPasswordResetEmail(email: string, token: string, name?: string) {
  await dispatchNotification('password_reset', {
    email: email,
    fullName: name,
    token: token,
    userId: 'system'
  });
}

export async function sendVerificationEmail(email: string, token: string, name?: string) {
  await dispatchNotification('verify_email', {
    email: email,
    fullName: name,
    token: token,
    userId: 'system'
  });
}
