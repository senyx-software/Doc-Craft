import { Router } from 'express';
import { proxyHandler } from '../controllers/proxy.controller.js';

const router = Router();

// Route all auth and user requests to proxy handler
router.all('/*', proxyHandler);

export default router;
