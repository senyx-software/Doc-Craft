/**
 * coupon.service.ts — discount coupon validation.
 */

import { prisma } from '../db/prisma.js';

export interface CouponValidationResult {
  valid:        boolean;
  discountType?: 'percent' | 'fixed';
  value?:        number;
  error?:        string;
}

export async function validateCoupon(code: string): Promise<CouponValidationResult> {
  const coupon = await prisma.coupon.findFirst({
    where: {
      code,
      deletedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!coupon) {
    return { valid: false, error: 'Coupon not found or expired' };
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, error: 'Coupon usage limit reached' };
  }

  return {
    valid:        true,
    discountType: coupon.discountType as 'percent' | 'fixed',
    value:        coupon.value,
  };
}

/** Increments usage count when a coupon is successfully applied */
export async function applyCoupon(code: string): Promise<void> {
  await prisma.coupon.updateMany({
    where: { code },
    data:  { usageCount: { increment: 1 } },
  });
}
