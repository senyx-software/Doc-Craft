import { paymentConfigClient } from './paymentConfigClient.service.js';

export type Gateway = 'paddle' | 'payhere';

/** Synchronous fallback router — Sri Lankan customers (country === 'LK') -> PayHere, others -> Paddle */
export function selectGateway(country: string): Gateway {
  return country.toUpperCase() === 'LK' ? 'payhere' : 'paddle';
}

/** Async dynamic router — consults Admin-managed payment settings while preserving country routing */
export async function selectGatewayAsync(country: string, currency?: 'USD' | 'LKR'): Promise<Gateway> {
  const settings = await paymentConfigClient.getPaymentSettings();

  const allowed = (gateway: Gateway) => settings[gateway === 'paddle' ? 'allow_paddle' : 'allow_payhere'] !== false;
  const forced = settings.default_payment_provider;
  if (forced === 'payhere' || forced === 'paddle') {
    if (!allowed(forced)) throw Object.assign(new Error('Selected payment provider is disabled'), {statusCode:503});
    return forced;
  }
  const preferred = currency === 'LKR' ? 'payhere' : currency === 'USD' ? 'paddle' : selectGateway(country);
  if (allowed(preferred)) return preferred;
  const alternative = preferred === 'payhere' ? 'paddle' : 'payhere';
  if (allowed(alternative)) return alternative;
  throw Object.assign(new Error('Payments are disabled by the administrator'), {statusCode:503});
}
