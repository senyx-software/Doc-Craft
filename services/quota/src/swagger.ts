import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DocCraft Quota Service API',
      version: '1.0.0',
      description:
        'Manages document generation quotas for free and pro users. ' +
        'Uses atomic Redis counters with midnight UTC daily resets via BullMQ.',
    },
    servers: [
      { url: 'http://localhost:3001/v1/quota', description: 'API Gateway Proxy' },
      { url: 'http://localhost:3015', description: 'Local development' },
    ],
    security: [
      { BearerAuth: [] },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from auth service',
        },
        InternalSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Internal-Secret',
          description: 'Shared secret for service-to-service calls',
        },
      },
      schemas: {
        QuotaStatus: {
          type: 'object',
          properties: {
            userId:    { type: 'string', format: 'uuid' },
            plan:      { type: 'string', enum: ['free', 'pro'] },
            used:      { type: 'integer', example: 1 },
            limit:     { type: 'integer', example: 3 },
            remaining: { type: 'integer', example: 2 },
            resetsAt:  { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error:   { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    tags: [
      { name: 'Quota',  description: 'User-facing quota endpoints' },
      { name: 'Internal', description: 'Service-to-service endpoints (require X-Internal-Secret)' },
      { name: 'Guest',  description: 'Unauthenticated guest session endpoints' },
      { name: 'Health', description: 'Liveness checks' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness check',
          description: 'Pings both Redis and Postgres. Returns 503 if any dependency is down.',
          responses: {
            '200': { description: 'All dependencies healthy' },
            '503': { description: 'One or more dependencies degraded' },
          },
        },
      },
      '/v1/quota/me': {
        get: {
          tags: ['Quota'],
          summary: 'Get my current quota',
          description: 'Returns the authenticated user\'s usage, limit, remaining count, and reset time.',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Quota status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/QuotaStatus' },
                },
              },
            },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/v1/quota/check': {
        post: {
          tags: ['Internal'],
          summary: 'Check if user can generate',
          description: 'Called by document service before starting PDF generation.',
          security: [{ InternalSecret: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId'],
                  properties: {
                    userId: { type: 'string' },
                    plan:   { type: 'string', enum: ['free', 'pro'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Allowed — user is within quota' },
            '403': { description: 'Quota exceeded' },
          },
        },
      },
      '/v1/quota/increment': {
        post: {
          tags: ['Internal'],
          summary: 'Increment quota counter',
          description: 'Atomically increments Redis counter after successful generation.',
          security: [{ InternalSecret: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId'],
                  properties: { userId: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Counter incremented' },
            '403': { description: 'Unauthorized' },
          },
        },
      },
      '/v1/quota/reset': {
        post: {
          tags: ['Internal'],
          summary: 'Reset a user\'s quota counter',
          description: 'Resets counter to 0. Called on subscription renewal or by admin.',
          security: [{ InternalSecret: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId'],
                  properties: { userId: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Quota reset' },
          },
        },
      },
      '/v1/quota/override': {
        post: {
          tags: ['Internal'],
          summary: 'Override quota limit',
          description: 'Admin or payment service can set a custom limit with a mandatory reason.',
          security: [{ InternalSecret: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId', 'overrideLimit', 'reason', 'adminId'],
                  properties: {
                    userId:        { type: 'string' },
                    overrideLimit: { type: 'integer', example: 999999 },
                    reason:        { type: 'string' },
                    adminId:       { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Limit overridden' },
          },
        },
      },
      '/v1/quota/guest/check': {
        post: {
          tags: ['Guest'],
          summary: 'Check guest session quota',
          description: 'Returns whether the session token can generate (cap: 1 per session, 24h TTL).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sessionToken'],
                  properties: { sessionToken: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Allowed' },
            '403': { description: 'Guest quota exceeded' },
          },
        },
      },
      '/v1/quota/guest/increment': {
        post: {
          tags: ['Guest'],
          summary: 'Increment guest session quota',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sessionToken'],
                  properties: { sessionToken: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Guest counter incremented' },
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
  app.use('/docs', swaggerUi.serve as any, swaggerUi.setup(spec, {
    customSiteTitle: 'DocCraft Quota API',
    customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
  }));
  app.get('/docs.json', (_req, res) => {
    res.json(spec);
  });
  console.log('[quota] Swagger UI available at http://localhost:3015/docs');
}

