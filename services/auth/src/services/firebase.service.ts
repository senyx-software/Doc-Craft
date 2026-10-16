import { createRemoteJWKSet, jwtVerify } from 'jose';

import { serviceFetch } from '../../../../shared/service-auth.mjs';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function verifyGoogleIdToken(idToken: string) {
  const projectId=process.env.FIREBASE_PROJECT_ID;
  if(!projectId)throw Object.assign(new Error('Firebase is not configured'),{statusCode:503});
  const config=await serviceFetch('admin-api',`${process.env.ADMIN_API_SERVICE_URL || 'http://localhost:3018'}/api/v1/internal/config/settings`,{signal:AbortSignal.timeout(3000)});
  if(!config.ok)throw Object.assign(new Error('Identity provider policy unavailable'),{statusCode:503});
  const body=await config.json() as any;
  if((body.data || body).allow_firebase!==true)throw Object.assign(new Error('Firebase sign-in is disabled'),{statusCode:503});
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
  });
  const firebase = payload.firebase as { sign_in_provider?: string } | undefined;
  if (!payload.sub || payload.sub.length > 128 ||
      typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000 ||
      typeof payload.auth_time !== 'number' || payload.auth_time > Date.now() / 1000 ||
      firebase?.sign_in_provider !== 'google.com' || payload.email_verified !== true ||
      typeof payload.email !== 'string' || !payload.email.includes('@')) {
    throw new Error('Invalid Google identity');
  }
  return {
    email: payload.email.toLowerCase(),
    fullName: typeof payload.name === 'string' ? payload.name : undefined,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
