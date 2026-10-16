/**
 * webhook-verify.middleware.ts — webhook verification strategies.
 *
 * Two distinct strategies, one per gateway, run AFTER the raw-body parser for
 * that route and BEFORE the controller — so the signature/hash is always
 * checked against the untrusted body before any handler treats it as data.
 * Requests that fail verification are rejected here and never reach the queue.
 *
 *   Paddle  → Paddle-Signature header, HMAC-SHA256 (verified via the SDK)
 *   PayHere → md5sig field, MD5 hash against the merchant secret
 */

import {env} from '../config/env.js';
import type { Request, Response, NextFunction } from 'express';
import type { EventEntity } from '@paddle/paddle-node-sdk';
import { verifyPaddleSignature } from '../services/paddle.service.js';
import { verifyWebhookHash, type PayhereWebhookPayload } from '../services/payhere.service.js';

/** Request augmented with the verified Paddle event, set by verifyPaddleWebhook. */
export interface PaddleWebhookRequest extends Request {
  paddleEvent: EventEntity;
}

/**
 * verifyPaddleWebhook — validates the Paddle-Signature header against the raw
 * body. On success attaches the parsed event as `req.paddleEvent`.
 *
 * Requires the route to use `express.raw({ type: 'application/json' })` first,
 * so `req.body` is the raw Buffer needed for signature verification.
 */
export async function verifyPaddleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if(!env.PADDLE_WEBHOOK_SECRET || !env.PADDLE_API_KEY){res.status(503).json({error:'provider_unconfigured'});return;}
  const signature = req.headers['paddle-signature'] as string | undefined;
  if (!signature) {
    res.status(400).json({ error: 'missing_signature', message: 'Paddle-Signature header required' });
    return;
  }

  try {
    const rawBody = req.body as Buffer;
    const event = await verifyPaddleSignature(rawBody.toString('utf-8'), signature);

    if (!event) {
      res.status(400).json({ error: 'invalid_signature', message: 'Paddle signature verification failed' });
      return;
    }

    (req as PaddleWebhookRequest).paddleEvent = event;
    next();
  } catch (err) {
    console.error('[payment/paddle] Webhook verification error:', err);
    res.status(400).json({ error: 'webhook_error', message: 'Failed to verify Paddle webhook' });
  }
}

/**
 * verifyPayhereWebhook — validates the PayHere md5sig against the merchant
 * secret. Requires the route to use `express.urlencoded()` first.
 */
export function verifyPayhereWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if(!env.PAYHERE_MERCHANT_ID || !env.PAYHERE_MERCHANT_SECRET){res.status(503).json({error:'provider_unconfigured'});return;}
  const payload = req.body as PayhereWebhookPayload;

  const isValid = verifyWebhookHash({
    merchant_id:      payload.merchant_id,
    order_id:         payload.order_id,
    payhere_amount:   payload.payhere_amount,
    payhere_currency: payload.payhere_currency,
    status_code:      payload.status_code,
    md5sig:           payload.md5sig,
  });

  if (!isValid) {
    console.warn('[payment/payhere] Invalid md5sig for order:', payload.order_id);
    res.status(400).json({ error: 'invalid_signature', message: 'PayHere signature verification failed' });
    return;
  }

  next();
}
