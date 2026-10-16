import { Redis } from "ioredis";
import { env } from "../config/env.js";

// Ensure a fallback for local development if REDIS_URL is not set
const redisUrl = env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  // Cap retries to 10 (with exponential backoff). Setting null means infinite
  // retries which can mask a permanently-down Redis and stall requests forever.
  maxRetriesPerRequest: 3,
  // Reconnect with exponential backoff, capped at 5 s
  retryStrategy: (times: number) => {
    if (times > 10) {
      // Stop retrying — Redis is likely permanently unavailable
      return null;
    }
    return Math.min(times * 200, 5000);
  },
  // Fail immediately if the initial connection is refused instead of hanging
  enableOfflineQueue: false,
  lazyConnect: false,
});

redis.on("error", (err) => {
  console.error("❌ Redis Error:", err);
});

redis.on("ready", () => {
  console.log("✅ Connected to Redis");
});

redis.on("reconnecting", () => {
  console.warn("⚠️ Redis reconnecting...");
});

/** Gracefully close the Redis connection during shutdown. */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}
