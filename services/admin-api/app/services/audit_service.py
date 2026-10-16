from typing import Any, Dict, Optional
from fastapi import Request

from app.models.audit_log import AuditLogEntry
from app.repositories.audit_repository import audit_repository
from app.security.authentication import AdminUserPayload


class AuditService:
    """Service owning audit record generation for state-changing actions and security events."""

    def _extract_request_meta(self, request: Optional[Request]) -> Dict[str, str]:
        if not request:
            return {"ip_address": "127.0.0.1", "user_agent": "internal"}

        forwarded_for = request.headers.get("X-Forwarded-For")
        real_ip = request.headers.get("X-Real-IP")

        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        elif real_ip:
            client_ip = real_ip.strip()
        elif request.client:
            client_ip = request.client.host
        else:
            client_ip = "127.0.0.1"

        user_agent = request.headers.get("User-Agent", "Unknown")
        return {"ip_address": client_ip, "user_agent": user_agent}

    def log_action(
        self,
        admin: AdminUserPayload,
        action: str,
        module: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        totp_verified: bool = False,
    ) -> AuditLogEntry:
        """Log state-changing admin operation (e.g. role.created, config.updated, staff.invited)."""
        meta = self._extract_request_meta(request)
        entry = AuditLogEntry(
            id="",
            admin_id=admin.admin_id,
            admin_email=admin.email,
            action=action,
            module=module,
            ip_address=meta["ip_address"],
            user_agent=meta["user_agent"],
            totp_verified=totp_verified,
            details=details or {},
        )
        saved = audit_repository.append(entry)

        # Automatically capture real IP Access Log entry in database
        try:
            from app.repositories.security_repository import security_repository
            security_repository.log_ip_access(
                ip_address=meta["ip_address"],
                user_email=admin.email,
                action=f"{module}.{action}",
                user_agent=meta["user_agent"]
            )
        except Exception:
            pass

        return saved

    def log_security_event(
        self,
        action: str,
        module: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        admin_id: Optional[str] = None,
        admin_email: Optional[str] = None,
        totp_verified: bool = False,
    ) -> AuditLogEntry:
        """Log security event (e.g. security.ip_blocked, login.failed, totp.failed, auth.unauthorized)."""
        meta = self._extract_request_meta(request)
        entry = AuditLogEntry(
            id="",
            admin_id=admin_id,
            admin_email=admin_email,
            action=action,
            module=module,
            ip_address=meta["ip_address"],
            user_agent=meta["user_agent"],
            totp_verified=totp_verified,
            details=details or {},
        )
        saved = audit_repository.append(entry)

        # Automatically capture real IP Access Log & Security Alert in database
        try:
            from app.repositories.security_repository import security_repository
            security_repository.log_ip_access(
                ip_address=meta["ip_address"],
                user_email=admin_email or "Anonymous",
                action=f"{module}.{action}",
                user_agent=meta["user_agent"]
            )
            if "failed" in action or "blocked" in action or "unauthorized" in action:
                security_repository.create_alert(
                    title=f"Security Alert: {action}",
                    details=f"Event '{action}' triggered from IP {meta['ip_address']} ({meta['user_agent']})",
                    severity="high" if "blocked" in action else "medium"
                )
        except Exception:
            pass

        return saved


audit_service = AuditService()
