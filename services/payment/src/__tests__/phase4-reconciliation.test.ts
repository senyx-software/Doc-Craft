import {it,expect,vi,afterEach} from 'vitest';
import {providerInstant,addBillingPeriod,retrievePayhereOrder} from '../services/payhere-reconciliation.service.js';
import {summarizeRevenue} from '../services/revenue.service.js';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('requires a verified timestamp offset instead of interpreting provider dates in host time',()=>{
 expect(()=>providerInstant('2026-10-16 10:00:00','')).toThrow('UTC_OFFSET');
 expect(providerInstant('2026-10-16 10:00:00','+05:30').toISOString()).toBe('2026-10-16T04:30:00.000Z');
 expect(addBillingPeriod(new Date('2026-01-31T10:00:00Z'),'monthly').toISOString()).toBe('2026-02-28T10:00:00.000Z');
});
it('does not infer recurring identity without OAuth merchant credentials',async()=>{
 vi.stubEnv('PAYHERE_APP_ID','');vi.stubEnv('PAYHERE_APP_SECRET','');
 await expect(retrievePayhereOrder('owned-order')).rejects.toThrow('OAuth');
});
it('uses only the OAuth-protected subscription identity and rejects ambiguous mandate ownership',async()=>{
 vi.stubEnv('PAYHERE_APP_ID','synthetic-app');vi.stubEnv('PAYHERE_APP_SECRET','synthetic-secret');
 const fetch=vi.fn().mockResolvedValueOnce(Response.json({access_token:'synthetic-token'})).mockResolvedValueOnce(Response.json({status:1,data:[{order_id:'owned',subscription_id:123},{order_id:'owned',subscription_id:456}]}));vi.stubGlobal('fetch',fetch);
 await expect(retrievePayhereOrder('owned')).rejects.toThrow('ambiguous');expect(fetch).toHaveBeenCalledTimes(2);
 expect(fetch.mock.calls[1][0]).toMatch(/sandbox.payhere.lk\/merchant\/v1\/subscription$/);
});
it('reports gross collection, partial/full refunds and net collection separately per currency',()=>{
 const result=summarizeRevenue([], [{currency:'USD',amount:10,status:'paid'},{currency:'LKR',amount:1000,status:'refunded'}],[{currency:'USD',amountMinor:250}]);
 expect(result.by_currency.USD).toMatchObject({total_revenue_paid:10,refunds:2.5,net_collected:7.5});
 expect(result.by_currency.LKR).toMatchObject({total_revenue_paid:1000,refunds:1000,net_collected:0});
});
