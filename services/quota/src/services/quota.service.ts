import {ledgerOperation} from './reservation-ledger.service.js';
import { serviceFetch } from '../../../../shared/service-auth.mjs';
import { signedEvent } from '../../../../shared/event-auth.mjs';
/**
 * quota.service.ts — the hot-path quota logic.
 *
 * THE CORE INVARIANT (SRS rule #1): the check is a single ATOMIC Redis
 * operation. `/check` runs a Lua script that reads the effective limit,
 * `INCR`s the counter, and compares — all inside one server-side execution, so
 * two concurrent requests can never both pass a limit check. There is no
 * read-then-write anywhere in this path, and the request-blocking check never
 * touches Postgres (Supabase is synced off the hot path by quota-sync.service).
 *
 * Redis key schema:
 *   quota:user:{userId}        → integer counter (TTL anchored to next midnight UTC)
 *   quota:limit:{userId}       → integer override limit (set by admin override only)
 *   quota:guest:{sessionToken} → integer counter (TTL = 86400s, capped at 1)
 */

import { getRedis } from '../db/redis.js';
import { nextMidnightUTC, secondsUntilMidnightUTC } from '../lib/time.js';
import { syncUsage } from './quota-sync.service.js';
import { quotaConfigClient } from './quotaConfigClient.service.js';
import { env } from '../config/env.js';

export { nextMidnightUTC, secondsUntilMidnightUTC };

const QUOTA_WARNING_THRESHOLD_RATIO = 0.8;

/**
 * trackProductEvent — reports a real quota lifecycle event to PostHog via
 * the Analytics Service's /v1/analytics/event endpoint (the one place
 * holding the real API key). Fire-and-forget: never affects the hot path.
 */
function trackProductEvent(userId: string, eventName: string, properties: Record<string, unknown>): void {
  serviceFetch('analytics', `${env.ANALYTICS_SERVICE_URL}/v1/analytics/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify({ userId, eventName, properties }),
  }).catch((err) => {
    console.warn(`[quota] trackProductEvent('${eventName}') failed:`, err);
  });
}

const DENIAL_ABUSE_WINDOW_SECONDS = 600; // 10 minutes
const DENIAL_ABUSE_THRESHOLD = 25;       // denied /check calls within the window
const SUSPEND_REPORT_COOLDOWN_SECONDS = 86_400; // avoid re-reporting the same user all day

/**
 * reportAutoSuspend — fire-and-forget report to admin-api when a user keeps
 * calling the generation endpoint far past their own quota denial, a strong
 * signal of a scripted bypass attempt rather than a normal client backing
 * off. Never awaited from the request path.
 */
function reportAutoSuspend(userId: string, reason: string): void {
  serviceFetch('admin-api', `${env.ADMIN_API_SERVICE_URL}/api/v1/admin/security/auto-suspend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify({ user_id: userId, reason, source: 'quota-abuse-detection' }),
  }).catch((err) => {
    console.warn('[quota/security] Failed to report auto-suspend to admin-api:', err);
  });
}

/**
 * maybeFlagAbusiveDenials — tracks denied /check attempts per user in a
 * rolling window. Crossing the threshold auto-suspends the account via
 * admin-api. Fire-and-forget and fails open: a Redis hiccup here must never
 * affect the quota hot path.
 */
async function maybeFlagAbusiveDenials(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    const denyKey = `abuse:denied:${userId}`;
    const count = await redis.incr(denyKey);
    if (count === 1) await redis.expire(denyKey, DENIAL_ABUSE_WINDOW_SECONDS);

    if (count >= DENIAL_ABUSE_THRESHOLD) {
      const reportedKey = `abuse:denied:reported:${userId}`;
      const firstReport = await redis.set(reportedKey, '1', 'EX', SUSPEND_REPORT_COOLDOWN_SECONDS, 'NX');
      if (firstReport === 'OK') {
        reportAutoSuspend(
          userId,
          `${count} quota-denied generation attempts within ${DENIAL_ABUSE_WINDOW_SECONDS / 60} minutes`,
        );
      }
    }
  } catch (err) {
    console.warn('[quota] maybeFlagAbusiveDenials failed:', err);
  }
}

/**
 * maybeEmitQuotaWarning — publishes `quota.warning` to `doccraft:events`, the
 * channel the Admin Automation Engine subscribes to (rule_quota_warning),
 * the instant usage first crosses 80% of the plan limit. Fires exactly once
 * per reset period — `used` only climbs until the daily reset, so checking
 * "this call is the one that crossed the line" (not "is at/above it") avoids
 * re-emitting on every subsequent request. Fire-and-forget: never blocks or
 * fails the hot path.
 */
