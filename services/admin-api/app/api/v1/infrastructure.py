from app.security.permissions import require_permission
import asyncio
import time
from typing import Any, Dict
from urllib.parse import urlparse

import httpx

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.redis import cache_manager
from app.db.admin_db import admin_db
from app.security.authentication import AdminUserPayload
from app.security.dependencies import get_current_admin

router = APIRouter(prefix="/admin/infrastructure", tags=["Admin Infrastructure Monitoring"])

# Real services this deployment actually runs, keyed by the base URL each one
# is configured with (same env vars every other integration client in this
# service already uses) — not a hand-maintained guess at ports, so it can't
# drift out of sync with docker-compose.yml the way the old hardcoded
# frontend list did (it had Payment on :3004 and Auth on :3001, both wrong).
SERVICE_TARGETS = [
    {"name": "Gateway", "url": lambda: settings.GATEWAY_URL},
    {"name": "Auth Service", "url": lambda: settings.AUTH_SERVICE_URL},
    {"name": "Chat & AI Service", "url": lambda: settings.CHAT_SERVICE_URL},
    {"name": "Document Render Service", "url": lambda: settings.DOCUMENT_SERVICE_URL},
    {"name": "Payment Service", "url": lambda: settings.PAYMENT_SERVICE_URL},
    {"name": "Quota Service", "url": lambda: settings.QUOTA_SERVICE_URL},
    {"name": "Notification Service", "url": lambda: settings.NOTIFICATION_SERVICE_URL},
    {"name": "Analytics Service", "url": lambda: settings.ANALYTICS_SERVICE_URL},
]


async def _check_http_service(name: str, base_url: str) -> Dict[str, Any]:
    port = urlparse(base_url).port
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(f"{base_url.rstrip('/')}/health")
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        status = "Online" if res.status_code < 500 else "Degraded"
        return {"name": name, "port": port, "status": status, "latency_ms": latency_ms, "detail": None}
    except Exception as err:
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {"name": name, "port": port, "status": "Offline", "latency_ms": latency_ms, "detail": str(err)}


def _check_postgres() -> Dict[str, Any]:
    started = time.perf_counter()
    try:
        admin_db.fetch_one("SELECT 1 as ok")
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {"name": "PostgreSQL Database", "port": 5432, "status": "Online", "latency_ms": latency_ms, "detail": None}
    except Exception as err:
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {"name": "PostgreSQL Database", "port": 5432, "status": "Offline", "latency_ms": latency_ms, "detail": str(err)}


def _check_redis() -> Dict[str, Any]:
    started = time.perf_counter()
    client = getattr(cache_manager, "_client", None)
    if client is None:
        return {"name": "Redis Cache Bus", "port": 6379, "status": "Offline", "latency_ms": None, "detail": "not connected — using in-memory fallback"}
    try:
        client.ping()
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {"name": "Redis Cache Bus", "port": 6379, "status": "Online", "latency_ms": latency_ms, "detail": None}
    except Exception as err:
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {"name": "Redis Cache Bus", "port": 6379, "status": "Offline", "latency_ms": latency_ms, "detail": str(err)}


@router.get("/mcp/sessions")
async def get_mcp_chat_sessions(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Real recent Chat MCP sessions from the Chat Service's own tables
    (same shared Postgres database) — replaces a previous UI mock that
    displayed invented session IDs/emails/token counts with no query behind
    them at all. `model`/`total_tokens`/`latency_ms` are NOT queried here:
    the chat service's `AIUsage` Prisma model is never written to by any
    real code path (verified — no `db.aIUsage.create` call exists anywhere
    in services/chat/src), so its table would only ever be empty; querying
    it would just add a fake-looking-real "no data" column rather than
    actually track anything."""
    try:
        rows = admin_db.fetch_all(
            """
            SELECT
              cs.id,
              u.email AS user_email,
              dt.name AS document_type,
              cs.status,
              cs."updatedAt" AS updated_at,
              (SELECT COUNT(*) FROM chat_messages cm WHERE cm."sessionId" = cs.id) AS message_count
            FROM chat_sessions cs
            LEFT JOIN users u ON u.id = cs."userId"
            LEFT JOIN document_types dt ON dt.id = cs."documentTypeId"
            ORDER BY cs."updatedAt" DESC
            LIMIT 10
            """
        )
        return {"sessions": rows}
    except Exception as err:
        return {"sessions": [], "error": str(err)}


@router.get("/mcp/templates")
async def get_mcp_templates(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Real document templates from the Chat/Document Service's shared
    `templates` table. No prompt-version or slot-count registry exists in
    this codebase, so those invented fields from the old UI mock are simply
    not returned rather than being faked."""
    try:
        rows = admin_db.fetch_all(
            """
            SELECT
              t.id,
              t.name,
              dt.name AS document_type,
              t."isPremium" AS is_premium,
              (SELECT COUNT(*) FROM chat_sessions cs WHERE cs."templateId" = t.id) AS sessions_using
            FROM templates t
            LEFT JOIN document_types dt ON dt.id = t."documentTypeId"
            ORDER BY sessions_using DESC
            LIMIT 20
            """
        )
        return {"templates": rows}
    except Exception as err:
        return {"templates": [], "error": str(err)}


@router.get("/health")
async def get_infrastructure_health(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Real-time health snapshot of every backend microservice + datastore,
    measured live on each call — no fabricated uptime history exists (this
    deployment has no monitoring time-series store), so `uptime_pct` is
    always null rather than a fake number. Status/latency are the actual
    result of this request's own HTTP/DB/Redis round trip."""
    http_checks = await asyncio.gather(
        *[_check_http_service(t["name"], t["url"]()) for t in SERVICE_TARGETS]
    )

    self_check = {"name": "Admin API (this service)", "port": settings.PORT, "status": "Online", "latency_ms": 0.0, "detail": None}
    postgres_check = _check_postgres()
    redis_check = _check_redis()

    services = [self_check, *http_checks, postgres_check, redis_check]
    for s in services:
        s["uptime_pct"] = None  # honest: no historical uptime monitoring exists

    overall_healthy = all(s["status"] == "Online" for s in services)

    return {
        "status": "healthy" if overall_healthy else "degraded",
        "checked_at_ms": int(time.time() * 1000),
        "services": services,
    }
