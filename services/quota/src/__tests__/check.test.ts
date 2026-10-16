import {it,expect,vi,beforeEach} from 'vitest';
import {LedgerFixture} from './ledgerFixture.js';
import {FakeRedis} from './fakeRedis.js';
const database=new LedgerFixture(),redis=new FakeRedis();
const policy={version:1,account_enabled:true,plan:'free',daily_quota:3,quota_policy:{window_hours:20}};
vi.mock('../db/prisma.js',()=>({prisma:database}));
vi.mock('../db/redis.js',()=>({getRedis:()=>redis}));
vi.mock('../../../../shared/entitlements.mjs',()=>({getEntitlements:async(user_id:string)=>({...policy,user_id})}));
const {checkAndReserve,refundUsage,getStatus}=await import('../services/quota.service.js');
beforeEach(()=>{database.reset();redis.reset();Object.assign(policy,{account_enabled:true,plan:'free',daily_quota:3,quota_policy:{window_hours:20}});});
it('bounds concurrent distinct reservations to the current account allowance',async()=>{
 const results=await Promise.all(Array.from({length:20},(_,i)=>checkAndReserve('u','spoofed-max','request:'+i)));
 expect(results.filter(value=>value.allowed)).toHaveLength(3);expect((await getStatus('u','spoofed-max')).used).toBe(3);
});
it('concurrent retries have one durable receipt and refunds cannot subtract twice',async()=>{
 const results=await Promise.all(Array.from({length:12},()=>checkAndReserve('u','free','document:a')));
 expect(results.every(value=>value.allowed&&value.used===1)).toBe(true);
 await checkAndReserve('u','free','document:b');
 expect(await Promise.all(Array.from({length:8},()=>refundUsage('u','free','document:a')))).toEqual(Array(8).fill(1));
 expect((await checkAndReserve('u','free','document:a')).allowed).toBe(false);
 expect(await refundUsage('u','free','chat:document:b')).toBe(1);
});
it('Redis data loss does not erase usage or durable refund identities',async()=>{
 await checkAndReserve('u','free','a');await checkAndReserve('u','free','b');redis.reset();
 expect((await getStatus('u','free')).used).toBe(2);expect(await refundUsage('u','free','a')).toBe(1);
 redis.reset();expect(await refundUsage('u','free','a')).toBe(1);
});
it('starts the 20-hour window at first reservation and preserves it through midnight and plan changes',async()=>{
 const status=await getStatus('u','free');expect((status as any).window_started).toBe(false);expect(database.windows.size).toBe(0);
 const first=await checkAndReserve('u','free','a');expect(first.resets_at).toBe('2026-10-17T19:50:00.000Z');
 database.now=new Date('2026-10-17T00:10:00Z');policy.daily_quota=25;
 expect((await checkAndReserve('u','max','b')).resets_at).toBe(first.resets_at);
 policy.daily_quota=1;expect((await checkAndReserve('u','free','c')).allowed).toBe(false);
 database.now=new Date(first.resets_at);expect((await checkAndReserve('u','free','c')).used).toBe(1);
 expect(await refundUsage('u','free','a')).toBe(1);
});
it('suspension denies even a previously accepted receipt',async()=>{
 await checkAndReserve('u','free','a');policy.account_enabled=false;policy.daily_quota=0;
 expect((await checkAndReserve('u','free','a')).allowed).toBe(false);
});
it('a refunded receipt cannot become another charge after the window expires',async()=>{
 await checkAndReserve('u','free','a');await refundUsage('u','free','a');database.now=new Date('2026-10-19T00:00:00Z');
 expect((await checkAndReserve('u','free','a')).allowed).toBe(false);
 expect((await checkAndReserve('u','free','new')).used).toBe(1);
});
