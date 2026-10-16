import { Router } from 'express';
import { proxyHandler } from '../controllers/proxy.controller.js';

const router = Router();

// Forward all analytics request paths
router.all('/*', proxyHandler);

export default router;
