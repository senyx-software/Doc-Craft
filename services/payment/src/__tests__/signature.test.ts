/**
 * signature.test.ts — webhook verification for both gateways.
 *
 *   PayHere → verifyWebhookHash / generateHash (pure functions in payhere.service)
 *   Paddle  → verifyPaddleWebhook middleware (signature checked before the controller)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ─── Top-level mocks ──────────────────────────────────────────────────────────

const mockVerifyPaddleSignature = vi.fn();

vi.mock('../services/paddle.service.js', () => ({
  verifyPaddleSignature: mockVerifyPaddleSignature,
  createPaddleCheckout:  vi.fn(),
  getPortalSession:      vi.fn(),
  processPaddleEvent:    vi.fn(),
  paddle:                {},
}));

vi.mock('../db/prisma.js', () => ({ prisma: {} }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Generates a valid PayHere md5sig using the same formula as payhere.service.ts.
// PAYHERE_MERCHANT_SECRET is set to 'TEST_SECRET_XYZ' in test.setup.ts.
const MERCHANT_ID     = 'TEST_MERCHANT';
const MERCHANT_SECRET = 'TEST_SECRET_XYZ';

function buildValidFixture() {
  const orderId    = 'order-abc-123';
  const amount     = '990.00';
  const currency   = 'LKR';
  const statusCode = '2';

  const secretHash = crypto.createHash('md5').update(MERCHANT_SECRET).digest('hex').toUpperCase();
  const raw        = `${MERCHANT_ID}${orderId}${amount}${currency}${statusCode}${secretHash}`;
  const md5sig     = crypto.createHash('md5').update(raw).digest('hex').toUpperCase();

  return { merchant_id: MERCHANT_ID, order_id: orderId, payhere_amount: amount, payhere_currency: currency, status_code: statusCode, md5sig };
}

// Import after mocks
const { verifyWebhookHash, generateHash } = await import('../services/payhere.service.js');
const { verifyPaddleWebhook }             = await import('../middleware/webhook-verify.middleware.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PayHere — verifyWebhookHash()', () => {
  it('returns true for a valid md5sig', () => {
    expect(verifyWebhookHash(buildValidFixture())).toBe(true);
    expect(verifyWebhookHash({...buildValidFixture(),md5sig:'15A8B570F436757DC1C767C64E313AD6'})).toBe(true);
  });

  it('returns false when the amount is tampered', () => {
    const tampered = { ...buildValidFixture(), payhere_amount: '1.00' };
    expect(verifyWebhookHash(tampered)).toBe(false);
  });

  it('returns false when the md5sig itself is tampered', () => {
    const tampered = { ...buildValidFixture(), md5sig: 'DEADBEEF00000000000000000000000A' };
    expect(verifyWebhookHash(tampered)).toBe(false);
  });

  it('returns false when the order_id is tampered', () => {
    const tampered = { ...buildValidFixture(), order_id: 'different-order-id' };
    expect(verifyWebhookHash(tampered)).toBe(false);
  });

  it('returns false when the status_code is tampered', () => {
    const tampered = { ...buildValidFixture(), status_code: '-1' };
    expect(verifyWebhookHash(tampered)).toBe(false);
  });
});

describe('PayHere — generateHash()', () => {
  it('produces a 32-character uppercase hex string', () => {
    const hash = generateHash('order-1', '990.00', 'LKR');
    expect(hash).toMatch(/^[A-F0-9]{32}$/);
  });

  it('produces different hashes for different amounts', () => {
    const h1 = generateHash('order-1', '990.00',  'LKR');
    const h2 = generateHash('order-1', '9000.00', 'LKR');
    expect(h1).not.toBe(h2);
  });
});

describe('Paddle — verifyPaddleWebhook middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when the Paddle-Signature header is absent', async () => {
    const req = { headers: {}, body: Buffer.from('{}') } as any;
    const json   = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next   = vi.fn();

    await verifyPaddleWebhook(req, { status } as any, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'missing_signature' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when signature verification returns null (bad signature)', async () => {
    mockVerifyPaddleSignature.mockResolvedValueOnce(null);

    const req = { headers: { 'paddle-signature': 'ts=1;h1=badsig' }, body: Buffer.from('{}') } as any;
    const json   = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next   = vi.fn();

    await verifyPaddleWebhook(req, { status } as any, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_signature' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches the event when the signature is valid', async () => {
    const event = { eventId: 'evt_123', eventType: 'transaction.completed', data: {} };
    mockVerifyPaddleSignature.mockResolvedValueOnce(event);

    const req = { headers: { 'paddle-signature': 'ts=1;h1=goodsig' }, body: Buffer.from('{}') } as any;
    const json   = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next   = vi.fn();

    await verifyPaddleWebhook(req, { status } as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
    expect(req.paddleEvent).toBe(event);
  });
});
