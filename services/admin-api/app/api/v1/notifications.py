from shared.service_auth import async_service_client
from app.security.permissions import require_permission
import os
from typing import Any, Dict, List, Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
import httpx

from app.core.config import settings
from app.db.admin_db import admin_db
from app.repositories.notification_repository import notification_repository
from app.security.authentication import AdminUserPayload
from app.security.dependencies import get_current_admin, require_internal_secret, require_totp_2fa
from app.services.audit_service import audit_service

router = APIRouter(prefix="/admin/notifications", tags=["Notifications & Server Settings"])

NOTIFICATION_SERVICE_URL = settings.NOTIFICATION_SERVICE_URL


# ──────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas
# ──────────────────────────────────────────────────────────────────────────────

class AnnouncementRequest(BaseModel):
    title: str
    message: str
    severity: Optional[str] = "info"
    target_audience: Optional[str] = "all_users"


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    severity: Optional[str] = None
    target_audience: Optional[str] = None
    is_active: Optional[bool] = None


class NotificationTemplateCreate(BaseModel):
    name: str
    subject: str
    body_html: str
    channel: Optional[str] = "email"
    is_active: Optional[bool] = True
    # The system event this template overrides (welcome, quota_alert, document_ready,
    # renewal, payment_failed, cancellation, invoice_ready, verify_email, password_reset).
    # Leave unset for a custom template not bound to an automatic send.
    type: Optional[str] = None


class NotificationTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    is_active: Optional[bool] = None
    channel: Optional[str] = None
    type: Optional[str] = None


class ServerSettingsUpdate(BaseModel):
    email_provider: Optional[Literal["resend","disabled"]] = None
    sender_email: Optional[str] = None
    sender_name: Optional[str] = None
    max_retries: Optional[int] = None
    rate_limit_per_minute: Optional[int] = None
    webhook_url: Optional[str] = None
    email_notifications_enabled: Optional[bool] = None
    sms_notifications_enabled: Optional[bool] = None
    in_app_notifications_enabled: Optional[bool] = None
    marketing_enabled: Optional[bool] = None
    branding_logo_url: Optional[str] = None
    branding_primary_color: Optional[str] = None
    branding_footer_text: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Email Logs (proxied from Notification Service → DB fallback)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/email-logs")
async def get_email_logs(
    status_filter: Optional[str] = Query(None, alias="status"),
    type_filter: Optional[str] = Query(None, alias="type"),
    limit: int = Query(100, le=500),
    current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))
):
    """Fetch transactional email delivery logs from the Notification Service (port 3016)."""
    server_settings = notification_repository.get_settings()

    # 1. Proxy to Notification Service
    try:
        params: Dict[str, Any] = {"limit": limit}
        if status_filter:
            params["status"] = status_filter
        if type_filter:
            params["type"] = type_filter
        async with async_service_client("notification", timeout=5.0) as client:
            resp = await client.get(
                f"{NOTIFICATION_SERVICE_URL}/notification/logs/admin",
                params=params
            )
            if resp.status_code == 200:
                rows = resp.json()
                return _format_notification_logs(rows, server_settings)
    except Exception as proxy_err:
        print(f"[notifications.py] Notification service proxy error, falling back to DB: {proxy_err}")

    # 2. Fallback: query admin DB (NotificationLog in the notification service DB)
    try:
        query = 'SELECT * FROM "NotificationLog" ORDER BY "createdAt" DESC LIMIT 100'
        rows = admin_db.fetch_all(query)
        if rows:
            return _format_notification_logs_from_db(rows, status_filter, type_filter, server_settings)
    except Exception as db_err:
        print(f"[notifications.py] DB fallback failed: {db_err}")

    return []


TYPE_SUBJECT_MAP = {
    "verify_email": "Security Verification Code (OTP)",
    "password_reset": "Password Reset Request",
    "welcome": "Welcome to DocCraft",
    "invoice_ready": "Invoice Generated",
    "quota_alert": "Quota Warning Alert",
    "renewal": "Subscription Renewal",
    "payment_receipt": "Payment Receipt",
    "payment_failed": "Payment Failure Alert",
    "cancellation": "Subscription Cancellation",
}


