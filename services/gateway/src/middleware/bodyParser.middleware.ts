import express from 'express';
import type { RequestHandler } from 'express';

const json = express.json({ limit: '2mb' });
const raw = express.raw({ type: () => true, limit: '100kb' });

// Signature verification must receive precisely the bytes sent by the provider.
export const gatewayBodyParser: RequestHandler = (req, res, next) => {
  if (/^\/v1\/(?:payment|billing)\/webhook\/(?:paddle|payhere)\/?$/.test(req.path) || /^\/v1\/notifications?\/webhooks\/resend-status\/?$/.test(req.path)) {
    return raw(req, res, next);
  }
  return json(req, res, next);
};
