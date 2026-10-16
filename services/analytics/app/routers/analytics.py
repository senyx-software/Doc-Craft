from shared.queue_auth import add_job
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import pandas as pd
from app.services.db import get_db, engine
from app.models.analytics import AnalyticsEvent
from app.workers.posthog_worker import analytics_queue
from app.security import current_user, require_internal_secret

router = APIRouter()

@router.post("/event", status_code=202, dependencies=[Depends(require_internal_secret)])
async def track_event(event: AnalyticsEvent, request: Request):
    """
    Internal endpoint — every backend service reports real product/AI events
    here (never call PostHog directly from elsewhere; this is the one place
    holding the real API key). Was previously wide open to any caller with
    no secret check, meaning anyone could inject arbitrary events into this
    project's real PostHog data.
    """
    # Enqueue to BullMQ with 3 retries as per documentation
    await add_job(analytics_queue,"analytics",
        "posthog_event",
        event.model_dump(),
        opts={"attempts": 3}
    )
    return {"status": "queued"}


class ClientEventRequest(BaseModel):
    eventName: str = Field(..., max_length=100, description="UI event name")
    properties: Dict[str, Any] = Field(default_factory=dict)


@router.post("/client-event", status_code=202)
async def track_client_event(payload: ClientEventRequest, user_id: str = Depends(current_user)):
    """Accept UI events only for the independently verified current account."""
    allowed_exact = {"page_view_duration"}
    if not (payload.eventName.startswith("btn_") or payload.eventName in allowed_exact):
        raise HTTPException(status_code=400, detail="eventName must start with 'btn_', or be one of: page_view_duration")

    event = AnalyticsEvent(userId=user_id, eventName=payload.eventName, properties=payload.properties)
    await add_job(analytics_queue,"analytics","posthog_event", event.model_dump(), opts={"attempts": 3})
    return {"status": "queued"}


