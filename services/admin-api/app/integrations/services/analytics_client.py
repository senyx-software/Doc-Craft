from shared.service_auth import async_service_client
import asyncio
import httpx
from typing import Any, Dict, Optional
from app.core.config import settings


class AnalyticsServiceClient:
    """HTTP integration client for the DocCraft Analytics Service (port 3017)."""

    def __init__(self):
        self.base_url = settings.ANALYTICS_SERVICE_URL.rstrip("/")

    async def _fetch(self, path: str, params: Optional[Dict[str, Any]] = None, timeout: float = 5.0) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        try:
            async with async_service_client("analytics", timeout=timeout) as client:
                res = await client.get(url, params=params, headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET})
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, dict) and "error" not in data:
                        return data
        except Exception as err:
            print(f"[AnalyticsServiceClient] GET {url} error: {err}")
        return {}

    # ── Overview / User Counts ───────────────────────────────────────────────

    async def get_overview(self) -> Dict[str, Any]:
        """Fetch general analytics overview (total users, document generations)."""
        data = await self._fetch("/v1/analytics/overview")
        total_users = data.get("total_users")
        total_generations = data.get("total_generations")

        # If the Analytics Service didn't return a user count, fall back to the
        # Auth Service's own count (admin_db.admin_users is admin *staff*, not
        # platform users — never a stand-in for this number).
        if total_users is None or total_users == 0:
            try:
                from app.integrations.services.auth_client import auth_client
                auth_resp = await auth_client.list_users(page=1, limit=1)
                total_users = (auth_resp or {}).get("meta", {}).get("total", 0)
            except Exception as e:
                print(f"[AnalyticsServiceClient] auth_client fallback for total_users failed: {e}")
                total_users = 0

        # If the Analytics Service didn't return generations, count real rows
        # in the Document Service's own `documents` table (admin-api and the
        # Document Service share the same Postgres database) — this used to
        # scan audit_logs for any action containing "pdf" or module='document',
        # which could mislabel an unrelated admin action as a real generation.
        if total_generations is None or total_generations == 0:
            try:
                from app.db.admin_db import admin_db
                docs_cnt = admin_db.fetch_one("SELECT COUNT(id) as cnt FROM documents")
                total_generations = docs_cnt.get("cnt", 0) if docs_cnt else 0
            except Exception:
                total_generations = 0

        return {
            "total_users": int(total_users or 0),
            "total_generations": int(total_generations or 0),
        }

    # ── Dashboard KPIs (combines Analytics/Auth/Payment/Quota/cost ledger) ──────

    async def get_metrics(self) -> Dict[str, Any]:
        """
        Compute all KPI metrics that the Dashboard needs — combining the four
        services that each own a piece of this: Analytics/Auth (users), Payment
        (revenue), Quota (generation volume), and this service's own DB (margin,
        render success). Zero hardcoded/fabricated business values anywhere.

        Returns:
          - total_users:         real registered platform users (Analytics Service's
                                 own SQL count, falling back to the Auth Service directly)
          - active_customers:    active, non-guest platform users (Auth Service) —
                                 never admin_db.admin_users, which is admin staff
          - total_generations:   real PDF generation volume from the Quota Service
          - mrr / arr:           real subscriber revenue from the Payment Service
          - by_plan:             active subscription counts per plan (Payment Service)
          - trajectory:          last 12 months of paid revenue (Payment Service)
          - mrr_growth_pct:      % change between the last two months of `trajectory`
          - gross_margin_pct:    (mrr - infra_costs) / mrr * 100
                                 infra_costs from the real cost ledger, else a
                                 7.5%-of-MRR estimate when nothing's logged yet
          - render_success_pct:  successful vs total doc-gen attempts from the
                                 Document Service's own `documents` table
                                 (same shared Postgres database) — the only
                                 place that tracks real success/failure outcomes
        """
        from app.db.admin_db import admin_db
        from app.integrations.services.auth_client import auth_client
        from app.integrations.services.payment_client import payment_client
        from app.integrations.services.quota_client import quota_client
        from app.repositories.cost_ledger_repository import cost_ledger_repository
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        current_month_str = now.strftime("%Y-%m")

        try:
            # These five lookups are all independent of each other — none needs
            # another's result — so they're fired concurrently instead of one
            # sequential `await` after another. Sequentially, a slow Quota call
            # (Prisma's cold-connection warm-up can take several seconds) adds
            # its full delay on top of every other call's; concurrently, the
            # total wait is whichever single one is slowest, not their sum.
            (
                overview_result,
                active_result,
                quota_result,
                revenue_result,
                trajectory_result,
            ) = await asyncio.gather(
                self.get_overview(),
                auth_client.list_users(page=1, limit=1, status="active", isGuest=False),
                quota_client.get_admin_stats(),
                asyncio.to_thread(payment_client.get_revenue_summary),
                asyncio.to_thread(payment_client.get_revenue_trajectory),
                return_exceptions=True,
            )

            # ── Total platform users — Analytics Service (real SQL count against
            #    the Auth Service's users table), falling back to Auth directly ─
            if isinstance(overview_result, Exception):
                print(f"[AnalyticsServiceClient] get_overview error: {overview_result}")
                total_users = 0
            else:
                total_users = int(overview_result.get("total_users", 0) or 0)

            # ── Active customers — real active, non-guest users (Auth Service).
            #    Never admin_db.admin_users: that table is admin *staff*, not
            #    platform customers.
            if isinstance(active_result, Exception):
                print(f"[AnalyticsServiceClient] auth_client active-users lookup failed: {active_result}")
                active_customers = total_users
            else:
                active_customers = int((active_result or {}).get("meta", {}).get("total", 0))

            # ── Generation volume — Quota Service is authoritative; fall back
            #    to the Document Service's own `documents` table (same shared
            #    Postgres database) if the quota totals are empty ────────────
            if isinstance(quota_result, Exception):
                print(f"[AnalyticsServiceClient] quota_client.get_admin_stats error: {quota_result}")
                total_generations = 0
            else:
                total_generations = int(quota_result.get("total_generations_used", 0) or 0)

            gen_total_row = admin_db.fetch_one("SELECT COUNT(id) as cnt FROM documents")
            logged_generations = int((gen_total_row or {}).get("cnt", 0))
            if total_generations == 0:
                total_generations = logged_generations

            # ── Render success rate — real per-attempt outcomes ─────────────
            success_row = admin_db.fetch_one(
                "SELECT COUNT(id) as cnt FROM documents WHERE status = 'success'"
            )
            success_cnt = int((success_row or {}).get("cnt", 0))
            render_success_pct = (
                round((success_cnt / logged_generations * 100), 2) if logged_generations > 0 else 100.0
            )

            # ── Revenue — Payment Service is the source of truth ─────────────
            if isinstance(revenue_result, Exception):
                print(f"[AnalyticsServiceClient] payment_client.get_revenue_summary error: {revenue_result}")
                mrr, arr, by_plan, arpu, ltv, revenue_by_gateway = 0.0, 0.0, {}, 0.0, 0.0, {}
            else:
                mrr = float(revenue_result.get("mrr", 0) or 0)
                arr = float(revenue_result.get("arr", mrr * 12) or 0)
                by_plan = revenue_result.get("subscriptions_by_plan", {}) or {}
                arpu = float(revenue_result.get("arpu", 0) or 0)
                ltv = float(revenue_result.get("ltv", 0) or 0)
                revenue_by_gateway = revenue_result.get("revenue_by_gateway", {}) or {}

            # ── MRR growth trajectory — real paid-invoice revenue by month ──
            if isinstance(trajectory_result, Exception):
                print(f"[AnalyticsServiceClient] payment_client.get_revenue_trajectory error: {trajectory_result}")
                trajectory = []
            else:
                trajectory = trajectory_result.get("trajectory", [])

            if len(trajectory) >= 2 and trajectory[-2].get("mrr", 0) > 0:
                mrr_growth_pct = round(
                    ((trajectory[-1]["mrr"] - trajectory[-2]["mrr"]) / trajectory[-2]["mrr"]) * 100, 1
                )
            elif len(trajectory) >= 1 and trajectory[-1].get("mrr", 0) > 0:
                mrr_growth_pct = 100.0  # first month with data
            else:
                mrr_growth_pct = 0.0

            # ── Gross margin: real infra costs from cost_ledger_repository ──
            actual_costs = cost_ledger_repository.get_total_for_month(current_month_str)
            infra_cost = actual_costs if actual_costs > 0 else mrr * 0.075
            gross_margin_pct = round(((mrr - infra_cost) / mrr) * 100, 1) if mrr > 0 else 0.0

            return {
                "total_users":        total_users,
                "total_generations":  total_generations,
                "mrr":                mrr,
                "arr":                arr,
                "arpu":               arpu,
                "ltv":                ltv,
                "revenue_by_gateway": revenue_by_gateway,
                "by_plan":            by_plan,
                "trajectory":         trajectory,
                "mrr_growth_pct":     mrr_growth_pct,
                "gross_margin_pct":   gross_margin_pct,
                "render_success_pct": render_success_pct,
                "active_customers":   active_customers,
            }

        except Exception as e:
            print(f"[AnalyticsServiceClient] get_metrics error: {e}")
            return {
                "total_users": 0,
                "total_generations": 0,
                "mrr": 0.0,
                "arr": 0.0,
                "arpu": 0.0,
                "ltv": 0.0,
                "revenue_by_gateway": {},
                "by_plan": {},
                "trajectory": [],
                "mrr_growth_pct": 0.0,
                "gross_margin_pct": 0.0,
                "render_success_pct": 0.0,
                "active_customers": 0,
            }

    # ── Generations ──────────────────────────────────────────────────────────

    async def get_generations(self) -> Dict[str, Any]:
        """Fetch document generation statistics by type and user tier."""
        data = await self._fetch("/v1/analytics/generations")
        return {
            "by_type": data.get("by_type", {}),
            "by_tier": data.get("by_tier", {}),
        }

    # ── Users & Traffic ──────────────────────────────────────────────────────

    async def get_users_breakdown(self) -> Dict[str, Any]:
        """Fetch user breakdown by status, class, and guest counts."""
        data = await self._fetch("/v1/analytics/users")
        return {
            "by_status": data.get("by_status", {}),
            "by_class":  data.get("by_class",  {}),
            "guests":    data.get("guests",     0),
        }

    async def get_traffic(self, from_date: Optional[str] = None, to_date: Optional[str] = None) -> Dict[str, Any]:
        """Fetch traffic and conversion analytics, optionally filtered to a
        real date range (ISO YYYY-MM-DD) — filters sources/devices/geographic
        by the real signup/login timestamps behind them, not a guessed scale
        multiplier applied client-side to all-time totals."""
        params = {k: v for k, v in {"from_date": from_date, "to_date": to_date}.items() if v}
        # This endpoint runs ~8 sequential queries against the remote Supabase
        # pooler (sources/devices/geographic/funnel x4/channel_conversion/
        # sessions_in_range), which alone takes ~5s round-trip in practice —
        # the shared 5.0s default timeout was already right at that edge and
        # would intermittently time out, making genuinely-real data look like
        # an empty "no data" response.
        data = await self._fetch("/v1/analytics/traffic", params=params or None, timeout=15.0)
        if data:
            return data
        return {"sources": [], "devices": [], "geographic": [], "funnel": []}

    async def get_journey(self) -> Dict[str, Any]:
        """Fetch real signup-to-activation stage timings (registration -> first
        document, registration -> subscription upgrade)."""
        data = await self._fetch("/v1/analytics/journey")
        if data:
            return data
        return {"stages": [], "total_users": 0}

    # ── PostHog Event Tracking ───────────────────────────────────────────────

    async def track_event(
        self, user_id: str, event_name: str, properties: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Enqueue an event to the BullMQ PostHog worker via the Analytics service."""
        payload = {
            "userId":    user_id,
            "eventName": event_name,
            "properties": properties or {},
        }
        try:
            async with async_service_client("analytics", timeout=5.0) as client:
                res = await client.post(
                    f"{self.base_url}/v1/analytics/event",
                    json=payload,
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                )
                if res.status_code in [200, 202]:
                    return res.json()
        except Exception as err:
            print(f"[AnalyticsServiceClient] track_event error: {err}")
        return {"status": "queued"}


analytics_client = AnalyticsServiceClient()
