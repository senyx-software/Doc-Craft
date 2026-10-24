import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.admin_db import admin_db

# ──────────────────────────────────────────────────────────────────────────────
# Default seed data (loaded once into DB if tables are empty)
# ──────────────────────────────────────────────────────────────────────────────

# `type` is the system event key the Notification Service matches against
# (see services/notification/src/services/email.service.ts) — every event
# type it can send is seeded here so an admin can customize any of them from
# the start, rather than only the ones someone happened to seed.
DEFAULT_TEMPLATES = [
    {
        "id": "tpl_welcome",
        "name": "Welcome Email",
        "type": "welcome",
        "subject": "Welcome to DocCraft - AI Document Builder",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><h1 style='color: {{primary_color}};'>Welcome {{full_name}}</h1><p>Thank you for joining DocCraft.</p></div>",
        "is_active": True,
    },
    {
        "id": "tpl_invoice_ready",
        "name": "Invoice Generated Notification",
        "type": "invoice_ready",
        "subject": "Your DocCraft Invoice #{{invoice_id}} is ready",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Hello {{full_name}}, your invoice <strong>#{{invoice_id}}</strong> is ready for download.</p></div>",
        "is_active": True,
    },
    {
        "id": "tpl_quota_alert",
        "name": "Quota Usage Warning",
        "type": "quota_alert",
        "subject": "You have reached {{percentage}}% of your monthly document quota",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Warning: You have used {{percentage}}% of your quota. Upgrade to Pro to enjoy unlimited document generations.</p></div>",
        "is_active": True,
    },
    {
        "id": "verify_email",
        "name": "Verification Code Email",
        "type": "verify_email",
        "subject": "Verify your DocCraft Account",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Your verification code is: <strong style='font-size: 20px;'>{{token}}</strong></p></div>",
        "is_active": True,
    },
    {
        "id": "password_reset",
        "name": "Password Reset Email",
        "type": "password_reset",
        "subject": "DocCraft Password Reset Request",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Your password reset code is: <strong style='font-size: 20px;'>{{token}}</strong></p></div>",
        "is_active": True,
    },
    {
        "id": "tpl_document_ready",
        "name": "Document Ready Notification",
        "type": "document_ready",
        "subject": "Your DocCraft Document is Ready!",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Hello {{full_name}}, your document is ready to download.</p></div>",
        "is_active": True,
    },
    {
        "id": "tpl_renewal",
        "name": "Subscription Renewal",
        "type": "renewal",
        "subject": "Your DocCraft Subscription Has Renewed",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Hello {{full_name}}, your subscription has renewed successfully.</p></div>",
        "is_active": True,
    },
    {
        "id": "tpl_payment_failed",
        "name": "Payment Failed",
        "type": "payment_failed",
        "subject": "Payment Failed — Action Required",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Hello {{full_name}}, we were unable to process your latest payment. Please update your billing details.</p></div>",
        "is_active": True,
    },
    {
        "id": "tpl_cancellation",
        "name": "Subscription Cancelled",
        "type": "cancellation",
        "subject": "Your DocCraft Subscription Was Cancelled",
        "channel": "email",
        "body_html": "<div style='font-family: sans-serif;'><p>Hello {{full_name}}, your subscription has been cancelled. You've been moved to the Free plan.</p></div>",
        "is_active": True,
    },
]

DEFAULT_SETTINGS: Dict[str, Any] = {
    "email_provider": "resend",
    # No smtp_host/smtp_port/smtp_user here — real delivery goes through
    # Resend's HTTPS API (services/notification/src/services/email.service.ts),
    # which has no concept of an SMTP host/port. Those fields used to exist
    # here and in the admin UI but were never read by anything that actually
    # sends mail — removed rather than kept as dead, misleading config.
    # Must match RESEND_FROM_EMAIL / the domain actually verified (SPF+DKIM)
    # in Resend — sending from an unverified domain is a strong spam signal.
    # doc-craft.com is the verified domain; senyxsoftware.com previously
    # seeded here was never verified and is why mail landed in spam.
    "sender_email": os.getenv("RESEND_FROM_EMAIL") or "noreply@doc-craft.com",
    "sender_name": "DocCraft Platform",
    "max_retries": "3",
    "rate_limit_per_minute": "100",
    "webhook_url": "http://localhost:3000/api/webhooks/email-status",
    "is_connected": "true",
    "email_notifications_enabled": "true",
    "sms_notifications_enabled": "false",
    "in_app_notifications_enabled": "true",
    "marketing_enabled": "true",
    # Left unset by default: this path 404s (verified via curl), which is
    # exactly why the header logo rendered as a broken image. The
    # Notification Service falls back to its own inline-embedded logo
    # (services/notification/src/assets/logoBase64.ts) whenever this is
    # empty/unset — an admin who sets a real, working logo URL here
    # overrides that as normal.
    "branding_logo_url": "",
    "branding_primary_color": "#8B5CF6",
    "branding_footer_text": "© 2026 DocCraft Inc. All rights reserved. 100 Enterprise Way, Suite 400.",
}

