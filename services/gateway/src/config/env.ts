import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: [
  path.resolve(process.cwd(), 'gateway.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../../.env')
] });

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().default(''),
  CORS_ORIGINS: z.string().transform((val) => val.split(',').map((o) => o.trim())),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Downstream service URLs
  AUTH_SERVICE_URL: z.string().url(),
  AI_SERVICE_URL: z.string().default("http://127.0.0.1:3016"),
  DOCUMENT_SERVICE_URL: z.string().url(),
  BILLING_SERVICE_URL: z.string().url(),
  QUOTA_SERVICE_URL: z.string().url(),
  NOTIFICATION_SERVICE_URL: z.string().url(),
  ANALYTICS_SERVICE_URL: z.string().url(),
  ADMIN_API_SERVICE_URL: z.string().url(),
  INTERNAL_SERVICE_SECRET: z.string().default(''),

  // Webhook security allowlists
  WEBHOOK_ALLOWED_IPS: z.string().default('').transform((val) =>
    val.split(',').map((ip) => ip.trim()).filter(Boolean)
  ),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid gateway environment variables:', result.error.format());
  process.exit(1);
}

export const env = result.data;
