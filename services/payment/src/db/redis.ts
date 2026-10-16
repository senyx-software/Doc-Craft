import { Redis as IORedis } from 'ioredis';
import { env } from '../config/env.js';

let client: IORedis | null = null;

export function getRedis(): IORedis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // BullMQ requires null for blocking commands
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('connect', () => console.log('Redis connected (payment service)'));
    client.on('error', (err: Error) => console.error('Redis error:', err));
  }
  return client;
}

/**
 * redisClient — the singleton IORedis instance.
 * Exported for BullMQ so both the queue producer and worker share one connection.
 * Call getRedis() first to ensure the client is initialised.
 */
export { client as redisClient };

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
