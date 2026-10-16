import asyncio
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from app.core.config import settings
from app.repositories.security_repository import security_repository
from app.security.authentication import AdminUserPayload
from app.security.permissions import require_permission
from app.services.audit_service import audit_service
from app.integrations.services.chat_client import chat_client
from app.integrations.services.payment_client import payment_client
from app.integrations.services.auth_client import auth_client

router = APIRouter(prefix="/admin/security", tags=["Security & Compliance Control Plane"])


class BotDetectionEventRequest(BaseModel):
    ip_address: str
    user_agent: Optional[str] = None
    reason: str
    risk_score: float = 0.85
    status: str = "Blocked"


class AutoSuspendRequest(BaseModel):
    user_id: str
    reason: str
    source: str = "quota-abuse-detection"


class RateLimitViolationRequest(BaseModel):
    ip_address: str
    identifier: str
    group_name: str
    path: str
    limit_val: int


@router.get("/alerts", response_model=List[Dict[str, Any]])
async def list_security_alerts(
    status: Optional[str] = Query(None, description="Filter alerts by status e.g. Pending, Resolved"),
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """Fetch security alerts from dedicated database."""
    return security_repository.get_alerts(status=status)


@router.patch("/alerts/{alert_id}/resolve", response_model=Dict[str, Any])
async def resolve_security_alert(
    alert_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "manage")),
):
    """Mark a security alert as resolved in database."""
    updated = security_repository.resolve_alert(alert_id)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Security alert '{alert_id}' not found")
    audit_service.log_action(
        admin=admin,
        action="security.alert_resolved",
        module="security",
        request=request,
        details={"alert_id": alert_id},
    )
    return updated


@router.get("/sessions", response_model=List[Dict[str, Any]])
async def list_active_sessions(
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """List active customer JWT sessions stored in admin database."""
    return security_repository.get_sessions()


@router.delete("/sessions/{session_id}")
async def terminate_session(
    session_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "manage")),
):
    """Revoke and terminate active JWT session."""
    success = security_repository.terminate_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    audit_service.log_action(
        admin=admin,
        action="security.session_terminated",
        module="security",
        request=request,
        details={"session_id": session_id},
    )
    return {"message": f"Session {session_id} successfully terminated", "session_id": session_id}


