import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import type {Redis} from 'ioredis';
const state=vi.hoisted(()=>({fetch:vi.fn(),send:vi.fn()}));
vi.mock('../../../shared/service-auth.mjs',()=>({serviceFetch:state.fetch}));
vi.mock('resend',()=>({Resend:class{emails={send:state.send};}}));
import {sendEmail} from './services/email.service.js';
import {isUnderRateLimit} from './worker.js';
beforeEach(()=>{state.fetch.mockReset();state.send.mockReset();});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it('disabled provider blocks even critical verification mail without making a provider request',async()=>{
 state.fetch.mockResolvedValue(Response.json({settings:{email_provider:'disabled'}}));
 await expect(sendEmail('verify_email',{email:'fixture@example.com',token:'synthetic-code'})).rejects.toThrow('disabled');expect(state.send).not.toHaveBeenCalled();
});
it('policy outage retains the queued send for retry instead of falling back to local provider defaults',async()=>{
 state.fetch.mockResolvedValue(new Response('',{status:503}));
 await expect(sendEmail('verify_email',{email:'fixture@example.com'})).rejects.toThrow('policy unavailable');expect(state.send).not.toHaveBeenCalled();
});
it('provider and policy errors cannot echo credentials, recipients or message content into logs',async()=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const sensitive='synthetic-secret recipient@example.com private-message';
 state.fetch.mockRejectedValueOnce(new Error(sensitive));
 await expect(sendEmail('verify_email',{email:'recipient@example.com'})).rejects.toThrow('policy unavailable');
 vi.stubEnv('RESEND_API_KEY','synthetic-test-only');
 state.fetch.mockResolvedValue(Response.json({settings:{email_provider:'resend'}}));
 state.send.mockResolvedValue({error:{message:sensitive}});
 await expect(sendEmail('verify_email',{email:'recipient@example.com',token:sensitive})).rejects.toThrow('Email delivery failed');
 expect(warning).toHaveBeenCalled();expect(JSON.stringify(warning.mock.calls)).not.toContain(sensitive);
 expect(JSON.stringify(warning.mock.calls)).not.toContain('recipient@example.com');
});
it('email throttling rejects missing or partial Redis transactions and enforces the exact boundary',async()=>{
 const multi:any={};for(const name of ['zremrangebyscore','zcard','zadd','expire'])multi[name]=()=>multi;
 multi.exec=vi.fn();const connection={multi:()=>multi} as unknown as Redis;
 for(const result of [null,[[null,0],[new Error('unavailable'),null],[null,1],[null,1]]]){
  multi.exec.mockResolvedValueOnce(result);await expect(isUnderRateLimit(connection,2)).rejects.toThrow('rate limit unavailable');
 }
 multi.exec.mockResolvedValueOnce([[null,0],[null,2],[null,1],[null,1]]);expect(await isUnderRateLimit(connection,2)).toBe(false);
 multi.exec.mockResolvedValueOnce([[null,0],[null,1],[null,1],[null,1]]);expect(await isUnderRateLimit(connection,2)).toBe(true);
});
it('an expired or uncertain durable receipt blocks the actual provider call',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});vi.stubEnv('RESEND_API_KEY','synthetic-test-only');
 state.fetch.mockResolvedValue(Response.json({settings:{email_provider:'resend'}}));
 await expect(sendEmail('renewal',{email:'fixture@example.com'},'stable-receipt',async()=>{throw new Error('Receipt requires reconciliation');})).rejects.toThrow('Email delivery failed');
 expect(state.send).not.toHaveBeenCalled();
});
it('transactional payment receipts remain enabled when marketing notifications are off and escape invoice facts',async()=>{
 vi.stubEnv('RESEND_API_KEY','synthetic-test-only');
 state.fetch.mockResolvedValue(Response.json({settings:{email_provider:'resend',email_notifications_enabled:false}}));
 state.send.mockResolvedValue({data:{id:'synthetic-receipt'}});
 await sendEmail('payment_receipt',{email:'fixture@example.com',invoiceId:'<script>bad()</script>',amountFormatted:'LKR 9,900.50',currency:'LKR',transactionReference:'provider-ref',gateway:'payhere',paidAt:'2026-10-16T00:00:00Z'},'receipt:invoice-1');
 const [mail,options]=state.send.mock.calls[0];expect(mail.html).toContain('Payment received');expect(mail.html).toContain('LKR 9,900.50');expect(mail.html).toContain('&lt;script&gt;');expect(mail.html).not.toContain('<script>bad()');expect(mail.text).toContain('provider-ref');expect(options.idempotencyKey).toBe('receipt:invoice-1');
 state.fetch.mockResolvedValue(Response.json({settings:{email_provider:'disabled'}}));
 await expect(sendEmail('payment_receipt',{email:'fixture@example.com'})).rejects.toThrow('disabled');expect(state.send).toHaveBeenCalledTimes(1);
});
