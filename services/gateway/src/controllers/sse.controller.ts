import type { Request, Response, NextFunction } from 'express';
import { serviceRegistry } from '../services/serviceRegistry.js';
import { SSERelayService } from '../services/sseRelay.service.js';

/**
 * SSEController — relays realtime streaming paths to their internal hosts.
 */
export async function sseHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const fullPath = req.baseUrl + req.path;
  const matchedService = serviceRegistry.resolve(fullPath);

  if (!matchedService) {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No registered service matches the request path: ${fullPath}`,
        requestId: (req.headers['x-request-id'] as string) || '',
      },
    });
    return;
  }

  try {
    await SSERelayService.relay(req, res, matchedService.baseUrl);
  } catch (err) {
    next(err);
  }
}
