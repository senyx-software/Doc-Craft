import {beforeEach,expect,it,vi} from 'vitest';
import {apiRequest,refreshAccessToken} from '../client';
const values=new Map<string,string>();
beforeEach(()=>{values.clear();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});vi.stubGlobal('document',{cookie:''});vi.stubGlobal('window',{location:{protocol:'https:',pathname:'/login',search:''}});});
it('coalesces concurrent renewal and never persists refresh credentials in browser storage',async()=>{
 let finish!:(r:Response)=>void;const fetcher=vi.fn((input:RequestInfo|URL,options?:RequestInit)=>{void input;void options;return new Promise<Response>(resolve=>{finish=resolve});});vi.stubGlobal('fetch',fetcher);
 const first=refreshAccessToken(),second=refreshAccessToken();expect(fetcher).toHaveBeenCalledOnce();finish(Response.json({accessToken:'new-test-access',refreshToken:'must-not-be-stored'}));
 expect(await first).toBe('new-test-access');expect(await second).toBe('new-test-access');expect([...values.values()]).not.toContain('must-not-be-stored');expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'include'});
});
it('retries one authorized request after a real transport401 contract, at most once',async()=>{
 values.set('doccraft_token','old-test-access');const fetcher=vi.fn().mockResolvedValueOnce(Response.json({error:'expired'},{status:401})).mockResolvedValueOnce(Response.json({accessToken:'renewed-test-access'})).mockResolvedValueOnce(Response.json({saved:true}));vi.stubGlobal('fetch',fetcher);
 expect(await apiRequest('/owned-resource')).toEqual({saved:true});expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer renewed-test-access');
});
