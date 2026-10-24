import { checkChatQuota } from './quotaClient.service.js';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { getEntitlements, requireEntitlement } from '../../../../shared/entitlements.mjs';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ConversationMessage, SSEEvent } from './claude.service.js';
import { trackAiGeneration, trackAiSpan } from './posthogTracking.service.js';
import { modelToolText } from '../../../../shared/model-context.mjs';
const models = (env.GROQ_MODELS || 'openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b').split(',').map(model=>model.trim()).filter(Boolean);
type ProviderFailure = {code:string;status:number;retryable:boolean};
const failurePriority = (failure:ProviderFailure) => ({PROVIDER_UNCONFIGURED:1,PROVIDER_FAILED:2,PROVIDER_TIMEOUT:3,PROVIDER_TOOL_REJECTED:4,PROVIDER_RATE_LIMITED:5,CONTEXT_LIMIT:6}[failure.code] || 0);
export async function* runGroqAgenticLoop(messages: ConversationMessage[], systemPrompt: string, mcpClient: Client, _sessionId: string, signal?: AbortSignal, userId = 'anonymous', requirements: {requireMutation?:boolean;plan?:string} = {}): AsyncGenerator<SSEEvent> {
    const policy=await getEntitlements(userId);
    requireEntitlement(policy,'ai_enabled');
    const allowedModels=models.filter(model=>policy.groq_models===null || policy.groq_models.includes(model));
    if(!allowedModels.length) throw Object.assign(new Error('No permitted AI model'),{statusCode:403,code:'ENTITLEMENT_DENIED'});
    if (!env.GROQ_API_KEY) {
        yield { type: 'error', code:'PROVIDER_UNCONFIGURED',phase:'provider',retryable:false, message: 'AI provider is not configured' };
        return;
    }
    const traceId = randomUUID();
    const listed = await mcpClient.listTools(undefined,{signal});
    const tools = listed.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
    const history: any[] = [{ role: 'system', content: systemPrompt }, ...messages];
    let lastValidationFailure:any;let rejectedExtraction=false;let lastModel='';let mutationResolved=false;
    for (let iteration = 0; iteration < 6; iteration++) {
        if (JSON.stringify(history).length > 100000) {
            yield { type: 'error',code:'CONTEXT_LIMIT',phase:'context',retryable:false, message: 'Context limit reached. Saved information is still available.' };
            return;
        }
        signal?.throwIfAborted();
        let data: any, model = '', failure:ProviderFailure|undefined;
        const rememberFailure=(next:ProviderFailure)=>{if(!failure||failurePriority(next)>failurePriority(failure))failure=next;};
        for (const candidate of allowedModels) {
            signal?.throwIfAborted();
            const reservation=await checkChatQuota(userId,policy.plan,'provider:'+randomUUID());
            if(!reservation.allowed)throw Object.assign(new Error('Quota exceeded'),{statusCode:403,status:403,code:'QUOTA_EXCEEDED',phase:'quota',retryable:false});
            const start = Date.now();
            try {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: candidate, messages: history, tools, tool_choice: 'auto', temperature: 0, max_tokens: 2048, ...(candidate.startsWith('openai/gpt-oss-')?{reasoning_effort:'low'}:{}), stream: false }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(env.GROQ_TIMEOUT_MS)]) : AbortSignal.timeout(env.GROQ_TIMEOUT_MS) });
                if (!response.ok) {
                    let details:any={};try{details=await response.json();}catch{}
                    const upstreamCode=typeof details.error?.code==='string'&&/^[a-z0-9_-]{1,100}$/i.test(details.error.code)?details.error.code:undefined;
                    const code=response.status===413||upstreamCode==='context_length_exceeded'?'CONTEXT_LIMIT':response.status===429?'PROVIDER_RATE_LIMITED':response.status===401||response.status===403||upstreamCode==='model_not_found'?'PROVIDER_UNCONFIGURED':upstreamCode==='tool_use_failed'?'PROVIDER_TOOL_REJECTED':'PROVIDER_FAILED';
                    rememberFailure({code,status:response.status===429?429:code==='CONTEXT_LIMIT'?422:503,retryable:!['PROVIDER_UNCONFIGURED','CONTEXT_LIMIT'].includes(code)});
                    // Never log API keys, prompts, raw provider messages or
                    // failed_generation (which can contain user document data).
                    console.warn('[groq] request rejected',JSON.stringify({sessionId:_sessionId,model:candidate,status:response.status,code:upstreamCode,requestId:response.headers.get('x-request-id')}));
                    continue;
                }
                data = await response.json();
                if(!data?.choices?.[0]?.message) {
                    rememberFailure({code:'PROVIDER_FAILED',status:503,retryable:true});
                    data=undefined;continue;
                }
                model = candidate;
                trackAiGeneration({ userId, sessionId: _sessionId, traceId, model, provider: 'groq', inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens, latencyMs: Date.now() - start });
                break;
            }
            catch (error:any) {
                rememberFailure({code:error?.name==='TimeoutError'?'PROVIDER_TIMEOUT':'PROVIDER_FAILED',status:error?.name==='TimeoutError'?504:503,retryable:true});
                console.warn('[groq] request failed',JSON.stringify({sessionId:_sessionId,model:candidate,name:error?.name}));
                if (signal?.aborted)
                    signal.throwIfAborted();
            }
        }
        const answer = data?.choices?.[0]?.message;
        if (!answer) {
            yield {type:'error',phase:'provider',...(failure||{code:'PROVIDER_UNCONFIGURED',status:503,retryable:false}),message:'AI response unavailable. Saved information is still available.'};
            return;
        }
        lastModel=model;history.push(answer);
        if (!answer.tool_calls?.length) {
            if(requirements.requireMutation&&!mutationResolved){
                history.push({role:'system',content:'This turn requests a document edit. Execute update_slots with evidenced supported changes, or persist a targeted clarification using the supported tool schema. Existing line items support update and removal by ID. Do not claim editing is unsupported or ask for confirmation without saving its operation. Do not invent values or bypass validation.'});
                continue;
            }
            if (!answer.content?.trim() || data.choices[0].finish_reason === 'length') {
                yield {type:'error',code:'RESPONSE_INCOMPLETE',phase:'provider',message:'Incomplete AI response'};
                return;
            }
            yield { type: 'done', model, text: answer.content.trim() };
            return;
        }
        let needsUserInput = false;
        for (const tool of answer.tool_calls) {
            if (!['update_slots', 'get_session_state','edit_canvas','get_editor_selection','undo_document','redo_document','propose_language_correction'].includes(tool.function.name)) {
                yield {type:'error',code:'TOOL_SCHEMA_INVALID',phase:'tool',retryable:false,message:'Invalid tool request'};
                return;
            }
            let args;
            try {
                args = JSON.parse(tool.function.arguments || '{}');
            }
            catch {
                yield {type:'error',code:'TOOL_SCHEMA_INVALID',phase:'tool',retryable:false,message:'Invalid extracted data'};
                return;
            }
            const start = Date.now();
            let result;
            try { result = await mcpClient.callTool({ name: tool.function.name, arguments: args }, undefined, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(env.MCP_TIMEOUT_MS)]) : AbortSignal.timeout(env.MCP_TIMEOUT_MS) }); }
            catch (error:any) {yield {type:'error',code:error?.name==='TimeoutError'?'TOOL_TIMEOUT':'TOOL_FAILED',phase:'tool',message:'Document tool unavailable'};return;}
            trackAiSpan({ userId, sessionId: _sessionId, traceId, spanName: tool.function.name, input: { fields: Object.keys(args.slots || {}) }, output: { isError: !!result.isError }, latencyMs: Date.now() - start, isError: !!result.isError });
            if (result.isError) {
                let details:any={};try{details=JSON.parse((result.content as any[])?.find(block=>block.type==='text')?.text||'{}');}catch{}
                if(['EVIDENCE_REJECTED','TOOL_SCHEMA_INVALID','VALIDATION_FAILED'].includes(details.code)) {
                    lastValidationFailure={code:details.code,phase:'tool',status:details.status,retryable:true};
                    history.push({role:'tool',tool_call_id:tool.id,content:modelToolText(result.content)});continue;
                }
                yield {type:'error',code:details.code||'TOOL_FAILED',phase:'tool',status:details.status,retryable:details.retryable,message:'Document update failed. Saved information is still available.'};
                return;
            }
            const payload=(result.content as any[])?.find(block=>block.type==='text')?.text;
            let outcomes:any[]=[];try {const parsed=JSON.parse(payload||'{}');outcomes=parsed.operationResults||[];mutationResolved ||= parsed.editorApplied===true;}catch{}
            if(tool.function.name==='update_slots') {
                let committed:any;try{committed=JSON.parse(payload||'{}');}catch{}
                mutationResolved ||= outcomes.some(outcome=>['committed','cleared','unchanged','retained','skipped','conflicting','needs_confirmation','needs_value'].includes(outcome.outcome)) || !!args.requestField&&committed?.nextAction?.field===args.requestField;
            }
            rejectedExtraction ||= outcomes.some(outcome=>outcome.outcome==='rejected');
            needsUserInput ||= !!args.requestField || outcomes.some(outcome=>['conflicting','needs_confirmation','needs_value'].includes(outcome.outcome)||outcome.outcome==='rejected'&&!['EVIDENCE_REJECTED','OWNERSHIP_UNRESOLVED'].includes(outcome.code));
            history.push({ role: 'tool', tool_call_id: tool.id, content: modelToolText(result.content) });
        }
        if(needsUserInput && answer.tool_calls.every((tool:any)=>tool.function.name==='update_slots')) {yield {type:'done',model,text:answer.content?.trim()};return;}
    }
    if(rejectedExtraction&&!lastValidationFailure){yield {type:'done',model:lastModel};return;}
    yield { type: 'error',code:'RESPONSE_INCOMPLETE',phase:'provider',...lastValidationFailure, message: 'The response is incomplete. Retry to continue from saved information.' };
}
