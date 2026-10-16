import {it,expect,vi,beforeEach} from 'vitest';
import {LedgerFixture} from './ledgerFixture.js';
import {FakeRedis} from './fakeRedis.js';
const database=new LedgerFixture(),redis=new FakeRedis(),policy=vi.fn();
vi.mock('../db/prisma.js',()=>({prisma:database}));
vi.mock('../db/redis.js',()=>({getRedis:()=>redis}));
vi.mock('../../../../shared/entitlements.mjs',()=>({getEntitlements:policy}));
const {checkAndReserve,getStatus}=await import('../services/quota.service.js');
beforeEach(()=>{database.reset();redis.reset();policy.mockReset();});
const allow=(limit:number)=>policy.mockResolvedValue({account_enabled:true,plan:'free',daily_quota:limit,quota_policy:{window_hours:20}});
it('fails closed before reserving when the authority cannot verify current benefits',async()=>{
 policy.mockRejectedValue(new Error('Policy unavailable'));
 await expect(checkAndReserve('u','max','a')).rejects.toThrow('Policy unavailable');expect(database.receipts.size).toBe(0);
});
it('ignores forged Redis overrides and caller plan claims',async()=>{
 allow(3);await redis.set('quota:limit:u','-1');await redis.set('quota:plan:max','-1');
 expect((await getStatus('u','max')).limit).toBe(3);
});
it('admin changes and expired overrides restore the current baseline without losing usage',async()=>{
 allow(10);await checkAndReserve('u','free','a');allow(3);
 expect(await getStatus('u','free')).toMatchObject({used:1,limit:3,remaining:2});
});
it('unlimited is explicit policy, and every provider attempt still has a receipt',async()=>{
 allow(-1);for(let i=0;i<40;i++)expect((await checkAndReserve('u','free','attempt:'+i)).allowed).toBe(true);
 expect((await getStatus('u','free')).used).toBe(40);expect(database.receipts.size).toBe(40);
});
