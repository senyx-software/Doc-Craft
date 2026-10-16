from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field


class AdminPermission(BaseModel):
    id: str = Field(..., description="Unique permission identifier (e.g. perm_users_view)")
    module: str = Field(..., description="Module key (e.g. users, plans, templates, rbac, automation)")
    action: str = Field(..., description="Action key (e.g. view, create, edit, delete, approve)")
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def permission_key(self) -> str:
        return f"{self.module}:{self.action}".lower()