@router.get("/overview", dependencies=[Depends(require_internal_secret)])
def get_overview(db: Session = Depends(get_db)):
    try:
        users_df = pd.read_sql_query(
            "SELECT count(id) as total_users FROM users", con=engine
        )
        docs_df = pd.read_sql_query(
            "SELECT count(id) as total_docs FROM documents", con=engine
        )
        return {
            "total_users": (
                int(users_df.iloc[0]["total_users"]) if not users_df.empty else 0
            ),
            "total_generations": (
                int(docs_df.iloc[0]["total_docs"]) if not docs_df.empty else 0
            ),
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/revenue", dependencies=[Depends(require_internal_secret)])
def get_revenue(db: Session = Depends(get_db)):
    # Payment owns currency and billing cadence. Do not sum untyped plan prices.
    import os
    from shared.service_auth import service_request
    try:
        response=service_request("payment","GET",os.getenv("PAYMENT_SERVICE_URL","http://localhost:3014")+"/v1/payment/admin/revenue",timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as error:
        raise HTTPException(503,"Revenue reporting unavailable") from error


@router.get("/generations", dependencies=[Depends(require_internal_secret)])
def get_generations(db: Session = Depends(get_db)):
    try:
        docs_df = pd.read_sql_query(
            """
            SELECT d."documentType", u.plan
            FROM documents d
            JOIN users u ON d."userId" = u.id
        """,
            con=engine,
        )

        if docs_df.empty:
            return {"by_type": {}, "by_tier": {}}

        by_type = docs_df.groupby("documentType").size().to_dict()
        by_tier = docs_df.groupby("plan").size().to_dict()

        return {
            "by_type": {k: int(v) for k, v in by_type.items()},
            "by_tier": {k: int(v) for k, v in by_tier.items()},
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/users", dependencies=[Depends(require_internal_secret)])
def get_users(db: Session = Depends(get_db)):
    try:
        users_df = pd.read_sql_query(
            """
            SELECT status, "userClass", "isGuest"
            FROM users
        """,
            con=engine,
        )

        if users_df.empty:
            return {"by_status": {}, "by_class": {}}

        by_status = users_df.groupby("status").size().to_dict()
        by_class = users_df.groupby("userClass").size().to_dict()
        guests = int(users_df["isGuest"].sum())

        return {
            "by_status": {k: int(v) for k, v in by_status.items()},
            "by_class": {k: int(v) for k, v in by_class.items()},
            "guests": guests,
        }
    except Exception as e:
        return {"error": str(e)}


SOURCE_COLORS = ["#3B82F6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899"]
SOURCE_LABELS = {
    "email": "Email Sign-up",
    "google": "Google OAuth",
}


@router.get("/traffic", dependencies=[Depends(require_internal_secret)])
def get_traffic(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
    """
    Real acquisition/activation/device/location numbers only.

    `devices` and `geographic` are read from the Auth Service's `login_events`
    table (admin-api, Auth, and Analytics all share the same Postgres
    database) — populated at every real login from the request's actual
    User-Agent header (parsed with ua-parser-js) and IP address (resolved
    with geoip-lite's offline MaxMind-derived database). No fixed splits.

    `from_date`/`to_date` (ISO `YYYY-MM-DD`, optional) filter `sources` by
    real `users.createdAt` (signups in range) and `devices`/`geographic` by
    real `login_events.createdAt` (logins in range). Omitting them returns
    all-time totals. There used to be a frontend-only "date range" selector
    that didn't reach this endpoint at all — it just multiplied the all-time
    numbers by a fixed guessed ratio per preset (e.g. always *0.32 for "7d"),
    which wasn't a real filter, just a fabricated-looking scale on real data.
    """
    date_params: Dict[str, Any] = {}
    date_where_users = ""
    date_where_events = ""
    if from_date:
        date_params["from_date"] = from_date
        date_where_users += ' AND "createdAt" >= %(from_date)s'
        date_where_events += ' AND "createdAt" >= %(from_date)s'
    if to_date:
        date_params["to_date"] = to_date
        date_where_users += ' AND "createdAt" < (%(to_date)s::date + interval \'1 day\')'
        date_where_events += ' AND "createdAt" < (%(to_date)s::date + interval \'1 day\')'

    try:
        # ── Sources — the one acquisition signal we actually record: how the
        # user authenticated at signup (users.authProvider). ──────────────────
        sources = []
        try:
            provider_df = pd.read_sql_query(
                f'SELECT "authProvider", count(id) as cnt FROM users WHERE 1=1{date_where_users} GROUP BY "authProvider"',
                con=engine,
                params=date_params,
            )
            for idx, row in provider_df.iterrows():
                provider = str(row["authProvider"] or "unknown")
                sources.append({
                    "name": SOURCE_LABELS.get(provider, provider.title()),
                    "value": int(row["cnt"]),
                    "color": SOURCE_COLORS[idx % len(SOURCE_COLORS)],
                })
        except Exception:
            sources = []

        # ── Devices — real login_events.deviceType, parsed from each real
        # login's User-Agent header. ────────────────────────────────────────
        devices = []
        try:
            device_df = pd.read_sql_query(
                f'SELECT "deviceType", count(*) as cnt FROM login_events '
                f'WHERE "deviceType" IS NOT NULL{date_where_events} GROUP BY "deviceType" ORDER BY cnt DESC',
                con=engine,
                params=date_params,
            )
            for idx, row in device_df.iterrows():
                devices.append({
                    "device": str(row["deviceType"]).title(),
                    "value": int(row["cnt"]),
                    "color": SOURCE_COLORS[idx % len(SOURCE_COLORS)],
                })
        except Exception:
            devices = []

        # ── Geographic — real login_events.country, resolved per real login
        # from its actual IP via an offline GeoIP database (no external call,
        # no guess). Loopback/private IPs (local dev) have no entry and are
        # excluded rather than mislabeled. ──────────────────────────────────
        geographic = []
        try:
            geo_df = pd.read_sql_query(
                f'SELECT country, count(*) as cnt FROM login_events '
                f"WHERE country IS NOT NULL{date_where_events} GROUP BY country ORDER BY cnt DESC",
                con=engine,
                params=date_params,
            )
            total_geo = int(geo_df["cnt"].sum()) if not geo_df.empty else 0
            for idx, row in geo_df.iterrows():
                cnt = int(row["cnt"])
                geographic.append({
                    "country": str(row["country"]),
                    "visitors": str(cnt),
                    "share": f"{round((cnt / total_geo) * 100)}%" if total_geo > 0 else "0%",
                    "status": "Primary" if idx == 0 else "Secondary",
                })
        except Exception:
            geographic = []

        # ── Sessions tracked in range — real count of login events, not a
        # fabricated "~10000" base number the frontend used to scale. ──────
        sessions_in_range = 0
        try:
            sessions_df = pd.read_sql_query(
                f'SELECT count(*) as cnt FROM login_events WHERE 1=1{date_where_events}',
                con=engine,
                params=date_params,
            )
            if not sessions_df.empty:
                sessions_in_range = int(sessions_df.iloc[0]["cnt"])
        except Exception:
            sessions_in_range = 0

        # ── Funnel — real signup → activation → power user → pro plan ──────
        total_users = 0
        activated_users = 0
        power_users = 0
        pro_users = 0
        try:
            users_df = pd.read_sql_query("SELECT count(id) as cnt FROM users", con=engine)
            if not users_df.empty:
                total_users = int(users_df.iloc[0]["cnt"])

            activated_df = pd.read_sql_query(
                'SELECT count(DISTINCT "userId") as cnt FROM documents', con=engine
            )
            if not activated_df.empty:
                activated_users = int(activated_df.iloc[0]["cnt"])

            power_df = pd.read_sql_query(
                'SELECT "userId" FROM documents GROUP BY "userId" HAVING count(id) >= 3', con=engine
            )
            power_users = len(power_df) if not power_df.empty else 0

            pro_df = pd.read_sql_query(
                "SELECT count(id) as cnt FROM users WHERE plan = 'pro'", con=engine
            )
            if not pro_df.empty:
                pro_users = int(pro_df.iloc[0]["cnt"])
        except Exception:
            pass

        funnel = [
            {"step": "1. Registered Accounts", "count": total_users, "percentage": "100%"},
            {
                "step": "2. Activated Creators (Generated ≥1 Document)",
                "count": activated_users,
                "percentage": f"{round((activated_users / total_users) * 100, 1)}%" if total_users > 0 else "0%",
            },
            {
                "step": "3. Power Creators (Generated ≥3 Documents)",
                "count": power_users,
                "percentage": f"{round((power_users / total_users) * 100, 1)}%" if total_users > 0 else "0%",
            },
            {
                "step": "4. Pro Tier Subscribers",
                "count": pro_users,
                "percentage": f"{round((pro_users / total_users) * 100, 1)}%" if total_users > 0 else "0%",
            },
        ]

        conversion_stats = {
            "registration_to_activation": f"{round((activated_users / total_users) * 100, 1)}%" if total_users > 0 else "0%",
            "activation_to_power": f"{round((power_users / activated_users) * 100, 1)}%" if activated_users > 0 else "0%",
            "overall_paid_conversion": f"{round((pro_users / total_users) * 100, 1)}%" if total_users > 0 else "0%",
            "total_users": total_users,
            "activated_users": activated_users,
            "power_users": power_users,
            "pro_users": pro_users,
        }

        # ── Per-channel conversion — real activation count per acquisition
        # channel, not a fixed ratio applied to every channel's signup count.
        # A user counts as "activated" for their channel if they have ≥1
        # document; the LEFT JOIN + COUNT(DISTINCT ...) naturally excludes
        # users with no matching document row (NULL userId isn't counted). ──
        channel_conversion = []
        try:
            channel_df = pd.read_sql_query(
                'SELECT u."authProvider" as provider, count(DISTINCT u.id) as total, '
                'count(DISTINCT d."userId") as activated '
                'FROM users u LEFT JOIN documents d ON d."userId" = u.id '
                'GROUP BY u."authProvider"',
                con=engine,
            )
            for _, row in channel_df.iterrows():
                provider = str(row["provider"] or "unknown")
                total = int(row["total"])
                activated = int(row["activated"])
                channel_conversion.append({
                    "name": SOURCE_LABELS.get(provider, provider.title()),
                    "total": total,
                    "activated": activated,
                    "conversion_pct": f"{round((activated / total) * 100, 1)}%" if total > 0 else "0%",
                })
        except Exception:
            channel_conversion = []

        return {
            "sources": sources,
            "devices": devices,
            "geographic": geographic,
            "funnel": funnel,
            "conversion_stats": conversion_stats,
            "channel_conversion": channel_conversion,
            "sessions_in_range": sessions_in_range,
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/journey", dependencies=[Depends(require_internal_secret)])
def get_journey():
    """
    Real signup-to-activation timing — only for the two stages that have an
    actual timestamp to measure from: `users.createdAt` (registration) to
    the user's own first `documents.createdAt` (first generation), and to
    their own `subscriptions.createdAt` (Pro upgrade). admin-api, Auth,
    Document, and Payment all share this one Postgres database (same
    project as the /traffic funnel above), so this is a real cross-table
    query, not a fabricated split.

    There is deliberately no "guest session duration before signup" stage
    here — nothing anywhere records when an anonymous visitor's session
    started before they registered, so an average for it would be invented.
    Adding that stage for real would mean instrumenting guest-session start
    time first; this endpoint won't guess in the meantime.
    """
    try:
        total_users = 0
        users_df = pd.read_sql_query("SELECT count(id) as cnt FROM users", con=engine)
        if not users_df.empty:
            total_users = int(users_df.iloc[0]["cnt"])

        # Stage: Registration -> First Document
        first_doc_df = pd.read_sql_query(
            'SELECT u."createdAt" as signup_at, MIN(d."createdAt") as first_doc_at '
            'FROM users u JOIN documents d ON d."userId" = u.id '
            'GROUP BY u.id, u."createdAt"',
            con=engine,
        )
        activated_count = len(first_doc_df)
        avg_time_to_first_doc_seconds = 0.0
        if activated_count > 0:
            deltas = (pd.to_datetime(first_doc_df["first_doc_at"], utc=True) - pd.to_datetime(first_doc_df["signup_at"], utc=True))
            avg_time_to_first_doc_seconds = deltas.dt.total_seconds().mean()

        # Stage: Registration -> Subscription Upgrade
        sub_df = pd.read_sql_query(
            'SELECT u."createdAt" as signup_at, s."createdAt" as sub_at '
            'FROM users u JOIN subscriptions s ON s."userId" = u.id',
            con=engine,
        )
        upgraded_count = len(sub_df)
        avg_time_to_upgrade_seconds = 0.0
        if upgraded_count > 0:
            deltas = (pd.to_datetime(sub_df["sub_at"], utc=True) - pd.to_datetime(sub_df["signup_at"], utc=True))
            avg_time_to_upgrade_seconds = deltas.dt.total_seconds().mean()

        return {
            "stages": [
                {
                    "name": "Registration to First Document",
                    "count": activated_count,
                    "conversion_pct": round((activated_count / total_users) * 100, 1) if total_users > 0 else 0.0,
                    "avg_duration_seconds": round(avg_time_to_first_doc_seconds, 1),
                },
                {
                    "name": "Registration to Subscription Upgrade",
                    "count": upgraded_count,
                    "conversion_pct": round((upgraded_count / total_users) * 100, 1) if total_users > 0 else 0.0,
                    "avg_duration_seconds": round(avg_time_to_upgrade_seconds, 1),
                },
            ],
            "total_users": total_users,
        }
    except Exception as e:
        return {"error": str(e)}
