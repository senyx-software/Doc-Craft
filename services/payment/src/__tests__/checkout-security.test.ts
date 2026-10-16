import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  intent: vi.fn(), activate: vi.fn(), processed: vi.fn(), invoice: vi.fn(),
}));
vi.mock('../db/prisma.js', () => ({ prisma: {
  checkoutIntent: { findUnique: mock.intent },
  plan: { findUnique: vi.fn().mockResolvedValue({ id: 'owned-plan', name: 'pro' }) },
  subscription: { findUnique: vi.fn().mockResolvedValue({ id: 'subscription' }) },
} }));
vi.mock('../services/subscription.service.js', () => ({
  isAlreadyProcessed: vi.fn().mockResolvedValue(false), markProcessed: mock.processed,
  activateProSubscription: mock.activate, downgradeToFree: vi.fn(), upsertInvoice: mock.invoice,
  queueNotification: vi.fn(), emitAutomationEvent: vi.fn(), trackProductEvent: vi.fn(),
}));
import { processPayhereWebhook, buildCheckoutData } from '../services/payhere.service.js';
const payload = { merchant_id: 'TEST_MERCHANT', order_id: 'owned-order', payment_id: 'payment-one', payhere_amount: '990.25', payhere_currency: 'LKR', status_code: '2', md5sig: 'fixture', custom_1: 'attacker-target', custom_2: 'max-plan' };
beforeEach(() => {
  vi.clearAllMocks();
  mock.intent.mockResolvedValue({ userId: 'checkout-owner', planId: 'owned-plan', amountMinor: 99025, currency: 'LKR', billingCycle: 'yearly' });
});
it('binds signed callback effects to stored ownership and cadence, ignoring unbound custom fields', async () => {
  await processPayhereWebhook(payload);
  const activation = mock.activate.mock.calls[0][0];
  expect(activation.userId).toBe('checkout-owner');
  expect(activation.planId).toBe('owned-plan');
  expect(activation.periodEnd.getFullYear()).toBe(activation.periodStart.getFullYear() + 1);
});
it.each([{ payhere_amount: '29.00' }, { payhere_currency: 'USD' }])('rejects checkout amount/currency mismatches', async changes => {
  await expect(processPayhereWebhook({ ...payload, ...changes })).rejects.toThrow('does not match checkout');
  expect(mock.activate).not.toHaveBeenCalled();
  expect(mock.processed).not.toHaveBeenCalled();
});
it('fails closed for legacy or invented checkout orders', async () => {
  mock.intent.mockResolvedValue(null);
  await expect(processPayhereWebhook(payload)).rejects.toThrow('No server-owned checkout record');
  expect(mock.activate).not.toHaveBeenCalled();
});
it('unbound payment IDs cannot manufacture new authenticated payment events or target another invoice', async () => {
  await processPayhereWebhook(payload);
  await processPayhereWebhook({ ...payload, payment_id: 'payment-two' });
  expect(mock.processed.mock.calls[0][0]).toEqual(mock.processed.mock.calls[1][0]);
  expect(mock.invoice.mock.calls.every(([invoice])=>invoice.gatewayInvoiceId==='payhere:owned-order')).toBe(true);
});
it('does not mark a webhook processed when billing history persistence fails', async () => {
  mock.invoice.mockRejectedValueOnce(new Error('invoice storage unavailable'));
  await expect(processPayhereWebhook(payload)).rejects.toThrow('invoice storage unavailable');
  expect(mock.processed).not.toHaveBeenCalled();
});
it('annual checkout requests annual recurrence', () => {
  const form = buildCheckoutData({ userId: 'u', planId: 'p', orderId: 'o', amount: '990.25', email: 'fixture@example.com', billingCycle: 'yearly' });
  expect(form.recurrence).toBe('1 Year');
});
