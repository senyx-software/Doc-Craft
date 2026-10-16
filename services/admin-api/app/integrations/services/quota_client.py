from shared.service_auth import async_service_client
"""
quota_client.py — HTTP Integration client for the DocCraft Quota Service.

Combines Quota Service Prisma DB (via /v1/quota/admin/stats) with the
Document Service's `documents` table (read directly — admin-api and the
Document Service share the same Postgres database) to serve 100% live
generation analytics.

Zero hardcoded values — all data is computed from real database records.
"""

import httpx
from typing import Any, Dict, List
from app.core.config import settings
from app.db.admin_db import admin_db


class QuotaServiceClient:
    """HTTP integration client for the DocCraft Quota Service."""

    def __init__(self):
        self.base_url = settings.QUOTA_SERVICE_URL.rstrip("/")
        self.secret = settings.INTERNAL_SERVICE_SECRET

    async def _fetch(self, path: str) -> Dict[str, Any]:
        headers = {"X-Internal-Secret": self.secret, "Content-Type": "application/json"}
        url = f"{self.base_url}{path}"
        try:
            async with async_service_client("quota", timeout=6.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, dict):
                        return data
        except Exception as err:
            print(f"[QuotaServiceClient] GET {url} error: {err}")
        return {}

    async def get_admin_stats(self) -> Dict[str, Any]:
        """Fetch live stats from the Quota Service Prisma DB."""
        return await self._fetch("/v1/quota/admin/stats")

    async def remove_override(self, user_id: str) -> None:
        from urllib.parse import quote
        async with async_service_client("quota", timeout=5.0) as client:
            response = await client.delete(
                f"{self.base_url}/v1/quota/override/{quote(user_id, safe='')}",
                headers={"X-Internal-Secret": self.secret},
            )
            response.raise_for_status()

    # ──────────────────────────────────────────────────────────────────────────
    # Detailed generations analytics — all computed from live data
    # ──────────────────────────────────────────────────────────────────────────

    async def get_detailed_generations(self) -> Dict[str, Any]:
        """
        Return complete, live generations analytics, sourced from the
        Document Service's own `documents` table.

        admin-api and the Document Service share the exact same Postgres
        database (same Supabase project) — there used to be a second,
        separate `generation_events` table here that the Document Service
        reported into over HTTP, purely for admin analytics. That was
        redundant (two services independently recording "a document was
        generated") and, in practice, dead: nothing ever called the
        reporting endpoint. `documents` is the real, authoritative record
        (it's what actually serves PDF downloads/share links), so admin-api
        now just reads it directly — no HTTP hop, no duplicate table.

        Quota Service's DB is used only as a last-resort fallback when
        `documents` has no rows yet, and only for the total count — its own
        `overrideLimit`-based free/pro proxy is not reliable enough to use
        for the plan breakdown (see git history for why).
        """
        colors = ["#3B82F6", "#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#f97316", "#06b6d4"]

        # ── 1. By-type breakdown ────────────────────────────────────────────
        type_rows = admin_db.fetch_all(
            'SELECT "documentType" as doc_type, COUNT(*) as cnt FROM documents '
            "WHERE status = 'success' GROUP BY \"documentType\" ORDER BY cnt DESC"
        )
        doc_type_stats: List[Dict] = [
            {
                "name": str(row.get("doc_type", "Unknown")).title(),
                "count": int(row.get("cnt", 0)),
                "color": colors[idx % len(colors)],
            }
            for idx, row in enumerate(type_rows)
        ]
        # No documents yet: leave empty rather than inventing a split.

        # ── 2. Monthly trend + free/pro totals, by the row's own real `plan` ─
        MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        # Postgres stores `createdAt` as a native timestamp (substr() can't
        # implicitly cast it to text); the SQLite test-isolation mirror stores
        # it as TEXT, where substr() works directly.
        ym_expr = "to_char(\"createdAt\", 'YYYY-MM')" if admin_db.is_postgres else 'substr("createdAt", 1, 7)'
        trend_rows = admin_db.fetch_all(
            f'SELECT {ym_expr} as ym, plan, COUNT(*) as cnt FROM documents '
            "WHERE status = 'success' GROUP BY ym, plan ORDER BY ym ASC"
        )
        monthly_trend: List[Dict] = []
        free_tier_total = 0
        pro_tier_total = 0
        month_map: Dict[str, Dict[str, int]] = {}
        for row in trend_rows:
            ym = str(row.get("ym", ""))
            plan = str(row.get("plan", "free"))
            cnt = int(row.get("cnt", 0))
            bucket = month_map.setdefault(ym, {"free": 0, "pro": 0})
            if plan == "free":
                bucket["free"] += cnt
                free_tier_total += cnt
            else:
                bucket["pro"] += cnt
                pro_tier_total += cnt
        for ym in sorted(month_map.keys())[-12:]:
            try:
                mm = int(ym.split("-")[1])
                label = MONTH_NAMES[mm - 1]
            except (IndexError, ValueError):
                label = ym
            monthly_trend.append({"month": label, "free": month_map[ym]["free"], "pro": month_map[ym]["pro"]})

        # ── 3. Top users ─────────────────────────────────────────────────────
        top_users: List[Dict] = []
        doc_user_rows = admin_db.fetch_all(
            'SELECT "userId" as user_id, "userEmail" as user_email, plan, COUNT(*) as cnt FROM documents '
            'GROUP BY "userId", "userEmail", plan ORDER BY cnt DESC LIMIT 20'
        )
        for row in doc_user_rows:
            top_users.append({
                "id": str(row.get("user_id", ""))[:16] or "—",
                "email": str(row.get("user_email") or "—"),
                "count": int(row.get("cnt", 0)),
                "plan": str(row.get("plan", "free")),
                "date": "",
            })

        if not top_users:
            # Fallback: Quota's own top-usage list, without inventing an
            # email — admin_db.admin_users is admin *staff*, never a stand-in
            # for a platform customer's identity.
            quota_data = await self.get_admin_stats()
            for q in quota_data.get("top_user_quotas", [])[:20]:
                uid = str(q.get("userId", ""))
                top_users.append({
                    "id": uid[:16] if uid else "—",
                    "email": "—",
                    "count": int(q.get("used", 0)),
                    "plan": "unknown",
                    "date": str(q.get("periodStart") or q.get("updatedAt") or "")[:10],
                })

        # ── 4. Failed generations ───────────────────────────────────────────
        failed_rows = admin_db.fetch_all(
            'SELECT id, "userEmail" as user_email, "documentType" as doc_type, "errorMessage" as error_message, "createdAt" as created_at '
            "FROM documents WHERE status = 'failed' ORDER BY \"createdAt\" DESC LIMIT 30"
        )
        failed_generations: List[Dict] = [
            {
                "id": f"fail-{str(row.get('id', ''))[:8]}",
                "user": str(row.get("user_email") or "—"),
                "type": str(row.get("doc_type", "unknown")).title(),
                "error": str(row.get("error_message") or "Generation failed"),
                "date": str(row.get("created_at", ""))[:16],
            }
            for row in failed_rows
        ]

        # ── 4b. Recent generations (any status) — the real backing data for
        # the admin "Generated Document Logs" table. There is no byte-size
        # column anywhere on `documents` (checked the model directly) — PDFs
        # are written to Supabase Storage by key (`pdfKey`), and no service
        # measures/stores their size, so this never fabricates one.
        recent_rows = admin_db.fetch_all(
            'SELECT id, "userEmail" as user_email, "documentType" as doc_type, "templateId" as template_id, '
            'status, "createdAt" as created_at FROM documents ORDER BY "createdAt" DESC LIMIT 10'
        )
        recent_generations: List[Dict] = [
            {
                "id": str(row.get("id", "")),
                "user": str(row.get("user_email") or "—"),
                "type": str(row.get("doc_type", "unknown")).title(),
                "template": str(row.get("template_id", "—")),
                "status": str(row.get("status", "unknown")),
                "date": str(row.get("created_at", ""))[:16],
            }
            for row in recent_rows
        ]

        # ── 5. Funnel drop-off — not available from this table. The Document
        # Service only sees the final "generate" call, not the earlier chat
        # steps (document type selection, slot filling), so it can't tell
        # who dropped off before reaching generation. Real drop-off tracking
        # would need Chat Service's own session data (chat_sessions.status:
        # ACTIVE/COMPLETED/ABANDONED/EXPIRED) — not implemented here yet.
        drop_off_points: List[Dict] = []

        # ── 6. Totals ────────────────────────────────────────────────────────
        if trend_rows or failed_generations:
            total_generations = free_tier_total + pro_tier_total + len(failed_generations)
        else:
            quota_data = await self.get_admin_stats()
            total_generations = int(quota_data.get("total_generations_used", 0))

        return {
            "status": "success",
            "total_generations": total_generations,
            "by_type": doc_type_stats,
            "top_users": top_users,
            "recent_generations": recent_generations,
            "failed_generations": failed_generations,
            "monthly_trend": monthly_trend,
            "drop_off_points": drop_off_points,
            "free_tier_total": free_tier_total,
            "pro_tier_total": pro_tier_total,
        }


quota_client = QuotaServiceClient()
