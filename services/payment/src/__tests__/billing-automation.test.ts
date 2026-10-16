import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({fetch:vi.fn(),defer:vi.fn()}));
vi.mock('../../../../shared/service-auth.mjs',()=>({serviceFetch:state.fetch}));
vi.mock('../services/payment-outbox.service.js',()=>({deferPaymentEffect:state.defer}));
vi.mock('../db/prisma.js',()=>({prisma:{}}));
vi.mock('../services/paymentConfigClient.service.js',()=>({paymentConfigClient:{}}));
vi.mock('../services/paddle.client.js',()=>({paddle:{}}));
import {emitAutomationEvent} from '../services/subscription.service.js';
beforeEach(()=>{state.fetch.mockReset();state.defer.mockReset().mockResolvedValue(false);});
it('defers billing automation inside the reducer without contacting a dependency',async()=>{
 state.defer.mockResolvedValue(true);await emitAutomationEvent('payment.failed',{user_id:'owner'});expect(state.fetch).not.toHaveBeenCalled();
});
it('retains outbox delivery when the downstream response lacks a durable receipt',async()=>{
 state.fetch.mockResolvedValue(Response.json({status:'queued'}));await expect(emitAutomationEvent('payment.failed',{user_id:'owner'},'event:action')).rejects.toThrow('Automation delivery unavailable');
});
it('uses the same durable downstream event identity across delivery retries',async()=>{
 state.fetch.mockImplementation(async()=>Response.json({durably_accepted:true}));
 await emitAutomationEvent('payment.failed',{user_id:'owner'},'event:action');await emitAutomationEvent('payment.failed',{user_id:'owner'},'event:action');
 expect(state.fetch.mock.calls.map(call=>JSON.parse(call[2].body).delivery_id)).toEqual(['event:action','event:action']);
 expect(state.fetch.mock.calls[0][1]).toMatch(/\/api\/v1\/internal\/automation\/events$/);
});
