import {dependenciesReady} from '../../../shared/readiness.mjs';
import {prisma} from './db/prisma.js';
import { captureRawServiceBody } from '../../../shared/service-auth.mjs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import paymentRoutes from './routes/payment.routes.js';
import healthRoutes  from './routes/health.routes.js';
import { seedPlans } from './services/plan.service.js';
import { setupSwagger } from './swagger.js';
import { startWebhookWorker, stopWebhookWorker } from './queues/payment-webhook.queue.js';

export function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));

  // Global JSON body parser — but NOT on webhook routes, which must receive the
  // raw body for signature/hash verification. Letting express.json() consume the
  // stream first would break Paddle's raw-body signature check.
  const jsonParser = express.json({ limit: '100kb', verify: (request, _response, buffer) => captureRawServiceBody(request, buffer) });
  app.use((req, res, next) => {
    if (req.path.startsWith('/v1/payment/webhook/')) {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  app.get('/ready',async(_req,res)=>{const ready=await dependenciesReady(()=>prisma.$queryRaw`SELECT 1`);res.status(ready?200:503).json({status:ready?'ready':'unavailable'});});
  app.use('/health',       healthRoutes);
  app.use('/v1/payment',   paymentRoutes);

  // ─── Swagger UI ─────────────────────────────────────────────────────────────
  setupSwagger(app);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Route not found' });
  });

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[payment] Unhandled error:', err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  });

  // Seed default plans on startup (idempotent)
  seedPlans().catch((err) => {
    console.error('[payment] Plan seeding failed:', err);
  });

  // Start the BullMQ webhook worker
  startWebhookWorker();

  return app;
}
