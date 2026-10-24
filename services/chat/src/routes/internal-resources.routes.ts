import { authorizeService, captureServiceBody } from '../../../../shared/service-auth.mjs';
import type { FastifyInstance } from 'fastify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ReadResourceRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { db } from '../services/db.service.js';
import { conversations } from '../services/conversation.repository.js';
import { snapshot } from '../../../../shared/conversation-state.mjs';

/** Private control-plane MCP transport. User MCP remains owner-scoped SSE. */
export async function internalResourceRoutes(app: FastifyInstance) {
  app.addHook('preParsing', captureServiceBody);
  app.get('/internal/ai/outcomes',{preValidation:async(request,reply)=>{
    try{await authorizeService('chat',request);}catch(error){return reply.status((error as {statusCode?:number}).statusCode||503).send({error:'Service authorization rejected'});}
  }},async()=>{
    const now=new Date(),createdAt={gte:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1))};
    const count=(key:string,value:string|boolean)=>db.chatMessage.count({where:{role:'ASSISTANT',createdAt,metadata:{path:[key],equals:value}}});
    const [total_messages,successful_turns,deterministic_messages,inference_messages,editor_attempts,editor_successes,document_ready_turns]=await Promise.all([
      db.chatMessage.count({where:{role:'USER',createdAt}}),db.chatMessage.count({where:{role:'ASSISTANT',createdAt}}),count('processingRoute','deterministic'),count('processingRoute','inference'),count('editorAttempt',true),count('editorApplied',true),count('documentReady',true),
    ]);
    return {available:true,total_messages,successful_turns,deterministic_messages,inference_messages,editor_attempts,editor_successes,document_ready_turns};
  });
  app.post('/internal/resources', { preValidation: async (request, reply) => {
    try { await authorizeService('chat', request); }
    catch (error) {return reply.status((error as {statusCode?:number}).statusCode || 503).send({error:'Service authorization rejected'});}
  } }, async (request, reply) => {
    const server = new Server({ name: 'doccraft-support-resources', version: '1.0.0' }, { capabilities: { resources: {} } });
    server.setRequestHandler(ReadResourceRequestSchema, async message => {
      const match = /^chat:\/\/sessions\/([0-9a-f-]{36})$/i.exec(message.params.uri);
      if (!match) throw new McpError(ErrorCode.InvalidParams, 'Unsupported resource URI');
      const session = await db.chatSession.findUnique({ where: { id: match[1] } });
      const resource = session ? {
        session_id: session.id, found: true,
        state: snapshot(await conversations.load(session.userId, session.id)),
        messages: await db.chatMessage.findMany({ where: { sessionId: session.id, flaggedPromptInjection: false }, select: { role: true, content: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
      } : { session_id: match[1], found: false };
      return { contents: [{ uri: message.params.uri, mimeType: 'application/json', text: JSON.stringify(resource) }] };
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.once('close', () => { void server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
}
