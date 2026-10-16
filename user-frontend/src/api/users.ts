/**
 * User Management API endpoints
 * Maps to: GET /auth/me, PATCH /auth/me
 * (Auth service registers routes at /v1/auth prefix — gateway maps /v1/auth → auth service)
 */

import { get, patch } from './client';
import type { User } from '../types';

/** GET /auth/me — Get authenticated user profile (normalized from camelCase backend) */
export async function getProfile(): Promise<User> {
  const res = await get<{ user: Record<string, unknown> }>('/auth/me');
  const u = res.user;
  return {
    user_id:       (u.id as string) || (u.user_id as string),
    email:         u.email as string,
    full_name:     (u.fullName as string) || (u.full_name as string) || '',
    avatar_url:    (u.avatarUrl as string | undefined) || (u.avatar_url as string | undefined),
    auth_provider: ((u.authProvider as string) || 'email') as User['auth_provider'],
    plan:          ((u.plan as string) || 'free') as User['plan'],
    timezone:      (u.timezone as string | undefined),
    created_at:    (u.createdAt as string | undefined),
  };
}

/** PATCH /auth/me — Update user profile settings */
export async function updateProfile(data: Partial<Pick<User, 'full_name' | 'timezone'>>): Promise<User> {
  // Backend expects camelCase
  const payload: Record<string, unknown> = {};
  if (data.full_name !== undefined) payload.fullName = data.full_name;
  if (data.timezone  !== undefined) payload.timezone  = data.timezone;

  const res = await patch<{ user: Record<string, unknown> }>('/auth/me', payload);
  const u = res.user;
  return {
    user_id:       (u.id as string) || (u.user_id as string),
    email:         u.email as string,
    full_name:     (u.fullName as string) || (u.full_name as string) || '',
    avatar_url:    (u.avatarUrl as string | undefined) || (u.avatar_url as string | undefined),
    auth_provider: ((u.authProvider as string) || 'email') as User['auth_provider'],
    plan:          ((u.plan as string) || 'free') as User['plan'],
    timezone:      (u.timezone as string | undefined),
    created_at:    (u.createdAt as string | undefined),
  };
}
