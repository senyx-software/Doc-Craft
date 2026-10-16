import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { getRedis } from '../db/redis.js';

interface CacheEntry {
  data: Record<string, any>;
  expiresAt: number;
}

export class PaymentConfigClient {
  private static instance: PaymentConfigClient;
  private redisSubscriber?: Redis;
  private memoryCache = new Map<string, CacheEntry>();
  private readonly pubSubChannel = 'config_invalidation';
  private readonly cacheTtlMs = 300 * 1000; // 5-minute TTL

  private constructor() {
    this.initPubSub();
  }

  public static getInstance(): PaymentConfigClient {
    if (!PaymentConfigClient.instance) {
      PaymentConfigClient.instance = new PaymentConfigClient();
    }
    return PaymentConfigClient.instance;
  }

  private async initPubSub(): Promise<void> {
    try {
      this.redisSubscriber = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      this.redisSubscriber.on('error', () => {
        // Graceful fallback when Redis is offline in test mode
      });

      await this.redisSubscriber.connect();
      await this.redisSubscriber.subscribe(this.pubSubChannel);

      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === this.pubSubChannel) {
          try {
            const event = JSON.parse(message);
            const domain = event.domain?.toLowerCase()?.trim();
            if (domain) {
              this.memoryCache.delete(domain);
            } else {
              this.memoryCache.clear();
            }
          } catch {
            this.memoryCache.clear();
          }
        }
      });
    } catch {
      // Fail open if subscriber connection is disabled
    }
  }

  /**
   * Fetch plans configuration payload via 3-Tier Strategy.
   */
  public async getPlansConfig(): Promise<Record<string, any>> {
    const now = Date.now();

    // Tier 1: Memory Cache
    const cached = this.memoryCache.get('plans');
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // Tier 2: Redis Cache
    try {
      const redis = getRedis();
      const redisVal = await redis.get('config:domain:plans');
      if (redisVal) {
        const parsed = JSON.parse(redisVal);
        const payload = parsed.data || parsed;
        this.memoryCache.set('plans', { data: payload, expiresAt: now + this.cacheTtlMs });
        return payload;
      }
    } catch {}

    // Tier 3: HTTP Fallback to admin-api internal read endpoint
    try {
      const url = `${env.ADMIN_API_SERVICE_URL}/api/v1/internal/config/plans`;
      const res = await serviceFetch('admin-api', url, { headers: { 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET }, signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = (await res.json()) as any;
        const payload = body.data || body;
        this.memoryCache.set('plans', { data: payload, expiresAt: now + this.cacheTtlMs });
        return payload;
      }
    } catch {}

    // Billing cannot invent prices, quotas or provider products during an outage.
    return {};
  }

  public async getPlan(code: string): Promise<any> {
    const plans = await this.getPlansConfig();
    return plans[code.toLowerCase()] || null;
  }

  public async getPaymentSettings(): Promise<Record<string, any>> {
    // Provider enablement is an authorization decision: fetch current persisted
    // policy and fail closed instead of resurrecting cached/default gateways.
    const response=await serviceFetch('admin-api',`${env.ADMIN_API_SERVICE_URL}/api/v1/internal/config/settings`,{signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw Object.assign(new Error('Payment provider policy unavailable'),{statusCode:503});
    const body=await response.json() as any;
    return body.data || body;
  }

  public async close():Promise<void> {
    this.redisSubscriber?.disconnect();
    this.redisSubscriber=undefined;
    this.memoryCache.clear();
  }

  public clearMemoryCache(): void {
    this.memoryCache.clear();
  }
}

export const paymentConfigClient = PaymentConfigClient.getInstance();
