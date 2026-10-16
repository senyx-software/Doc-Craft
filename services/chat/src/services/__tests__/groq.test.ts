vi.mock('../quotaClient.service.js',()=>({checkChatQuota:vi.fn(async()=>({allowed:true}))}));
vi.mock('../../../../../shared/entitlements.mjs',async()=>{
 const actual=await vi.importActual<any>('../../../../../shared/entitlements.mjs');
 return {...actual,getEntitlements:async(user_id:string)=>({version:1,user_id,account_enabled:true,plan:'pro',ai_enabled:true,claude_models:['claude-haiku-4-5','claude-sonnet-4-5'],groq_models:null,custom_logo:true})};
});
vi.mock('../planConfigClient.service.js', () => ({ getGroqModelsForPlan: async (_plan: string, available: string[]) => available }));
import {it,expect,vi,afterEach} from 'vitest';
vi.mock('../../config/env.js',()=>({env:{GROQ_API_KEY:'synthetic-test-key',GROQ_TIMEOUT_MS:200,MCP_TIMEOUT_MS:200}}));
vi.mock('../posthogTracking.service.js',()=>({trackAiGeneration:vi.fn(),trackAiSpan:vi.fn()}));
import {runGroqAgenticLoop} from '../groq.service.js';
import {toolSchema} from '../../../../../shared/document-contract.mjs';
afterEach(()=>vi.unstubAllGlobals());
const mcp=()=>({listTools:async()=>({tools:[{name:'update_slots',inputSchema:toolSchema('invoice')}]}),callTool:vi.fn(async()=>({content:[{type:'text',text:'{"slots":{"businessName":"Nexora"}}'}]}))});
it('HTTP 413 token-size rejection is classified as context size instead of an unexplained provider failure',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'rate_limit_exceeded'}},{status:413})));
 try{expect((await events(mcp())).at(-1)).toMatchObject({type:'error',code:'CONTEXT_LIMIT',status:422,retryable:false});}finally{warn.mockRestore();}
});
async function events(client:any){const out=[];for await(const e of runGroqAgenticLoop([{role:'user',content:'My business is Nexora'}],'Known facts: Nexora',client,'s'))out.push(e);return out;}
it('provider fallback preserves context and uses discovered canonical tool schema',async()=>{const bodies:any[]=[];let count=0;vi.stubGlobal('fetch',vi.fn(async(_url:any,init:any)=>{bodies.push(JSON.parse(init.body));return ++count===1?new Response('',{status:429}):Response.json({choices:[{message:{content:'Acknowledged'},finish_reason:'stop'}]});}));expect((await events(mcp())).at(-1)?.type).toBe('done');expect(bodies[0].messages).toEqual(bodies[1].messages);expect(bodies[1].tools[0].function.parameters.properties.slots.properties.lineItems).toBeTruthy();});
it('empty or truncated final response is an error rather than successful completion',async()=>{for(const response of [{content:''},{content:'partial',finish:'length'}]){vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{message:{content:response.content},finish_reason:response.finish||'stop'}]})));expect((await events(mcp())).at(-1)?.type).toBe('error');}});
it('failed MCP commit terminates without success or a saved acknowledgement',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{message:{tool_calls:[{id:'tool',function:{name:'update_slots',arguments:'{"slots":{"businessName":"Nexora"}}'}}]}}]})));const client=mcp();client.callTool.mockResolvedValue({content:[{type:'text',text:'not committed'}],isError:true} as any);const result=await events(client);expect(result.at(-1)?.type).toBe('error');expect(result.some(e=>e.type==='done')).toBe(false);});
it('compound extraction continues across tool batches before finishing the response',async()=>{
 let count=0;
 vi.stubGlobal('fetch',vi.fn(async()=>{count++;const field=count===1?'notesAndTerms':'accountDetails',value=count===1?'valid 30 days':'boc panadura 007903232';return Response.json({choices:[{message:count<=2?{tool_calls:[{id:'tool-'+count,function:{name:'update_slots',arguments:JSON.stringify({slots:{[field]:value},evidence:{[field]:value}})}}]}:{content:'Saved notes and bank details.'},finish_reason:count<=2?'tool_calls':'stop'}]});}));
 const client=mcp();client.callTool.mockResolvedValue({content:[{type:'text',text:'{"operationResults":[{"outcome":"committed"}]}'}]});
 const result=[];for await(const e of runGroqAgenticLoop([{role:'user',content:'add note valid 30 days add my bank detalis boc panadura 007903232'}],'Extract all remaining clauses',client,'s'))result.push(e);
 expect(client.callTool).toHaveBeenCalledTimes(2);expect(count).toBe(3);expect(result.at(-1)).toMatchObject({type:'done',text:'Saved notes and bank details.'});
});
it('invalid model evidence receives tool feedback and is repaired before the reply',async()=>{
 let count=0;const bodies:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:any,init:any)=>{bodies.push(JSON.parse(init.body));count++;return Response.json({choices:[{message:count<=2?{tool_calls:[{id:'tool-'+count,function:{name:'update_slots',arguments:JSON.stringify({slots:{accountDetails:count===1?'Invented':'boc panadura 007903232'},evidence:{accountDetails:'boc panadura 007903232'}})}}]}:{content:'Saved bank details.'},finish_reason:count<=2?'tool_calls':'stop'}]});}));
 const c=mcp();c.callTool.mockResolvedValueOnce({isError:true,content:[{type:'text',text:'{"code":"EVIDENCE_REJECTED","hint":"Use literal facts"}'}]} as any).mockResolvedValueOnce({content:[{type:'text',text:'{"operationResults":[{"outcome":"committed"}]}'}]});
 const result=await events(c);expect(result.some(e=>e.type==='error')).toBe(false);expect(result.at(-1)?.type).toBe('done');expect(c.callTool).toHaveBeenCalledTimes(2);expect(JSON.stringify(bodies[1].messages)).toContain('EVIDENCE_REJECTED');
});
it('per-field evidence rejection is repaired instead of ending a compound extraction early',async()=>{
 let count=0;vi.stubGlobal('fetch',vi.fn(async()=>{count++;return Response.json({choices:[{message:count<=2?{tool_calls:[{id:'tool-'+count,function:{name:'update_slots',arguments:JSON.stringify({slots:{accountDetails:'boc panadura 007903232'},evidence:{accountDetails:count===1?'BOC, Panadura':'boc panadura 007903232'}})}}]}:{content:'Saved bank details.'},finish_reason:count<=2?'tool_calls':'stop'}]});}));
 const c=mcp();c.callTool.mockResolvedValueOnce({content:[{type:'text',text:'{"operationResults":[{"outcome":"rejected","code":"EVIDENCE_REJECTED"}],"hint":"Copy exact source text"}'}]}).mockResolvedValueOnce({content:[{type:'text',text:'{"operationResults":[{"outcome":"committed"}]}'}]});expect((await events(c)).at(-1)?.type).toBe('done');expect(c.callTool).toHaveBeenCalledTimes(2);
});

