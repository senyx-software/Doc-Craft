import {expect,it} from 'vitest';
import {subscriptionBillingFacts} from '../services/subscription-display.service.js';
it('preserves actual LKR and yearly USD facts without substituting catalog monthly prices',()=>{
 expect(subscriptionBillingFacts({billingAmountMinor:99000,billingCurrency:'LKR',billingCycle:'monthly'})).toMatchObject({amount:990,currency:'LKR',billing_cycle:'monthly'});
 expect(subscriptionBillingFacts({billingAmountMinor:12000,billingCurrency:'USD',billingCycle:'yearly'})).toMatchObject({amount:120,currency:'USD',billing_cycle:'yearly'});
});
it('does not fabricate financial figures for legacy unknown billing facts',()=>{
 expect(subscriptionBillingFacts({billingAmountMinor:null,billingCurrency:null,billingCycle:null})).toMatchObject({amount:null,currency:null,billing_facts_recorded:false});
 expect(subscriptionBillingFacts({billingAmountMinor:12000,billingCurrency:'USD',billingCycle:null}).amount).toBeNull();
});
