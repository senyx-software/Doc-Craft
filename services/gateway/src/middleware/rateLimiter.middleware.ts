import {requestIp} from '../../../../shared/request-ip.mjs';
import { serviceFetch } from '../../../../shared/service-auth.mjs';
import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { gatewayConfigClient } from '../services/configClient.service.js';

// Init Redis connection
const redis = new Redis(env.REDIS_URL);

redis.on('error', (err: Error) => {
  console.error('[gateway/redis] Rate Limiter Redis Connection Error:', err);
});

// Paddle verified IPs list from spec
const PADDLE_IPS = new Set([
  '34.194.127.46',
  '54.234.237.108',
  '3.208.120.145',
  '44.226.236.210',
  '44.241.183.62',
  '100.20.172.113',
]);

function getClientIp(req: Request): string {
  return requestIp(req);
}

/**
 * reportRateLimitViolation — fire-and-forget report to admin-api so a real
 * 429 block actually shows up on the Rate Limit Violations page, instead of
 * only ever reaching this process's own stdout. Never awaited from the
 * request path: a slow/unreachable admin-api must not delay the 429 response.
 */
function reportRateLimitViolation(ip: string, groupName: string, path: string, limit: number, identifier: string): void {
  serviceFetch('admin-api', `${env.ADMIN_API_SERVICE_URL}/api/v1/admin/security/rate-limit-violation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify({ ip_address: ip, group_name: groupName, path, limit_val: limit, identifier }),
  }).catch((err) => {
    console.warn('[gateway/security] Failed to report rate limit violation to admin-api:', err);
  });
}

/**
 * rateLimiterMiddleware — Redis-backed sliding window rate limiter.
 */
export async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = req.path;
  const method = req.method;
  const ip = getClientIp(req);

  // 1. Check if payment webhook route — skip rate limiting, check source IP ranges instead (Tech spec 11.3)
  if (path.startsWith('/v1/payment/webhook/')) {
    if (env.NODE_ENV !== 'production') {
      next();
      return;
    }

    // Resolve configured webhook IP allowlist (or fallback to hardcoded Paddle list)
    const isAllowedIp = 
      env.WEBHOOK_ALLOWED_IPS.includes(ip) || 
      (path === '/v1/payment/webhook/paddle' && PADDLE_IPS.has(ip));

    if (!isAllowedIp) {
      console.warn(`[gateway/security] Blocked webhook request from unauthorized IP: ${ip}`);
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Webhook request from unverified origin IP address is forbidden.',
        },
      });
      return;
    }
    next();
    return;
  }

  // 1.5. Real Gateway Maintenance Mode — a super admin can flip this from
  // Settings > Export Data (CSV) via the Dynamic Config Engine's "settings"
  // domain (maintenance_mode field), invalidated instantly across the
  // gateway fleet via the same Redis Pub/Sub channel getConfig() already
  // subscribes to. Admin routes and health checks stay reachable so an
  // admin can always see status and turn it back off; fails open (treats
  // as not-in-maintenance) if config lookup fails, same as the rate-limit
  // fallback below.
  if (path !== '/health' && !path.startsWith('/v1/admin/')) {
    try {
      const settingsConfig = await gatewayConfigClient.getConfig('settings');
      if (settingsConfig.maintenance_mode) {
        res.setHeader('Retry-After', '300');
        res.status(503).json({
          error: {
            code: 'MAINTENANCE_MODE',
            message: 'DocCraft is currently undergoing scheduled maintenance. Please try again shortly.',
          },
        });
        return;
      }
    } catch {
      // Fail open — a config lookup failure must not itself take the platform down.
    }
  }

  // 2. Classify Route Group and determine Limits dynamically via Admin Config
  let groupName = 'public';
  let limit = 20; // Default 20 req/min
  let windowSeconds = 60;
  let identifier = ip;

  const userId = req.headers['x-user-id'] as string | undefined;
  const userPlan = req.headers['x-user-plan'] as string | undefined;
  const userRole = req.headers['x-user-role'] as string | undefined;

  // Try to read dynamic rate limits from Admin Config settings
  try {
    const settingsConfig = await gatewayConfigClient.getConfig('settings');
    const dynamicLimits = settingsConfig.rate_limits || {};

    if (path.startsWith('/v1/auth/')) {
      groupName = 'auth';
      limit = dynamicLimits.auth || 10;
      identifier = ip;
    } else if (userRole === 'admin' || path.startsWith('/v1/admin/')) {
      groupName = 'admin';
      limit = dynamicLimits.admin || 200;
      identifier = userId || ip;
    } else if (userId) {
      groupName = 'user';
      limit = dynamicLimits.user || 100;
      identifier = userId;
    } else if (dynamicLimits.public) {
      limit = dynamicLimits.public;
    }
  } catch {
    // Fallback to defaults
    if (path.startsWith('/v1/auth/')) {
      groupName = 'auth';
      limit = 10;
      identifier = ip;
    } else if (userRole === 'admin' || path.startsWith('/v1/admin/')) {
      groupName = 'admin';
      limit = 200;
      identifier = userId || ip;
    } else if (userId) {
      groupName = 'user';
      limit = 100;
      identifier = userId;
    }
  }

  const key = `rate_limit:${groupName}:${identifier}`;
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;

  try {
    // Sliding window using Redis ZSET
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, cutoff);
    multi.zcard(key);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.expire(key, windowSeconds);
    
    const results = await multi.exec();
    if (!results) {
      next();
      return;
    }

    // results[1] contains [err, count] from zcard
    const count = results[1][1] as number;

    if (count >= limit) {
      reportRateLimitViolation(ip, groupName, path, limit, identifier);
      res.setHeader('Retry-After', windowSeconds);
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Limit is ${limit} requests per minute for this endpoint.`,
          requestId: (req.headers['x-request-id'] as string) || '',
        },
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[gateway/limiter] Rate Limiter failure, failing open:', err);
    next(); // Fail open on Redis error to maintain platform availability
  }
}
