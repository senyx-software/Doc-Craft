import { randomUUID } from 'node:crypto';
import { checkChatQuota } from './quotaClient.service.js';
import { getEntitlements, requireEntitlement } from '../../../../shared/entitlements.mjs';
import { modelToolText } from '../../../../shared/model-context.mjs';
import { errorDetails } from '../../../../shared/chat-errors.mjs';
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import type { ModelId } from "./model-router.service.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { validateToolCall } from "../security/tool-guardrails.js";
import { anthropicCircuitBreaker } from "./circuit-breaker.js";
import { claudeResponseTimeSummary } from "./metrics.service.js";

// ─── Singleton Anthropic client ───────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if(!env.ANTHROPIC_API_KEY)throw Object.assign(new Error('Claude is not configured'),{statusCode:503});
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  sourceId?: string;
  createdAt?: string | Date;
}

export type SSEEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; tool: string; input: Record<string, unknown> }
  | { type: "done"; model: string; text?: string }
  | { type: "error"; message: string; code?: string; phase?: string; status?: number; retryable?: boolean };

// ─── Local Fallback Assistant ─────────────────────────────────────────

async function* runLocalFallbackAssistant(
  _messages: ConversationMessage[], _systemPrompt: string, _mcpClient: Client, _sessionId: string,
): AsyncGenerator<SSEEvent> {
  yield {type:'error',code:'PROVIDER_UNCONFIGURED',phase:'provider',retryable:false,message:'AI provider unavailable. Saved information is still available. Please retry.'};
}

// ─── Agentic loop ─────────────────────────────────────────────────────────────

/**
 * Runs a multi-turn Claude conversation with tool support via MCP.
 */
