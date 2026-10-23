import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const stateCookie = 'doccraft_oauth_state';
export const verifierCookie = 'doccraft_oauth_verifier';
export const oauthCookieOptions = () => ({
  path: '/v1/auth', httpOnly: true, sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production', maxAge: 600,
});

export function googleOAuthOptions() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callback = process.env.GOOGLE_CALLBACK_URL;
  if (!clientId || !clientSecret || !callback) return null;
  const uri = new URL(callback);
  const frontend = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
  for (const url of [uri, frontend]) {
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('OAuth requires trusted HTTPS URLs (loopback HTTP is development-only)');
    }
  }
  if (uri.pathname !== '/v1/auth/oauth/google/callback' || frontend.pathname !== '/') {
    throw new Error('OAuth callback and frontend origin must match the documented routes');
  }
  return {
    name: 'googleOAuth2',
    credentials: {
      client: { id: clientId, secret: clientSecret },
      auth: {
        authorizeHost: 'https://accounts.google.com', authorizePath: '/o/oauth2/v2/auth',
        tokenHost: 'https://oauth2.googleapis.com', tokenPath: '/token',
        [Symbol.for('fastify-oauth2.generate-callback-uri-params')]: (_params: unknown, _request: unknown, _scope: unknown, state: string) => ({ nonce: state }),
      },
      http: { timeout: 10000 },
    },
    startRedirectPath: '/v1/auth/login/google', callbackUri: callback,
    scope: ['openid', 'profile', 'email'], pkce: 'S256',
    cookie: oauthCookieOptions(), redirectStateCookieName: stateCookie, verifierCookieName: verifierCookie,
    generateStateFunction: async () => randomBytes(32).toString('hex'),
    checkStateFunction: async (request: any) => validOAuthState(request),
  };
}

export function validOAuthState(request: any): boolean {
  const state = request.query?.state, cookie = request.cookies?.[stateCookie];
  const verifier = request.cookies?.[verifierCookie];
  return typeof state === 'string' && /^[a-f0-9]{64}$/.test(state) &&
    typeof cookie === 'string' && cookie.length === state.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(cookie)) &&
    typeof verifier === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(verifier);
}

export async function verifyOAuthIdentity(idToken: unknown, nonce: string) {
  if (typeof idToken !== 'string' || !process.env.GOOGLE_CLIENT_ID) throw new Error('Invalid identity');
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID, requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
  });
  if (!payload.sub || payload.sub.length > 255 || payload.nonce !== nonce ||
      payload.email_verified !== true || typeof payload.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000 ||
      (payload.azp !== undefined && payload.azp !== process.env.GOOGLE_CLIENT_ID)) throw new Error('Invalid identity');
  return { email: payload.email.toLowerCase(), fullName: typeof payload.name === 'string' ? payload.name : undefined,
    avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined };
}
