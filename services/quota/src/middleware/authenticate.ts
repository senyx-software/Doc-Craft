import { authorizeService } from '../../../../shared/service-auth.mjs';
import { serviceFetch } from '../../../../shared/service-auth.mjs';
import type { Request, Response, NextFunction } from 'express';
import { verifyUserToken } from '../../../../shared/user-auth.mjs';
import { env } from '../config/env.js';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userPlan: string;
}

/** Verify the bearer and re-read current account status, revocation and plan from Auth. */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Verify the bearer even when a caller supplies gateway-looking headers.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyUserToken(token);

    if (!payload.sub || payload.type !== 'access') {
      res.status(401).json({ error: 'unauthorized', message: 'Invalid token payload' });
      return;
    }

    const accountResponse = await serviceFetch('auth', `${process.env.AUTH_SERVICE_URL || 'http://localhost:3011'}/internal/verify-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET },
      body: JSON.stringify({ userId: payload.sub,token: token }), signal: AbortSignal.timeout(3000),
    });
    if ([401,403,404].includes(accountResponse.status)) { res.status(403).json({ error: 'account_unavailable' }); return; }
    if (!accountResponse.ok) { res.status(503).json({ error: 'account_verification_unavailable' }); return; }
    const account = await accountResponse.json() as { valid?: boolean; user?: { id?: string; plan?: string } };
    if (!account.valid || account.user?.id !== payload.sub) { res.status(403).json({ error: 'account_unavailable' }); return; }
    (req as AuthenticatedRequest).userId   = payload.sub;
    (req as AuthenticatedRequest).userPlan = typeof account.user?.plan === 'string' ? account.user.plan : 'free';
    next();
  } catch (error) {
    const invalidToken = error instanceof Error && (error.name.startsWith('JWT') || error.name.startsWith('JWS'));
    res.status(invalidToken ? 401 : 503).json({ error: invalidToken ? 'unauthorized' : 'account_verification_unavailable', message: invalidToken ? 'Invalid or expired token' : 'Account verification unavailable' });
  }
}

/** Enforce scoped service identity and namespace reservations by their owner. */
export async function authenticateInternal(req: Request, res: Response, next: NextFunction): Promise<void> {
  let caller:string;
  try { caller=await authorizeService('quota', req); }
  catch (error) { res.status((error as {statusCode?:number}).statusCode || 503).json({error:'Service authorization rejected'}); return; }
  if(req.path?.endsWith('/check') || req.path?.endsWith('/refund')){
    const id=req.body?.reservationId;
    if(typeof id!=='string'||!id||id.length>200){res.status(400).json({error:'A valid reservationId is required'});return;}
    req.body.reservationId=caller+':'+id;
  }
  const {userId, plan} = req.body || {};
  if (typeof userId !== 'string' || !userId) {res.status(400).json({error:'userId is required'}); return;}
  (req as AuthenticatedRequest).userId=userId;
  (req as AuthenticatedRequest).userPlan=typeof plan==='string'?plan:'free';
  next();
}

/** Enforce receiver-side authorization for aggregate/admin operations. */
export async function requireInternalSecret(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await authorizeService('quota', req); next(); }
  catch (error) { res.status((error as {statusCode?:number}).statusCode || 503).json({error:'Service authorization rejected'}); }
}
