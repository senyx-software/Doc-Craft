import { Router } from 'express';
import { proxyHandler } from '../controllers/proxy.controller.js';

const router = Router();

// Forward all notification request paths
router.all('/*', proxyHandler);

export default router;
