from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query

from app.core.exceptions import NotFoundException
from app.models.audit_log import AuditLogEntry
from app.repositories.audit_repository import audit_repository
from app.security.authentication import AdminUserPayload
from app.security.permissions import require_permission

router = APIRouter(prefix="/admin/audit-logs", tags=["Audit & Security Logs"])


@router.get("", response_model=Dict[str, Any])
async def search_audit_logs(
    admin_id: Optional[str] = Query(None, description="Filter by Admin Staff ID"),
    admin_email: Optional[str] = Query(None, description="Filter by Admin Email address"),
    module: Optional[str] = Query(None, description="Filter by target module (e.g. rbac, settings, users, security)"),
    action: Optional[str] = Query(None, description="Filter by action name (e.g. role.created, config.updated)"),
    ip_address: Optional[str] = Query(None, description="Filter by client IP address"),
    totp_verified: Optional[bool] = Query(None, description="Filter by 2FA TOTP verification status"),
    date_from: Optional[datetime] = Query(None, description="ISO format start date"),
    date_to: Optional[datetime] = Query(None, description="ISO format end date"),
    page: int = Query(1, ge=1, description="Page index (1-based)"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """
    Search and filter immutable audit logs and security events (Protected: rbac:view / audit:view).
    Supports filtering across admin ID, email, module, action, IP, 2FA status, and date range.
    """
    return audit_repository.search(
        admin_id=admin_id,
        admin_email=admin_email,
        module=module,
        action=action,
        ip_address=ip_address,
        totp_verified=totp_verified,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )


@router.get("/all", response_model=List[AuditLogEntry])
async def get_all_audit_logs(
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """
    Fetch all audit log entries without requiring any query or filter parameters (Protected: rbac:view).
    """
    return audit_repository.get_all()


@router.get("/{log_id}", response_model=AuditLogEntry)
async def get_audit_log_detail(
    log_id: str,
    admin: AdminUserPayload = Depends(require_permission("rbac", "view")),
):
    """Fetch detail for a specific immutable audit log record (Protected: rbac:view)."""
    entry = audit_repository.get_by_id(log_id)
    if not entry:
        raise NotFoundException(f"Audit log entry with ID '{log_id}' not found")
    return entry