export async function* runAgenticLoop(
  messages: ConversationMessage[],
  model: ModelId,
  systemPrompt: string,
  mcpClient: Client,
  sessionId: string,
  signal?: AbortSignal,
  userId?: string,
): AsyncGenerator<SSEEvent> {
  if(!userId) throw Object.assign(new Error('Verified account required'),{statusCode:403});
  const policy=await getEntitlements(userId);
  requireEntitlement(policy,'ai_enabled');
  if(!policy.claude_models.includes(model)) throw Object.assign(new Error('Model is not permitted'),{statusCode:403,code:'ENTITLEMENT_DENIED'});
  const isApiKeyMissingOrDummy = !env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.includes("REPLACE") || env.ANTHROPIC_API_KEY.includes("your-claude-api-key");
  if (isApiKeyMissingOrDummy) {
    yield* runLocalFallbackAssistant(messages, systemPrompt, mcpClient, sessionId);
    return;
  }

  const client = getClient();

  // 1. Discover tools dynamically from MCP server
  signal?.throwIfAborted();
  const discoverySignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(env.MCP_TIMEOUT_MS)]) : AbortSignal.timeout(env.MCP_TIMEOUT_MS);
  let mcpTools;
  try { ({ tools: mcpTools } = await mcpClient.listTools(undefined, { signal: discoverySignal })); }
  catch(error) { yield {type:'error',...errorDetails(error,'tool')};return; }
  
  // Transform MCP tools (JSON Schema) into Anthropic tools format
  const chatTools: Anthropic.Tool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: {
      ...t.inputSchema,
      type: "object",
    },
  }));

  // Managed context window: keep system prompt + last 30 messages for 200k context window management
  const windowedMessages = messages.slice(-30);
  const conversation: Anthropic.MessageParam[] = windowedMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const MAX_ITERATIONS = 10;

  let lastValidationFailure:any;let rejectedExtraction=false;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    signal?.throwIfAborted();

    const reservation=await checkChatQuota(userId,policy.plan,'provider:'+randomUUID());
    if(!reservation.allowed)throw Object.assign(new Error('Quota exceeded'),{statusCode:403,code:'QUOTA_EXCEEDED'});
    const startTime = Date.now();
    const claudeTimeoutSignal = AbortSignal.timeout(env.CLAUDE_TIMEOUT_MS);
    const combinedSignal = signal ? AbortSignal.any([signal, claudeTimeoutSignal]) : claudeTimeoutSignal;

    const realModel = model;

    // Stream one Claude turn through the Circuit Breaker
    let stream;
    try {
      stream = await anthropicCircuitBreaker.fire(
        client,
        {
          model: realModel,
          max_tokens: 4096,
          system: systemPrompt,
          messages: conversation,
          tools: chatTools.length > 0 ? chatTools : undefined,
        },
        { signal: combinedSignal }
      );
    } catch (err: any) {
      const errMsg = (err.message || "").toLowerCase();
      if (errMsg.includes("401") || errMsg.includes("authentication_error") || errMsg.includes("api key") || errMsg.includes("invalid")) {
        console.warn("[claude.service] Anthropic API authentication failed (invalid key). Falling back to local assistant.");
        yield* runLocalFallbackAssistant(messages, systemPrompt, mcpClient, sessionId);
        return;
      }
      if (errMsg.includes("breaker is open")) {
        yield { type: 'error',code:'PROVIDER_FAILED',phase:'provider',retryable:true,message:'AI service is temporarily unavailable.' };
        return;
      }
      yield {type:'error',...errorDetails(err,'provider')};return;
    }

    const textBlocks = new Map<number, string>();
    const toolBlocks = new Map<number, { id: string; name: string; inputBuffer: string }>();
    const assistantContent: Anthropic.ContentBlockParam[] = [];

    for await (const event of stream) {
      signal?.throwIfAborted();

      switch (event.type) {
        case "content_block_start":
          if (event.content_block.type === "text") {
            textBlocks.set(event.index, "");
          } else if (event.content_block.type === "tool_use") {
            toolBlocks.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              inputBuffer: "",
            });
          }
          break;

        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            const prev = textBlocks.get(event.index) ?? "";
            textBlocks.set(event.index, prev + event.delta.text);
            yield { type: "token", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            const tb = toolBlocks.get(event.index);
            if (tb) tb.inputBuffer += event.delta.partial_json;
          }
          break;

        case "content_block_stop":
          if (textBlocks.has(event.index)) {
            const text = textBlocks.get(event.index)!;
            if (text) assistantContent.push({ type: "text", text });
            textBlocks.delete(event.index);
          } else if (toolBlocks.has(event.index)) {
            const tb = toolBlocks.get(event.index)!;
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = JSON.parse(tb.inputBuffer || "{}");
            } catch {
              yield {type:'error',code:'TOOL_SCHEMA_INVALID',phase:'tool',retryable:false,message:'Invalid tool arguments'};return;
            }
            assistantContent.push({
              type: "tool_use",
              id: tb.id,
              name: tb.name,
              input: parsedInput,
            });
            toolBlocks.delete(event.index);
          }
          break;
      }
    }

    const finalMessage = await stream.finalMessage();
    claudeResponseTimeSummary.observe(Date.now() - startTime);
    conversation.push({ role: "assistant", content: assistantContent });

    if (finalMessage.stop_reason === "end_turn") {
      const text=assistantContent.filter(block=>block.type==="text").map(block=>(block as Anthropic.TextBlock).text).join("").trim();
      if(!text){yield {type:"error",code:"RESPONSE_INCOMPLETE",phase:"provider",message:"Incomplete AI response"};return;}
      yield { type: "done", model, text };
      return;
    }

    if (finalMessage.stop_reason === "tool_use") {
      let needsUserInput = false;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type !== "tool_use") continue;
        const toolBlock = block as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

        yield { type: "tool_call", tool: toolBlock.name, input: toolBlock.input };

        try {
          // Tool Guardrail: ensure tool is allowed and not cross-session
          const validation = validateToolCall(toolBlock.name, toolBlock.input, sessionId);
          if (!validation.isAllowed) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: `Guardrail Blocked: ${validation.reason}`,
              is_error: true,
            });
            yield {type:'error',code:'TOOL_SCHEMA_INVALID',phase:'tool',retryable:false,message:'Tool not permitted'};return;
          }

          const mcpTimeoutSignal = AbortSignal.timeout(env.MCP_TIMEOUT_MS);
          const combinedMcpSignal = signal ? AbortSignal.any([signal, mcpTimeoutSignal]) : mcpTimeoutSignal;

          // Execute tool over MCP — pass the combined signal so the call
          // is cancelled if the client disconnects or the timeout fires.
          const result = await mcpClient.callTool(
            {
              name: toolBlock.name,
              arguments: toolBlock.input,
            },
            undefined,
            { signal: combinedMcpSignal },
          );
          
          if(result.isError) {
            let details:any={};try{details=JSON.parse((result.content as any[])?.find(block=>block.type==='text')?.text||'{}');}catch{}
            if(['EVIDENCE_REJECTED','TOOL_SCHEMA_INVALID','VALIDATION_FAILED'].includes(details.code)) {
                lastValidationFailure={code:details.code,phase:'tool',status:details.status,retryable:true};
                toolResults.push({type:'tool_result',tool_use_id:toolBlock.id,content:modelToolText(result.content),is_error:true});continue;
            }
            yield {type:'error',code:details.code||'TOOL_FAILED',phase:'tool',status:details.status,retryable:details.retryable,message:'Document update failed'};return;
          }
          let outcomes:any[]=[];try {outcomes=JSON.parse((result.content as any[])?.find(block=>block.type==='text')?.text||'{}').operationResults||[];}catch{}
          rejectedExtraction ||= outcomes.some(outcome=>outcome.outcome==='rejected');
          needsUserInput ||= !!(toolBlock.input as any)?.requestField || outcomes.some(outcome=>['conflicting','needs_confirmation','needs_value'].includes(outcome.outcome)||outcome.outcome==='rejected'&&!['EVIDENCE_REJECTED','OWNERSHIP_UNRESOLVED'].includes(outcome.code));
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: modelToolText(result.content),
            is_error: result.isError as boolean | undefined,
          });
        } catch (err: any) {
          yield {type:'error',code:err.name==='TimeoutError'?'TOOL_TIMEOUT':'TOOL_FAILED',phase:'tool',message:'Document tool unavailable'};return;

        }
      }

      if(assistantContent.filter(block=>block.type==='tool_use').every(block=>(block as Anthropic.ToolUseBlock).name==='update_slots') && needsUserInput) {yield {type:'done',model,text:assistantContent.filter(block=>block.type==='text').map(block=>(block as Anthropic.TextBlock).text).join('').trim()};return;}
      conversation.push({ role: "user", content: toolResults });
      continue;
    }

    yield {type:"error",code:"RESPONSE_INCOMPLETE",phase:"provider",message:"Incomplete AI response"};
    return;
  }

  if(rejectedExtraction&&!lastValidationFailure){yield {type:"done",model};return;}
  yield { type: "error",code:"RESPONSE_INCOMPLETE",phase:"provider", ...lastValidationFailure, message: "Agentic loop exceeded maximum iterations" };
}
