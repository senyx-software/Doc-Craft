import type { FastifyRequest } from 'fastify';
import type { RateLimitPluginOptions } from '@fastify/rate-limit';
import { env } from '../config/env.js';
import { errorMessage } from '../../../../shared/chat-errors.mjs';

function bucket(request: FastifyRequest) {
    const path = request.url.split('?')[0];
    return request.method === 'POST' && /\/chat\/session\/[^/]+\/message$/.test(path) ? 'message' : 'api';
}

export const chatRateLimitOptions: RateLimitPluginOptions = {
    // Authentication runs onRequest, before this hook. Gateway requests all
    // arrive from one IP, so only a verified identity can isolate user limits.
    hook: 'preHandler',
    nameSpace:'chat:rate:',
    max: request => bucket(request) === 'message' ? env.RATE_LIMIT_MAX : env.API_RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: request => `${bucket(request)}:${(request as any).user?.id || request.ip}`,
    allowList: request => request.url.startsWith('/api/mcp') || request.url.startsWith('/api/metrics'),
    errorResponseBuilder: (request, context) => ({
        type: 'error', outcome: 'failure', statusCode: 429, status: 429,
        code: 'CHAT_RATE_LIMITED', phase: 'capacity', retryable: true,
        retryAfter: Math.ceil(context.ttl / 1000),
        requestId: String(request.headers['x-request-id'] || request.id),
        message: errorMessage('CHAT_RATE_LIMITED'),
    }),
};
