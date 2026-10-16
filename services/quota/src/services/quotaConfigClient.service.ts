import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { getRedis } from '../db/redis.js';

interface CacheEntry {
  data: Record<string, any>;
  expiresAt: number;
}

/**
 * QuotaConfigClient — reads Admin-managed plan quota limits via a 4-tier strategy:
 *   Tier 1: Local memory cache (5-min TTL)
 *   Tier 2a: Redis `quota:plan:{code}` — written by admin-api on every plan mutation
 *   Tier 2b: Redis `config:domain:plans` — full plans snapshot written by admin-api ConfigEngine
 *   Tier 3: HTTP fallback to admin-api internal config endpoint
 *   Tier 4: Conservative safe defaults (used only when admin-api is completely unavailable)
 *
 * Subscribes to `config_invalidation` pub/sub channel to evict Tier 1 cache instantly
 * when an admin changes plan quotas — ensuring Quota Service applies changes in < 1 second.
 *
 * There is no Tier 4 "safe default" business value (no fabricated free/pro/max
 * numbers): if every real source (Redis, admin-api) is unreachable, callers get an
 * empty config / a 0 quota rather than a guessed number — a guessed "pro" limit is a
 * real abuse/cost risk, and a guessed "free" limit would silently violate whatever an
 * admin actually configured. Failing closed here is intentional.
 */
export class QuotaConfigClient {
  private static instance: QuotaConfigClient;
  private redisSubscriber?: Redis;
  private memoryCache = new Map<string, CacheEntry>();
  private readonly pubSubChannel = 'config_invalidation';
  private readonly cacheTtlMs = 300 * 1000; // 5-minute TTL

  private constructor() {
    this.initPubSub();
  }

  public static getInstance(): QuotaConfigClient {
    if (!QuotaConfigClient.instance) {
      QuotaConfigClient.instance = new QuotaConfigClient();
    }
    return QuotaConfigClient.instance;
  }

  private async initPubSub(): Promise<void> {
    try {
      this.redisSubscriber = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

      this.redisSubscriber.on('error', () => {
        // Handle offline redis in dev/test mode — fail open
      });

      await this.redisSubscriber.connect();
      await this.redisSubscriber.subscribe(this.pubSubChannel);

      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === this.pubSubChannel) {
          try {
            const event = JSON.parse(message);
            const domain = event.domain?.toLowerCase()?.trim();
            if (domain === 'plans' || !domain) {
              // Evict Tier 1 for plans and all per-plan quota keys
              this.memoryCache.delete('plans');
              for (const key of this.memoryCache.keys()) {
                if (key.startsWith('quota:plan:')) {
                  this.memoryCache.delete(key);
                }
              }
              console.log('[quota/config-client] Plans config invalidated via pub/sub');
            }
          } catch {
            this.memoryCache.clear();
          }
        }
      });
    } catch {
      // Fail open when Redis subscriber cannot connect
    }
  }

  /**
   * Fetch the full plans configuration payload via 3-Tier Strategy.
   */
  public async getPlansConfig(): Promise<Record<string, any>> {
    const now = Date.now();

    // Tier 1: Memory Cache
    const cached = this.memoryCache.get('plans');
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // Tier 2: Redis Cache — full plans snapshot
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

    // Tier 4: no fabricated business values — Redis and admin-api are both
    // unreachable, so return nothing rather than guess plan quotas.
    console.warn('[quota/config-client] Plans config unavailable from Redis and admin-api — returning empty config');
    return {};
  }

  /**
   * Resolve the quota limit for a given plan key dynamically. Despite the
   * `monthly_quota` field name (admin-api's historical naming — kept as-is
   * to avoid a cross-service wire-contract rename), this limit actually
   * resets daily: see quota.service.ts's TTL-to-midnight-UTC logic.
   *
   * Resolution order:
   *   1. Memory cache keyed `quota:plan:{planKey}` (fast, evicted on pub/sub)
   *   2. Redis key `quota:plan:{planKey}` — written by admin-api on every plan save
   *   3. Full plans config snapshot (Tier 2b / Tier 3 HTTP above)
   *   4. Fail closed — 0 (never hardcodes a business quota value)
   */
  public async getPlanQuota(planKey: string): Promise<number> {
    const key = planKey.toLowerCase();
    const cacheKey = `quota:plan:${key}`;
    const now = Date.now();

    // Tier 1: Memory cache for this specific plan limit
    const memHit = this.memoryCache.get(cacheKey);
    if (memHit && memHit.expiresAt > now) {
      const v = memHit.data['value'];
      if (typeof v === 'number') return v;
    }

    // Tier 2a: Direct Redis key `quota:plan:{code}` written by admin-api
    try {
      const redis = getRedis();
      const raw = await redis.get(cacheKey);
      if (raw !== null) {
        const limit = parseInt(raw, 10);
        if (!isNaN(limit)) {
          // Cache in memory for 5 minutes
          this.memoryCache.set(cacheKey, { data: { value: limit }, expiresAt: now + this.cacheTtlMs });
          return limit;
        }
      }
    } catch {}

    // Tier 2b: Full plans config snapshot
    const plansConfig = await this.getPlansConfig();
    const planInfo = plansConfig[key];
    if (planInfo && typeof planInfo.monthly_quota === 'number') {
      this.memoryCache.set(cacheKey, { data: { value: planInfo.monthly_quota }, expiresAt: now + this.cacheTtlMs });
      return planInfo.monthly_quota;
    }

    // Tier 4: no fabricated business values — Redis and admin-api are both
    // unreachable (or this plan isn't configured anywhere). Return 0, which
    // blocks generation, rather than guessing a limit for any plan.
    console.warn(`[quota/config-client] No configured quota for plan '${key}' from Redis or admin-api — denying (0)`);
    return 0;
  }

  public clearMemoryCache(): void {
    this.memoryCache.clear();
  }
}

export const quotaConfigClient = QuotaConfigClient.getInstance();
