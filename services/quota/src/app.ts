import {dependenciesReady} from '../../../shared/readiness.mjs';
import {prisma} from './db/prisma.js';
import { captureRawServiceBody } from '../../../shared/service-auth.mjs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import quotaRoutes  from './routes/quota.routes.js';
import healthRoutes from './routes/health.routes.js';
import { startQuotaResetWorker, stopQuotaResetWorker } from './queues/quota-reset.queue.js';
import { setupSwagger } from './swagger.js';

export function buildApp() {
  const app = express();
app.set('trust proxy', process.env.TRUSTED_PROXY_IPS ? JSON.parse(process.env.TRUSTED_PROXY_IPS) : false);

  // ─── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ─── CORS — internal only; accept calls from gateway and other services ─────
  // In production this service is not exposed publicly (Docker internal network),
  // but we set CORS defensively in case the port is reached directly.
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));

  // ─── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb', verify: (request, _response, buffer) => captureRawServiceBody(request, buffer) }));

  // ─── Routes ─────────────────────────────────────────────────────────────────
  app.get('/ready',async(_req,res)=>{const ready=await dependenciesReady(()=>prisma.$queryRaw`SELECT 1`);res.status(ready?200:503).json({status:ready?'ready':'unavailable'});});
  app.use('/health',    healthRoutes);
  app.use('/v1/quota',  quotaRoutes);

  // ─── Swagger UI ─────────────────────────────────────────────────────────────
  setupSwagger(app);

  // ─── 404 fallthrough ────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Route not found' });
  });

  // ─── Global error handler ───────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[quota] Unhandled error:', err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  });

  // ─── Start BullMQ quota-reset cron worker ───────────────────────────────────
  // Fire-and-forget; worker runs in background and survives the buildApp() call.
  startQuotaResetWorker().catch((err) => {
    console.error('[quota] Failed to start quota-reset worker:', err);
  });

  return app;
}
