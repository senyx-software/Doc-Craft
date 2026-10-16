/**
 * webhookIpAllowlist.ts — IP-based allowlist for webhook endpoints.
 *
 * Per security spec (section 11.3):
 *   "Paddle and PayHere webhooks: Unlimited from verified gateway IPs only"
 *
 * Paddle IP ranges (current as of 2025):
 *   https://developer.paddle.com/api-reference/about/ip-addresses
 *
 * PayHere IPs: PayHere does not publish a fixed IP list, so in production
 * you should also verify via MD5 signature (already done in payhereWebhook
 * controller). The allowlist here is a defence-in-depth layer.
 *
 * In development (NODE_ENV !== 'production'), this middleware is bypassed
 * so you can test with Paddle CLI / ngrok without IP restrictions.
 */

import type { Request, Response, NextFunction } from 'express';

// Paddle published IP ranges for webhook delivery
// Source: https://developer.paddle.com/api-reference/about/ip-addresses
const PADDLE_IPS = new Set([
  '34.194.127.46',
  '54.234.237.108',
  '3.208.120.145',
  '44.226.236.210',
  '44.241.183.62',
  '100.20.172.113',
]);

// PayHere doesn't publish static IPs; we rely on MD5 sig verification instead.
// If PayHere provides you with IPs, add them here.
const PAYHERE_IPS = new Set<string>([
  // e.g. '103.xx.xx.xx'
]);

function getClientIp(req: Request): string {
  // Respect X-Forwarded-For if behind a trusted proxy (e.g. nginx, Cloudflare)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]!.trim();
  }
  return req.socket.remoteAddress ?? '';
}

/**
 * allowPaddleWebhookIps — middleware that only passes Paddle's published IPs.
 * Skipped entirely in development.
 */
export function allowPaddleWebhookIps(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const ip = getClientIp(req);
  if (!PADDLE_IPS.has(ip)) {
    console.warn(`[payment/security] Blocked Paddle webhook from unknown IP: ${ip}`);
    res.status(403).json({ error: 'forbidden', message: 'IP not allowed' });
    return;
  }

  next();
}

/**
 * allowPayhereWebhookIps — middleware for PayHere.
 * Only enforces IP when PAYHERE_IPS set is non-empty; otherwise relies on
 * MD5 signature verification in the controller.
 */
export function allowPayhereWebhookIps(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV !== 'production' || PAYHERE_IPS.size === 0) {
    next();
    return;
  }

  const ip = getClientIp(req);
  if (!PAYHERE_IPS.has(ip)) {
    console.warn(`[payment/security] Blocked PayHere webhook from unknown IP: ${ip}`);
    res.status(403).json({ error: 'forbidden', message: 'IP not allowed' });
    return;
  }

  next();
}
