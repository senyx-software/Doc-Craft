import { expect, it, vi } from 'vitest';
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
vi.mock('../../config/env.js', () => ({ env: { NODE_ENV: 'production', CORS_ORIGINS: ['https://approved.example'] } }));
import { corsConfig } from '../../security/cors.config.js';
import { ProxyClientService } from '../proxyClient.service.js';

it('retains the gateway CORS decision when an upstream advertises a different frontend origin', async () => {
  const upstream = express();
  upstream.get('/v1/payment/plans', (_req, res) => res.set('Access-Control-Allow-Origin', 'https://stale.example').json({ plans: [] }));
  const origin = upstream.listen(0, '127.0.0.1');
  await once(origin, 'listening');
  const target = `http://127.0.0.1:${(origin.address() as AddressInfo).port}`;
  const gateway = express();
  gateway.use(corsConfig);
  gateway.use((req, res) => { void ProxyClientService.forward(req, res, target); });
  const server = gateway.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/payment/plans`, { headers: { Origin: 'https://approved.example' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://approved.example');
    expect(await response.json()).toEqual({ plans: [] });
    const denied = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/payment/plans`, { headers: { Origin: 'http://localhost:9999' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  } finally {
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => origin.close(() => resolve()))]);
  }
});
