import {fastifyTlsOptions} from '../../../shared/server-tls.mjs';
import {dependenciesReady} from '../../../shared/readiness.mjs';
import {safeLoggerOptions} from '../../../shared/logging.mjs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import metricsPlugin from 'fastify-metrics';
import { prisma } from './db/prisma.js';
import cookie from '@fastify/cookie';
import oauthPlugin from '@fastify/oauth2';
import { authRoutes } from './routes/auth.routes.js';
import { internalRoutes } from './routes/internal.routes.js';
import dotenv from 'dotenv';
import path from 'path';
import { authorizeService } from '../../../shared/service-auth.mjs';

dotenv.config({ path: [
  path.resolve(process.cwd(), 'auth.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env')
] });

const server = Fastify({...fastifyTlsOptions(),
  logger: process.env.NODE_ENV !== 'production' ? {
    ...safeLoggerOptions,
    transport: {
      target: 'pino-pretty',
    },
  } : safeLoggerOptions,
  trustProxy: process.env.TRUSTED_PROXY_IPS ? JSON.parse(process.env.TRUSTED_PROXY_IPS) : false,
});

async function main() {
  server.addHook('preValidation',async(request,reply)=>{
    if(request.url.split('?')[0]!=='/metrics') return;
    try {await authorizeService('auth',request);}
    catch(error){return reply.status((error as {statusCode?:number}).statusCode||503).send({error:'Service authorization rejected'});}
  });
  await server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  await server.register(helmet as any, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production'
  });

  await server.register(metricsPlugin as any, {
    endpoint: '/metrics'
  });

  await server.register(cookie as any, {
    secret: process.env.JWT_SECRET || 'fallback-cookie-secret',
    parseOptions: {}
  });

  // Swagger Documentation Setup
  await server.register(swagger as any, {
    openapi: {
      info: {
        title: 'DocCraft Auth API',
        description: 'Authentication microservice for DocCraft',
        version: '1.0.0'
      },
      servers: [
        { url: 'http://localhost:3011', description: 'Direct Service Local (Port 3011)' },
        { url: 'http://localhost:3001/v1/auth', description: 'API Gateway Proxy (Port 3001)' }
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          },
          UserIdHeader: {
            type: 'apiKey',
            name: 'X-User-Id',
            in: 'header'
          }
        }
      },
      security: [
        { BearerAuth: [] }
      ]
    }
  });

  await server.register(swaggerUi as any, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  await server.register(oauthPlugin as any, {
    name: 'googleOAuth2',
    credentials: {
      client: {
        id: process.env.GOOGLE_CLIENT_ID || 'dummy_id',
        secret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_secret'
      },
      auth: {
        authorizeHost: 'https://accounts.google.com',
        authorizePath: '/o/oauth2/v2/auth',
        tokenHost: 'https://oauth2.googleapis.com',
        tokenPath: '/token'
      }
    },
    startRedirectPath: '/v1/auth/login/google',
    callbackUri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3011/v1/auth/oauth/google/callback',
    scope: ['profile', 'email']
  });

  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(authRoutes);
  await server.register(internalRoutes, { prefix: '/internal' });

  server.get('/ready',async(_request,reply)=>{const ready=await dependenciesReady(()=>prisma.$queryRaw`SELECT 1`);return reply.status(ready?200:503).send({status:ready?'ready':'unavailable'});});
server.get('/health', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', service: 'auth', db: 'connected' };
    } catch (e) {
      server.log.error(e);
      return reply.status(503).send({ status: 'error', service: 'auth', db: 'disconnected' });
    }
  });

  const port = parseInt(process.env.PORT || '3011', 10);
  const host = '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`Auth service running on http://${host}:${port}`);

    // Graceful Shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        server.log.info(`Received ${signal}, initiating graceful shutdown...`);
        await server.close();
        await prisma.$disconnect();
        process.exit(0);
      });
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
