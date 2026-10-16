import { Router } from 'express';
import { proxyHandler } from '../controllers/proxy.controller.js';

const router = Router();

// Proxy all admin control plane requests to admin-api microservice
router.all('/*', proxyHandler);

export default router;
