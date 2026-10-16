import { serviceFetch } from '../../../../shared/service-auth.mjs';
/**
 * productTracking.service.ts — reports real signup/login lifecycle events to
 * PostHog via the Analytics Service's /v1/analytics/event endpoint (the one
 * place holding the real API key — Auth never talks to PostHog directly).
 * Fire-and-forget: a tracking failure must never affect a real auth flow.
 */
const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3017';
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'REPLACE_WITH_STRONG_RANDOM_SECRET';

export function trackProductEvent(userId: string, eventName: string, properties: Record<string, unknown> = {}): void {
  serviceFetch('analytics', `${ANALYTICS_SERVICE_URL}/v1/analytics/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify({ userId, eventName, properties }),
  }).catch((err) => {
    console.warn(`[auth] trackProductEvent('${eventName}') failed:`, err);
  });
}
