vi.mock('../quotaClient.service.js',()=>({checkChatQuota:vi.fn(async()=>({allowed:true}))}));
vi.mock('../../../../../shared/entitlements.mjs',async()=>{
 const actual=await vi.importActual<any>('../../../../../shared/entitlements.mjs');
 return {...actual,getEntitlements:async(user_id:string)=>({version:1,user_id,account_enabled:true,plan:'pro',ai_enabled:true,claude_models:['claude-haiku-4-5','claude-sonnet-4-5'],groq_models:null,custom_logo:true})};
});
import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({fire:vi.fn()}));
vi.mock('../../config/env.js',()=>({env:{ANTHROPIC_API_KEY:'synthetic',CLAUDE_TIMEOUT_MS:1000,MCP_TIMEOUT_MS:1000}}));
vi.mock('../circuit-breaker.js',()=>({anthropicCircuitBreaker:{fire:mocks.fire}}));
vi.mock('../metrics.service.js',()=>({claudeResponseTimeSummary:{observe:vi.fn()}}));
import {runAgenticLoop} from '../claude.service.js';
import {toolSchema} from '../../../../../shared/document-contract.mjs';
beforeEach(()=>vi.clearAllMocks());
function stream(tool?:string,stop='end_turn') {
 return {async *[Symbol.asyncIterator](){
  if(tool){yield {type:'content_block_start',index:0,content_block:{type:'tool_use',id:'call',name:tool}};yield {type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{}'}};yield {type:'content_block_stop',index:0};}
  else {yield {type:'content_block_start',index:0,content_block:{type:'text'}};yield {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Relevant Claude reply'}};yield {type:'content_block_stop',index:0};}
 },finalMessage:async()=>({stop_reason:tool?'tool_use':stop})};
}
async function run(client:any){const out=[];for await(const event of runAgenticLoop([{role:'user',content:'Explain this document'}],'claude-haiku-4-5','system',client,'s',undefined,'u'))out.push(event);return out;}
const client=()=>({listTools:async()=>({tools:[{name:'get_session_state',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'update_slots',inputSchema:toolSchema('invoice')}]}),callTool:vi.fn(async()=>({content:[{type:'text',text:'{}'}]}))});
it('T44 discovered state tool is allowed; full schema and configured model retained; final text preserved',async()=>{
 mocks.fire.mockResolvedValueOnce(stream('get_session_state')).mockResolvedValueOnce(stream());const c=client(),out=await run(c);
 expect(c.callTool).toHaveBeenCalled();expect(out.at(-1)).toMatchObject({type:'done',text:'Relevant Claude reply'});
 expect(mocks.fire.mock.calls[0][1].model).toBe('claude-haiku-4-5');expect(mocks.fire.mock.calls[0][1].tools[1].input_schema.additionalProperties).toBe(false);
});
it('T44 failed tool and truncated response never complete successfully',async()=>{
 mocks.fire.mockResolvedValueOnce(stream('get_session_state'));const c=client();c.callTool.mockResolvedValueOnce({isError:true,content:[]} as any);expect((await run(c)).at(-1)?.type).toBe('error');
 mocks.fire.mockResolvedValueOnce(stream(undefined,'max_tokens'));expect((await run(client())).at(-1)?.type).toBe('error');
});
it('Claude completes multiple update batches instead of stopping after the first saved field',async()=>{
 mocks.fire.mockResolvedValueOnce(stream('update_slots')).mockResolvedValueOnce(stream('update_slots')).mockResolvedValueOnce(stream());const c=client();c.callTool.mockResolvedValue({content:[{type:'text',text:'{"operationResults":[{"outcome":"committed"}]}'}]});const out=[];
 for await(const event of runAgenticLoop([{role:'user',content:'add notes and bank details'}],'claude-haiku-4-5','system',c,'s',undefined,'u'))out.push(event);
 expect(c.callTool).toHaveBeenCalledTimes(2);expect(out.at(-1)).toMatchObject({type:'done',text:'Relevant Claude reply'});
});
