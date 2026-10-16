import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load chat.env or .env from current directory, fallback to workspace root
dotenv.config({ path: [
  path.resolve(process.cwd(), "chat.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env")
] });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3016"),
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  INTERNAL_SERVICE_SECRET: z.string().default(""),
  AUTH_SERVICE_URL: z.string().url().default("http://localhost:3011"),
  ADMIN_API_SERVICE_URL: z.string().default("http://localhost:3018"),
  ANALYTICS_SERVICE_URL: z.string().default("http://localhost:3017"),
  QUOTA_SERVICE_URL: z.string().default("http://localhost:3015"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODELS: z.string().default('openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b'),
  CORS_ORIGIN: z.string().optional(), // e.g. "https://app.doccraft.io" — defaults to "*" if unset
  MAX_CONCURRENT_REQUESTS: z.string().default("50").transform(Number),
  MAX_QUEUE_SIZE: z.string().default("100").transform(Number),
  QUEUE_TIMEOUT_MS: z.string().default("30000").transform(Number),
  GROQ_TIMEOUT_MS: z.string().default("30000").transform(Number),
  TURN_TIMEOUT_MS: z.string().default("90000").transform(Number),
  CLAUDE_TIMEOUT_MS: z.string().default("60000").transform(Number),
  MCP_TIMEOUT_MS: z.string().default("15000").transform(Number),
  RATE_LIMIT_WINDOW: z.string().default("60000").transform(Number),
  RATE_LIMIT_MAX: z.string().default("10").transform(Number),
  API_RATE_LIMIT_MAX: z.string().default("100").transform(Number),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  throw new Error("Invalid environment variables");
}

export const env = _env.data;
