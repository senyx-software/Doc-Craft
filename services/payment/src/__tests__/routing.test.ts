/**
 * routing.test.ts — country-based gateway routing in createCheckout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ─── Persistent mock implementations ─────────────────────────────────────────

// No admin-managed gateway settings configured — selectGatewayAsync must fall
// back to pure country-based routing, same as the old synchronous behavior.
vi.mock('../services/paymentConfigClient.service.js',()=>({paymentConfigClient:{getPaymentSettings:vi.fn().mockResolvedValue({default_payment_provider:'auto',allow_paddle:true,allow_payhere:true}),clearMemoryCache:vi.fn()}}));
const redisMock = { get: vi.fn().mockResolvedValue(null), on: vi.fn(), connect: vi.fn(), status: 'ready' };
vi.mock('../db/redis.js', () => ({ getRedis: () => redisMock }));

const PRO_PLAN = {
  id: 'plan-pro-id', name: 'pro',
  priceMonthly: 990, priceYearly: 9000, currency: 'LKR' as 'LKR' | 'USD',
  prices: { LKR: { monthly: 990, yearly: 9000 }, USD: { monthly: 29, yearly: 290 } },
  paddlePriceMonthlyId: 'pri_monthly',
  paddlePriceYearlyId:  'pri_yearly',
};

vi.mock('../services/plan.service.js', () => ({
  getPlanByName: vi.fn().mockImplementation(() => Promise.resolve(PRO_PLAN)),
  listPlans:     vi.fn(),
}));

vi.mock('../services/payhere.service.js', () => ({
  buildCheckoutData:    vi.fn().mockImplementation(() => ({ merchant_id: '12345', hash: 'abc' })),
  PAYHERE_CHECKOUT_URL: 'https://sandbox.payhere.lk/pay/checkout',
}));

vi.mock('../services/paddle.service.js', () => ({
  createPaddleCheckout: vi.fn().mockImplementation(() => Promise.resolve({
    checkoutUrl: 'https://checkout.paddle.com/checkout/custom/abc123',
    gateway: 'paddle',
  })),
  getPortalSession: vi.fn(),
}));

vi.mock('../services/subscription.service.js', () => ({
  getSubscription:    vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock('../services/coupon.service.js', () => ({ validateCoupon: vi.fn() }));
vi.mock('../services/invoice.service.js', () => ({ getUserInvoices: vi.fn() }));

vi.mock('../queues/payment-webhook.queue.js', () => ({
  enqueueWebhookJob: vi.fn().mockImplementation(() => Promise.resolve()),
}));

vi.mock('../db/prisma.js', () => ({ prisma: { checkoutIntent: { create: vi.fn() } } }));

// ─── Import controller (after mocks). selectGatewayAsync runs for real,
// falling back to country-based routing since no admin settings are mocked. ──
const { createCheckout } = await import('../controllers/payment.controller.js');
const { paymentConfigClient } = await import('../services/paymentConfigClient.service.js');

beforeEach(() => {
  PRO_PLAN.currency = 'LKR';
  redisMock.get.mockResolvedValue(null);
  paymentConfigClient.clearMemoryCache();
  vi.mocked(paymentConfigClient.getPaymentSettings).mockImplementation(async()=>{
    const fixture=await redisMock.get('config:domain:settings');
    return fixture?JSON.parse(fixture).data:{default_payment_provider:'auto',allow_paddle:true,allow_payhere:true};
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeReq(country: string): Request {
  const req = {
    body:    { country, billingCycle: 'monthly', email: 'test@example.com' },
    headers: { 'x-user-id': 'user-123', 'x-user-plan': 'free', 'x-user-email': 'test@example.com' },
  } as unknown as Request;
  (req as any).userId   = 'user-123';
  (req as any).userPlan = 'free';
  return req;
}

function makeRes() {
  const json   = vi.fn();
  const status = vi.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createCheckout — country routing', () => {
  it('routes LK customers to PayHere', async () => {
    const { res, json } = makeRes();
    await createCheckout(makeReq('LK'), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'payhere' }));
  });

  it('routes US customers to Paddle', async () => {
    PRO_PLAN.currency = 'USD';
    const { res, json } = makeRes();
    await createCheckout(makeReq('US'), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'paddle' }));
  });

  it('routes DE customers to Paddle', async () => {
    PRO_PLAN.currency = 'USD';
    const { res, json } = makeRes();
    await createCheckout(makeReq('DE'), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'paddle' }));
  });

  it('routes lowercase "lk" to PayHere (case-insensitive)', async () => {
    const { res, json } = makeRes();
    await createCheckout(makeReq('lk'), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'payhere' }));
  });

  it('returns checkout_url and form_data for LK', async () => {
    const { res, json } = makeRes();
    await createCheckout(makeReq('LK'), res);
    const call = json.mock.calls[0][0];
    expect(call).toHaveProperty('checkout_url');
    expect(call).toHaveProperty('form_data');
  });

  it('returns a paddle.com checkout_url for non-LK', async () => {
    PRO_PLAN.currency = 'USD';
    const { res, json } = makeRes();
    await createCheckout(makeReq('SG'), res);
    const call = json.mock.calls[0][0];
    expect(call).toHaveProperty('checkout_url');
    expect(call.checkout_url).toContain('paddle.com');
  });
});

describe('createCheckout — Admin-managed gateway settings override country routing', () => {
  it('routes an LK customer to Paddle when admin disables PayHere', async () => {
    PRO_PLAN.currency = 'USD';
    redisMock.get.mockImplementation((key: string) =>
      key === 'config:domain:settings'
        ? Promise.resolve(JSON.stringify({ data: { allow_payhere: false, allow_paddle: true } }))
        : Promise.resolve(null),
    );

    const { res, json } = makeRes();
    await createCheckout(makeReq('LK'), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'paddle' }));
  });

  it('honors an admin-forced default_payment_provider regardless of country', async () => {
    PRO_PLAN.currency = 'USD';
    redisMock.get.mockImplementation((key: string) =>
      key === 'config:domain:settings'
        ? Promise.resolve(JSON.stringify({ data: { default_payment_provider: 'paddle' } }))
        : Promise.resolve(null),
    );

    const { res, json } = makeRes();
    await createCheckout(makeReq('LK'), res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'paddle' }));
  });
});

it('rejects a forced provider that cannot charge the configured currency', async () => {
  PRO_PLAN.currency = 'LKR';
  redisMock.get.mockResolvedValue(JSON.stringify({ data: { default_payment_provider: 'paddle' } }));
  const { res, json, status } = makeRes();
  await createCheckout(makeReq('US'), res);
  expect(status).toHaveBeenCalledWith(409);
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'currency_provider_mismatch' }));
});
