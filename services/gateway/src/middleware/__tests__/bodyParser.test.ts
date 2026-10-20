import { expect, it } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { gatewayBodyParser } from '../bodyParser.middleware.js';

it.each(['payment', 'billing'])('preserves signed webhook bytes for %s including JSON whitespace', async alias => {
  const app = express();
  app.use(gatewayBodyParser);
  app.post(`/v1/${alias}/webhook/paddle`, (req, res) => {
    res.json({ raw: Buffer.isBuffer(req.body), bytes: req.body.toString('utf8') });
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const body = '{ "event_type" : "subscription.created",\n "data": {} }';
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/${alias}/webhook/paddle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    expect(await response.json()).toEqual({ raw: true, bytes: body });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it('allows larger template uploads while retaining limits on other routes and oversized uploads', async () => {
  const app = express();
  app.use(gatewayBodyParser);
  app.post('*', (_req, res) => res.json({ok:true}));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const send = (path:string, bytes:number) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({data:'a'.repeat(bytes)}),
    });
    expect((await send('/v1/document/templates/uploads', 3 * 1024 * 1024)).status).toBe(200);
    expect((await send('/v1/document/generate', 3 * 1024 * 1024)).status).toBe(413);
    expect((await send('/v1/document/templates/uploads', 7 * 1024 * 1024)).status).toBe(413);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
