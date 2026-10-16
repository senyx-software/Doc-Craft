import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

interface CacheEntry {
  data: Record<string, any>;
  expiresAt: number;
}

export class GatewayConfigClient {
  private static instance: GatewayConfigClient;
  private redis: Redis;
  private redisSubscriber: Redis;
  private memoryCache = new Map<string, CacheEntry>();
  private readonly pubSubChannel = 'config_invalidation';
  private readonly cacheTtlMs = 300 * 1000; // 5-minute TTL

  private constructor() {
    const redisOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    };
    this.redis = new Redis(env.REDIS_URL, redisOptions);
    this.redisSubscriber = new Redis(env.REDIS_URL, redisOptions);

    this.redis.on('error', (err) => {
      console.warn('[gateway/config-client] Redis client error:', err.message);
    });

    this.redisSubscriber.on('error', (err) => {
      console.warn('[gateway/config-client] Redis subscriber error:', err.message);
    });

    this.initPubSub();
  }

  public static getInstance(): GatewayConfigClient {
    if (!GatewayConfigClient.instance) {
      GatewayConfigClient.instance = new GatewayConfigClient();
    }
    return GatewayConfigClient.instance;
  }

  private async initPubSub(): Promise<void> {
    try {
      await this.redisSubscriber.connect();
      await this.redisSubscriber.subscribe(this.pubSubChannel);
      
      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === this.pubSubChannel) {
          try {
            const event = JSON.parse(message);
            const domain = event.domain?.toLowerCase()?.trim();
            if (domain && this.memoryCache.has(domain)) {
              console.log(`[gateway/config-client] Invalidation event received for '${domain}'. Evicting Tier 1 cache.`);
              this.memoryCache.delete(domain);
            } else if (!domain) {
              this.memoryCache.clear();
            }
          } catch {
            this.memoryCache.clear();
          }
        }
      });
    } catch (err: any) {
      console.warn('[gateway/config-client] Failed to initialize Pub/Sub subscriber:', err.message);
    }
  }

  /**
   * Fetch domain configuration payload using 3-Tier strategy:
   *   Tier 1: Local memory LRU cache
   *   Tier 2: Redis cache (config:domain:<domain>)
   *   Tier 3: HTTP fallback call to admin-api internal read endpoint
   */
  public async getConfig(domain: string): Promise<Record<string, any>> {
    const domainClean = domain.toLowerCase().trim();
    const now = Date.now();

    // Tier 1: Local Memory Cache
    const cached = this.memoryCache.get(domainClean);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // Tier 2: Redis Cache
    const cacheKey = `config:domain:${domainClean}`;
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      const redisVal = await this.redis.get(cacheKey);
      if (redisVal) {
        const parsed = JSON.parse(redisVal);
        const payload = parsed.data || parsed;
        this.memoryCache.set(domainClean, {
          data: payload,
          expiresAt: now + this.cacheTtlMs,
        });
        return payload;
      }
    } catch (err: any) {
      console.warn(`[gateway/config-client] Redis lookup failed for '${domainClean}':`, err.message);
    }

    // Tier 3: HTTP Fallback to admin-api internal endpoint
    const url = `${env.ADMIN_API_SERVICE_URL}/api/v1/internal/config/${domainClean}`;
    try {
      const res = await serviceFetch('admin-api', url, {
        headers: { 'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET },
      });
      if (res.ok) {
        const body = (await res.json()) as any;
        const payload = body.data || body;
        this.memoryCache.set(domainClean, {
          data: payload,
          expiresAt: now + this.cacheTtlMs,
        });
        return payload;
      }
    } catch (err: any) {
      console.error(`[gateway/config-client] HTTP fallback failed for domain '${domainClean}':`, err.message);
    }

    // Tier 4: Static Fallback Defaults (handles offline/standalone dev mode)
    const staticDefaults: Record<string, any> = {
      plans: {
        guest: { name: 'Guest Preview', monthly_quota: 1, is_active: true },
        free: { name: 'Free Tier', monthly_quota: 5, is_active: true },
        pro: { name: 'Pro Professional', monthly_quota: 500, is_active: true },
        max: { name: 'Max', monthly_quota: 10000, is_active: true },
      },
      feature_flags: {
        watermark_removal: { type: 'boolean', default: false, plan_matrix: { free: false, pro: true, max: true } },
        custom_font_upload: { type: 'boolean', default: false, plan_matrix: { free: false, pro: true, max: true } },
        priority_pdf_rendering: { type: 'boolean', default: false, plan_matrix: { free: false, pro: false, max: true } },
      },
      branding: {
        company_name: 'DocCraft',
        logo_url: 'https://cdn.doccraft.app/assets/logo.svg',
      },
      settings: {
        rate_limits: { auth: 10, admin: 200, user: 100, public: 20 },
      },
    };

    const fallbackPayload = staticDefaults[domainClean] || {};
    this.memoryCache.set(domainClean, {
      data: fallbackPayload,
      expiresAt: now + this.cacheTtlMs,
    });
    return fallbackPayload;
  }

  /**
   * Check whether a feature flag is enabled globally or for a specific plan.
   */
  public async isFeatureEnabled(featureKey: string, planKey?: string): Promise<boolean> {
    const flagsConfig = await this.getConfig('feature_flags');
    const flagInfo = flagsConfig[featureKey];
    if (!flagInfo) {
      return false;
    }

    if (planKey && flagInfo.plan_matrix) {
      const planVal = flagInfo.plan_matrix[planKey.toLowerCase()];
      return planVal !== undefined ? Boolean(planVal) : Boolean(flagInfo.default);
    }

    return Boolean(flagInfo.default ?? false);
  }

  /**
   * Resolve pricing, quota limits, and gateway config for a plan key.
   */
  public async getPlanConfig(planKey: string): Promise<Record<string, any> | null> {
    const plansConfig = await this.getConfig('plans');
    return plansConfig[planKey.toLowerCase()] || null;
  }
}

export const gatewayConfigClient = GatewayConfigClient.getInstance();
