import {fastifyTlsOptions} from '../../../shared/server-tls.mjs';
import {dependenciesReady} from '../../../shared/readiness.mjs';
import {safeLoggerOptions} from '../../../shared/logging.mjs';
import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { db, closeDb } from "./services/db.service.js";
import { mcpRoutes } from "./routes/mcp.routes.js";
import { chatRoutes } from "./routes/chat.routes.js";
import { metricsRoutes } from "./routes/metrics.routes.js";
import { statusRoutes } from "./routes/status.routes.js";
import { internalResourceRoutes } from './routes/internal-resources.routes.js';
import { redis, closeRedis } from "./services/redis.service.js";

import rateLimit from "@fastify/rate-limit";
import { chatRateLimitOptions } from "./middleware/rate-limit.js";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

const fastify = Fastify({...fastifyTlsOptions(),
  logger: safeLoggerOptions,
});

fastify.register(swagger as any, {
  openapi: {
    info: {
      title: "DocCraft Chat & AI Service API",
      description: "LLM session management, MCP integration, prompt guardrails & stream proxy",
      version: "1.0.0",
    },
    servers: [
      { url: "http://localhost:3001/v1/chat", description: "API Gateway Proxy" },
      { url: `http://localhost:${env.PORT}`, description: "Direct Service Local" }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT Bearer token obtained from POST /v1/auth/login"
        }
      }
    },
    security: [
      { BearerAuth: [] }
    ]
  },
});

fastify.register(swaggerUi as any, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false,
  },
});

fastify.register(cors, {
  // Restrict to the configured allowed origin in production.
  // Falls back to "*" only when not set (local dev).
  origin: env.CORS_ORIGIN ?? "*",
});

fastify.register(rateLimit, {
  ...chatRateLimitOptions,
  redis: redis,
});

import { requireAuth } from "./middleware/auth.middleware.js";

fastify.addHook("onRequest", async (req, reply) => {
  if (req.url.includes('/chat') || req.url.includes('/mcp')) await requireAuth(req as any, reply as any);
});

fastify.get('/ready',async(_request,reply)=>{const ready=await dependenciesReady(()=>db.$queryRaw`SELECT 1`);return reply.status(ready?200:503).send({status:ready?'ready':'unavailable'});});
fastify.get("/health", async (_req, reply) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", service: "chat", db: "connected" };
  } catch (e) {
    fastify.log.error(e);
    return reply.status(503).send({ status: "error", service: "chat", db: "disconnected" });
  }
});

fastify.register(mcpRoutes, { prefix: "/api" });
fastify.register(chatRoutes, { prefix: "/api" });
fastify.register(metricsRoutes, { prefix: "/api" });
fastify.register(statusRoutes, { prefix: "/api" });
fastify.register(internalResourceRoutes);

fastify.register(mcpRoutes, { prefix: "/v1/chat/api" });
fastify.register(chatRoutes, { prefix: "/v1/chat/api" });
fastify.register(metricsRoutes, { prefix: "/v1/chat/api" });

// Graceful shutdown — close all connections in order
const listeners = ["SIGINT", "SIGTERM"];
listeners.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal} — shutting down gracefully`);
    await fastify.close();
    await closeDb();
    await closeRedis();
    process.exit(0);
  });
});

const start = async () => {
  try {
    await db.$connect();
    fastify.log.info("Connected to the database");
  } catch (err) {
    fastify.log.warn("Database connection warning (non-fatal): " + (err as Error).message);
  }

  try {
    await fastify.listen({ port: parseInt(env.PORT, 10), host: "0.0.0.0" });
    fastify.log.info(`Chat service listening on port ${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
