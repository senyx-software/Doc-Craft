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
