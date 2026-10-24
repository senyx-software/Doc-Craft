export function subscriptionBillingFacts(subscription: any) {
  const plan = subscription?.plan;
  const billingCycle = subscription?.billingCycle || (plan?.priceYearly ? 'yearly' : 'monthly');
  const amount = plan?.priceMonthly ?? plan?.priceYearly ?? 0;
  const currency = plan?.currency || 'USD';
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd ?? false;
  return {
    amount,
    currency,
    billing_cycle: billingCycle,
    cancel_at_period_end: cancelAtPeriodEnd
  };
}
