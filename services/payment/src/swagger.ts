import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DocCraft Payment Service API',
      version: '1.0.0',
      description:
        'Handles subscription checkout, billing portal, webhook processing (Paddle + PayHere), ' +
        'and invoice history. Routes customers to Paddle (global) or PayHere (Sri Lanka / LKR) ' +
        'based on billing country.',
    },
    servers: [
      { url: 'http://localhost:3001/v1/billing', description: 'API Gateway Proxy' },
      { url: 'http://localhost:3014', description: 'Local development' },
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
      },
      schemas: {
        Plan: {
          type: 'object',
          properties: {
            id:           { type: 'string', format: 'uuid' },
            name:         { type: 'string', enum: ['free', 'pro'] },
            priceMonthly: { type: 'number', example: 990 },
            priceYearly:  { type: 'number', example: 9000 },
            features:     { type: 'object' },
          },
        },
        Subscription: {
          type: 'object',
          properties: {
            id:                 { type: 'string', format: 'uuid' },
            userId:             { type: 'string' },
            planId:             { type: 'string' },
            gateway:            { type: 'string', enum: ['paddle', 'payhere'] },
            status:             { type: 'string', enum: ['active', 'past_due', 'cancelled'] },
            currentPeriodStart: { type: 'string', format: 'date-time' },
            currentPeriodEnd:   { type: 'string', format: 'date-time' },
            cancelAtPeriodEnd:  { type: 'boolean' },
          },
        },
        Invoice: {
          type: 'object',
          properties: {
            id:              { type: 'string', format: 'uuid' },
            gateway:         { type: 'string', enum: ['paddle', 'payhere'] },
            amount:          { type: 'number' },
            currency:        { type: 'string', example: 'LKR' },
            status:          { type: 'string', enum: ['paid', 'open', 'failed', 'refunded'] },
            pdfUrl:          { type: 'string', nullable: true },
            paidAt:          { type: 'string', format: 'date-time', nullable: true },
          },
        },
        PaddleCheckoutResponse: {
          type: 'object',
          properties: {
            gateway:      { type: 'string', example: 'paddle' },
            checkout_url: { type: 'string', description: 'Redirect user to this URL' },
          },
        },
        PayhereCheckoutResponse: {
          type: 'object',
          properties: {
            gateway:      { type: 'string', example: 'payhere' },
            checkout_url: { type: 'string', description: 'POST form_data fields to this URL' },
            form_data:    { type: 'object', description: 'Hidden form fields to POST to checkout_url' },
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
      { name: 'Plans',         description: 'Subscription plan listing' },
      { name: 'Subscription',  description: 'Checkout, portal, cancel, and subscription status' },
      { name: 'Webhooks',      description: 'Paddle and PayHere payment event receivers' },
      { name: 'Invoices',      description: 'Payment history' },
      { name: 'Coupons',       description: 'Discount code validation' },
      { name: 'Health',        description: 'Liveness checks' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness check',
          responses: {
            '200': { description: 'Healthy' },
            '503': { description: 'Degraded' },
          },
        },
      },
      '/v1/payment/plans': {
        get: {
          tags: ['Plans'],
          summary: 'List all subscription plans',
          description: 'Returns all plans with pricing (LKR) and feature flags. Public endpoint.',
          responses: {
            '200': {
              description: 'Plans list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      plans: { type: 'array', items: { $ref: '#/components/schemas/Plan' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/payment/subscribe': {
        post: {
          tags: ['Subscription'],
          summary: 'Create checkout session',
          description:
            'Routes to Paddle (non-LK) or PayHere (LK) based on billing country.\n\n' +
            '- **Paddle**: returns a `checkout_url` — redirect the user to it.\n' +
            '- **PayHere**: returns `form_data` — POST those fields to `checkout_url` (use a form).',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['country'],
                  properties: {
                    country:      { type: 'string', example: 'LK', description: 'ISO 3166-1 alpha-2' },
                    billingCycle: { type: 'string', enum: ['monthly', 'yearly'], default: 'monthly' },
                    email:        { type: 'string', format: 'email' },
                    firstName:    { type: 'string' },
                    lastName:     { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Checkout session created',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { $ref: '#/components/schemas/PaddleCheckoutResponse' },
                      { $ref: '#/components/schemas/PayhereCheckoutResponse' },
                    ],
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '500': { description: 'Gateway not configured' },
          },
        },
      },
      '/v1/payment/portal': {
        post: {
          tags: ['Subscription'],
          summary: 'Get billing portal URL (Paddle)',
          description: 'Returns a Paddle customer portal URL for managing payment methods and billing.',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Portal URL',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { portal_url: { type: 'string' } },
                  },
                },
              },
            },
            '404': { description: 'No active Paddle subscription' },
          },
        },
      },
      '/v1/payment/subscription': {
        get: {
          tags: ['Subscription'],
          summary: 'Get current subscription',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Subscription details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      subscription: {
                        oneOf: [
                          { $ref: '#/components/schemas/Subscription' },
                          { type: 'null' },
                        ],
                      },
                      plan: { type: 'string', enum: ['free', 'pro'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/payment/cancel': {
        post: {
          tags: ['Subscription'],
          summary: 'Cancel subscription',
          description:
            'For Paddle: cancels via API at end of billing period.\n\n' +
            'For PayHere: marks `cancelAtPeriodEnd=true` and returns instructions to cancel via PayHere portal.',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': { description: 'Cancellation scheduled' },
            '400': { description: 'No active subscription' },
          },
        },
      },
      '/v1/payment/webhook/paddle': {
        post: {
          tags: ['Webhooks'],
          summary: 'Paddle webhook receiver',
          description:
            'Receives and verifies Paddle events (HMAC-SHA256 via `Paddle-Signature` header).\n\n' +
            'Events handled: `transaction.completed`, `subscription.activated`, ' +
            '`subscription.updated`, `invoice.payment_succeeded`, `invoice.payment_failed`, ' +
            '`subscription.past_due`, `subscription.cancelled`.',
          parameters: [
            {
              name: 'Paddle-Signature',
              in: 'header',
              required: true,
              schema: { type: 'string' },
              description: 'Paddle HMAC-SHA256 signature',
            },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '200': { description: 'Received (processing is async)' },
            '400': { description: 'Invalid signature' },
          },
        },
      },
      '/v1/payment/webhook/payhere': {
        post: {
          tags: ['Webhooks'],
          summary: 'PayHere IPN webhook receiver',
          description:
            'Receives PayHere IPN (Instant Payment Notification) form-encoded data.\n\n' +
            'Verified via MD5 hash of `merchant_id + order_id + amount + currency + MD5(secret) + status_code`.\n\n' +
            'Status codes: 2=success, 0=pending, -1=cancelled, -2=failed, -3=chargebacked.',
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    merchant_id:      { type: 'string' },
                    order_id:         { type: 'string' },
                    payhere_amount:   { type: 'string' },
                    payhere_currency: { type: 'string' },
                    status_code:      { type: 'string' },
                    md5sig:           { type: 'string' },
                    custom_1:         { type: 'string', description: 'userId' },
                    custom_2:         { type: 'string', description: 'planId' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'OK' },
            '400': { description: 'Invalid MD5 signature' },
          },
        },
      },
      '/v1/payment/invoices': {
        get: {
          tags: ['Invoices'],
          summary: 'Get invoice history',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page',  in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } },
          ],
          responses: {
            '200': {
              description: 'Paginated invoices',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      invoices: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } },
                      pagination: {
                        type: 'object',
                        properties: {
                          page: { type: 'integer' }, limit: { type: 'integer' },
                          total: { type: 'integer' }, totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/payment/coupon/validate': {
        post: {
          tags: ['Coupons'],
          summary: 'Validate a coupon code',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code'],
                  properties: { code: { type: 'string', example: 'LAUNCH50' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Valid coupon',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      valid:        { type: 'boolean' },
                      discountType: { type: 'string', enum: ['percent', 'fixed'] },
                      value:        { type: 'number' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid or expired coupon' },
          },
        },
      },
    },
  },
  apis: [],
};

const spec = swaggerJsdoc(options);

export function setupSwagger(app: Express): void {
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'DocCraft Payment API',
      customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
    }),
  );
  app.get('/docs.json', (_req, res) => {
    res.json(spec);
  });
  console.log('[payment] Swagger UI available at http://localhost:3014/docs');
}
