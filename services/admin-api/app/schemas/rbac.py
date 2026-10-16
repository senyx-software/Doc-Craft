from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class PermissionSchema(BaseModel):
    id: str
    module: str
    action: str
    description: Optional[str] = None


class RoleCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = None
    permissions: List[str] = Field(..., description="List of permission IDs or module:action strings")


class RoleUpdateSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class RoleResponseSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    is_custom: bool = True
    permissions: List[PermissionSchema] = []
    assigned_staff_count: int = 0
    created_at: Optional[datetime] = None


class StaffInviteSchema(BaseModel):
    email: EmailStr
    role_id: str
    name: Optional[str] = None
    send_invite_email: bool = True


class StaffUpdateSchema(BaseModel):
    role_id: Optional[str] = None
    status: Optional[str] = Field(None, description="active | suspended | disabled")
    force_totp_reenrollment: bool = False