@router.get("/ip-logs", response_model=List[Dict[str, Any]])
async def get_ip_logs(
    limit: int = Query(50, ge=1, le=200),
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """Fetch live IP access logs from database."""
    return security_repository.get_ip_logs(limit=limit)


@router.get("/rate-limits", response_model=List[Dict[str, Any]])
async def get_rate_limit_violations(
    limit: int = Query(50, ge=1, le=200),
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """Fetch rate limit and IP blocking violations from database."""
    return security_repository.get_rate_limits(limit=limit)


@router.get("/bot-logs", response_model=List[Dict[str, Any]])
async def get_bot_detection_logs(
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """Fetch bot detection and automated scraper event logs from database."""
    return security_repository.get_bot_logs()


@router.get("/abuse-reports", response_model=List[Dict[str, Any]])
async def get_account_abuse_reports(
    status: Optional[str] = Query(None, description="Filter by status e.g. Open, Resolved"),
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """Fetch account abuse reports from database."""
    return security_repository.get_abuse_reports(status=status)


@router.patch("/abuse-reports/{report_id}/resolve", response_model=Dict[str, Any])
async def resolve_abuse_report(
    report_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "manage")),
):
    """Mark an account abuse report as resolved in database."""
    updated = security_repository.resolve_abuse_report(report_id)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Abuse report '{report_id}' not found")
    audit_service.log_action(
        admin=admin,
        action="security.abuse_report_resolved",
        module="security",
        request=request,
        details={"report_id": report_id},
    )
    return updated


@router.post("/bot-detection-event", status_code=201)
async def report_bot_detection_event(payload: BotDetectionEventRequest, request: Request):
    """
    Internal endpoint — called by the Quota Service's ipAbuseDetection
    middleware whenever it blocks an anomalous request pattern, so the event
    actually surfaces on the Bot Detection Logs page instead of only ever
    reaching that service's own stdout.
    No admin auth required (internal service-to-service call via X-Internal-Secret).
    """
    from shared.service_auth import authorize_service
    await authorize_service("admin-api", request)

    logged = security_repository.log_bot_detection(
        ip_address=payload.ip_address,
        user_agent=payload.user_agent or "unknown",
        reason=payload.reason,
        risk_score=payload.risk_score,
        status=payload.status,
    )
    return {"status": "logged", "id": logged["id"]}


@router.post("/rate-limit-violation", status_code=201)
async def report_rate_limit_violation(payload: RateLimitViolationRequest, request: Request):
    """
    Internal endpoint — called by the Gateway's rateLimiterMiddleware whenever
    it actually returns a 429, so the event surfaces on the Rate Limit
    Violations page instead of only ever reaching the gateway's own stdout.
    No admin auth required (internal service-to-service call via X-Internal-Secret).
    """
    from shared.service_auth import authorize_service
    await authorize_service("admin-api", request)

    logged = security_repository.log_rate_limit_violation(
        ip_address=payload.ip_address,
        identifier=payload.identifier,
        group_name=payload.group_name,
        path=payload.path,
        limit_val=payload.limit_val,
    )
    return {"status": "logged", "id": logged["id"]}


@router.post("/auto-suspend", status_code=200)
async def auto_suspend_user(payload: AutoSuspendRequest, request: Request):
    """
    Internal endpoint — called by a backend service (e.g. Quota Service) when
    it detects abusive behaviour tied to a specific user account, so the
    account is actually suspended rather than only logged. No admin
    performs this action, so it is recorded as a security event, not an
    admin audit action, and surfaces on the Suspended/Banned list with its
    real trigger reason.
    No admin auth required (internal service-to-service call via X-Internal-Secret).
    """
    from shared.service_auth import authorize_service
    await authorize_service("admin-api", request)

    try:
        await auth_client.update_user_status(payload.user_id, "suspended")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to suspend user in Auth service: {e}")

    audit_service.log_security_event(
        action="user.auto_blocked",
        module="users",
        request=request,
        details={
            "target_id": payload.user_id,
            "user_id": payload.user_id,
            "new_status": "suspended",
            "reason": payload.reason,
            "source": payload.source,
        },
        admin_email=f"system:{payload.source}",
    )
    return {"status": "suspended", "user_id": payload.user_id}


def _is_configured(value: Optional[str]) -> bool:
    return bool(value) and "REPLACE" not in value.upper()


def _last4(value: Optional[str]) -> Optional[str]:
    if not _is_configured(value) or len(value) < 4:
        return None
    return value[-4:]


@router.get("/api-keys", response_model=Dict[str, Any])
async def get_api_key_status(
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """
    Reports, per third-party integration, whether its secret is configured
    in that service's own environment and a last-4-character preview —
    never the real value. Each service is the source of truth for its own
    key; admin-api never stores or displays a copy of the secret itself.
    """
    chat_result, payment_result = await asyncio.gather(
        asyncio.to_thread(chat_client.get_key_status),
        asyncio.to_thread(payment_client.get_key_status),
        return_exceptions=True,
    )

    keys: List[Dict[str, Any]] = []

    if isinstance(chat_result, Exception):
        keys.append({
            "id": "anthropic", "name": "Anthropic Claude Secret API", "service": "chat",
            "configured": False, "last4": None, "error": "Chat service unreachable",
            "manage_url": "https://console.anthropic.com/settings/keys",
        })
    else:
        for k in chat_result.get("keys", []):
            keys.append({**k, "service": "chat", "manage_url": "https://console.anthropic.com/settings/keys"})

    if isinstance(payment_result, Exception):
        for key_id, name, url in [
            ("payhere", "PayHere Merchant Secret", "https://www.payhere.lk/merchant/settings"),
            ("paddle", "Paddle API Secret Key", "https://vendors.paddle.com/authentication"),
        ]:
            keys.append({
                "id": key_id, "name": name, "service": "payment",
                "configured": False, "last4": None, "error": "Payment service unreachable",
                "manage_url": url,
            })
    else:
        manage_urls = {
            "payhere": "https://www.payhere.lk/merchant/settings",
            "paddle": "https://vendors.paddle.com/authentication",
        }
        for k in payment_result.get("keys", []):
            keys.append({**k, "service": "payment", "manage_url": manage_urls.get(k.get("id"))})

    keys.append({
        "id": "resend",
        "name": "Resend Email SMTP Secret Key",
        "service": "admin-api",
        "configured": _is_configured(settings.RESEND_API_KEY),
        "last4": _last4(settings.RESEND_API_KEY),
        "manage_url": "https://resend.com/api-keys",
    })

    return {"keys": keys}
