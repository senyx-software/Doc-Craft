import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * errorHandlerMiddleware — catches all unhandled errors and format them into the standard error schema.
 */
export function errorHandlerMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || '';

  // If response headers are already sent, delegate to standard Express handler
  if (res.headersSent) {
    return next(err);
  }

  console.error(`[gateway/errorHandler] Unhandled Error on ${req.method} ${req.path}:`, err);

  const isProduction = env.NODE_ENV === 'production';

  // Map timeouts and 5xx failures to 503
  let status = err.status || err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred on the gateway.';

  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    status = 503;
    code = 'DOWNSTREAM_UNAVAILABLE';
    message = 'Downstream service is currently unavailable or timed out.';
  }

  res.status(status).json({
    error: {
      code,
      message: isProduction && status === 500 ? 'An unexpected internal error occurred.' : message,
      requestId,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}
