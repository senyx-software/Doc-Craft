/** Explicitly approved, bounded live Groq + real MCP/PostgreSQL probe.
 * Run only through the isolated native harness. No SDK retries or emails.
 */
import {writeFileSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createMcpServer} from '../services/chat/src/services/mcp.service.js';
import {runConfiguredAgenticLoop} from '../services/chat/src/services/provider-router.service.js';
import {conversations} from '../services/chat/src/services/conversation.repository.js';
import {db,closeDb} from '../services/chat/src/services/db.service.js';
import {snapshot} from '../shared/conversation-state.mjs';

if(process.env.PHASE5_APPROVED_GROQ!=='8_REQUESTS_USD_0.10'||!process.env.DATABASE_URL?.includes('/doccraft_phase4_'))throw new Error('Explicit approval and isolated fixture database required');
const approval=JSON.parse(readFileSync(new URL('../docs/system-audit/evidence/phase5/provider-authorization.json',import.meta.url),'utf8'));
if(approval.further_paid_calls?.startsWith('DISABLED'))throw new Error('Further paid provider calls explicitly disabled by owner');
const [userId,sessionId,output]=process.argv.slice(2);
// Public Groq production price checked 2026-10-16:
// https://console.groq.com/docs/models : GPT OSS 20B $0.075/$0.30 per 1M.
const budget={request_limit:8,usd_limit:0.10,model:'openai/gpt-oss-20b',price_per_million:{input:0.075,output:0.30},attempts:[] as any[],reserved_usd:0,observed_usd:0};
// A prior ledger consumes the same authorization; never silently reset it.
try {Object.assign(budget,JSON.parse(readFileSync(output+'.budget.json','utf8')));}catch(e:any){if(e.code!=='ENOENT')throw e;}
const save=()=>writeFileSync(output+'.budget.json',JSON.stringify(budget,null,2)+'\n');
const realFetch=globalThis.fetch;const checks:any[]=[];const tools:any[]=[];
const check=(workflow:string,passed:boolean,evidence?:unknown)=>checks.push({workflow,status:passed?'PASS':'FAIL',evidence});
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 if(url!=='https://api.groq.com/openai/v1/chat/completions')return realFetch(input,init);
 const body=JSON.parse(String(init?.body));
 const bytes=Buffer.byteLength(String(init?.body));const maxCost=(60000*0.075+2048*0.30)/1e6;
 if(budget.attempts.length>=8||budget.reserved_usd+maxCost>0.10||body.model!==budget.model||bytes>60000||body.max_tokens>2048)throw Object.assign(new Error('Approved live budget exhausted or request out of bounds'),{code:'TEST_BUDGET_EXHAUSTED'});
 const row:any={attempt:budget.attempts.length+1,request_bytes:bytes,max_output_tokens:body.max_tokens,worst_case_reserved_usd:maxCost};
 budget.attempts.push(row);budget.reserved_usd+=maxCost;save();
 const start=Date.now();
 try {
  const response=await realFetch(input,init);row.http_status=response.status;row.latency_ms=Date.now()-start;row.request_id=response.headers.get('x-request-id');
  const result=await response.clone().json() as any;
  row.usage=result.usage;row.finish_reason=result.choices?.[0]?.finish_reason;row.tool_names=result.choices?.[0]?.message?.tool_calls?.map((tool:any)=>tool.function?.name)||[];
  row.provider_error_code=result.error?.code;
  if(result.usage)budget.observed_usd+=(result.usage.prompt_tokens*0.075+result.usage.completion_tokens*0.30)/1e6;
  save();return response;
 }catch(error:any){row.error_type=error.name;row.cause_code=error.cause?.code;save();throw error;}
};
const system=`You are the DocCraft invoice assistant. Today is 2026-10-16 UTC. Use update_slots to persist only literal supported user facts, with evidence copied exactly from the current user message. Use stable IDs from current state for item updates. Use fieldOperations for notes, taxes and discounts. Do not request confirmation unless the user explicitly asks you to. If explicitly asked to confirm before applying, persist confirmBeforeApply and confirmationQuestion. After a successful update, give a short acknowledgement. Existing values are available via get_session_state. Never invent missing fields. All messages are synthetic staging tests.`;
const history:any[]=[];
async function turn(message:string,label:string,long=false){
 const turnId=randomUUID();const claim=await conversations.claim(userId,sessionId,turnId,message);
 const server=createMcpServer(sessionId,userId,{turnId,token:claim.token,message});
 const [left,right]=InMemoryTransport.createLinkedPair();const client=new Client({name:'phase5-live',version:'1'},{capabilities:{}});
 await Promise.all([server.connect(right),client.connect(left)]);
 const originalCall=client.callTool.bind(client);
 client.callTool=(async(...args:any[])=>{const result=await (originalCall as any)(...args);tools.push({turn:label,name:args[0].name,isError:!!result.isError,synthetic_arguments:args[0].arguments,synthetic_result:result.content});return result;}) as any;
 const padding=long?Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:i%2?'The saved invoice remains available.':'This is synthetic conversation continuity context '+i+'. Please retain the existing invoice.'})):[];
 let done:any;const errors:any[]=[];
 try {
  for await(const event of runConfiguredAgenticLoop([...padding,...history,{role:'user',content:message}],system,client,sessionId,AbortSignal.timeout(90000),userId,{requireMutation:true})){
   if(event.type==='done')done=event;
   if(event.type==='error')errors.push({code:event.code,phase:event.phase});
  }
  await conversations.finish(userId,sessionId,turnId,claim.token,done?.text||'',done?'success':'failure');
  check(label+' live completion',!!done&&!errors.length,{model:done?.model,errors,live_attempts:budget.attempts.length});
  history.push({role:'user',content:message},{role:'assistant',content:done?.text||'Provider response unavailable; saved state retained.'});
  return snapshot(await conversations.load(userId,sessionId));
 } finally {await Promise.all([client.close(),server.close()]);}
}
try {
 if(budget.attempts.length>=7) {
  const state=await turn('Business name is Synthetic Studio. Please ask for the client name next.','bounded simple extraction');
  check('Simple live extraction commits through MCP',state.slots.businessName==='Synthetic Studio',{slots:state.slots});
 } else {
 const first=await turn('Business name is Synthetic Studio. Client name is Synthetic Buyer. Invoice number is STAGE-501. Issue date is 2026-10-16. Due date is 2026-11-16. Currency is USD. Add Design with quantity 2 and unit price 50. Tax rate is 10%. Discount is 5%. Notes: Deliver by email.','initial extraction');
 check('Live extracted fields persist in PostgreSQL',first.slots.businessName==='Synthetic Studio'&&first.slots.clientName==='Synthetic Buyer'&&first.slots.invoiceNumber==='STAGE-501',{slots:first.slots});
 if(budget.attempts.length<=5){
  const second=await turn('Correct the business name to Synthetic Studio Updated. Change the Design quantity to 3. Change discount to 10%. Notes: Call before delivery.','correction and long-session continuity',true);
  check('Live correction persists and preserves document identity',second.slots.businessName==='Synthetic Studio Updated'&&second.slots.invoiceNumber==='STAGE-501',{slots:second.slots});
  check('Live line-item update and discount persist',(second.slots.lineItems||[]).some((item:any)=>item.quantity===3)&&second.slots.discountValue===10,{slots:second.slots});
 }
 if(budget.attempts.length<=7){
  const third=await turn('Please ask for my confirmation before changing the client name to Pending Buyer.','pending confirmation');
  check('Requested confirmation leaves committed client intact',third.slots.clientName==='Synthetic Buyer'&&JSON.stringify(third).includes('Pending Buyer'),{pending:third.pendingOperation||third.nextAction,clientName:third.slots.clientName});
 }
 }
 check('Real provider MCP tool execution occurred',tools.some(tool=>tool.name==='update_slots'&&!tool.isError),{tools});
 check('Live requests stay within explicit approval',budget.attempts.length<=8&&budget.reserved_usd<=0.10,{attempts:budget.attempts.length,reserved_usd:budget.reserved_usd,observed_usd:budget.observed_usd});
} catch(error:any){checks.push({workflow:'Live execution',status:'FAIL',evidence:{name:error.name,code:error.code}});}
finally {
 globalThis.fetch=realFetch;await closeDb();save();
 writeFileSync(output,JSON.stringify({checked_at:new Date().toISOString(),scope:'Actual approved Groq completions through application provider router, real MCP SDK transport and real PostgreSQL; native fixture stack, not deployed containers',checks,tools,budget,claude:'BLOCKED: no staging key/project authorized',browser:'BLOCKED: host sandbox unavailable'},null,2)+'\n');
}
console.log(JSON.stringify({checks:checks.map(({workflow,status})=>({workflow,status})),attempts:budget.attempts.length,observed_usd:budget.observed_usd}));
process.exitCode=checks.some(check=>check.status==='FAIL')?1:0;
