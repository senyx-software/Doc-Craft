import type { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../security/jwtVerifier.js';

// Explicit public routes list (bypasses authentication checks per Technical Document v1.0 Section 12)
const PUBLIC_ROUTES = [
  // Auth Service public routes
  { method: 'POST', path: '/v1/auth/register' },
  { method: 'POST', path: '/v1/users/register' },
  { method: 'POST', path: '/v1/auth/login' },
  { method: 'POST', path: '/v1/users/login' },
  { method: 'POST', path: '/v1/auth/login/2fa' },
  { method: 'POST', path: '/v1/auth/login/google' },
  { method: 'POST', path: '/v1/auth/guest' },
  { method: 'POST', path: '/v1/auth/refresh' },
  { method: 'POST', path: '/v1/auth/password/forgot' },
  { method: 'POST', path: '/v1/auth/password/reset' },
  { method: 'POST', path: '/v1/auth/verify-email' },
  { method: 'POST', path: '/v1/auth/verify-email/resend' },
  { method: 'GET',  path: '/v1/auth/login/google' },
  { method: 'GET',  path: '/v1/auth/oauth/google/callback' },
  
  // Payment & Billing public routes
  { method: 'GET',  path: '/v1/payment/plans' },
  { method: 'GET',  path: '/v1/billing/plans' },
  { method: 'POST', path: '/v1/payment/webhook/paddle' },
  { method: 'POST', path: '/v1/billing/webhook/paddle' },
  { method: 'POST', path: '/v1/payment/webhook/payhere' },
  { method: 'POST', path: '/v1/billing/webhook/payhere' },

  // Quota public routes
  { method: 'POST', path: '/v1/quota/guest/check' },
  { method: 'POST', path: '/v1/quota/guest/increment' },

  // Document public shared routes
  { method: 'GET',  path: '/v1/document/shared/*' },
  { method: 'GET',  path: '/v1/documents/shared/*' },
  { method: 'GET',  path: '/v1/document/download-file/*' },
  { method: 'GET',  path: '/v1/documents/download-file/*' },

  // Support public routes
  { method: 'POST', path: '/v1/support/tickets' },
  { method: 'POST', path: '/v1/support/refunds' },
  { method: 'POST', path: '/v1/support/contact' },
  { method: 'POST', path: '/v1/support/plan-override-requests' },


  // Resend's own webhook dispatcher calls this directly — no JWT to present,
  // same as the payment webhooks above. See services/notification/src/
  // controllers/notification.controller.ts's receiveResendWebhook.
  { method: 'POST', path: '/v1/notification/webhooks/resend-status' },
  { method: 'POST', path: '/v1/notifications/webhooks/resend-status' },

  // System & Documentation public routes
  { method: 'GET',  path: '/ready' },
  { method: 'GET',  path: '/health' },
  { method: 'GET',  path: '/health/deep' },
  { method: 'GET',  path: '/docs' },
  { method: 'GET',  path: '/docs/*' },
  { method: 'GET',  path: '/docs.json' },
  { method: 'GET',  path: '/openapi.json' },
  { method: 'GET',  path: '/favicon.ico' },
];

/**
 * authMiddleware — decodes Bearer token, validates it, and injects user identity headers.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Identity comes only from a verified token. The dedicated analytics ingress
  // verifies its own internal secret downstream; chat never receives that header.
  for (const header of ['x-user-id', 'x-user-plan', 'x-user-email', 'x-user-role', 'x-is-admin', 'x-service-id', 'x-doccraft-service-token']) delete req.headers[header];
  delete req.headers['x-internal-secret'];
  // Check if current route matches public allowlist
  const isPublic = PUBLIC_ROUTES.some((route) => {
    if (route.method !== req.method) return false;
    if (route.path.endsWith('*')) {
      const prefix = route.path.slice(0, -1);
      return req.path.startsWith(prefix);
    }
    return req.path === route.path;
  });

  if (isPublic) {
    next();
    return;
  }

  // Preflight requests skip auth
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  // Button-click tracking must not hard-fail for logged-out visitors —
  // the Hero landing page's "Start Creating" CTA is clicked mostly by
  // anonymous, pre-login traffic, and that's exactly the click worth
  // tracking. Same soft-auth carve-out as chat/AI: real identity when
  // there's a valid token, 'guest_user' otherwise, never a 401.
  const isClientEventRoute = req.path === '/v1/analytics/client-event';

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (isClientEventRoute) {
      req.headers['x-user-id'] = 'guest_user';
      next();
      return;
    }
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header with bearer token.',
        requestId: (req.headers['x-request-id'] as string) || '',
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await verifyJwt(token);

    // Inject headers for downstream services to read
    req.headers['x-user-id'] = decoded.sub;
    if (decoded.plan) {
      req.headers['x-user-plan'] = decoded.plan;
    }
    if (decoded.email) {
      req.headers['x-user-email'] = decoded.email;
    }
    if (decoded.role) {
      req.headers['x-user-role'] = decoded.role;
    }

    next();
  } catch (err: any) {
    console.warn(`[gateway/auth] Token verification failed for ${req.method} ${req.path}:`, err.message);
    if (isClientEventRoute) {
      req.headers['x-user-id'] = 'guest_user';
      next();
      return;
    }
    res.status(err.statusCode === 503 ? 503 : err.statusCode === 403 ? 403 : 401).json({
      error: {
        code: err.statusCode === 503 ? 'AUTH_UNAVAILABLE' : err.statusCode === 403 ? 'ACCOUNT_UNAVAILABLE' : 'INVALID_TOKEN',
        message: err.statusCode === 503 ? 'Account verification is temporarily unavailable.' : err.statusCode === 403 ? 'This account is unavailable.' : 'Your authentication token is invalid or has expired.',
        requestId: (req.headers['x-request-id'] as string) || '',
      },
    });
  }
}
