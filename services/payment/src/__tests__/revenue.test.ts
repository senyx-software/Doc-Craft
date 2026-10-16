import {expect,it} from 'vitest';
import {summarizeRevenue} from '../services/revenue.service.js';
it('normalizes annual revenue and separates currencies without guessing legacy amounts',()=>{
 const result=summarizeRevenue([
  {billingAmountMinor:12000,billingCurrency:'USD',billingCycle:'yearly',gateway:'paddle',plan:{name:'pro'}},
  {billingAmountMinor:99000,billingCurrency:'LKR',billingCycle:'monthly',gateway:'payhere',plan:{name:'max'}},
  {billingAmountMinor:null,billingCurrency:null,billingCycle:null,gateway:'payhere',plan:{name:'pro'}},
 ],[{currency:'USD',amount:120},{currency:'LKR',amount:990}]);
 expect(result.by_currency.USD.mrr).toBe(10);
 expect(result.by_currency.LKR.mrr).toBe(990);
 expect(result.by_currency.USD.total_revenue_paid).toBe(120);
 expect(result.by_currency.LKR.total_revenue_paid).toBe(990);
 expect(result.unreconciled_subscription_count).toBe(1);
});