def _format_notification_logs(rows: list, server_settings: dict) -> list:
    result = []
    for i, r in enumerate(rows):
        payload = r.get("payload") or {}
        if isinstance(payload, str):
            import json
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        t_type = r.get("type", "unknown")
        friendly_subj = TYPE_SUBJECT_MAP.get(t_type, f"Notification: {t_type}")
        result.append({
            "id": r.get("id") or r.get("dedupeKey") or f"msg-{i+1}",
            "recipient": payload.get("email") or payload.get("to") or "user@doccraft.app",
            "subject": friendly_subj,
            "type": t_type,
            "gateway": server_settings.get("sender_name", "DocCraft Platform"),
            "status": r.get("status", "sent"),
            "timestamp": str(r.get("createdAt", ""))[:16].replace("T", " "),
            "payload": payload,
        })
    return result


def _format_notification_logs_from_db(rows: list, status_filter: Optional[str], type_filter: Optional[str], server_settings: dict) -> list:
    import json
    result = []
    for r in rows:
        t_type = r.get("type", "unknown")
        if type_filter and t_type.lower() != type_filter.lower():
            continue
        payload = r.get("payload") or {}
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        recipient = payload.get("email") or payload.get("to") or "user@doccraft.app"
        st = r.get("status", "sent")
        if status_filter and st.lower() != status_filter.lower():
            continue
        friendly_subj = TYPE_SUBJECT_MAP.get(t_type, f"Notification: {t_type}")
        result.append({
            "id": r.get("id") or r.get("dedupeKey") or f"msg-{len(result)+1}",
            "recipient": recipient,
            "subject": friendly_subj,
            "type": t_type,
            "gateway": server_settings.get("sender_name", "DocCraft Platform"),
            "status": st,
            "timestamp": str(r.get("createdAt", ""))[:16],
            "payload": payload,
        })
    return result


