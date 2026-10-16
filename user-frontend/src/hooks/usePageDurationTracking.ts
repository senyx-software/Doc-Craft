/**
 * usePageDurationTracking — reports real per-route time-on-page to the
 * Analytics Service, backing the admin "Page Visit Duration & Bounce
 * Statistics" page. Mount once near the app root (inside the Router).
 *
 * Two report paths, both needed for an accurate bounce rate (a session that
 * viewed exactly one route before leaving):
 *  - Route change: reported via the normal authenticated `post()` call, so
 *    it carries the real user's identity.
 *  - Tab close / reload: `beforeunload` can't wait on a fetch response, so
 *    it uses `navigator.sendBeacon` instead — bypasses the app's normal
 *    Authorization header, so the Gateway attributes it to 'guest_user'
 *    (same soft-auth fallback every other client-event route already gets).
 *    That's an acceptable trade-off: without it, whichever route a visitor
 *    was on when they left would never be reported at all, silently
 *    undercounting exactly the pages most likely to be bounces.
 *
 * A session id (one random id per browser tab, via sessionStorage) lets the
 * backend tell "visited only this one route all session" (a bounce) apart
 * from "visited this route, then moved on."
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { post } from '../api/client';

const GATEWAY_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3001/v1';

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem('doccraft_page_session_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('doccraft_page_session_id', id);
    }
    return id;
  } catch {
    // Private browsing / storage blocked — a per-call random id still lets
    // this one event through, it just can't be correlated with others.
    return crypto.randomUUID();
  }
}

function buildPayload(route: string, durationSeconds: number) {
  return {
    eventName: 'page_view_duration',
    properties: {
      route,
      duration_seconds: Math.max(0, Math.round(durationSeconds)),
      session_id: getSessionId(),
    },
  };
}

function reportViaFetch(route: string, durationSeconds: number): void {
  if (durationSeconds < 1) return; // sub-second "visits" are route-change noise, not real dwell time
  post('/analytics/client-event', buildPayload(route, durationSeconds)).catch(() => {
    // Never surface a tracking failure to the user.
  });
}

function reportViaBeacon(route: string, durationSeconds: number): void {
  if (durationSeconds < 1 || !navigator.sendBeacon) return;
  try {
    const blob = new Blob([JSON.stringify(buildPayload(route, durationSeconds))], { type: 'application/json' });
    navigator.sendBeacon(`${GATEWAY_BASE_URL}/analytics/client-event`, blob);
  } catch {
    // Best-effort only.
  }
}

export function usePageDurationTracking(): void {
  const location = useLocation();
  const enterTimeRef = useRef<number>(0);
  const routeRef = useRef<string>(location.pathname);

  useEffect(() => {
    enterTimeRef.current = Date.now();
    routeRef.current = location.pathname;

    return () => {
      reportViaFetch(routeRef.current, (Date.now() - enterTimeRef.current) / 1000);
    };

  }, [location.pathname]);

  useEffect(() => {
    const handleUnload = () => {
      reportViaBeacon(routeRef.current, (Date.now() - enterTimeRef.current) / 1000);
    };
    window.addEventListener('pagehide', handleUnload);
    return () => window.removeEventListener('pagehide', handleUnload);
  }, []);
}
