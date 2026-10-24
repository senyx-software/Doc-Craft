export const stateCookie = 'oauth_state';
export const verifierCookie = 'oauth_verifier';

export function oauthCookieOptions() {
  return {
    path: '/v1/auth',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
  };
}

export function googleOAuthOptions() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    name: 'googleOAuth2',
    credentials: {
      client: {
        id: clientId,
        secret: clientSecret
      },
      auth: {
        authorizeHost: 'https://accounts.google.com',
        authorizePath: '/o/oauth2/v2/auth',
        tokenHost: 'https://oauth2.googleapis.com',
        tokenPath: '/token'
      }
    },
    startRedirectPath: '/v1/auth/login/google',
    callbackUri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3011/v1/auth/oauth/google/callback',
    scope: ['profile', 'email']
  };
}

export function validOAuthState(request: any): boolean {
  const queryState = request.query?.state;
  const cookieState = request.cookies?.[stateCookie];
  if (!queryState) return false;
  if (cookieState && queryState !== cookieState) return false;
  return true;
}

export async function verifyOAuthIdentity(idToken: string, state?: string): Promise<{ email: string; fullName?: string; avatarUrl?: string }> {
  // If idToken is provided, decode or verify it
  try {
    const { verifyGoogleIdToken } = await import('./firebase.service.js');
    return await verifyGoogleIdToken(idToken);
  } catch {
    // If not firebase, decode standard JWT claims
    const parts = idToken.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload.email) {
        return {
          email: payload.email.toLowerCase(),
          fullName: payload.name || payload.fullName,
          avatarUrl: payload.picture || payload.avatarUrl
        };
      }
    }
    throw new Error('Unable to verify OAuth identity');
  }
}
