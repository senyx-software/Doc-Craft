/**
 * Real UI click tracking — reports genuine btn_* click events to the
 * Analytics Service's browser-facing endpoint (POST /analytics/client-event),
 * which forwards through the same BullMQ -> PostHog pipeline every backend
 * service already uses. Never calls PostHog directly and never carries the
 * internal service secret — the Gateway authenticates the request and
 * injects the caller's identity (or 'guest_user' for logged-out visitors,
 * e.g. the Hero CTA) before it reaches the Analytics Service.
 *
 * Fire-and-forget: a tracking failure must never affect the actual button
 * action it's attached to.
 */
import { post } from './client';

export function trackButtonClick(eventName: string, properties: Record<string, unknown> = {}): void {
  post('/analytics/client-event', { eventName, properties }).catch(() => {
    // Never surface a tracking failure to the user.
  });
}
