import type { Request, Response } from 'express';
import { upstreamPath } from './upstreamPath.js';

// Headers that we should NOT forward (hop-by-hop headers)
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'public-key-pins',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length', // Let fetch calculate the correct body length
  'host',
]);

/**
 * ProxyClientService — handles standard REST (non-SSE) request forwarding to upstream services.
 */
export class ProxyClientService {
  /**
   * Forwards the incoming request to the target service.
   *
   * @param req             Express request
   * @param res             Express response
   * @param targetBaseUrl   Target service root URL (e.g. http://auth:3011)
   */
  public static async forward(req: Request, res: Response, targetBaseUrl: string): Promise<void> {
    const targetUrl = new URL(upstreamPath(req.originalUrl), targetBaseUrl).toString();

    // Prepare headers
    const headers = new Headers();

    // Copy all request headers except hop-by-hop ones
    for (const [key, value] of Object.entries(req.headers)) {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      if (['forwarded','x-forwarded-for','x-real-ip','x-forwarded-host','x-forwarded-proto'].includes(key.toLowerCase())) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else if (value !== undefined) {
        headers.append(key, value);
      }
    }
    headers.set('X-Forwarded-For', req.ip || req.socket?.remoteAddress || 'unknown');

    // Correlation / Trace ID mapping (already set or create new)
    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    headers.set('X-Request-Id', requestId);
    res.setHeader('X-Request-Id', requestId);

    // Pass downstream headers from gateway JWT decoding
    if (req.headers['x-user-id']) {
      headers.set('x-user-id', req.headers['x-user-id'] as string);
    }
    if (req.headers['x-user-plan']) {
      headers.set('x-user-plan', req.headers['x-user-plan'] as string);
    }
    if (req.headers['x-user-email']) {
      headers.set('x-user-email', req.headers['x-user-email'] as string);
    }

    // Determine if request has body
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body;
    let body: string | Buffer | undefined = undefined;

    if (hasBody) {
      if (typeof req.body === 'object' && !(req.body instanceof Buffer)) {
        body = JSON.stringify(req.body);
        headers.set('Content-Type', 'application/json');
      } else {
        body = req.body as Buffer;
      }
    }

    // Setup abort controller in case the client drops the request
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        redirect: 'manual',
      });

      // Send status code
      res.status(response.status);

      // Copy response headers
      response.headers.forEach((value, key) => {
        // The gateway is the browser security boundary. Service-local CORS
        // settings must not replace the origin already approved here.
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase()) || key.toLowerCase().startsWith('access-control-')) return;
        res.setHeader(key, value);
      });

      // Read and stream body chunks
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`[gateway] Request proxy aborted by client: ${req.method} ${req.url}`);
        return;
      }
      console.error(`[gateway] Upstream proxy error on ${req.method} ${req.url}:`, err);

      // Fallback
      if (!res.headersSent) {
        res.status(503).json({
          error: {
            code: 'DOWNSTREAM_UNAVAILABLE',
            message: 'Downstream service is currently unavailable or timed out.',
            requestId,
          },
        });
      }
    }
  }
}
