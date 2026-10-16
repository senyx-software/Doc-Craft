import { apiRequest } from './client';

export interface PaymentMethodItem {
  id: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'discover' | 'generic';
  last4: string;
  cardholderName: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}
export interface AddPaymentMethodPayload {
  cardNumber: string;
  cardholderName: string;
  expMonth: number;
  expYear: number;
  cvc?: string;
}
export interface SubscriptionData { plan: string; subscription: { status: string; currentPeriodEnd: string; gateway: string; cancelAtPeriodEnd: boolean } | null; }
export interface PublicPlan {
  id: string; name: string; displayName: string; description: string;
  currency: 'USD' | 'LKR'; priceMonthly: number | null; priceYearly: number | null;
  features: { windowHours?:number; documentsPerDay: number | 'unlimited'; watermark: boolean; customLogo: boolean; allTemplates: boolean; priorityQueue: boolean; shareLinkMaxDays: number };
}
export function getPlans(): Promise<{ plans: PublicPlan[] }> { return apiRequest('/payment/plans'); }
export interface CheckoutSession {
  checkout_url: string;
  gateway?: string;
  form_data?: Record<string, string>;
}
export function getPaymentMethods(): Promise<{ methods: PaymentMethodItem[] }> {
  return apiRequest('/payment/methods');
}
export function addPaymentMethod(data: AddPaymentMethodPayload): Promise<{ success: boolean; method: PaymentMethodItem }> {
  return apiRequest('/payment/methods', { method: 'POST', body: data });
}
export function deletePaymentMethod(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/payment/methods/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function setDefaultPaymentMethod(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/payment/methods/${encodeURIComponent(id)}/default`, { method: 'POST' });
}
export function getSubscription(): Promise<SubscriptionData> {
  return apiRequest('/payment/subscription');
}
export function createCheckoutSession(billingCycle: 'monthly' | 'yearly' = 'monthly', plan = 'pro'): Promise<CheckoutSession> {
  return apiRequest('/payment/subscribe', { method: 'POST', body: { billingCycle, plan } });
}
export function cancelSubscription(): Promise<{ success: boolean; message: string }> {
  return apiRequest('/payment/cancel', { method: 'POST' });
}
export function getBillingPortal(): Promise<{ portal_url: string | null; available: boolean; message?: string }> {
  return apiRequest('/payment/portal', { method: 'POST' });
}

/** Use the provider checkout returned by the server; entitlements come from webhooks. */
export function redirectToCheckout(session: CheckoutSession): void {
  const target = new URL(session.checkout_url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid checkout URL');
  if (session.gateway === 'payhere') {
    if (!session.form_data) throw new Error('Checkout form data is missing');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = target.href;
    for (const [name, value] of Object.entries(session.form_data)) {
      const field = document.createElement('input');
      field.type = 'hidden'; field.name = name; field.value = String(value);
      form.appendChild(field);
    }
    document.body.appendChild(form);
    try { form.submit(); } finally { form.remove(); }
  } else {
    window.location.assign(target.href);
  }
}
