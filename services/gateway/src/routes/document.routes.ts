import { Router } from 'express';
import { proxyHandler } from '../controllers/proxy.controller.js';

const router = Router();

// Forward all document and template request paths
router.all('/*', proxyHandler);

export default router;
