import {acceptDelivery} from '../services/delivery-inbox.service.js';
import { FastifyRequest, FastifyReply } from 'fastify';
import * as db from '../services/db.service.js';
import { sendEmail, fetchAdminConfig } from '../services/email.service.js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { validResendSignature, approvedStatusWebhook } from '../security.js';

dotenv.config({ path: path.resolve(process.cwd(), 'notification.env') });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: 1,enableOfflineQueue:false,commandTimeout:5000 });
export const emailQueue = new Queue('email_queue_notification', { connection: connection as any });

export async function getPreferences(req: FastifyRequest, reply: FastifyReply) {
  const query = req.query as any;
  const userId = query.userId || (req.headers['x-user-id'] as string) || 'test-user';
  try {
    const data = await db.getPreferences(userId);
    if (!data) return reply.send({ marketing: true, billing: true, documentReady: true });
    return reply.send(data);
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}

export async function updatePreferences(req: FastifyRequest, reply: FastifyReply) {
  const body = req.body as any;
  const userId = body.userId || (req.headers['x-user-id'] as string) || 'test-user';
  const type = body.type;
  const enabled = body.enabled;
  
  // Map frontend types to db columns
  const updateData: any = {};
  if (type === 'billing') {
    updateData.billing = enabled;
  } else if (type === 'marketing') {
    updateData.marketing = enabled;
  } else if (type === 'documentReady' || type === 'document_ready') {
    updateData.documentReady = enabled;
  }

  try {
    const result = await db.updatePreferences(userId, updateData);
    return reply.send(result);
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}

export async function sendNotification(req: FastifyRequest, reply: FastifyReply) {
  const body = req.body as any;
  const type = body.type || 'verify_email';
  const payload = { ...(body.payload || body), userId: body.userId || body.payload?.userId || "system" };
  const userId = body.userId || payload.userId || 'system';

  try {
    const key=typeof body.idempotencyKey==='string' && body.idempotencyKey.length<=200 ? body.idempotencyKey : undefined;
    const receipt=await acceptDelivery((req as any).serviceCaller||'notification',type,payload,key);
    return reply.send({ status: receipt.completed?'completed':'durably_accepted',type,deliveryId:receipt.id });
  } catch (queueErr: any) {
    return reply.status(queueErr.statusCode===409?409:503).send({error:queueErr.statusCode===409?'Idempotency key conflicts with accepted notification':'Notification durable intake unavailable; retry with the same idempotency key'});
  }
}

export async function getLogs(req: FastifyRequest, reply: FastifyReply) {
  const query = req.query as any;
  const userId = query.userId || (req.headers['x-user-id'] as string) || 'test-user';
  try {
    const data = await db.getLogs(userId);
    return reply.send(data);
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}

export async function getAdminLogs(req: FastifyRequest, reply: FastifyReply) {
  const query = req.query as any;
  const statusFilter = query.status as string | undefined;
  const typeFilter = query.type as string | undefined;
  const limit = parseInt(query.limit || '50', 10);
  try {
    const data = await db.getAdminLogs({ statusFilter, typeFilter, limit });
    return reply.send(data);
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}

/**
 * receiveResendWebhook — real backing for the admin "Status Webhook URL"
 * setting, which used to be stored and displayed but relayed to nothing.
 *
 * Resend calls THIS endpoint (once an admin registers its public URL in
 * Resend's dashboard — Webhooks → Add Endpoint — that registration is a
 * manual, external step this code can't perform) whenever a tracked email's
 * delivery status changes (sent/delivered/bounced/complained/opened/clicked).
 * We normalize the event and relay it via POST to whatever URL the admin
 * configured as `webhook_url`, so that URL actually receives real delivery
 * events instead of being pure decoration.
 *
 * Note: without a configured RESEND_WEBHOOK_SECRET, this does not verify
 * Resend's Svix request signature — acceptable for now since no secret is
 * provisioned anywhere in this codebase yet, but anyone standing this up in
 * production should add signature verification before relying on it.
 */
export async function receiveResendWebhook(req: FastifyRequest, reply: FastifyReply) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return reply.status(503).send({ error: 'Webhook signing is not configured' });
  if (!validResendSignature((req as any).rawBody || '', req.headers, secret)) return reply.status(401).send({ error: 'Invalid webhook signature' });
  const event = req.body as any;

  try {
    const adminConfig = await fetchAdminConfig();
    const webhookUrl = adminConfig?.settings?.webhook_url;

    console.log(`[Resend Webhook] Received event: ${event?.type}`);

    if (!webhookUrl) {
      return reply.send({ received: true, relayed: false, reason: 'No Status Webhook URL configured' });
    }

    const relayPayload = {
      source: 'doccraft-notification-service',
      resend_event_type: event?.type,
      email_id: event?.data?.email_id,
      to: event?.data?.to,
      subject: event?.data?.subject,
      occurred_at: event?.created_at || new Date().toISOString(),
    };

    try {
      const relayRes = await fetch(approvedStatusWebhook(webhookUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relayPayload),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      return reply.send({ received: true, relayed: true, relay_status: relayRes.status });
    } catch (relayErr: any) {
      console.warn('[Resend Webhook] Approved status relay failed');
      return reply.send({ received: true, relayed: false, reason: 'Status webhook delivery failed' });
    }
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}

export async function closeNotificationQueue(){await emailQueue.close();await connection.quit();}
