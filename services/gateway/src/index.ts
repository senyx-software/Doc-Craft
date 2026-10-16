import {createAppServer} from '../../../shared/server-tls.mjs';
import express from 'express';
import type { Server } from 'http';
import { env } from './config/env.js';
import { corsConfig } from './security/cors.config.js';
import { helmetConfig } from './security/helmet.config.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.middleware.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { rateLimiterMiddleware } from './middleware/rateLimiter.middleware.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.middleware.js';
import { setupSwagger } from './swagger.js';
import routes from './routes/index.js';
import { gatewayBodyParser } from './middleware/bodyParser.middleware.js';

const app = express();
app.set('trust proxy', process.env.TRUSTED_PROXY_IPS ? JSON.parse(process.env.TRUSTED_PROXY_IPS) : false);

// 1. Security configurations
app.use(helmetConfig);
app.use(corsConfig);

// Disable Express default "x-powered-by" header defensively
app.disable('x-powered-by');

// 2. Logging & request tracking
app.use(requestLoggerMiddleware);

// Register Swagger UI documentation
setupSwagger(app);

// 3. Body Parsing (restricted to 100kb limit)
// Note: webhook routes and stream proxy controllers handle raw buffers
// directly so body parsers won't interfere on streaming lines
app.use(gatewayBodyParser);

// 4. Global Auth and Rate Limiting
app.use(authMiddleware);
app.use(rateLimiterMiddleware);

// 5. Register Routes Index
app.use('/', routes);

// 404 Fallback
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested path ${req.method} ${req.path} does not exist on the gateway.`,
      requestId: (req.headers['x-request-id'] as string) || '',
    },
  });
});

// 6. Global Error Handling
app.use(errorHandlerMiddleware);

// Start server
const server: Server = createAppServer(app).listen(env.PORT, '0.0.0.0', () => {
  console.log(`Gateway service successfully started on port ${env.PORT} (${env.NODE_ENV} mode) — AI_SERVICE_URL: ${env.AI_SERVICE_URL}`);
});

// 7. Graceful Shutdown (SIGTERM / SIGINT)
const gracefulShutdown = (signal: string) => {
  console.log(`\n[gateway] Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('[gateway] HTTP server closed.');
    process.exit(0);
  });

  // Forcibly shutdown after 10-second grace period (handles hanging streams)
  setTimeout(() => {
    console.warn('[gateway] Forced shutdown threshold reached. Exiting immediately.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