@router.get("/failed")
async def get_failed_notifications(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Fetch specifically failed email notifications."""
    return await get_email_logs(status_filter="failed", type_filter=None, limit=100, current_admin=current_admin)


@router.get("/history")
async def get_notification_history(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Fetch complete notification history with channel and status details."""
    return await get_email_logs(status_filter=None, type_filter=None, limit=100, current_admin=current_admin)


@router.get("/status")
async def get_notification_status_overview(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Fetch high-level notification delivery stats, active announcements, and template count."""
    logs = await get_email_logs(status_filter=None, type_filter=None, limit=100, current_admin=current_admin)
    server_settings = notification_repository.get_settings()
    templates = notification_repository.list_templates()
    announcements = notification_repository.list_announcements()

    total_logs = len(logs)
    failed_logs = len([l for l in logs if l.get("status") == "failed"])
    sent_logs = total_logs - failed_logs
    delivery_rate = round((sent_logs / total_logs * 100), 1) if total_logs > 0 else 100.0

    return {
        "status": "healthy" if server_settings.get("is_connected") else "degraded",
        "total_notifications": total_logs,
        "sent_count": sent_logs,
        "failed_count": failed_logs,
        "delivery_rate_percentage": delivery_rate,
        "active_templates_count": len([t for t in templates if t.get("is_active")]),
        "active_announcements_count": len([a for a in announcements if a.get("is_active")]),
        "flags": {
            "email_notifications_enabled": server_settings.get("email_notifications_enabled", True),
            "sms_notifications_enabled": server_settings.get("sms_notifications_enabled", False),
            "in_app_notifications_enabled": server_settings.get("in_app_notifications_enabled", True),
            "marketing_enabled": server_settings.get("marketing_enabled", True),
        },
        "branding": {
            "logo_url": server_settings.get("branding_logo_url"),
            "primary_color": server_settings.get("branding_primary_color"),
            "footer_text": server_settings.get("branding_footer_text"),
        }
    }


# ──────────────────────────────────────────────────────────────────────────────
# System Announcements (DB-backed)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/announcements")
async def list_announcements(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Fetch all system-wide announcements (active and inactive)."""
    return notification_repository.list_announcements(active_only=False)


@router.post("/announcements")
async def create_announcement(
    payload: AnnouncementRequest,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
):
    """Broadcast a new platform announcement to all users."""
    announcement = notification_repository.create_announcement(
        title=payload.title,
        message=payload.message,
        severity=payload.severity or "info",
        target_audience=payload.target_audience or "all_users",
    )

    audit_service.log_action(
        admin=current_admin,
        action="announcement.created",
        module="notifications",
        request=request,
        details={"announcement_title": payload.title}
    )
    return {"status": "success", "message": f"Announcement '{payload.title}' published!", "announcement": announcement}


@router.patch("/announcements/{announcement_id}")
async def update_announcement(
    announcement_id: str,
    payload: AnnouncementUpdate,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
):
    """Update an existing announcement (e.g., deactivate it)."""
    updated = notification_repository.update_announcement(announcement_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Announcement not found")
    audit_service.log_action(
        admin=current_admin,
        action="announcement.updated",
        module="notifications",
        request=request,
        details={"announcement_id": announcement_id}
    )
    return {"status": "success", "message": "Announcement updated.", "announcement": updated}


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: str,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
):
    """Delete a system announcement."""
    success = notification_repository.delete_announcement(announcement_id)
    if not success:
        raise HTTPException(status_code=404, detail="Announcement not found")
    audit_service.log_action(
        admin=current_admin,
        action="announcement.deleted",
        module="notifications",
        request=request,
        details={"announcement_id": announcement_id}
    )
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Notification Templates (DB-backed)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/templates")
async def get_templates(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """List all notification/email templates stored in DB."""
    return notification_repository.list_templates()


@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: NotificationTemplateCreate,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
):
    """Create a new notification template."""
    tpl = notification_repository.create_template(
        name=payload.name,
        subject=payload.subject,
        body_html=payload.body_html,
        channel=payload.channel or "email",
        is_active=payload.is_active if payload.is_active is not None else True,
        type=payload.type,
    )
    audit_service.log_action(
        admin=current_admin,
        action="notification_template.created",
        module="notifications",
        request=request,
        details={"template_name": payload.name}
    )
    return {"status": "success", "message": f"Template '{payload.name}' created!", "template": tpl}


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    payload: NotificationTemplateUpdate,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
):
    """Update notification template subject, HTML body, active status, or channel."""
    updated = notification_repository.update_template(template_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Notification template not found")
    audit_service.log_action(
        admin=current_admin,
        action="notification_template.updated",
        module="notifications",
        request=request,
        details={"template_id": template_id}
    )
    return {"status": "success", "message": f"Template '{updated.get('name', template_id)}' updated!", "template": updated}


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
):
    """Delete a notification template."""
    success = notification_repository.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification template not found")
    audit_service.log_action(
        admin=current_admin,
        action="notification_template.deleted",
        module="notifications",
        request=request,
        details={"template_id": template_id}
    )
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Server Settings (DB-backed KV store)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_server_settings(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))):
    """Get SMTP and notification service server configurations from DB."""
    return notification_repository.get_settings()


@router.put("/settings")
async def update_server_settings(
    payload: ServerSettingsUpdate,
    request: Request,
    current_admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
    verified: AdminUserPayload = Depends(require_totp_2fa),
):
    """Update notification server configurations & SMTP credentials. Stored in DB, propagated to Notification Service."""
    updates = payload.model_dump(exclude_unset=True)
    updated_settings = notification_repository.update_settings(updates)

    audit_service.log_action(
        admin=current_admin,
        action="notification_settings.updated",
        module="notifications",
        request=request,
        details=updates
    )
    return {"status": "success", "message": "Notification server settings updated!", "settings": updated_settings}


# ──────────────────────────────────────────────────────────────────────────────
# Public Integration Endpoint — Notification Microservice polls this
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/config/public", dependencies=[Depends(require_internal_secret)])
def get_public_notification_config():
    """
    Public config endpoint for Notification Microservice (port 3016).
    Returns Admin-managed email templates, notification settings, branding, and enable/disable flags.
    The Notification Service fetches this every 30 seconds to stay in sync.
    """
    settings_dict = notification_repository.get_settings()
    templates = notification_repository.list_templates()
    announcements = notification_repository.list_announcements(active_only=True)

    # Keyed by event `type` (not id) — that's the field the Notification Service
    # actually dispatches on. Inactive or unbound (no type) templates are left out
    # so the dispatcher falls through to its own default subject/body for them.
    templates_by_type = {t["type"]: t for t in templates if t.get("type") and t.get("is_active")}

    return {
        "settings": settings_dict,
        "templates": templates_by_type,
        "announcements": announcements,
    }
