/**
 * portal.test.ts — /payment/portal behaviour across gateways.
 *
 * Paddle provides a native billing portal; PayHere does not. PayHere
 * subscribers must get a clear, non-error "not available" response rather
 * than a fake URL or a 500.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mockGetPortalSession = vi.fn();

vi.mock('../services/paddle.service.js', () => ({
  getPortalSession:     mockGetPortalSession,
  createPaddleCheckout: vi.fn(),
  verifyPaddleSignature: vi.fn(),
  processPaddleEvent:   vi.fn(),
  paddle:               {},
}));

vi.mock('../queues/payment-webhook.queue.js', () => ({ enqueueWebhookJob: vi.fn() }));
vi.mock('../db/prisma.js', () => ({ prisma: {} }));

const { getBillingPortal } = await import('../controllers/payment.controller.js');

function makeReq(): Request {
  const req = { body: {}, headers: {} } as unknown as Request;
  (req as any).userId = 'user-123';
  return req;
}

function makeRes() {
  const json   = vi.fn();
  const status = vi.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

describe('getBillingPortal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a portal_url for a Paddle subscriber', async () => {
    mockGetPortalSession.mockResolvedValueOnce({ available: true, portalUrl: 'https://paddle.com/portal/xyz' });
    const { res, json } = makeRes();
    await getBillingPortal(makeReq(), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ portal_url: 'https://paddle.com/portal/xyz', available: true }));
  });

  it('returns a graceful non-support response (200) for a PayHere subscriber', async () => {
    mockGetPortalSession.mockResolvedValueOnce({ available: false, message: 'not available for PayHere' });
    const { res, json, status } = makeRes();
    await getBillingPortal(makeReq(), res);
    expect(status).toHaveBeenCalledWith(200);
    const payload = json.mock.calls[0][0];
    expect(payload.available).toBe(false);
    expect(payload.portal_url).toBeNull();
    expect(payload.message).toMatch(/not available/i);
  });

  it('returns 404 when the user has no subscription', async () => {
    mockGetPortalSession.mockResolvedValueOnce(null);
    const { res, json, status } = makeRes();
    await getBillingPortal(makeReq(), res);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'not_found' }));
  });
});