DEFAULT_ANNOUNCEMENTS = []

_SEEDED = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ──────────────────────────────────────────────────────────────────────────────
# Seed helper
# ──────────────────────────────────────────────────────────────────────────────

def _seed_defaults():
    global _SEEDED
    if _SEEDED:
        return
    _SEEDED = True

    now = _now()

    # Templates
    try:
        existing = admin_db.fetch_all("SELECT id FROM notification_templates")
        existing_ids = {r["id"] for r in existing}
        for tpl in DEFAULT_TEMPLATES:
            if tpl["id"] not in existing_ids:
                admin_db.execute(
                    "INSERT INTO notification_templates (id, name, type, subject, channel, body_html, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (tpl["id"], tpl["name"], tpl["type"], tpl["subject"], tpl["channel"], tpl["body_html"], 1 if tpl["is_active"] else 0, now, now),
                )
    except Exception as e:
        print(f"[notification_repository] Template seed error: {e}")

    # Settings
    try:
        for key, value in DEFAULT_SETTINGS.items():
            existing_key = admin_db.fetch_one("SELECT key FROM notification_server_settings WHERE key = ?", (key,))
            if not existing_key:
                admin_db.execute(
                    "INSERT INTO notification_server_settings (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, str(value), now),
                )
    except Exception as e:
        print(f"[notification_repository] Settings seed error: {e}")

    # Announcements
    try:
        existing_anc = admin_db.fetch_all("SELECT id FROM system_announcements")
        existing_ids = {r["id"] for r in existing_anc}
        for anc in DEFAULT_ANNOUNCEMENTS:
            if anc["id"] not in existing_ids:
                admin_db.execute(
                    "INSERT INTO system_announcements (id, title, message, severity, target_audience, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (anc["id"], anc["title"], anc["message"], anc["severity"], anc["target_audience"], 1 if anc["is_active"] else 0, now),
                )
    except Exception as e:
        print(f"[notification_repository] Announcement seed error: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# Notification Templates
# ──────────────────────────────────────────────────────────────────────────────

class NotificationRepository:
    def __init__(self):
        try:
            _seed_defaults()
        except Exception:
            pass  # Resilient seed — tables may not exist yet in some edge cases

    # ----- Templates -----
    def list_templates(self) -> List[Dict[str, Any]]:
        try:
            rows = admin_db.fetch_all("SELECT * FROM notification_templates ORDER BY created_at ASC")
            return [self._tpl_to_dict(r) for r in rows]
        except Exception as e:
            print(f"[notification_repository] list_templates error: {e}")
            return []

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        try:
            row = admin_db.fetch_one("SELECT * FROM notification_templates WHERE id = ?", (template_id,))
            return self._tpl_to_dict(row) if row else None
        except Exception as e:
            print(f"[notification_repository] get_template error: {e}")
            return None

    def create_template(
        self, name: str, subject: str, body_html: str, channel: str = "email",
        is_active: bool = True, type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        `type` binds this template to a system event (welcome, quota_alert, ...) —
        the Notification Service looks templates up by this field, not by name or
        id, so a template created without one is a custom/unbound entry that the
        dispatcher will never automatically select.
        """
        now = _now()
        tpl_id = str(uuid.uuid4())
        admin_db.execute(
            "INSERT INTO notification_templates (id, name, type, subject, channel, body_html, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (tpl_id, name, type, subject, channel, body_html, 1 if is_active else 0, now, now),
        )
        return self.get_template(tpl_id)  # type: ignore[return-value]

    def update_template(self, template_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = _now()
        existing = self.get_template(template_id)
        if not existing:
            return None

        fields = []
        params = []
        allowed = {"subject", "body_html", "is_active", "name", "channel", "type"}
        for key, val in updates.items():
            if key in allowed and val is not None:
                fields.append(f"{key} = ?")
                params.append(1 if (key == "is_active" and isinstance(val, bool) and val) else
                               (0 if (key == "is_active" and isinstance(val, bool) and not val) else val))

        if not fields:
            return existing

        fields.append("updated_at = ?")
        params.append(now)
        params.append(template_id)
        admin_db.execute(f"UPDATE notification_templates SET {', '.join(fields)} WHERE id = ?", tuple(params))
        return self.get_template(template_id)

    def delete_template(self, template_id: str) -> bool:
        rows = admin_db.execute("DELETE FROM notification_templates WHERE id = ?", (template_id,))
        return rows > 0

    def _tpl_to_dict(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": row.get("id"),
            "name": row.get("name"),
            "type": row.get("type"),
            "subject": row.get("subject"),
            "channel": row.get("channel", "email"),
            "body_html": row.get("body_html", ""),
            "is_active": bool(row.get("is_active", 1)),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }

    # ----- System Announcements -----
    def list_announcements(self, active_only: bool = False) -> List[Dict[str, Any]]:
        try:
            if active_only:
                rows = admin_db.fetch_all("SELECT * FROM system_announcements WHERE is_active = 1 ORDER BY created_at DESC")
            else:
                rows = admin_db.fetch_all("SELECT * FROM system_announcements ORDER BY created_at DESC")
            return [self._anc_to_dict(r) for r in rows]
        except Exception as e:
            print(f"[notification_repository] list_announcements error: {e}")
            return []

    def create_announcement(self, title: str, message: str, severity: str = "info", target_audience: str = "all_users") -> Dict[str, Any]:
        now = _now()
        anc_id = f"anc_{uuid.uuid4().hex[:8]}"
        admin_db.execute(
            "INSERT INTO system_announcements (id, title, message, severity, target_audience, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (anc_id, title, message, severity, target_audience, 1, now),
        )
        return self._anc_to_dict(admin_db.fetch_one("SELECT * FROM system_announcements WHERE id = ?", (anc_id,)))  # type: ignore[return-value]

    def update_announcement(self, anc_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        existing = admin_db.fetch_one("SELECT * FROM system_announcements WHERE id = ?", (anc_id,))
        if not existing:
            return None
        fields = []
        params = []
        for key in ("title", "message", "severity", "target_audience", "is_active"):
            if key in updates and updates[key] is not None:
                fields.append(f"{key} = ?")
                val = updates[key]
                params.append(1 if (key == "is_active" and val is True) else (0 if (key == "is_active" and val is False) else val))
        if not fields:
            return self._anc_to_dict(existing)
        params.append(anc_id)
        admin_db.execute(f"UPDATE system_announcements SET {', '.join(fields)} WHERE id = ?", tuple(params))
        return self._anc_to_dict(admin_db.fetch_one("SELECT * FROM system_announcements WHERE id = ?", (anc_id,)))  # type: ignore[return-value]

    def delete_announcement(self, anc_id: str) -> bool:
        rows = admin_db.execute("DELETE FROM system_announcements WHERE id = ?", (anc_id,))
        return rows > 0

    def _anc_to_dict(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": row.get("id"),
            "title": row.get("title"),
            "message": row.get("message"),
            "severity": row.get("severity", "info"),
            "target_audience": row.get("target_audience", "all_users"),
            "is_active": bool(row.get("is_active", 1)),
            "created_at": row.get("created_at"),
        }

    # ----- Server Settings -----
    def get_settings(self) -> Dict[str, Any]:
        try:
            rows = admin_db.fetch_all("SELECT key, value FROM notification_server_settings")
            raw = {r["key"]: r["value"] for r in rows}
            # Coerce types
            result: Dict[str, Any] = {}
            int_keys = {"max_retries", "rate_limit_per_minute"}
            bool_keys = {"is_connected", "email_notifications_enabled", "sms_notifications_enabled",
                         "in_app_notifications_enabled", "marketing_enabled"}
            for k, v in raw.items():
                if k in int_keys:
                    try:
                        result[k] = int(v)
                    except Exception:
                        result[k] = v
                elif k in bool_keys:
                    result[k] = str(v).lower() in ("1", "true", "yes")
                else:
                    result[k] = v
            # Fall back defaults for missing keys
            for key, default_val in DEFAULT_SETTINGS.items():
                if key not in result:
                    if key in int_keys:
                        result[key] = int(default_val)
                    elif key in bool_keys:
                        result[key] = str(default_val).lower() in ("1", "true", "yes")
                    else:
                        result[key] = default_val
            return result
        except Exception as e:
            print(f"[notification_repository] get_settings error: {e}")
            return {k: v for k, v in DEFAULT_SETTINGS.items()}

    def update_settings(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        now = _now()
        for key, value in updates.items():
            existing = admin_db.fetch_one("SELECT key FROM notification_server_settings WHERE key = ?", (key,))
            str_val = str(value) if not isinstance(value, bool) else ("true" if value else "false")
            if existing:
                admin_db.execute(
                    "UPDATE notification_server_settings SET value = ?, updated_at = ? WHERE key = ?",
                    (str_val, now, key),
                )
            else:
                admin_db.execute(
                    "INSERT INTO notification_server_settings (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, str_val, now),
                )
        return self.get_settings()


notification_repository = NotificationRepository()
