import { Router } from 'express';
import { sseHandler } from '../controllers/sse.controller.js';
import { proxyHandler } from '../controllers/proxy.controller.js';
import { sseHeadersMiddleware } from '../middleware/sseHeaders.middleware.js';

const router = Router();

// Route all SSE chat streaming messages through sseHeadersMiddleware and sseHandler
router.use((req, res, next) => {
  const isMessageEndpoint = req.method === 'POST' && (req.path.includes('/message') || req.headers['accept']?.includes('text/event-stream'));
  if (isMessageEndpoint) {
    return sseHeadersMiddleware(req, res, () => sseHandler(req, res, next));
  }
  next();
});

// All non-streaming REST requests go to generic proxy
router.all('/*', proxyHandler);

export default router;
