from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class AdminUser(BaseModel):
    id: str = Field(..., description="Admin staff user ID (e.g. adm_001)")
    email: EmailStr
    password_hash: str
    name: Optional[str] = None
    role_id: str = Field(..., description="Assigned role ID")
    status: str = Field(default="active", description="active | suspended | disabled | pending_invite")
    totp_enabled: bool = False
    totp_secret: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
