export type Plan = 'free' | 'pro';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

export interface Subscription {
  plan: string;
  status: SubscriptionStatus;
  current_period_end: string;
  gateway: 'paddle' | 'payhere';
  gateway_customer_id: string;
}
