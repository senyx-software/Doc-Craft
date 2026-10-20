import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { verifyUserToken } from '../../../../shared/user-auth.mjs';
import { env } from '../config/env.js';

export interface DecodedToken {
  sub: string;
  email?: string;
  plan?: string;
  role?: string;
}

/**
 * Verifies JWT signature and expiry.
 *
 * @param token   bearer JWT token string
 */
export async function verifyJwt(token: string): Promise<DecodedToken> {
  const payload = await verifyUserToken(token);
  if (!payload.sub || payload.sub === 'guest_user' || payload.type !== 'access') throw new Error('Invalid access token');
  // Re-read account status/plan so admin actions affect existing browser sessions.
  let result;
  try {
    result = await serviceFetch('auth', `${env.AUTH_SERVICE_URL}/internal/verify-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET },
      body: JSON.stringify({ userId: payload.sub,token: token }), signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Object.assign(new Error('Account verification unavailable'), { statusCode: 503 });
  }
  if ([401,403,404].includes(result.status)) throw Object.assign(new Error('Account unavailable'), { statusCode: 403 });
  if (!result.ok) throw Object.assign(new Error('Account verification unavailable'), { statusCode: 503 });
  const account = await result.json() as { valid?: boolean; user?: { id?: string; plan?: string } };
  if (!account.valid || account.user?.id !== payload.sub) throw Object.assign(new Error('Account unavailable'), { statusCode: 403 });

  return {
    sub: payload.sub as string,
    email: payload.email as string | undefined,
    plan: typeof account.user?.plan === 'string' ? account.user.plan : payload.plan as string | undefined,
    role: payload.role as string | undefined,
  };
}
