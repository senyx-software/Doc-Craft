import type { Request, Response, NextFunction } from 'express';

/**
 * requestLoggerMiddleware — structured JSON logging.
 * Logs standard requests on completion, and SSE streams on open and close separately.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime();
  const suppliedId = req.headers['x-request-id'];
  const requestId = typeof suppliedId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(suppliedId) ? suppliedId : crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);

  const isSse = req.path === '/v1/ai' || req.path === '/v1/chat/message' || req.headers['accept'] === 'text/event-stream';

  if (isSse) {
    // Log SSE connection establishment immediately
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      event: 'sse_connect',
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }));

    // Log connection closure on close event
    req.on('close', () => {
      const diff = process.hrtime(start);
      const durationSeconds = (diff[0] + diff[1] / 1e9).toFixed(3);
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'sse_disconnect',
        method: req.method,
        path: req.path,
        durationSeconds,
      }));
    });
  } else {
    // Standard request logging on finish
    res.on('finish', () => {
      const diff = process.hrtime(start);
      const durationMs = (diff[0] * 1e3 + diff[1] / 1e6).toFixed(2);
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'request',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        ip: req.ip,
      }));
    });
  }

  next();
}
