import { describe, expect, it } from 'vitest';
import { upstreamPath } from '../upstreamPath.js';

describe('public gateway aliases match mounted upstream routes', () => {
  it.each([
    ['/v1/documents/generate', '/v1/document/generate'],
    ['/v1/documents/a/download', '/v1/document/a/download'],
    ['/v1/templates?type=invoice', '/v1/document/templates?type=invoice'],
    ['/v1/billing/webhook/paddle?x=%2F', '/v1/payment/webhook/paddle?x=%2F'],
    ['/v1/users/me', '/v1/auth/me'],
    ['/v1/support/tickets', '/api/v1/support/tickets'],
    ['/v1/notification/preferences', '/notification/preferences'],
    ['/v1/notifications/webhooks/resend-status', '/notification/webhooks/resend-status'],
    ['/v1/admin/plans', '/api/v1/admin/plans'],
    ['/v1/admin/users/u/status', '/api/v1/users/u/status'],
    ['/v1/chat/api/chat/session/s/message', '/api/chat/session/s/message'],
    ['/v1/chat/sessions', '/api/chat/sessions'],
    ['/v1/ai/api/chat/session', '/api/chat/session'],
    ['/v1/documentary', '/v1/documentary'],
    ['/v1/payment/plans', '/v1/payment/plans'],
  ])('%s -> %s', (input, expected) => expect(upstreamPath(input)).toBe(expected));
});
