import {configureServiceFixture,serviceHeaders} from '../../../../../shared/tests/service-fixtures.mjs';
import {serviceNonceStore} from '../../../../../shared/service-auth.mjs';
import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../services/db.service.js', () => ({ db: { chatSession: { findUnique: vi.fn(async () => null) } } }));
vi.mock('../../services/conversation.repository.js', () => ({ conversations: { load: vi.fn() } }));
import { internalResourceRoutes } from '../internal-resources.routes.js';
afterEach(() => vi.unstubAllEnvs());

it('private MCP rejects callers without the service credential', async () => {
  configureServiceFixture('chat');vi.spyOn(serviceNonceStore,'claim').mockResolvedValue(true);
  const app = Fastify(); await app.register(internalResourceRoutes);
  try {
    for (const headers of [{}, { 'x-internal-secret': 'wrong' }]) {
      expect((await app.inject({ method: 'POST', url: '/internal/resources', headers, payload: {} })).statusCode).toBe(401);
    }
  } finally { await app.close(); }
});

it('the control-plane transport exposes resources and rejects mutation tools', async () => {
  configureServiceFixture('chat');vi.spyOn(serviceNonceStore,'claim').mockResolvedValue(true);
  const app = Fastify(); await app.register(internalResourceRoutes);
  const headers = { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-03-26' };
  try {
    const response = await app.inject({ method: 'POST', url: '/internal/resources', headers: {...headers,...await serviceHeaders('admin-api','chat','POST','/internal/resources',JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_slots', arguments: {} } }))}, payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_slots', arguments: {} } } });
    expect(response.json().error.code).toBe(-32601);
    const read = await app.inject({ method: 'POST', url: '/internal/resources', headers: {...headers,...await serviceHeaders('admin-api','chat','POST','/internal/resources',JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'chat://sessions/00000000-0000-4000-8000-000000000000' } }))}, payload: { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'chat://sessions/00000000-0000-4000-8000-000000000000' } } });
    expect(JSON.parse(read.json().result.contents[0].text).found).toBe(false);
  } finally { await app.close(); }
});
