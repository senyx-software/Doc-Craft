import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: [
  path.resolve(process.cwd(), 'quota.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env')
] });

/**
 * Typed environment configuration.
 * Fails fast at startup if any required variable is missing.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  PORT:                    Number(process.env.PORT) || 3015,
  DATABASE_URL:            requireEnv('DATABASE_URL'),
  REDIS_URL:               requireEnv('REDIS_URL'),
  JWT_SECRET:              process.env.JWT_SECRET || '',
  /** Deprecated legacy fields; request-bound service credentials authorize internal calls. */
  INTERNAL_SERVICE_SECRET: '',
  ADMIN_API_SERVICE_URL:   process.env.ADMIN_API_SERVICE_URL || 'http://localhost:3018',
  ANALYTICS_SERVICE_URL:   process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3017',
  NODE_ENV:                process.env.NODE_ENV || 'development',
} as const;
