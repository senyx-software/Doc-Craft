import {it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {SSERelayService} from '../sseRelay.service.js';
afterEach(()=>vi.unstubAllGlobals());
function pair(){const req:any=new EventEmitter();Object.assign(req,{method:'POST',headers:{authorization:'Bearer signed'},originalUrl:'/v1/chat/api/chat/session/s/message',body:{message:'x'}});const res:any=new EventEmitter();Object.assign(res,{headersSent:false,writableEnded:false,destroyed:false,status:vi.fn(function(this:any,status:number){this.statusCode=status;return this;}),json:vi.fn(),setHeader:vi.fn(),set:vi.fn(function(this:any){return this;}),flushHeaders:vi.fn(function(this:any){this.headersSent=true;}),write:vi.fn(),end:vi.fn(function(this:any){this.writableEnded=true;})});return {req,res};}
for(const status of [401,403,404,410,429,503])it('preserves upstream HTTP '+status+' without flushing success headers',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('private upstream detail',{status})));const {req,res}=pair();await SSERelayService.relay(req,res,'http://test.local');expect(res.status).toHaveBeenCalledWith(status);expect(res.flushHeaders).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].outcome).toBe('failure');expect(JSON.stringify(res.json.mock.calls)).not.toContain('private upstream');});
it('request close from consumed POST body does not abort response',async()=>{const {req,res}=pair();vi.stubGlobal('fetch',vi.fn(async(_url:any,options:any)=>{req.emit('close');expect(options.signal.aborted).toBe(false);return new Response('data: {"type":"done"}\n\n');}));await SSERelayService.relay(req,res,'http://test.local');expect(res.write).toHaveBeenCalled();expect(res.end).toHaveBeenCalled();});
it('downstream disconnect aborts upstream and cleans listeners',async()=>{const {req,res}=pair();vi.stubGlobal('fetch',vi.fn(async(_url:any,options:any)=>{res.destroyed=true;res.emit('close');expect(options.signal.aborted).toBe(true);throw new Error('aborted');}));await SSERelayService.relay(req,res,'http://test.local');expect(res.listenerCount('close')).toBe(0);expect(req.listenerCount('aborted')).toBe(0);});
it('uncategorized upstream throttling keeps its retry delay and a useful error code',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({statusCode:429,error:'Too Many Requests',message:'private detail'},{status:429,headers:{'Retry-After':'45'}})));
 const {req,res}=pair();await SSERelayService.relay(req,res,'http://test.local');
 expect(res.json.mock.calls[0][0]).toMatchObject({code:'CHAT_RATE_LIMITED',status:429,retryAfter:45,retryable:true});expect(res.setHeader).toHaveBeenCalledWith('Retry-After','45');expect(JSON.stringify(res.json.mock.calls)).not.toContain('private detail');
});
it('structured nested upstream codes survive the relay',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'QUOTA_EXCEEDED'}},{status:403})));
 const {req,res}=pair();await SSERelayService.relay(req,res,'http://test.local');expect(res.json.mock.calls[0][0].code).toBe('QUOTA_EXCEEDED');
});
