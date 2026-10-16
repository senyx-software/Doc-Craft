from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class AdminRole(BaseModel):
    id: str = Field(..., description="Role identifier (e.g. role_super_admin, role_finance)")
    name: str = Field(..., description="Role name (e.g. Super Admin, Finance Staff)")
    description: Optional[str] = None
    is_custom: bool = Field(default=True, description="True if custom role, False if built-in system role")
    permission_ids: List[str] = Field(default_factory=list, description="Associated permission IDs")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
