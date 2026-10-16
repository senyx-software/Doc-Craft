import {it,expect,vi,beforeEach} from 'vitest';
import {EventEmitter} from 'node:events';
const mock=vi.hoisted(()=>({release:vi.fn(async()=>{}),acquire:vi.fn(async()=>{}),incr:vi.fn(async()=>1),decr:vi.fn(async()=>0)}));
vi.mock('../../services/redis.service.js',()=>({redis:{incr:mock.incr,decr:mock.decr}}));
vi.mock('../../config/env.js',()=>({env:{MAX_CONCURRENT_REQUESTS:2,QUEUE_TIMEOUT_MS:10,MAX_QUEUE_SIZE:3}}));
vi.mock('redis-semaphore',()=>({Semaphore:class{acquire=mock.acquire;release=mock.release;}}));
import {concurrencyLimiter} from '../concurrency.js';
beforeEach(()=>{vi.clearAllMocks();mock.incr.mockResolvedValue(1);mock.acquire.mockResolvedValue(undefined);});
function pair(){const req:any={raw:new EventEmitter(),log:{warn:vi.fn()}},reply:any={raw:new EventEmitter(),status:vi.fn().mockReturnThis(),send:vi.fn()};return {req,reply};}
it('releases each request permit exactly once across finish/close/aborted/finally',async()=>{const {req,reply}=pair();await concurrencyLimiter(req,reply);reply.raw.emit('finish');reply.raw.emit('close');req.raw.emit('aborted');req.releaseConcurrencyPermit();await Promise.resolve();expect(mock.release).toHaveBeenCalledOnce();expect(mock.decr).toHaveBeenCalledOnce();});
it('uses distinct semaphore ownership for concurrent requests',async()=>{const one=pair(),two=pair();await Promise.all([concurrencyLimiter(one.req,one.reply),concurrencyLimiter(two.req,two.reply)]);one.reply.raw.emit('close');two.reply.raw.emit('finish');await Promise.resolve();expect(mock.release).toHaveBeenCalledTimes(2);});
it('full queue and acquisition errors balance queue counts',async()=>{mock.incr.mockResolvedValueOnce(4);let p=pair();await concurrencyLimiter(p.req,p.reply);expect(p.reply.status).toHaveBeenCalledWith(429);expect(mock.decr).toHaveBeenCalledOnce();expect(mock.release).not.toHaveBeenCalled();vi.clearAllMocks();mock.acquire.mockRejectedValueOnce(new Error('timeout'));p=pair();await concurrencyLimiter(p.req,p.reply);expect(p.reply.status).toHaveBeenCalledWith(503);expect(mock.decr).toHaveBeenCalledOnce();});
