import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DocCraft API Gateway',
      version: '1.0.0',
      description: 'Central API Gateway routing traffic to all DocCraft microservices',
    },
    servers: [
      { url: 'http://localhost:3001', description: 'API Gateway Local' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT Bearer token obtained from POST /v1/auth/login',
        },
      },
    },
    security: [
      { BearerAuth: [] },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Gateway Health Check',
          responses: {
            '200': { description: 'Gateway healthy' },
          },
        },
      },
    },
  },
  apis: [],
};

const spec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(
    '/docs',
    swaggerUi.serve as any,
    swaggerUi.setup(spec, {
      customSiteTitle: 'DocCraft API Gateway Docs',
    }) as any,
  );
  app.get('/docs.json', (_req, res) => {
    res.json(spec);
  });
}
