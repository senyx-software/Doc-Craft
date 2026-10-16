import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: [
  path.resolve(process.cwd(), 'payment.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env')
] });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  PORT:                       Number(process.env.PORT) || 3014,
  DATABASE_URL:               requireEnv('DATABASE_URL'),
  REDIS_URL:                  requireEnv('REDIS_URL'),
  JWT_SECRET:                 process.env.JWT_SECRET || '',
  INTERNAL_SERVICE_SECRET:    '',
  // Paddle
  PADDLE_API_KEY:             process.env.PADDLE_API_KEY || '',
  PADDLE_WEBHOOK_SECRET:      process.env.PADDLE_WEBHOOK_SECRET || '',
  PADDLE_SANDBOX:             process.env.PADDLE_SANDBOX === 'true',
  PADDLE_PRO_MONTHLY_PRICE_ID: process.env.PADDLE_PRO_MONTHLY_PRICE_ID || '',
  PADDLE_PRO_YEARLY_PRICE_ID:  process.env.PADDLE_PRO_YEARLY_PRICE_ID  || '',
  PADDLE_MAX_MONTHLY_PRICE_ID: process.env.PADDLE_MAX_MONTHLY_PRICE_ID || '',
  PADDLE_MAX_YEARLY_PRICE_ID:  process.env.PADDLE_MAX_YEARLY_PRICE_ID  || '',
  // PayHere
  PAYHERE_MERCHANT_ID:        process.env.PAYHERE_MERCHANT_ID || '',
  PAYHERE_MERCHANT_SECRET:    process.env.PAYHERE_MERCHANT_SECRET || '',
  PAYHERE_SANDBOX:            process.env.PAYHERE_SANDBOX === 'true',
  // Downstream service URLs
  AUTH_SERVICE_URL:           process.env.AUTH_SERVICE_URL           || 'http://localhost:3011',
  QUOTA_SERVICE_URL:          process.env.QUOTA_SERVICE_URL          || 'http://localhost:3015',
  NOTIFICATION_SERVICE_URL:   process.env.NOTIFICATION_SERVICE_URL   || 'http://localhost:3012',
  FRONTEND_URL:               process.env.FRONTEND_URL               || 'http://localhost:5173',
  ADMIN_API_SERVICE_URL:      process.env.ADMIN_API_SERVICE_URL      || 'http://localhost:3018',
  ANALYTICS_SERVICE_URL:      process.env.ANALYTICS_SERVICE_URL      || 'http://localhost:3017',
  NODE_ENV:                   process.env.NODE_ENV                   || 'development',
} as const;
