/**
 * Auth API endpoints
 * Maps to: POST /auth/register, POST /auth/login, POST /auth/logout,
 *          POST /auth/password-reset, POST /auth/guest, GET /auth/oauth/google
 */

import { post, apiRequest } from './client';
import type { AuthResponse, RegisterResponse, GuestSession } from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/v1';

/** POST /auth/register — Register with email, password, and fullName */
export function register(email: string, password: string, fullName?: string): Promise<RegisterResponse> {
  return post<RegisterResponse>('/auth/register', { email, password, fullName }, false);
}

/** POST /auth/login — Log in with email and password */
export function login(email: string, password: string): Promise<AuthResponse> {
  return post<AuthResponse>('/auth/login', { email, password }, false);
}

export function googleLogin(idToken: string): Promise<AuthResponse> {
  return post<AuthResponse>('/auth/login/google', { idToken }, false);
}

/** POST /auth/logout — Invalidate current session */
export function logout(): Promise<{ message: string }> {
  return post<{ message: string }>('/auth/logout');
}

/** POST /auth/password/forgot — Send password reset email */
export function passwordReset(email: string): Promise<{ message: string }> {
  return post<{ message: string }>('/auth/password/forgot', { email }, false);
}

/** POST /auth/password/reset — Reset password with token and new password */
export function confirmPasswordReset(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>('/auth/password/reset', { token, newPassword }, false);
}

/** POST /auth/guest — Create anonymous guest session */
export function guestLogin(): Promise<GuestSession> {
  return apiRequest<GuestSession>('/auth/guest', { method: 'POST', body: {}, auth: false, timeoutMs: 20000 });
}

/** GET /auth/oauth/google — Redirect to Google OAuth */
export function getGoogleOAuthUrl(redirectTo?: string): string {
  const params = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  return `${BASE_URL}/auth/oauth/google${params}`;
}

/** GET /auth/me — Get current authenticated user profile */
export async function getMe(): Promise<import('../types').User> {
  // Gateway maps /v1/auth → auth service which registers routes at /v1/auth prefix
  const res = await apiRequest<{ user: Record<string, unknown> }>('/auth/me', { timeoutMs: 15000 });
  // Backend sends camelCase, frontend types use snake_case
  const u = res.user;
  return {
    user_id:       (u.id as string) || (u.user_id as string),
    email:         u.email as string,
    full_name:     (u.fullName as string) || (u.full_name as string),
    avatar_url:    (u.avatarUrl as string | undefined) || (u.avatar_url as string | undefined),
    auth_provider:    ((u.authProvider as string) || (u.auth_provider as string) || 'email') as import('../types').AuthProvider,
    plan:             ((u.plan as string) || 'free') as import('../types').Plan,
    timezone:         u.timezone as string | undefined,
    created_at:       u.createdAt as string | undefined,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };
}

/** POST /auth/verify-email — Verify 6-digit email code */
export function verifyEmail(email: string, code: string): Promise<{ status: string; message: string }> {
  return post<{ status: string; message: string }>('/auth/verify-email', { email, code }, false);
}

/** POST /auth/verify-email/resend — Resend 6-digit verification code */
export function resendVerification(email: string): Promise<{ status: string; message: string }> {
  return post<{ status: string; message: string }>('/auth/verify-email/resend', { email }, false);
}

/** POST /auth/2fa/enable — Enable 2FA (Returns QR Code URL & Secret) */
export function enable2FA(): Promise<import('../types').Enable2FAResponse> {
  return post<import('../types').Enable2FAResponse>('/auth/2fa/enable');
}

/** POST /auth/2fa/verify — Verify TOTP code to finalize 2FA setup */
export function verify2FA(totpCode: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/auth/2fa/verify', { totpCode });
}

/** POST /auth/2fa/disable — Disable 2FA with current TOTP code */
export function disable2FA(totpCode: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/auth/2fa/disable', { totpCode });
}

/** POST /auth/login/2fa — Complete 2FA login with MFA token and TOTP code */
export function login2FA(mfaToken: string, totpCode: string): Promise<import('../types').AuthResponse> {
  return post<import('../types').AuthResponse>('/auth/login/2fa', { mfaToken, totpCode }, false);
}
