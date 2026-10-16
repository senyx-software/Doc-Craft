import {fastifyTlsOptions} from '../../../shared/server-tls.mjs';
import {dependenciesReady} from '../../../shared/readiness.mjs';
import {safeLoggerOptions} from '../../../shared/logging.mjs';
import {closeNotificationQueue,emailQueue} from './controllers/notification.controller.js';
import {startDeliveryRecovery} from './services/delivery-inbox.service.js';
import {closeDb} from './services/db.service.js';
import {closeServiceAuth} from '../../../shared/service-auth.mjs';
import Fastify from 'fastify';
import dotenv from 'dotenv';
import path from 'path';
import { startEmailWorker } from './worker.js';
import { notificationRoutes } from './routes/notification.routes.js';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

dotenv.config({ path: [
  path.resolve(process.cwd(), 'notification.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env')
] });

const fastify = Fastify({...fastifyTlsOptions(), logger: safeLoggerOptions });

fastify.get('/ready',async(_request,reply)=>{const ready=await dependenciesReady(()=>import('./services/db.service.js').then(module=>module.getDbPool().query('SELECT 1')));return reply.status(ready?200:503).send({status:ready?'ready':'unavailable'});});
fastify.get('/health', async () => {
  return { status: 'ok', service: 'notification', queue: 'listening' };
});
fastify.register(swagger as any, {
  openapi: {
    info: {
      title: 'DocCraft Notification API',
      description: 'Notification microservice for emails and logging',
      version: '1.0.0'
    },
    servers: [
      { url: 'http://localhost:3001/v1/notification', description: 'API Gateway Proxy' },
      { url: 'http://localhost:3016', description: 'Direct Service Local' }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT Bearer token obtained from POST /v1/auth/login'
        }
      }
    },
    security: [
      { BearerAuth: [] }
    ]
  }
});

fastify.register(swaggerUi as any, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
});

fastify.register(notificationRoutes, { prefix: '/notification' });

async function main() {
  const port = parseInt(process.env.PORT || '3012', 10);

  try {
    const worker=startEmailWorker();
    const stopRecovery=startDeliveryRecovery(emailQueue);
    fastify.addHook('onClose',async()=>{await stopRecovery();await worker.close();await closeNotificationQueue();await closeDb();await closeServiceAuth();});
    await fastify.listen({port,host:'0.0.0.0'});
    fastify.log.info('Notification service listening');
    let closing=false;
    const stop=async()=>{if(closing)return;closing=true;const deadline=setTimeout(()=>process.exit(1),25000);deadline.unref();await fastify.close();clearTimeout(deadline);process.exit(0);};
    process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
