import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { FastifyInstance } from 'fastify';
import { getPreferences, updatePreferences, sendNotification, getLogs, getAdminLogs, receiveResendWebhook } from '../controllers/notification.controller.js';
import { authorizeNotification } from '../security.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', authorizeNotification);
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    (request as any).rawBody = body;
    try { done(null, JSON.parse(body as string)); } catch (error) { done(error as Error); }
  });
  const tags = ['Notification Preferences & Logs'];

  fastify.get('/announcements', async (request, reply) => {
    try {
      // Read fresh: disabling an announcement must not leave a cached user feed.
      const base = process.env.ADMIN_API_URL || 'http://localhost:3018';
      const response = await serviceFetch('admin-api', `${base}/api/v1/admin/notifications/config/public`, {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET || '' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Announcement service unavailable');
      const body = await response.json() as { announcements?: Array<{ id: string; title: string; message: string; severity: string; is_active: boolean; target_audience: string }> };
      const plan = request.headers['x-user-plan'];
      return { announcements: (body.announcements || [])
        .filter(item => item.is_active && (item.target_audience === 'all_users' || item.target_audience === plan || item.target_audience === `${plan}_users`))
        .map(({ id, title, message, severity }) => ({ id, title, message, severity })) };
    } catch {
      return reply.status(503).send({ error: 'Announcements unavailable' });
    }
  });

  fastify.get('/preferences', {
    schema: {
      tags,
      summary: 'Get user preferences',
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string' } }
      }
    }
  }, getPreferences);

  fastify.patch('/preferences', {
    schema: {
      tags,
      summary: 'Update user preferences',
      body: {
        type: 'object',
        required: ['userId', 'type', 'enabled'],
        properties: {
          userId: { type: 'string' },
          type: { type: 'string' },
          enabled: { type: 'boolean' }
        }
      }
    }
  }, updatePreferences);

  fastify.post('/send', {
    schema: {
      tags,
      summary: 'Trigger manual notification',
      body: {
        type: 'object',
        required: ['userId', 'type', 'email'],
        properties: {
          userId: { type: 'string' },
          type: { type: 'string' },
          email: { type: 'string' },
          payload: { type: 'object' }
        }
      }
    }
  }, sendNotification);

  fastify.get('/logs', {
    schema: {
      tags,
      summary: 'Get notification logs',
      querystring: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string' } }
      }
    }
  }, getLogs);

  fastify.get('/logs/admin', {
    schema: {
      tags,
      summary: 'Get all notification logs (admin — no userId required)',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: sent | failed | queued' },
          type: { type: 'string', description: 'Filter by notification type (e.g. welcome, invoice_ready)' },
          limit: { type: 'integer', default: 50 }
        }
      }
    }
  }, getAdminLogs);

  // Public — called by Resend's own webhook dispatcher, not by an
  // authenticated admin/user request. Must be listed in the Gateway's
  // public-routes bypass (services/gateway/src/middleware/auth.middleware.ts)
  // the same way payment webhooks are, or the Gateway will reject it for
  // lacking a JWT.
  fastify.post('/webhooks/resend-status', {
    schema: {
      tags,
      summary: 'Receive Resend delivery-status events and relay them to the admin-configured Status Webhook URL',
      body: { type: 'object', additionalProperties: true }
    }
  }, receiveResendWebhook);
}
