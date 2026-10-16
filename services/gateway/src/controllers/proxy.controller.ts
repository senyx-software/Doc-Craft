import type { Request, Response, NextFunction } from 'express';
import { serviceRegistry } from '../services/serviceRegistry.js';
import { ProxyClientService } from '../services/proxyClient.service.js';

/**
 * ProxyController — forwards REST request paths dynamically using the ServiceRegistry.
 */
export async function proxyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const fullPath = req.baseUrl + req.path;
  const matchedService = serviceRegistry.resolve(fullPath);

  if (!matchedService) {
    res.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No registered service prefix matches the request path: ${req.path}`,
        requestId: (req.headers['x-request-id'] as string) || '',
      },
    });
    return;
  }

  try {
    await ProxyClientService.forward(req, res, matchedService.baseUrl);
  } catch (err) {
    next(err);
  }
}
