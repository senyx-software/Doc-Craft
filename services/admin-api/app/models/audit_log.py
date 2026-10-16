from datetime import datetime, timezone
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class AuditLogEntry(BaseModel):
    id: str = Field(..., description="Unique audit log entry ID (e.g. audit_100293)")
    admin_id: Optional[str] = Field(None, description="Admin staff ID who performed action (nullable for pre-auth events)")
    admin_email: Optional[str] = Field(None, description="Admin email address")
    action: str = Field(..., description="Action name (e.g. role.created, config.updated, security.ip_blocked)")
    module: str = Field(..., description="Target module (e.g. rbac, settings, users, security)")
    ip_address: str = Field(..., description="Client IP address")
    user_agent: Optional[str] = Field(None, description="Client HTTP user-agent header")
    totp_verified: bool = Field(default=False, description="True if operation was verified with 2FA TOTP code")
    details: Dict[str, Any] = Field(default_factory=dict, description="Changed attributes, target IDs, and metadata")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
