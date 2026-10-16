import { beforeEach, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../client', () => ({ apiRequest: request }));
import * as payment from '../payment';
beforeEach(() => { vi.resetAllMocks(); });
it('uses the canonical payment endpoint and serializes the checkout object once', async () => {
  request.mockResolvedValue({ checkout_url: 'https://provider.example.test/checkout' });
  await payment.createCheckoutSession('yearly');
  expect(request).toHaveBeenCalledWith('/payment/subscribe', { method: 'POST', body: { billingCycle: 'yearly', plan: 'pro' } });
});
it.each([
  () => payment.getPaymentMethods(), () => payment.addPaymentMethod({ cardNumber: 'fixture', cardholderName: 'Fixture', expMonth: 1, expYear: 2030 }),
  () => payment.deletePaymentMethod('fixture'), () => payment.setDefaultPaymentMethod('fixture'),
  () => payment.getSubscription(), () => payment.createCheckoutSession(), () => payment.cancelSubscription(), () => payment.getBillingPortal(),
])('does not fabricate a successful result after a failed payment request', async operation => {
  request.mockRejectedValue(new Error('provider unavailable'));
  await expect(operation()).rejects.toThrow('provider unavailable');
});
it('rejects active-content checkout URLs', () => {
  expect(() => payment.redirectToCheckout({ checkout_url: 'javascript:alert(1)' })).toThrow('Invalid checkout URL');
});
