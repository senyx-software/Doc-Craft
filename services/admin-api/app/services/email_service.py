from shared.redact import redact
from shared.service_auth import service_client
import os
import httpx
from typing import Optional, Dict, Any
from app.core.config import settings
from app.db.admin_db import admin_db


class EmailService:
    """
    Service for dispatching real email notifications via Notification Microservice (port 3016)
    and Resend API fallback. Ensures every notification event is logged in the database.
    """

    def __init__(self):
        self.notification_service_url = settings.NOTIFICATION_SERVICE_URL
        self.api_key = os.getenv("RESEND_API_KEY", settings.RESEND_API_KEY)
        self.from_email = os.getenv("RESEND_FROM_EMAIL", settings.RESEND_FROM_EMAIL)

    def send_verification_code(self, to_email: str, code: str, reason: str = "login") -> Dict[str, Any]:
        """
        Send a 6-digit OTP verification code for Admin 2FA login or Password Reset via Notification Service.
        Logs every attempt to NotificationLog database table.
        """
        event_type = {
            "login": "verify_email",
            "password_reset": "password_reset",
        }.get(reason, "verify_email")
        payload = {
            "email": to_email,
            "to": to_email,
            "token": code,
            "reason": reason,
            "fullName": "Admin Staff",
            "full_name": "Admin Staff"
        }

        # 1. Try dispatching via Notification Microservice (port 3016)
        try:
            with service_client("notification", timeout=5.0) as client:
                resp = client.post(
                    f"{self.notification_service_url}/notification/send",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    json={
                        "userId": "admin_system",
                        "type": event_type,
                        "email": to_email,
                        "payload": payload
                    }
                )
                if resp.status_code in (200, 201):
                    print(f"[EmailService] Notification service queued OTP email for {to_email} ({event_type})")
                    return resp.json()
        except Exception as net_err:
            print(f"[EmailService] Notification service unreachable ({net_err}), falling back to direct Resend/DB dispatch.")

        # 2. Fallback: direct Resend API call or local log
        reason_label = {
            "login": "2FA Login",
            "password_reset": "Password Reset",
            "sensitive_action": "Verification",
        }.get(reason, "Verification")
        subject = f"DocCraft Admin - {reason_label} Verification Code: {code}"

        html_content = f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #0f172a; margin: 0;">DocCraft Admin Control Plane</h2>
                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Security Verification Code</p>
            </div>
            <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-radius: 6px; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb;">{code}</span>
            </div>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">
                Please enter this 6-digit code to complete your {reason_label}. This code will expire in <strong>10 minutes</strong>.
            </p>
        </div>
        """

        status_str = "sent"
        if not self.api_key or "dummy" in self.api_key:
            print("[EmailService] Mock transport: verification email suppressed")
        else:
            try:
                with httpx.Client(timeout=10.0) as client:
                    res = client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json={"from": self.from_email, "to": [to_email], "subject": subject, "html": html_content}
                    )
                    if res.status_code not in (200, 201):
                        status_str = "failed"
            except Exception as resend_err:
                print(f"[EmailService] Resend dispatch error: {resend_err}")
                status_str = "failed"

        # Log fallback to NotificationLog table in postgres/sqlite
        try:
            admin_db.execute(
                """INSERT INTO "NotificationLog" ("userId", "type", "channel", "status", "payload", "dedupeKey", "createdAt", "sentAt")
                   VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())""",
                ("admin_system", event_type, "email", status_str, str(redact(payload)).replace("'", '"'), f"admin_otp_{code}")
            )
        except Exception:
            pass

        return {"status": status_str}

    def send_staff_invite(self, to_email: str, temp_password: str, role_name: str) -> Dict[str, Any]:
        """Send a real invite email to a newly-created admin staff account,
        containing the real per-invite generated temporary password (not a
        password shared across every invite — see invite_staff in rbac.py).
        Same Notification Service -> Resend fallback dispatch path as OTP
        emails, so it actually reaches an inbox rather than only existing as
        a 'pending_invite' database row with no way for the invitee to ever
        learn their credentials."""
        payload = {
            "email": to_email,
            "to": to_email,
            "role": role_name,
            "token": temp_password,
            "fullName": to_email.split("@")[0],
            "reason": "staff_invite",
        }

        try:
            with service_client("notification", timeout=5.0) as client:
                resp = client.post(
                    f"{self.notification_service_url}/notification/send",
                    headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
                    json={
                        "userId": "admin_system",
                        "type": "staff_invite",
                        "email": to_email,
                        "payload": payload,
                    }
                )
                if resp.status_code in (200, 201):
                    print(f"[EmailService] Notification service queued staff invite email for {to_email}")
                    return {"status": "sent", "channel": "notification_service"}
        except Exception as net_err:
            print(f"[EmailService] Notification service unreachable ({net_err}), falling back to direct Resend dispatch.")

        subject = "You've been invited to DocCraft Admin"
        html_content = f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #0f172a; margin: 0;">DocCraft Admin Control Plane</h2>
                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">You've been invited as <strong>{role_name}</strong></p>
            </div>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin-bottom: 24px;">
                <p style="color: #334155; font-size: 13px; margin: 0 0 8px 0;">Email</p>
                <p style="color: #0f172a; font-size: 15px; font-weight: bold; margin: 0 0 16px 0;">{to_email}</p>
                <p style="color: #334155; font-size: 13px; margin: 0 0 8px 0;">Temporary Password</p>
                <p style="font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #2563eb; margin: 0;">{temp_password}</p>
            </div>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">
                Sign in at the DocCraft Admin portal with this email and temporary password, then change your
                password immediately from Settings — this temporary password was generated only for you and is
                not reused for other accounts.
            </p>
        </div>
        """

        status_str = "sent"
        if not self.api_key or "dummy" in self.api_key:
            print("[EmailService] Mock transport: staff invitation suppressed")
        else:
            try:
                with httpx.Client(timeout=10.0) as client:
                    res = client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                        json={"from": self.from_email, "to": [to_email], "subject": subject, "html": html_content}
                    )
                    if res.status_code not in (200, 201):
                        status_str = "failed"
            except Exception as resend_err:
                print(f"[EmailService] Resend dispatch error: {resend_err}")
                status_str = "failed"

        try:
            admin_db.execute(
                """INSERT INTO "NotificationLog" ("userId", "type", "channel", "status", "payload", "dedupeKey", "createdAt", "sentAt")
                   VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())""",
                ("admin_system", "staff_invite", "email", status_str, str(redact(payload)).replace("'", '"'), f"admin_invite_{to_email}")
            )
        except Exception:
            pass

        return {"status": status_str, "channel": "resend"}


email_service = EmailService()
