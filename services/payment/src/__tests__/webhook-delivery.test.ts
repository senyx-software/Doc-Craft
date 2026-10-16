import { beforeEach, expect, it, vi } from 'vitest';
const enqueue = vi.hoisted(() => vi.fn());
vi.mock('../queues/payment-webhook.queue.js', () => ({ enqueueWebhookJob: enqueue }));
vi.mock('../db/prisma.js', () => ({ prisma: {} }));
vi.mock('../db/redis.js', () => ({ getRedis: vi.fn() }));
vi.mock('../services/paymentConfigClient.service.js', () => ({ paymentConfigClient: {} }));
import { paddleWebhook, payhereWebhook } from '../controllers/payment.controller.js';
beforeEach(() => vi.resetAllMocks());
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }) as any;
const request = { paddleEvent: { eventId: 'fixture', eventType: 'subscription.created', data: {} }, body: { order_id: 'fixture', status_code: '2' } } as any;
it.each([paddleWebhook, payhereWebhook])('does not acknowledge an event that was not durably queued', async handler => {
  enqueue.mockRejectedValue(new Error('queue offline'));
  const res = response(); await handler(request, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.status).not.toHaveBeenCalledWith(200);
});
it.each([paddleWebhook, payhereWebhook])('acknowledges only after queue acceptance', async handler => {
  const res = response();
  enqueue.mockImplementation(async () => { expect(res.status).not.toHaveBeenCalled(); });
  await handler(request, res); expect(res.status).toHaveBeenCalledWith(200);
});
