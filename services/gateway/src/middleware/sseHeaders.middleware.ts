import type { Request, Response, NextFunction } from 'express';

/**
 * sseHeadersMiddleware — sets up downstream proxy and client headers to prepare for SSE relay.
 */
export function sseHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Ensure compression middleware does not buffer SSE streams
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Set cache-control defensively before entering streaming relay
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  
  next();
}
