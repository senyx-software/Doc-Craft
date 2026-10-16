import type { FastifyInstance } from 'fastify';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from '../services/mcp.service.js';
import { conversations } from '../services/conversation.repository.js';
const transports = new Map<string, {
    transport: SSEServerTransport;
    server: ReturnType<typeof createMcpServer>;
    userId: string;
}>();
export async function mcpRoutes(fastify: FastifyInstance) {
    fastify.get('/mcp', async (req, reply) => {
        const userId = (req as any).user?.id;
        const sessionId = (req.query as any).chatSessionId;
        if (!userId || typeof sessionId !== 'string')
            return reply.status(401).send({ error: 'Authenticated chat session required' });
        await conversations.load(userId, sessionId);
        const server = createMcpServer(sessionId, userId), transport = new SSEServerTransport(req.url.startsWith('/v1/chat') ? '/v1/chat/api/mcp/message' : '/api/mcp/message', reply.raw);
        reply.hijack();
        transports.set(transport.sessionId, { server, transport, userId });
        reply.raw.once('close', () => { transports.delete(transport.sessionId); void server.close().catch(() => { }); });
        await server.connect(transport);
    });
    fastify.post('/mcp/message', async (req, reply) => {
        const entry = transports.get((req.query as any).sessionId);
        if (!entry || entry.userId !== (req as any).user?.id)
            return reply.status(403).send({ error: 'MCP session access denied' });
        reply.hijack();
        await entry.transport.handlePostMessage(req.raw, reply.raw, req.body);
    });
}
