/**
 * idempotency.test.ts — validates duplicate webhook events are skipped.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Prisma with factory returning fresh mock fns ────────────────────────
// We capture the mock function references so we can control and assert on them.

const mockFindUnique = vi.fn();
const mockCreate     = vi.fn();
const mockUpsert     = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('../db/prisma.js', () => ({
  prisma: {
    webhookEvent: {
      findUnique: mockFindUnique,
      create:     mockCreate,
    },
    subscription: {
      upsert:      mockUpsert,
      updateMany:  mockUpdateMany,
      findUnique:  vi.fn().mockImplementation(() => Promise.resolve(null)),
      findFirst:   vi.fn().mockImplementation(() => Promise.resolve(null)),
      update:      vi.fn().mockImplementation(() => Promise.resolve({})),
    },
    plan: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(null)),
    },
    checkoutIntent: { findUnique: vi.fn().mockResolvedValue({ userId: 'user-123', planId: 'p', amountMinor: 99000, currency: 'LKR', billingCycle: 'monthly' }) },
    billingInvoice: {
      upsert: vi.fn().mockImplementation(() => Promise.resolve({})),
    },
  },
}));

vi.mock('../services/plan.service.js', () => ({
  getPlanByPaddleMonthlyPrice: vi.fn().mockImplementation(() => Promise.resolve(null)),
  getPlanByPaddleYearlyPrice:  vi.fn().mockImplementation(() => Promise.resolve(null)),
}));

// Import after mocks — processors now live in their respective gateway services
const { processPaddleEvent }    = await import('../services/paddle.service.js');
const { processPayhereWebhook } = await import('../services/payhere.service.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Paddle idempotency — processPaddleEvent()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips all DB writes when event has already been processed', async () => {
    mockFindUnique.mockResolvedValueOnce({ eventId: 'evt-dupe-001' });
    mockCreate.mockResolvedValue({});

    await processPaddleEvent({ eventId: 'evt-dupe-001', eventType: 'transaction.completed', data: {} });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('calls markProcessed on first delivery of an unknown event', async () => {
    mockFindUnique.mockResolvedValueOnce(null); // not yet processed
    mockCreate.mockResolvedValueOnce({});

    await processPaddleEvent({ eventId: 'evt-new-002', eventType: 'unknown.event.type', data: {} });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: 'evt-new-002', gateway: 'paddle' }),
      }),
    );
  });

  it('does not call markProcessed on a duplicate', async () => {
    mockFindUnique.mockResolvedValueOnce({ eventId: 'evt-dup-003' });

    await processPaddleEvent({ eventId: 'evt-dup-003', eventType: 'unknown.event.type', data: {} });

    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('PayHere idempotency — processPayhereWebhook()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips all DB writes when composite eventId has been processed', async () => {
    mockFindUnique.mockResolvedValueOnce({ eventId: 'payhere:order-xyz:2' });
    mockCreate.mockResolvedValue({});

    await processPayhereWebhook({
      merchant_id: 'TEST_MERCHANT', order_id: 'order-xyz',
      payhere_amount: '990.00', payhere_currency: 'LKR',
      status_code: '2', md5sig: '',
      custom_1: 'user-123',
    });

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('calls markProcessed once on first delivery of PENDING event', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({});

    await processPayhereWebhook({
      merchant_id: 'TEST_MERCHANT', order_id: 'order-new-456',
      payhere_amount: '990.00', payhere_currency: 'LKR',
      status_code: '0', md5sig: '',
      custom_1: 'user-123',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('does not double-write on replay', async () => {
    const payload = {
      merchant_id: 'TEST_MERCHANT', order_id: 'order-replay',
      payhere_amount: '990.00', payhere_currency: 'LKR',
      status_code: '0', md5sig: '',
      custom_1: 'user-123',
    };

    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({});
    await processPayhereWebhook(payload);
    const countAfterFirst = mockCreate.mock.calls.length;

    mockFindUnique.mockResolvedValueOnce({ eventId: 'payhere:order-replay:0' });
    await processPayhereWebhook(payload);

    expect(mockCreate.mock.calls.length).toBe(countAfterFirst);
  });
});