async function maybeEmitQuotaWarning(userId: string, plan: string, used: number, limit: number): Promise<void> {
  if (limit <= 0) return;
  const threshold = Math.ceil(limit * QUOTA_WARNING_THRESHOLD_RATIO);
  if (used < threshold || used - 1 >= threshold) return;
  try {
    await getRedis().publish('doccraft:events', await signedEvent('quota.warning', { user_id: userId, plan, used_quota: used, limit }));
    trackProductEvent(userId, 'quota_warning', { plan, used_quota: used, limit });
  } catch (err) {
    console.warn('[quota] maybeEmitQuotaWarning failed:', err);
  }
}

export const GUEST_LIMIT = 1;
export const GUEST_TTL_SECONDS = 86_400; // 24 hours

/**
 * UNLIMITED_QUOTA — sentinel plan/override limit meaning "no daily cap".
 * Admin-managed (a plan's `monthly_quota` or a per-user override) — never
 * hardcoded for a specific plan. Distinct from the fail-closed default of 0
 * (see quotaConfigClient), which denies rather than allows.
 */
export const UNLIMITED_QUOTA = -1;

function computeRemaining(used: number, limit: number): number {
  return limit === UNLIMITED_QUOTA ? UNLIMITED_QUOTA : Math.max(0, limit - used);
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

function userCounterKey(userId: string): string { return `quota:user:${userId}`; }
function userLimitKey(userId: string): string { return `quota:limit:${userId}`; }
function guestCounterKey(sessionToken: string): string { return `quota:guest:${sessionToken}`; }

// ─── Atomic Lua scripts ────────────────────────────────────────────────────────

/**
 * Authenticated check-and-reserve.
 *   KEYS[1] = counter key, KEYS[2] = override-limit key
 *   ARGV[1] = plan default limit, ARGV[2] = TTL seconds (anchor to midnight)
 * Reads the override (falling back to the plan limit), increments, and — if the
 * new value exceeds the limit — rolls the increment back so the stored count
 * always reflects reality. Returns {allowed(0|1), used, limit}.
 */
const CHECK_AND_RESERVE = `
if KEYS[3] then
  local prior = redis.call('GET', KEYS[3])
  if prior then local override=redis.call('GET',KEYS[2]);local allowed=1;if prior=='refunded' then allowed=0 end;return {allowed,tonumber(redis.call('GET',KEYS[1])) or 0,tonumber(override) or tonumber(ARGV[1])} end
end
local override = redis.call('GET', KEYS[2])
local limit = tonumber(override) or tonumber(ARGV[1])
local n = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
if limit >= 0 and n > limit then
  redis.call('DECR', KEYS[1])
  return {0, n - 1, limit}
end
if KEYS[3] then redis.call('SET', KEYS[3], cjson.encode({n,limit}), 'EX', tonumber(ARGV[2])) end
return {1, n, limit}
`;

/**
 * Refund one previously-reserved unit — undoes a checkAndReserve() whose
 * generation ultimately failed (e.g. the PDF worker crashed, template
 * render error, storage upload failure). Without this, a failed generation
 * still permanently burns the user's daily quota with nothing delivered —
 * confirmed live: a free-tier user hit 5 failed generations and was locked
 * out for the rest of the day having received zero documents.
 *   KEYS[1] = counter key
 * Clamps at 0 (never goes negative) and never touches the key's existing
 * TTL — it's still the same day's counter, just corrected downward.
 */
const REFUND_USAGE = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
local receipt = redis.call('GET', KEYS[2])
if not receipt or receipt == 'refunded' then return n end
local ttl = redis.call('TTL', KEYS[2])
if ttl <= 0 then return n end
redis.call('SET', KEYS[2], 'refunded', 'EX', ttl)
if n > 0 then
  n = redis.call('DECR', KEYS[1])
end
return n
`;

/**
 * Guest check-and-reserve (fixed limit, no override lookup).
 *   KEYS[1] = counter key; ARGV[1] = limit, ARGV[2] = TTL seconds
 */
const GUEST_CHECK_AND_RESERVE = `
local limit = tonumber(ARGV[1])
local n = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
if n > limit then
  redis.call('DECR', KEYS[1])
  return {0, n - 1, limit}
end
return {1, n, limit}
`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QuotaStatus {
  userId:    string;
  plan:      string;
  used:      number;
  limit:     number;
  remaining: number;
  resets_at: string; // ISO-8601
}

export interface QuotaCheckResult extends QuotaStatus {
  allowed: boolean;
}

export interface GuestQuotaStatus {
  sessionToken: string;
  used:         number;
  limit:        number;
  remaining:    number;
  allowed:      boolean;
}

// ─── Authenticated hot path ─────────────────────────────────────────────────

/**
 * checkAndReserve — the authoritative generation gate (SRS rule #1).
 *
 * Atomically reserves one unit of quota. A single Redis round trip; never
 * blocks on Postgres. Pro users run the same path (unlimited threshold) so
 * their usage is still captured. Postgres is synced fire-and-forget afterwards.
 */
export async function checkAndReserve(
  userId: string,
  plan: 'free' | 'pro' | string,
  reservationId?: string,
): Promise<QuotaCheckResult> {
  return ledgerOperation(userId,'reserve',reservationId);
}

/**
 * refundUsage — give back one unit of quota after a checkAndReserve()'d
 * generation ultimately failed to actually produce a document (worker
 * crash, template error, storage failure, ...). Called by the Document
 * Service's PDF worker from its failure handler, never from the hot
 * check-and-reserve path itself.
 */
export async function refundUsage(userId: string, plan: 'free' | 'pro' | string, reservationId: string): Promise<number> {
  if (!reservationId) throw new Error('A reservation ID is required for a refund');
  return (await ledgerOperation(userId,'refund',reservationId)).used;
}

/**
 * increment — standalone atomic increment for the "count after successful
 * generation" flow when the caller did NOT reserve via checkAndReserve.
 *
 * A generation must be counted exactly once: use `/check` as a reserving gate,
 * OR `/increment` to count post-hoc — not both for the same generation.
 */
export async function increment(
  userId: string,
  plan: 'free' | 'pro' | string,
): Promise<QuotaStatus> {
  return ledgerOperation(userId,'reserve');
}

/**
 * getStatus — read-only quota snapshot for GET /quota/me. Does not increment.
 * Redis-only, so it stays fast.
 */
export async function getStatus(
  userId: string,
  plan: 'free' | 'pro' | string,
): Promise<QuotaStatus> {
  return ledgerOperation(userId,'status');
}

/**
 * setUserLimitOverride — writes an admin override limit into Redis so the
 * atomic check picks it up immediately (no wait for the next reset cycle).
 */
export async function setUserLimitOverride(userId: string, limit: number): Promise<void> {
  await getRedis().set(userLimitKey(userId), String(limit));
}

// ─── Reset (Redis side) ────────────────────────────────────────────────────

/** resetUserCounter — clears a single user's Redis counter. */
export async function resetUserCounter(userId: string): Promise<void> {
  await ledgerOperation(userId,'reset');
}

/**
 * resetAllCounters — deletes every quota:user:* counter (used by the midnight
 * cron). Uses SCAN so it never blocks Redis. Returns the number of keys deleted.
 */
export async function resetAllCounters(): Promise<number> {
  const redis = getRedis();
  let cursor = '0';
  let deleted = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'quota:user:*', 'COUNT', 100);
    cursor = next;
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');
  return deleted;
}

// ─── Guest hot path ────────────────────────────────────────────────────────

/**
 * checkGuestAndReserve — atomic reserve for an unauthenticated guest session.
 * Capped at 1 document with a 24h TTL (separate keyspace from users).
 */
export async function checkGuestAndReserve(sessionToken: string): Promise<GuestQuotaStatus> {
  const redis = getRedis();
  const [allowedRaw, used, limit] = (await redis.eval(
    GUEST_CHECK_AND_RESERVE, 1,
    guestCounterKey(sessionToken),
    String(GUEST_LIMIT), String(GUEST_TTL_SECONDS),
  )) as [number, number, number];

  return {
    sessionToken, used, limit,
    remaining: Math.max(0, limit - used),
    allowed: allowedRaw === 1,
  };
}

/** getGuestStatus — read-only guest snapshot (does not increment). */
export async function getGuestStatus(sessionToken: string): Promise<GuestQuotaStatus> {
  const redis = getRedis();
  const raw = await redis.get(guestCounterKey(sessionToken));
  const used = raw ? parseInt(raw, 10) : 0;
  return {
    sessionToken, used, limit: GUEST_LIMIT,
    remaining: Math.max(0, GUEST_LIMIT - used),
    allowed: used < GUEST_LIMIT,
  };
}
