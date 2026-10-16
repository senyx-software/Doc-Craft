/**
 * Auth Store — Zustand
 * Manages user authentication state, tokens, and session management.
 */

import { create } from 'zustand';
import type { User, GuestSession } from '../types';
import * as authApi from '../api/auth';
import { setToken, clearToken, getToken, isTokenExpired, getTokenExpiry } from '../api/client';
import { getGoogleIdToken, googleSignInError } from '../lib/firebase';
import { apiRequest } from '../api/client';

async function transferGuestDrafts(guestToken: string | null, accessToken: string) {
  if (!guestToken) return null;
  const chat = (await import('./chatStore')).useChatStore.getState();
  const transferred = await apiRequest<{sessionIds?:string[]}>('/chat/api/chat/guest-migration', {method:'POST', auth:false, body:{guestToken}, headers:{Authorization:'Bearer '+accessToken}});
  return chat.sessionId || transferred.sessionIds?.[0] || null;
}

async function reopenTransferredDraft(sessionId: string | null) {
  if (sessionId) await (await import('./chatStore')).useChatStore.getState().loadSessionFromDb(sessionId);
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  guestSession: GuestSession | null;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  mfaToken: string | null;

  // Actions
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean }>;
  login2FA: (totpCode: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  guestLogin: () => Promise<void>;
  googleAuth: () => Promise<{ requires2FA?: boolean }>;
  passwordReset: (email: string) => Promise<string>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<string>;
  demoLogin: () => void;
  toggleDemoPlan: () => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  clearError: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isGuest: false,
  guestSession: null,
  isLoading: false,
  isInitializing: true,

  error: null,
  mfaToken: null,

  login: async (email: string, password: string) => {
    const guestToken = get().isGuest ? getToken() : null;
    set({ isLoading: true, error: null, mfaToken: null });
    try {
      const response = await authApi.login(email, password);

      // Handle 2FA required case
      if (response.requires2FA && response.mfaToken) {
        set({ mfaToken: response.mfaToken, isLoading: false });
        return { requires2FA: true };
      }

      // Backend returns camelCase 'accessToken', not 'access_token'
      const token = response.accessToken || response.access_token;
      if (!token) throw new Error('No access token in login response');
      // Normalize user fields (backend is camelCase, types are snake_case)
      const rawUser = response.user;
      const userId = rawUser?.id || rawUser?.user_id;
      if (!rawUser || !userId || !rawUser.email) throw new Error('Invalid account response');
      const user: import('../types').User = {
        user_id:          userId,
        email:            rawUser.email,
        full_name:        rawUser.fullName || rawUser.full_name,
        avatar_url:       rawUser.avatarUrl || rawUser.avatar_url,
        auth_provider:    rawUser.authProvider || rawUser.auth_provider || 'email',
        plan:             rawUser.plan || 'free',
        timezone:         rawUser.timezone,
        twoFactorEnabled: Boolean(rawUser.twoFactorEnabled),
      };
      const transferred = await transferGuestDrafts(guestToken, token);
      setToken(token);
      set({
        user,
        isAuthenticated: true,
        isGuest: false,
        guestSession: null,
        isLoading: false,
        mfaToken: null,
      });
      await reopenTransferredDraft(transferred);
      return {};
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  login2FA: async (totpCode: string) => {
    const guestToken = get().isGuest ? getToken() : null;
    const currentMfaToken = get().mfaToken;
    if (!currentMfaToken) throw new Error('2FA session expired. Please sign in again.');
    set({ isLoading: true, error: null });

    try {
      const response = await authApi.login2FA(currentMfaToken, totpCode);
      const token = response.accessToken || response.access_token;
      if (!token) throw new Error('Invalid token returned from 2FA login');
      const rawUser = response.user;
      const userId = rawUser?.id || rawUser?.user_id;
      if (!rawUser || !userId || !rawUser.email) throw new Error('Invalid account response');
      const user: import('../types').User = {
        user_id:          userId,
        email:            rawUser.email,
        full_name:        rawUser.fullName || rawUser.full_name,
        avatar_url:       rawUser.avatarUrl || rawUser.avatar_url,
        auth_provider:    rawUser.authProvider || rawUser.auth_provider || 'email',
        plan:             rawUser.plan || 'free',
        timezone:         rawUser.timezone,
        twoFactorEnabled: true,
      };
      const transferred = await transferGuestDrafts(guestToken, token);
      setToken(token);

      set({
        user,
        isAuthenticated: true,
        isGuest: false,
        guestSession: null,
        isLoading: false,
        mfaToken: null,
      });
      await reopenTransferredDraft(transferred);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid 2FA verification code.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },


  register: async (email: string, password: string, fullName?: string) => {
    set({ isLoading: true, error: null });
    try {
      await authApi.register(email, password, fullName);
      set({ isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Logout even if API call fails
    }
    clearToken();
    set({
      user: null,
      isAuthenticated: false,
      isGuest: false,
      guestSession: null,
    });
  },

  guestLogin: async () => {
    set({ isLoading: true, error: null, mfaToken: null });
    try {
      const session = await authApi.guestLogin();
      if (!session.session_token || !session.guest_user_id || isTokenExpired(session.session_token) || !Number.isFinite(Date.parse(session.expires_at))) {
        throw new Error('Guest sign-in did not return a valid session. Please try again.');
      }
      setToken(session.session_token);
      // Create a minimal guest user object
      const guestUser: import('../types').User = {
        user_id:       session.guest_user_id,
        email:         `${session.guest_user_id}@guest.doccraft.app`,
        full_name:     'Guest User',
        auth_provider: 'guest',
        plan:          'guest',
      };
      set({
        user:            guestUser,
        isAuthenticated: true,
        isGuest:         true,
        guestSession:    session,
        isLoading:       false,
        isInitializing:  false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error && ['TimeoutError','AbortError'].includes(err.name) ? 'Guest connection timed out. Please try again.' : err instanceof Error ? err.message : 'Guest session failed.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },


  googleAuth: async () => {
    const guestToken = get().isGuest ? getToken() : null;
    set({ isLoading: true, error: null, mfaToken: null });
    try {
      const response = await authApi.googleLogin(await getGoogleIdToken());
      if (response.requires2FA && response.mfaToken) {
        set({ mfaToken: response.mfaToken, isLoading: false });
        return { requires2FA: true };
      }
      const token = response.accessToken || response.access_token;
      if (!token) throw new Error('Google sign-in did not return a session. Please try again.');
      const transferred = await transferGuestDrafts(guestToken, token);
      setToken(token);
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isGuest: false, guestSession: null, isLoading: false, mfaToken: null });
      await reopenTransferredDraft(transferred);
      return {};
    } catch (error) {
      set({ error: googleSignInError(error), isLoading: false });
      return {};
    }
  },

  passwordReset: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.passwordReset(email);
      set({ isLoading: false });
      return response?.message || 'If an account exists with that email address, a password reset link has been sent.';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password recovery is temporarily unavailable';
      set({ isLoading: false, error: message });
      throw new Error(message, { cause: error });
    }
  },

  confirmPasswordReset: async (token: string, newPassword: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.confirmPasswordReset(token, newPassword);
      set({ isLoading: false });
      return response?.message || 'Password has been reset successfully! You can now log in.';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Password reset failed.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  demoLogin: () => {
    const demoUser: User = {
      user_id: 'demo-user-001',
      email: 'demo@doccraft.app',
      full_name: 'Demo User',
      auth_provider: 'email',
      plan: 'free',
      timezone: 'Asia/Colombo',
    };
    setToken('demo_token_for_testing');
    set({
      user: demoUser,
      isAuthenticated: true,
      isGuest: false,
      guestSession: null,
      isLoading: false,
      error: null,
    });
  },

  toggleDemoPlan: () => {
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: {
          ...currentUser,
          plan: currentUser.plan === 'free' ? 'pro' : 'free',
        }
      });
    }
  },

  setUser: (user: User) => set({ user }),

  setToken: (token: string) => {
    setToken(token);
    set({ isAuthenticated: true });
  },

  clearError: () => set({ error: null }),

  checkAuth: async () => {
    const token = getToken();

    if (!token) {
      clearToken();
      set({ user: null, isAuthenticated: false, isGuest: false, guestSession: null, isInitializing: false });
      return;
    }

    // Check client-side token expiration
    if (isTokenExpired(token)) {
      clearToken();
      set({ user: null, isAuthenticated: false, isGuest: false, guestSession: null, isInitializing: false });
      return;
    }

    if (token === 'demo_token_for_testing') {
      set({ isAuthenticated: true, isInitializing: false });
      return;
    }

    const currentState = get();
    if (currentState.isGuest && currentState.user) {
      set({ isAuthenticated: true, isInitializing: false });
      return;
    }

    try {
      const user = await authApi.getMe();
      if (getToken() !== token) return;
      const isGuest = user.plan === 'guest' || user.auth_provider === 'guest';
      set({ user, isAuthenticated: true, isGuest, guestSession: isGuest ? { session_token: token, guest_user_id: user.user_id, expires_at: new Date(getTokenExpiry(token)!).toISOString() } : null, isInitializing: false });
    } catch {
      if (getToken() !== token) {
        if (!getToken()) set({ isInitializing: false });
        return;
      }
      clearToken();
      set({ user: null, isAuthenticated: false, isGuest: false, guestSession: null, isInitializing: false });
    }
  },

}));
