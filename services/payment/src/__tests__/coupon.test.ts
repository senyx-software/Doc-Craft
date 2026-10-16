/**
 * coupon.test.ts — validates coupon validation logic.
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mock Prisma (top-level) ──────────────────────────────────────────────────

const mockFindFirst  = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('../db/prisma.js', () => ({
  prisma: {
    coupon: {
      findFirst:  mockFindFirst,
      updateMany: mockUpdateMany,
    },
  },
}));

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeCoupon(overrides: Partial<{
  usageLimit:   number | null;
  usageCount:   number;
  discountType: string;
  value:        number;
}> = {}) {
  return {
    id:           'coupon-id-1',
    code:         'TESTCODE',
    discountType: overrides.discountType !== undefined ? overrides.discountType : 'percent',
    value:        overrides.value        !== undefined ? overrides.value        : 10,
    expiresAt:    new Date(Date.now() + 86_400_000),
    usageLimit:   overrides.usageLimit   !== undefined ? overrides.usageLimit   : null,
    usageCount:   overrides.usageCount   !== undefined ? overrides.usageCount   : 0,
    deletedAt:    null,
    createdAt:    new Date(),
  };
}

// ─── Import service (after mocks are in place) ────────────────────────────────
// We import once and reuse — the mock is module-level so it persists.
const { validateCoupon } = await import('../services/coupon.service.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateCoupon()', () => {
  it('returns invalid for a coupon not found (expired or deleted)', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const result = await validateCoupon('EXPIRED10');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found or expired/i);
  });

  it('returns invalid for another not-found case', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const result = await validateCoupon('DELETED20');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found or expired/i);
  });

  it('returns invalid when usage count equals the usage limit', async () => {
    mockFindFirst.mockResolvedValueOnce(makeCoupon({ usageLimit: 5, usageCount: 5 }));
    const result = await validateCoupon('MAXED50');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/usage limit reached/i);
  });

  it('returns invalid when usage count exceeds the limit', async () => {
    mockFindFirst.mockResolvedValueOnce(makeCoupon({ usageLimit: 3, usageCount: 10 }));
    const result = await validateCoupon('OVER100');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/usage limit reached/i);
  });

  it('returns valid for a percent discount coupon within limits', async () => {
    mockFindFirst.mockResolvedValueOnce(
      makeCoupon({ discountType: 'percent', value: 20, usageLimit: 100, usageCount: 5 }),
    );
    const result = await validateCoupon('SAVE20');
    expect(result.valid).toBe(true);
    expect(result.discountType).toBe('percent');
    expect(result.value).toBe(20);
  });

  it('returns valid for a fixed discount coupon', async () => {
    mockFindFirst.mockResolvedValueOnce(makeCoupon({ discountType: 'fixed', value: 200 }));
    const result = await validateCoupon('FLAT200');
    expect(result.valid).toBe(true);
    expect(result.discountType).toBe('fixed');
    expect(result.value).toBe(200);
  });

  it('returns valid for a coupon with no usage limit (unlimited)', async () => {
    mockFindFirst.mockResolvedValueOnce(makeCoupon({ usageLimit: null, usageCount: 9999 }));
    const result = await validateCoupon('UNLIMITED');
    expect(result.valid).toBe(true);
  });

  it('returns valid when usageCount is exactly one below the limit', async () => {
    mockFindFirst.mockResolvedValueOnce(makeCoupon({ usageLimit: 10, usageCount: 9 }));
    const result = await validateCoupon('ALMOST');
    expect(result.valid).toBe(true);
  });

  it('valid result has no error field', async () => {
    mockFindFirst.mockResolvedValueOnce(makeCoupon({ discountType: 'percent', value: 10 }));
    const result = await validateCoupon('SAVE10');
    expect(result.error).toBeUndefined();
    expect(result.discountType).toBeDefined();
    expect(result.value).toBeDefined();
  });
});