it('unavailable fallback model cannot mask an upstream provider rate limit',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});let count=0;
 vi.stubGlobal('fetch',vi.fn(async()=>++count<3?Response.json({error:{code:'rate_limit_exceeded'}},{status:429}):Response.json({error:{code:'model_not_found'}},{status:404})));
 try{expect((await events(mcp())).at(-1)).toMatchObject({type:'error',code:'PROVIDER_RATE_LIMITED',status:429,retryable:true});}finally{warn.mockRestore();}
});
it('uses the currently available Qwen fallback and never logs provider document contents or API keys',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});let count=0;const bodies:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url:any,init:any)=>{bodies.push(JSON.parse(init.body));return ++count<3?Response.json({error:{code:'tool_use_failed',message:'private document data',failed_generation:'private bank account'}},{status:400}):Response.json({choices:[{message:{content:'Completed'},finish_reason:'stop'}]});}));
 try{
  expect((await events(mcp())).at(-1)).toMatchObject({type:'done',model:'qwen/qwen3.8-27b'});
  expect(bodies[0].reasoning_effort).toBe('low');expect(bodies[2].reasoning_effort).toBeUndefined();
  expect(JSON.stringify(warn.mock.calls)).toContain('tool_use_failed');expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|synthetic-test-key/);
 }finally{warn.mockRestore();}
});
it('all rejected tool generations report the provider extraction failure without executing failed_generation',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{code:'tool_use_failed',failed_generation:'{"slots":{"businessName":"Invented"}}'}},{status:400})));
 const client=mcp();
 try{expect((await events(client)).at(-1)).toMatchObject({type:'error',code:'PROVIDER_TOOL_REJECTED',retryable:true});expect(client.callTool).not.toHaveBeenCalled();}finally{warn.mockRestore();}
});
it('malformed successful provider envelope falls back instead of ending before another available model',async()=>{
 let count=0;vi.stubGlobal('fetch',vi.fn(async()=>++count===1?Response.json({choices:[]}):Response.json({choices:[{message:{content:'Recovered'},finish_reason:'stop'}]})));
 expect((await events(mcp())).at(-1)).toMatchObject({type:'done',text:'Recovered'});expect(count).toBe(2);
});

