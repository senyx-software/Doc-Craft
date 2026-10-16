import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = {
  get: vi.fn(),
  on: vi.fn(),
  connect: vi.fn(),
  status: 'ready',
};

vi.mock('../db/redis.js', () => ({ getRedis: () => redisMock }));
vi.mock('../db/prisma.js', () => ({
  prisma: {
    plan: {
      findMany: vi.fn().mockResolvedValue([{ id: "plan-pro", name: "pro" }]),
      findUnique: vi.fn().mockResolvedValue({ id: "plan-pro", name: "pro" }),
    },
  },
}));

const { paymentConfigClient } = await import('../services/paymentConfigClient.service.js');
const { listPlans, getPlanByName } = await import('../services/plan.service.js');
const { selectGatewayAsync } = await import('../services/gateway-router.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{default_payment_provider:'auto',allow_paddle:true,allow_payhere:true}})));
  paymentConfigClient.clearMemoryCache();
});

describe('Payment Service Admin Config Integration', () => {
  it('fails closed instead of fabricating billing configuration during an outage', async () => {
    redisMock.get.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('isolated outage')));
    await expect(listPlans()).rejects.toThrow('Authoritative plan configuration unavailable');
  });

  it('merges live Admin-managed pricing and feature flags dynamically', async () => {
    // Mock Redis config:domain:plans payload
    redisMock.get.mockImplementation((key: string) => {
      if (key === 'config:domain:plans') {
        return Promise.resolve(
          JSON.stringify({
            data: {
              pro: {
                name: 'Pro Tier Updated',
                price_usd_monthly: 39.0,
                price_usd_yearly: 390.0,
                feature_flags: { customLogo: true, priorityQueue: true, watermark: false },
              },
            },
          }),
        );
      }
      return Promise.resolve(null);
    });

    const proPlan = await getPlanByName('pro');
    expect(proPlan).toBeDefined();
    expect(proPlan?.priceMonthly).toBe(39.0);
    expect(proPlan?.priceYearly).toBe(390.0);
    expect(proPlan?.features.watermark).toBe(false);
  });

  it('resolves gateway selection via selectGatewayAsync and payment settings', async () => {
    redisMock.get.mockImplementation((key: string) => {
      if (key === 'config:domain:settings') {
        return Promise.resolve(
          JSON.stringify({
            data: {
              default_payment_provider: 'auto',
              allow_paddle: true,
              allow_payhere: true,
            },
          }),
        );
      }
      return Promise.resolve(null);
    });

    const lkGateway = await selectGatewayAsync('LK');
    const usGateway = await selectGatewayAsync('US');

    expect(lkGateway).toBe('payhere');
    expect(usGateway).toBe('paddle');
  });
});

it('keeps USD and LKR prices separate and selects the admin billing currency', async () => {
  const { configuredPlan } = await import('../services/plan.service.js');
  const plan = configuredPlan({ id: 'p', name: 'pro' }, { billing_currency: 'LKR', price_usd_monthly: 29, price_lkr_monthly: 990.25, monthly_quota: 7 });
  expect(plan.currency).toBe('LKR');
  expect(plan.priceMonthly).toBe(990.25);
  expect(plan.prices.USD.monthly).toBe(29);
  expect(plan.prices.LKR.yearly).toBeNull();
  expect(plan.features.documentsPerDay).toBe(7);
});

it('does not restore disabled gateways from cached or invented defaults',async()=>{
 redisMock.get.mockResolvedValue(JSON.stringify({data:{allow_paddle:true,allow_payhere:true}}));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})));
 await expect(selectGatewayAsync('US')).rejects.toMatchObject({statusCode:503});
});
it.each(['auto','payhere','paddle'])('rejects disabled gateways even with forced provider %s',async(provider)=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:{default_payment_provider:provider,allow_paddle:false,allow_payhere:false}})));
 await expect(selectGatewayAsync('LK')).rejects.toMatchObject({statusCode:503});
});
