import {beforeEach,expect,it,vi} from 'vitest';
import type {Queue} from 'bullmq';
const state=vi.hoisted(()=>({query:vi.fn(),signed:vi.fn()}));
vi.mock('./services/db.service.js',()=>({getDbPool:()=>({query:state.query})}));
vi.mock('../../../shared/queue-auth.mjs',()=>({signedJob:state.signed}));
import {acceptDelivery,projectDeliveries,beginDeliveryAttempt} from './services/delivery-inbox.service.js';
beforeEach(()=>{state.query.mockReset();state.signed.mockReset();});
it('uncertain attempts outside the provider deduplication window require reconciliation before another send',async()=>{
 state.query.mockResolvedValueOnce({rows:[{requiresReview:false}]}).mockResolvedValueOnce({rows:[{requiresReview:true}]}).mockResolvedValueOnce({rows:[]});
 await expect(beginDeliveryAttempt('receipt')).resolves.toBeUndefined();
 await expect(beginDeliveryAttempt('receipt')).rejects.toThrow('receipt reconciliation');
 await expect(beginDeliveryAttempt('receipt')).rejects.toThrow('receipt reconciliation');
});
it('acknowledges only durable acceptance and rejects a changed idempotent payload',async()=>{
 let fingerprint:string|undefined;
 state.query.mockImplementation(async(_sql,values)=>{fingerprint??=values[3];return {rows:[{fingerprint,completedAt:null}]};});
 const payload={userId:'owner',email:'fixture@example.com'};
 const first=await acceptDelivery('payment','renewal',payload,'event:1');
 expect(await acceptDelivery('payment','renewal',payload,'event:1')).toEqual(first);
 await expect(acceptDelivery('payment','cancellation',payload,'event:1')).rejects.toMatchObject({statusCode:409});
 state.query.mockRejectedValueOnce(new Error('Database offline'));
 await expect(acceptDelivery('payment','renewal',payload,'event:2')).rejects.toThrow('Database offline');
});
it('reconstructs a lost Redis job using its durable identity and a fresh signed envelope',async()=>{
 state.query.mockResolvedValueOnce({rows:[{id:'durable-id',type:'renewal'}]}).mockResolvedValue({rows:[]});
 state.signed.mockResolvedValue({data:{authorization:'synthetic-signed-envelope'},opts:{jobId:'durable-id'}});
 const queue={getJob:vi.fn().mockResolvedValue(undefined),add:vi.fn().mockResolvedValue({})};
 await projectDeliveries(queue as unknown as Queue);
 expect(state.signed).toHaveBeenCalledWith('email_queue_notification','renewal',{durableDeliveryId:'durable-id'},'durable-id');
 expect(queue.add).toHaveBeenCalledWith('renewal',{authorization:'synthetic-signed-envelope'},expect.objectContaining({jobId:'durable-id',attempts:3}));
});
it('keeps failed reconstruction pending for retry and can recreate exhausted cache jobs',async()=>{
 state.query.mockResolvedValueOnce({rows:[{id:'durable-id',type:'renewal'}]}).mockResolvedValue({rows:[]});
 const remove=vi.fn().mockResolvedValue(undefined);
 const queue={getJob:vi.fn().mockResolvedValue({getState:async()=>'failed',remove}),add:vi.fn().mockRejectedValue(new Error('Queue offline'))};
 state.signed.mockResolvedValue({data:{authorization:'fixture'},opts:{jobId:'durable-id'}});
 await expect(projectDeliveries(queue as unknown as Queue)).rejects.toThrow('Queue offline');
 expect(remove).toHaveBeenCalledOnce();
 expect(state.query.mock.calls.slice(1).some(([sql])=>sql.includes('"completedAt"=NOW()'))).toBe(false);
});
