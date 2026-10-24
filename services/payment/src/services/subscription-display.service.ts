/** Recorded billing facts only; an entitlement or current catalog price is not a payment. */
export function subscriptionBillingFacts(subscription:{billingAmountMinor:number|null;billingCurrency:string|null;billingCycle:string|null}) {
  const valid=Number.isSafeInteger(subscription.billingAmountMinor) && subscription.billingAmountMinor!>=0 &&
    ['USD','LKR'].includes(subscription.billingCurrency||'') && ['monthly','yearly'].includes(subscription.billingCycle||'');
  return {amount:valid?subscription.billingAmountMinor!/100:null,currency:subscription.billingCurrency,
    billing_cycle:subscription.billingCycle,billing_facts_recorded:valid};
}
