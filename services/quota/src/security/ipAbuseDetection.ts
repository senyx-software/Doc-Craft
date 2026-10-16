import {requestIp} from '../../../../shared/request-ip.mjs';
import { serviceFetch } from '../../../../shared/service-auth.mjs';
/**
 * ipAbuseDetection.ts — per-IP anomaly detection layered on top of the quota
 * counters (SRS Security Architecture).
 *
 * The per-user quota already caps documents, but a single IP fanning
 * rapid-fire /check or /increment calls across MANY different user IDs is an
 * abuse signal even when each individual user is within their limit. We track,
 * per IP over a rolling window, both the request rate and the number of
 * DISTINCT user IDs targeted, and reject (429) + log when either crosses a
 * threshold so the pattern surfaces in the admin infrastructure dashboard.
 *
 * All state lives in Redis and the whole check is one atomic Lua round trip.
 * It fails OPEN: a Redis hiccup must never take down the quota hot path.
 */

import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../db/redis.js';
import { env } from '../config/env.js';

const WINDOW_SECONDS      = 60;
const MAX_REQUESTS        = 300; // requests / IP / window
const MAX_DISTINCT_USERS  = 30;  // distinct userIds / IP / window

/**
 * reportBotDetection — fire-and-forget report to admin-api so the block
 * actually shows up on the Bot Detection Logs page, not just this process's
 * stdout. Never awaited from the request path: a slow/unreachable admin-api
 * must not delay the 429 response or affect the quota hot path.
 */
function reportBotDetection(ip: string, userAgent: string, reason: string): void {
  serviceFetch('admin-api', `${env.ADMIN_API_SERVICE_URL}/api/v1/admin/security/bot-detection-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify({ ip_address: ip, user_agent: userAgent, reason, risk_score: 0.9, status: 'Blocked' }),
  }).catch((err) => {
    console.warn('[quota/security] Failed to report bot detection to admin-api:', err);
  });
}

/**
 *   KEYS[1] = count key, KEYS[2] = distinct-users set key
 *   ARGV[1] = window seconds, ARGV[2] = userId
 * Returns {requestCount, distinctUsers}.
 */
const TRACK = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
redis.call('SADD', KEYS[2], ARGV[2])
if redis.call('TTL', KEYS[2]) < 0 then redis.call('EXPIRE', KEYS[2], ARGV[1]) end
return {c, redis.call('SCARD', KEYS[2])}
`;

function getClientIp(req: Request): string {
  return requestIp(req);
}

/**
 * ipAbuseDetection — Express middleware for the internal quota mutation routes.
 */
export async function ipAbuseDetection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ip = getClientIp(req);
    if (!ip) { next(); return; }

    const userId =
      (req.headers['x-user-id'] as string) ||
      ((req.body as { userId?: string })?.userId) ||
      'unknown';

    const [count, distinct] = (await getRedis().eval(
      TRACK, 2,
      `abuse:ip:${ip}:count`, `abuse:ip:${ip}:users`,
      String(WINDOW_SECONDS), userId,
    )) as [number, number];

    if (count > MAX_REQUESTS || distinct > MAX_DISTINCT_USERS) {
      const reason = count > MAX_REQUESTS
        ? `Exceeded ${MAX_REQUESTS} requests/${WINDOW_SECONDS}s from a single IP`
        : `Single IP targeted ${distinct} distinct user IDs within ${WINDOW_SECONDS}s`;

      console.warn(JSON.stringify({
        level:    'WARN',
        source:   'quota-abuse-detection',
        ip,
        requestCount:  count,
        distinctUsers: distinct,
        window:   `${WINDOW_SECONDS}s`,
        note:     'Anomalous request pattern from single IP across many users',
      }));
      reportBotDetection(ip, req.headers['user-agent'] || 'unknown', reason);
      res.status(429).json({ error: 'rate_limited', message: 'Anomalous request pattern detected' });
      return;
    }

    next();
  } catch (err) {
    // Fail open — never let abuse detection break the quota check.
    console.error('[quota/security] abuse detection error:', err);
    next();
  }
}
