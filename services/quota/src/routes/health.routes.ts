import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { getRedis } from '../db/redis.js';

const router = Router();

/**
 * GET /health
 * Pings both Redis and Postgres to confirm liveness.
 * Used by Docker health checks and the admin infrastructure dashboard.
 */
router.get('/', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'error'> = {
    redis:    'error',
    postgres: 'error',
  };

  try {
    const redis = getRedis();
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    // left as 'error'
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = 'ok';
  } catch {
    // left as 'error'
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  res.status(allOk ? 200 : 503).json({
    status:  allOk ? 'ok' : 'degraded',
    service: 'quota',
    checks,
  });
});

export default router;
