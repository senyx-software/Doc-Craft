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
it('reads persisted invoices even when there is no paid-plan entitlement',async()=>{request.mockResolvedValue({invoices:[],pagination:{page:1,total:0,totalPages:0}});expect((await payment.getInvoices()).invoices).toEqual([]);expect(request).toHaveBeenCalledWith('/payment/invoices?page=1&limit=20');});
it('never links non-HTTPS or embedded-credential invoice URLs',()=>{for(const value of ['javascript:alert(1)','http://example.com/receipt','https://user:password@example.com'])expect(payment.providerDocumentUrl(value)).toBeUndefined();});
