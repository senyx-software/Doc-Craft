from typing import Callable
from fastapi import Depends
from app.core.exceptions import ForbiddenException
from app.security.authentication import AdminUserPayload
from app.security.dependencies import get_current_admin


from app.services.rbac_engine import rbac_engine


def check_permission(admin: AdminUserPayload, module: str, action: str) -> bool:
    """
    Evaluates whether the active admin holds the required permission via RBACEngine.
    Super Admin bypasses all checks by role name.
    """
    return rbac_engine.has_permission(
        role_name=admin.role_name,
        permissions=admin.permissions,
        module=module,
        action=action,
    )


def require_permission(module: str, action: str) -> Callable:
    """
    FastAPI dependency factory enforcing granular RBAC permission check.
    Raises ForbiddenException (403) if permission is denied.
    """

    async def dependency(current_admin: AdminUserPayload = Depends(get_current_admin)) -> AdminUserPayload:
        has_perm = check_permission(current_admin, module, action)
        if not has_perm:
            raise ForbiddenException(
                message=f"Access denied: Requires permission for module '{module}' with action '{action}'",
                details={
                    "required_module": module,
                    "required_action": action,
                    "admin_role": current_admin.role_name,
                },
            )
        return current_admin

    return dependency
