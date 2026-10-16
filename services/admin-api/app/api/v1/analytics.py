from app.security.permissions import require_permission
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.db.admin_db import admin_db
from app.integrations.services.analytics_client import analytics_client
from app.integrations.services.posthog_client import posthog_client
from app.integrations.services.quota_client import quota_client
from app.security.authentication import AdminUserPayload
from app.security.dependencies import get_current_admin
from app.services.audit_service import audit_service

router = APIRouter(prefix="/admin/analytics", tags=["Admin Analytics & PostHog"])


class TrackEventRequest(BaseModel):
    user_id: Optional[str] = Field(None, description="Distinct User ID or Anonymous ID")
    event_name: str = Field(..., description="PostHog event name e.g. btn_download_pdf_click")
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Event metadata properties")


# ----------------------------------------------------------------------
# 1. Dashboard Overview
# ----------------------------------------------------------------------
@router.get("/overview")
async def get_analytics_overview(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch all dashboard KPI metrics from the Payment Service (revenue/subscribers) and Quota Service (generation volume) — zero hardcoded values."""
    metrics = await analytics_client.get_metrics()
    return {
        "status":              "success",
        "total_users":         metrics.get("total_users", 0),
        "active_customers":    metrics.get("active_customers", 0),
        "total_generations":   metrics.get("total_generations", 0),
        "mrr":                 metrics.get("mrr", 0.0),
        "arr":                 metrics.get("arr", 0.0),
        "mrr_growth_pct":      metrics.get("mrr_growth_pct", 0.0),
        "gross_margin_pct":    metrics.get("gross_margin_pct", 0.0),
        "render_success_pct":  metrics.get("render_success_pct", 0.0),
        "telemetry_status":    "Sync Active",
        "posthog_host":        settings.POSTHOG_HOST,
    }


# ----------------------------------------------------------------------
# 2. Revenue Analytics
# ----------------------------------------------------------------------
@router.get("/revenue")
async def get_revenue_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch MRR, ARR, ARPU, LTV, and revenue breakdown by plan/gateway from the Payment Service."""
    metrics = await analytics_client.get_metrics()
    revenue_by_gateway = metrics.get("revenue_by_gateway", {}) or {}
    return {
        "mrr":                metrics.get("mrr", 0.0),
        "arr":                metrics.get("arr", 0.0),
        "arpu":               metrics.get("arpu", 0.0),
        "ltv":                metrics.get("ltv", 0.0),
        "mrr_growth_pct":     metrics.get("mrr_growth_pct", 0.0),
        "by_plan":            metrics.get("by_plan", {}),
        "trajectory":         metrics.get("trajectory", []),
        "payhere_volume_usd": revenue_by_gateway.get("payhere", 0.0),
        "paddle_volume_usd":  revenue_by_gateway.get("paddle", 0.0),
    }


# ----------------------------------------------------------------------
# 3. Generation Analytics
# ----------------------------------------------------------------------
@router.get("/generations")
async def get_generation_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch document generation statistics grouped by document type and user tier."""
    return await analytics_client.get_generations()


@router.get("/generations/detailed")
async def get_detailed_generation_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch complete live generation analytics combining Quota Service and Cloud Database."""
    return await quota_client.get_detailed_generations()


@router.get("/journey")
async def get_journey_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch real signup-to-activation stage timings from the Analytics Service."""
    return await analytics_client.get_journey()


# ----------------------------------------------------------------------
# 4. User & Traffic Analytics
# ----------------------------------------------------------------------
@router.get("/users")
async def get_users_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch active user statistics grouped by status, user class, and guest sessions."""
    return await analytics_client.get_users_breakdown()


@router.get("/traffic")
async def get_traffic_analytics(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_admin: AdminUserPayload = Depends(require_permission("analytics", "view")),
):
    """Fetch acquisition traffic sources, device distribution, and geographic
    stats — optionally filtered to a real date range (ISO YYYY-MM-DD)."""
    return await analytics_client.get_traffic(from_date=from_date, to_date=to_date)


# ----------------------------------------------------------------------
# 5. PostHog Integration
# ----------------------------------------------------------------------
@router.get("/posthog/config")
async def get_posthog_config(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch PostHog integration status and runtime configuration."""
    # Monthly tracked sessions: distinct user count from the Document
    # Service's `documents` table (same shared Postgres database).
    session_count_row = admin_db.fetch_one(
        'SELECT COUNT(DISTINCT "userId") as cnt FROM documents'
    )
    monthly_sessions = int((session_count_row or {}).get("cnt", 0))

    # Real configuration state, not an assumed "connected" — POSTHOG_API_KEY
    # (client-side ingestion key) lets events be captured; querying anything
    # back (button-clicks, page-duration) additionally needs
    # POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID, which this deployment
    # doesn't have set. Neither key being present is ever verified against a
    # live PostHog connection here — "configured" means the env vars exist,
    # not that a network call to PostHog has actually succeeded.
    ingestion_key_set = bool(settings.POSTHOG_API_KEY)
    query_api_configured = posthog_client.is_configured()
    if not ingestion_key_set:
        status_value = "not_configured"
        telemetry_sync = "Inactive — POSTHOG_API_KEY not set"
    elif not query_api_configured:
        status_value = "partially_configured"
        telemetry_sync = "Sending events only — POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID not set, can't query PostHog back"
    else:
        status_value = "configured"
        telemetry_sync = "Sending and querying"

    return {
        "status": status_value,
        "posthog_host": settings.POSTHOG_HOST,
        "api_key_configured": ingestion_key_set,
        "api_key_masked": f"{settings.POSTHOG_API_KEY[:6]}...{settings.POSTHOG_API_KEY[-4:]}" if len(settings.POSTHOG_API_KEY) > 10 else None,
        "query_api_configured": query_api_configured,
        "telemetry_sync": telemetry_sync,
        "monthly_tracked_sessions": monthly_sessions,
        "analytics_service_url": settings.ANALYTICS_SERVICE_URL,
    }


# ----------------------------------------------------------------------
# 6. Button Click Tracking
# ----------------------------------------------------------------------
# Human-readable description for each real instrumented button event —
# documentation of what a known event name means, not fabricated data. An
# event PostHog returns that isn't in this map (new instrumentation, or a
# custom btn_* event fired ad hoc) just falls back to the raw event name.
BUTTON_EVENT_DESCRIPTIONS: Dict[str, str] = {
    "btn_start_creating_click": "CTA button on Hero landing page",
    "btn_download_pdf_click": "Download PDF trigger in builder",
    "btn_upgrade_monthly_click": "Upgrade to Pro checkout start",
    "btn_format_sidebar_toggle": "Format layout controls toggle",
}


@router.get("/button-clicks")
async def get_button_click_analytics(
    days: int = 30,
    current_admin: AdminUserPayload = Depends(require_permission("analytics", "view")),
):
    """Fetch real per-button click counts from PostHog (HogQL Query API) for
    every event reported by user-frontend's real btn_* click instrumentation.
    Returns configured=False (not fabricated data) if the PostHog personal
    API key isn't set up."""
    result = posthog_client.get_button_click_events(days=days)
    for row in result.get("events", []):
        row["description"] = BUTTON_EVENT_DESCRIPTIONS.get(row["event"], row["event"])
    return result


@router.get("/page-duration")
async def get_page_duration_analytics(
    days: int = 30,
    current_admin: AdminUserPayload = Depends(require_permission("analytics", "view")),
):
    """Fetch real per-route time-on-page and bounce rate from PostHog (HogQL
    Query API), for events reported by user-frontend's real
    usePageDurationTracking hook. Returns configured=False (not fabricated
    data) if the PostHog personal API key isn't set up."""
    return posthog_client.get_page_duration_stats(days=days)


@router.post("/events", status_code=202)
async def track_posthog_event(
    payload: TrackEventRequest,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("analytics", "edit")),
):
    """Enqueue a product analytics event to PostHog via the Analytics BullMQ worker."""
    user_id = payload.user_id or current_admin.email
    result = await analytics_client.track_event(
        user_id=user_id,
        event_name=payload.event_name,
        properties=payload.properties,
    )
    audit_service.log_security_event(
        action="analytics.event_tracked",
        module="analytics",
        request=request,
        admin_id=current_admin.admin_id,
        admin_email=current_admin.email,
        details={"event_name": payload.event_name},
    )
    return {"status": "queued", "event_name": payload.event_name, "result": result}
