import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({fetch:vi.fn(),defer:vi.fn(),invoice:vi.fn(),context:true}));
vi.mock('../../../../shared/service-auth.mjs',()=>({serviceFetch:state.fetch}));
vi.mock('../services/payment-outbox.service.js',()=>({deferPaymentEffect:state.defer}));
vi.mock('../db/transaction-context.js',()=>({paymentTransaction:{getStore:()=>state.context?{}:undefined}}));
vi.mock('../db/prisma.js',()=>({prisma:{billingInvoice:{upsert:state.invoice}}}));
vi.mock('../services/paymentConfigClient.service.js',()=>({paymentConfigClient:{}}));
vi.mock('../services/paddle.client.js',()=>({paddle:{}}));
import {upsertInvoice,deliverPaymentReceipt} from '../services/subscription.service.js';
const invoice={id:'invoice-1',userId:'owner',subscriptionId:'sub',gateway:'payhere' as const,gatewayInvoiceId:'trusted-ref',amount:9900.50,currency:'LKR',status:'paid' as const,paidAt:new Date('2026-10-16T00:00:00Z')};
beforeEach(()=>{state.context=true;state.fetch.mockReset();state.defer.mockReset().mockResolvedValue(true);state.invoice.mockReset().mockResolvedValue(invoice);});
it('atomically schedules trusted invoice facts after a verified paid write',async()=>{
 await upsertInvoice(invoice);expect(state.defer).toHaveBeenCalledWith('receipt',{invoiceId:'invoice-1',userId:'owner',amount:9900.5,currency:'LKR',gateway:'payhere',transactionReference:'trusted-ref',paidAt:'2026-10-16T00:00:00.000Z'});expect(state.fetch).not.toHaveBeenCalled();
});
it('fails before writing a paid invoice outside its verified transaction',async()=>{
 state.context=false;await expect(upsertInvoice(invoice)).rejects.toThrow('Verified payment transaction');expect(state.invoice).not.toHaveBeenCalled();
});
it.each(['open','failed','refunded'] as const)('does not send a success receipt for %s invoices',async(status)=>{
 state.invoice.mockResolvedValue({...invoice,status});await upsertInvoice({...invoice,status});expect(state.defer).not.toHaveBeenCalled();
});
it('receipt outbox failure rejects the reducer rather than acknowledging partial billing',async()=>{
 state.defer.mockRejectedValue(new Error('outbox unavailable'));await expect(upsertInvoice(invoice)).rejects.toThrow('outbox unavailable');
});
it.each([['LKR',9900.5,'LKR 9,900.50'],['JPY',150,'JPY 150'],['KWD',1.234,'KWD 1.234']])('formats %s using its currency precision and reuses a stable delivery key',async(currency,amount,formatted)=>{
 state.fetch.mockImplementation(async()=>Response.json({status:'durably_accepted',deliveryId:'delivery'}));
 const data={...invoice,invoiceId:invoice.id,email:'fixture@example.com',currency,amount};
 await deliverPaymentReceipt(data,'receipt:invoice-1');await deliverPaymentReceipt(data,'receipt:invoice-1');
 const bodies=state.fetch.mock.calls.map(call=>JSON.parse(call[2].body));expect(bodies[0]).toEqual(bodies[1]);expect(bodies[0].payload.amountFormatted).toBe(formatted);expect(bodies[0].type).toBe('payment_receipt');
});
it('requires a durable acknowledgement and rejects incomplete invoice facts',async()=>{
 state.fetch.mockResolvedValue(Response.json({status:'queued'}));await expect(deliverPaymentReceipt({...invoice,invoiceId:invoice.id,email:'fixture@example.com'},'receipt:invoice-1')).rejects.toThrow('acknowledgement');
 await expect(deliverPaymentReceipt({...invoice,invoiceId:invoice.id,amount:NaN},'receipt:invoice-1')).rejects.toThrow('Invalid');
});
