import { signUserToken, verifyUserToken } from '../../../../shared/user-auth.mjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'auth.env') });

const JWT_EXPIRES_IN     = process.env.JWT_EXPIRES_IN    || '1h';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '30d';

export interface JwtPayload {
  sub: string;
  email: string;
  plan: string;
  userClass: string;
  type: 'access' | 'refresh' | 'mfa';
}

export async function signAccessToken(userId: string, email: string, plan: string, userClass: string = 'freelancer', expiresAt?: number): Promise<string> {
  getExpiresInSeconds();
  return signUserToken('access', {sub:userId, email, plan, userClass}, expiresAt ?? JWT_EXPIRES_IN);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return signUserToken('refresh', {sub:userId}, REFRESH_EXPIRES_IN);
}

export async function signMfaToken(userId: string): Promise<string> {
  return signUserToken('mfa', {sub:userId}, '5m');
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const payload = await verifyUserToken(token, 'access');
  if (!payload.sub || payload.type !== 'access') throw new Error('Invalid access token');
  return payload as unknown as JwtPayload;
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string }> {
  const payload = await verifyUserToken(token, 'refresh');
  if (!payload.sub || payload.type !== 'refresh') throw new Error('Invalid refresh token');
  return { sub: payload.sub as string };
}

export async function verifyMfaToken(token: string): Promise<{ sub: string }> {
  const payload = await verifyUserToken(token, 'mfa');
  if (!payload.sub || payload.type !== 'mfa') throw new Error('Invalid token type');
  return { sub: payload.sub as string };
}

export function getExpiresInSeconds(): number {
  // Parse "15m" → 900, "1h" → 3600
  const match = JWT_EXPIRES_IN.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error('JWT_EXPIRES_IN must be a duration such as 15m or 1h');
  const [, num, unit] = match;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(num) * (multipliers[unit] ?? 60);
}
