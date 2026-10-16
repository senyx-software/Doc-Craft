import type { Request, Response } from 'express';
import { services } from '../config/services.config.js';

interface HealthCheckStatus {
  status: 'ok' | 'error' | 'timeout';
  latencyMs?: number;
}

/**
 * healthCheck — returns gateway liveness check (200 OK).
 */
export function healthCheck(req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    service: 'gateway',
    timestamp: new Date().toISOString(),
  });
}

/**
 * deepHealthCheck — queries all configured downstream microservices in parallel.
 */
export async function deepHealthCheck(req: Request, res: Response): Promise<void> {
  const serviceChecks: Record<string, HealthCheckStatus> = {};
  
  const promises = Object.entries(services).map(async ([key, value]) => {
    const start = Date.now();
    const controller = new AbortController();
    
    // Set a strict 2-second timeout for downstream health endpoints
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      // Fetch /health (or fallback to root / if health fails)
      const response = await fetch(`${value.baseUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (response.ok) {
        serviceChecks[key] = { status: 'ok', latencyMs };
      } else {
        serviceChecks[key] = { status: 'error', latencyMs };
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;
      
      if (err.name === 'AbortError') {
        serviceChecks[key] = { status: 'timeout', latencyMs };
      } else {
        serviceChecks[key] = { status: 'error', latencyMs };
      }
    }
  });

  await Promise.all(promises);

  const allOk = Object.values(serviceChecks).every((check) => check.status === 'ok');

  res.status(allOk ? 200 : 207).json({
    status: allOk ? 'ok' : 'degraded',
    service: 'gateway',
    timestamp: new Date().toISOString(),
    checks: serviceChecks,
  });
}