it('edit turns repair a prose-only refusal and complete only after a validated update tool',async()=>{
 const bodies:any[]=[];let count=0;vi.stubGlobal('fetch',vi.fn(async(_url:any,init:any)=>{bodies.push(JSON.parse(init.body));count++;return Response.json({choices:[{message:count===2?{tool_calls:[{id:'edit',function:{name:'update_slots',arguments:JSON.stringify({itemOperations:[{operation:'update',id:'item-0',item:{quantity:2}}]})}}]}:{content:count===1?'Existing item editing is unsupported. Please confirm replacement.':'Updated the quantity.'},finish_reason:count===2?'tool_calls':'stop'}]});}));
 const client=mcp();client.callTool.mockResolvedValue({content:[{type:'text',text:'{"operationResults":[{"field":"lineItems","outcome":"committed"}]}'}]});const result=[];for await(const e of runGroqAgenticLoop([], 'system',client as any,'s',undefined,'u',{requireMutation:true}))result.push(e);
 expect(client.callTool).toHaveBeenCalledTimes(1);expect(result.at(-1)).toMatchObject({type:'done',text:'Updated the quantity.'});expect(JSON.stringify(bodies[1].messages)).toContain('Execute update_slots');
});
it('a persistent no-tool refusal cannot become a successful edit or a phantom confirmation',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{message:{content:'Please confirm replacement; edits are unsupported.'},finish_reason:'stop'}]})));
 const result=[];for await(const e of runGroqAgenticLoop([], 'system',mcp() as any,'s',undefined,'u',{requireMutation:true}))result.push(e);
 expect(result.some(e=>e.type==='done')).toBe(false);expect(result.at(-1)).toMatchObject({type:'error',code:'RESPONSE_INCOMPLETE'});
});
it('reading saved state and submitting an empty update do not fulfill an edit request',async()=>{
 let count=0;vi.stubGlobal('fetch',vi.fn(async()=>{count++;return Response.json({choices:[{message:{tool_calls:[{id:'noop-'+count,function:{name:count%2?'get_session_state':'update_slots',arguments:'{}'}}]},finish_reason:'tool_calls'}]});}));
 const client=mcp();client.callTool.mockImplementation(async(args:any)=>({content:[{type:'text',text:JSON.stringify({operationResults:args.name==='get_session_state'?[{outcome:'committed'}]:[]})}]}));
 const result=[];for await(const e of runGroqAgenticLoop([], 'system',client as any,'s',undefined,'u',{requireMutation:true}))result.push(e);expect(result.at(-1)).toMatchObject({type:'error'});expect(result.some(e=>e.type==='done')).toBe(false);
});
it('ordinary questions still allow provider text without a mutation tool',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({choices:[{message:{content:'Quantity is the number of units.'},finish_reason:'stop'}]})));const client=mcp();expect((await events(client)).at(-1)).toMatchObject({type:'done',text:'Quantity is the number of units.'});expect(client.callTool).not.toHaveBeenCalled();
});
