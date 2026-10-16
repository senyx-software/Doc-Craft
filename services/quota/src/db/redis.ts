import { Redis as IORedis } from 'ioredis';
import { env } from '../config/env.js';

let client: IORedis | null = null;

export function getRedis(): IORedis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on('connect', () => console.log('Redis connected (quota service)'));
    client.on('error', (err: Error) => console.error('Redis error:', err));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
