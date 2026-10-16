import { Router } from 'express';
import { healthCheck, deepHealthCheck } from '../controllers/health.controller.js';
import authRoutes         from './auth.routes.js';
import chatRoutes         from './chat.routes.js';
import quotaRoutes        from './quota.routes.js';
import paymentRoutes      from './payment.routes.js';
import notificationRoutes from './notification.routes.js';
import documentRoutes     from './document.routes.js';
import analyticsRoutes    from './analytics.routes.js';
import adminRoutes        from './admin.routes.js';

const router = Router();

// Liveness and Deep Health Checks
router.get('/ready',async(_req,res)=>{
  const {services}=await import('../config/services.config.js');
  const results=await Promise.all(Object.values(services).map(async service=>{try{return (await fetch(service.baseUrl+'/ready',{signal:AbortSignal.timeout(3500)})).ok;}catch{return false;}}));
  const ready=results.every(Boolean);res.status(ready?200:503).json({status:ready?'ready':'unavailable'});
});
router.get('/health',      healthCheck);
router.get('/health/deep', deepHealthCheck);

// Mount downstream routes
router.use('/v1/auth',         authRoutes);
router.use('/v1/users',        authRoutes);
router.use('/v1/ai',           chatRoutes);
router.use('/v1/chat',         chatRoutes);
router.use('/v1/quota',        quotaRoutes);
router.use('/v1/payment',      paymentRoutes);
router.use('/v1/billing',      paymentRoutes);
router.use('/v1/notification', notificationRoutes);
router.use('/v1/notifications', notificationRoutes);
router.use('/v1/document',     documentRoutes);
router.use('/v1/documents',    documentRoutes);
router.use('/v1/templates',    documentRoutes);
router.use('/v1/analytics',    analyticsRoutes);
router.use('/v1/admin',        adminRoutes);
router.use('/v1/support',      adminRoutes);

export default router;
