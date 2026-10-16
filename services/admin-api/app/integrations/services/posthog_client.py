"""
posthog_client.py — Admin-API client for PostHog's real Experiments REST API.

Uses a personal/private API key (distinct from the client-side project key
used for event ingestion elsewhere in this codebase). If it isn't configured,
`get_experiments()` returns an explicit not-configured result rather than
fabricated A/B test data.
"""
from typing import Any, Dict, List

import httpx

from app.core.config import settings

TIMEOUT = 8.0


class PostHogClient:
    def __init__(self):
        self.host = settings.POSTHOG_HOST.rstrip("/")
        self.personal_api_key = settings.POSTHOG_PERSONAL_API_KEY
        self.project_id = settings.POSTHOG_PROJECT_ID

    def is_configured(self) -> bool:
        return bool(self.personal_api_key and self.project_id)

    def get_experiments(self) -> Dict[str, Any]:
        if not self.is_configured():
            return {
                "configured": False,
                "message": "PostHog personal API key / project ID not configured — set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID.",
                "experiments": [],
            }
        try:
            resp = httpx.get(
                f"{self.host}/api/projects/{self.project_id}/experiments/",
                headers={"Authorization": f"Bearer {self.personal_api_key}"},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            experiments: List[Dict[str, Any]] = []
            for exp in data.get("results", []):
                variants = (exp.get("parameters") or {}).get("feature_flag_variants") or []
                variant_names = [v.get("key", "") for v in variants]
                variant_rollouts = [v.get("rollout_percentage") for v in variants]
                status = "Draft"
                if exp.get("start_date") and not exp.get("end_date"):
                    status = "Running"
                elif exp.get("end_date"):
                    status = "Completed"
                experiments.append({
                    "id": exp.get("id"),
                    "name": exp.get("name"),
                    "feature_flag_key": exp.get("feature_flag_key"),
                    "variants": variant_names,
                    "traffic_split": variant_rollouts,
                    "status": status,
                    "start_date": exp.get("start_date"),
                    "end_date": exp.get("end_date"),
                })
            return {"configured": True, "experiments": experiments}
        except httpx.HTTPError as e:
            return {"configured": True, "error": str(e), "experiments": []}

    def get_button_click_events(self, days: int = 30) -> Dict[str, Any]:
        """
        Real per-button click counts from PostHog, for events reported by
        user-frontend's real `btn_*` click instrumentation (see
        productTracking.ts's trackButtonClick — routed through the Analytics
        Service's /v1/analytics/client-event, never fabricated here).

        Uses PostHog's HogQL Query API (same personal API key + project ID as
        get_experiments — a private key, distinct from the client-side
        ingestion key used elsewhere). Not configured -> explicit
        not-configured result, never a fabricated table.
        """
        if not self.is_configured():
            return {
                "configured": False,
                "message": "PostHog personal API key / project ID not configured — set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID.",
                "events": [],
            }
        try:
            query = {
                "kind": "HogQLQuery",
                "query": (
                    "SELECT event, count() as cnt "
                    "FROM events "
                    f"WHERE event LIKE 'btn\\_%' ESCAPE '\\' AND timestamp > now() - INTERVAL {int(days)} DAY "
                    "GROUP BY event ORDER BY cnt DESC LIMIT 50"
                ),
            }
            resp = httpx.post(
                f"{self.host}/api/projects/{self.project_id}/query/",
                headers={"Authorization": f"Bearer {self.personal_api_key}"},
                json={"query": query},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            events: List[Dict[str, Any]] = [
                {"event": row[0], "count": int(row[1])}
                for row in data.get("results", [])
            ]
            return {"configured": True, "events": events}
        except httpx.HTTPError as e:
            return {"configured": True, "error": str(e), "events": []}

    def get_page_duration_stats(self, days: int = 30) -> Dict[str, Any]:
        """
        Real per-route time-on-page and bounce rate from PostHog, for events
        reported by user-frontend's usePageDurationTracking hook (event
        `page_view_duration`, properties: route, duration_seconds,
        session_id).

        Bounce here means "this session's tab/route session recorded exactly
        one route for its whole lifetime" — computed with a window function
        (uniqExact(route) OVER (PARTITION BY session_id)) rather than a
        second query, so a route's bounce_pct is bounce_views / views for
        that route. Not configured -> explicit not-configured result, never
        fabricated numbers.
        """
        if not self.is_configured():
            return {
                "configured": False,
                "message": "PostHog personal API key / project ID not configured — set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID.",
                "pages": [],
            }
        try:
            query = {
                "kind": "HogQLQuery",
                "query": (
                    "SELECT route, avg(duration_seconds) as avg_duration, count() as views, "
                    "countIf(distinct_routes = 1) as bounce_views "
                    "FROM (SELECT properties.route as route, "
                    "toFloat(properties.duration_seconds) as duration_seconds, "
                    "uniqExact(properties.route) OVER (PARTITION BY properties.session_id) as distinct_routes "
                    "FROM events "
                    f"WHERE event = 'page_view_duration' AND timestamp > now() - INTERVAL {int(days)} DAY) "
                    "GROUP BY route ORDER BY views DESC LIMIT 50"
                ),
            }
            resp = httpx.post(
                f"{self.host}/api/projects/{self.project_id}/query/",
                headers={"Authorization": f"Bearer {self.personal_api_key}"},
                json={"query": query},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            pages: List[Dict[str, Any]] = []
            for row in data.get("results", []):
                route, avg_duration, views, bounce_views = row[0], row[1], int(row[2]), int(row[3])
                pages.append({
                    "route": route,
                    "avg_duration_seconds": round(float(avg_duration or 0), 1),
                    "views": views,
                    "bounce_pct": round((bounce_views / views) * 100, 1) if views > 0 else 0.0,
                })
            return {"configured": True, "pages": pages}
        except httpx.HTTPError as e:
            return {"configured": True, "error": str(e), "pages": []}


posthog_client = PostHogClient()
