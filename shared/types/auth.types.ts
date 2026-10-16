export type AuthProvider = 'email' | 'google';

export interface User {
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  auth_provider: AuthProvider;
  plan: 'free' | 'pro';
  timezone?: string;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: User;
}

export interface RegisterResponse {
  user_id: string;
  email: string;
  auth_provider: AuthProvider;
  created_at: string;
}

export interface GuestSession {
  session_token: string;
  quota: {
    allowed: number;
    used: number;
  };
}
