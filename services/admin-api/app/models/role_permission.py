from pydantic import BaseModel, Field


class RolePermission(BaseModel):
    id: str = Field(..., description="Unique assignment ID")
    role_id: str = Field(..., description="Foreign key to admin_roles.id")
    permission_id: str = Field(..., description="Foreign key to admin_permissions.id")
