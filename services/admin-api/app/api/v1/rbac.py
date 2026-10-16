import secrets
import string
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, Request, status

from app.core.exceptions import ForbiddenException, NotFoundException, ValidationException
from app.repositories.admin_user_repository import admin_user_repository
from app.repositories.role_repository import role_repository
from app.schemas.rbac import (
    PermissionSchema,
    RoleCreateSchema,
    RoleResponseSchema,
    RoleUpdateSchema,
    StaffInviteSchema,
    StaffUpdateSchema,
)
from app.security.authentication import AdminUserPayload, hash_password
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service
from app.services.email_service import email_service
from app.services.rbac_engine import rbac_engine

router = APIRouter(prefix="/admin", tags=["RBAC & Staff Management"])


def verify_super_admin(admin: AdminUserPayload):
    """Enforce strict Super Admin privilege check."""
    if not admin.is_super_admin:
        raise ForbiddenException("Only Super Admin can create, modify, or delete roles and manage privileges.")


# Seed Permission Catalogue (module x action pairs per Tech Design §5)
PERMISSIONS_CATALOGUE = [
    PermissionSchema(id="perm_001", module="users", action="view", description="View customer user accounts"),
    PermissionSchema(id="perm_002", module="users", action="edit", description="Edit customer user profiles & quotas"),
    PermissionSchema(id="perm_003", module="users", action="delete", description="Ban or deactivate customer accounts"),
    PermissionSchema(id="perm_004", module="plans", action="view", description="View pricing plans & feature flags"),
    PermissionSchema(id="perm_005", module="plans", action="create", description="Create new pricing plans"),
    PermissionSchema(id="perm_006", module="plans", action="edit", description="Modify plan pricing & feature flags"),
    PermissionSchema(id="perm_007", module="plans", action="delete", description="Archive pricing plans"),
    PermissionSchema(id="perm_008", module="templates", action="view", description="View document templates"),
    PermissionSchema(id="perm_009", module="templates", action="create", description="Create draft template versions"),
    PermissionSchema(id="perm_010", module="templates", action="approve", description="Publish template versions"),
    PermissionSchema(id="perm_011", module="rbac", action="view", description="View admin staff & roles"),
    PermissionSchema(id="perm_012", module="rbac", action="create", description="Create roles & invite staff"),
    PermissionSchema(id="perm_013", module="rbac", action="edit", description="Modify role permissions & staff roles"),
    PermissionSchema(id="perm_014", module="rbac", action="delete", description="Delete custom roles"),
]


def _to_role_schema(role_model) -> RoleResponseSchema:
    selected_perms = [
        p for p in PERMISSIONS_CATALOGUE
        if p.id in role_model.permission_ids or f"{p.module}:{p.action}" in role_model.permission_ids or "*" in role_model.permission_ids
    ]
    return RoleResponseSchema(
        id=role_model.id,
        name=role_model.name,
        description=role_model.description,
        is_custom=role_model.is_custom,
        permissions=selected_perms,
        assigned_staff_count=1 if not role_model.is_custom else 0,
        created_at=role_model.created_at,
    )


@router.get("/roles", response_model=List[RoleResponseSchema])
async def list_roles(admin: AdminUserPayload = Depends(require_permission("rbac", "view"))):
    """List all admin roles with permission sets and staff counts from dedicated admin database (Protected: Super Admin)."""
    verify_super_admin(admin)
    roles = role_repository.list_all()
    return [_to_role_schema(r) for r in roles]


@router.post("/roles", response_model=RoleResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: RoleCreateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "create")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Create a new custom role with permission matrix (Protected: Super Admin + 2FA)."""
    verify_super_admin(admin)
    existing = role_repository.get_by_name(payload.name)
    if existing:
        raise ValidationException(f"Role with name '{payload.name}' already exists")

    new_role_model = role_repository.create(
        name=payload.name,
        description=payload.description,
        permission_ids=payload.permissions,
    )
    rbac_engine.invalidate_role_cache(new_role_model.id)

    audit_service.log_action(
        admin=admin,
        action="role.created",
        module="rbac",
        request=request,
        details={"role_id": new_role_model.id, "name": payload.name, "permissions": payload.permissions},
        totp_verified=True,
    )
    return _to_role_schema(new_role_model)


@router.patch("/roles/{role_id}", response_model=RoleResponseSchema)
async def update_role(
    role_id: str,
    payload: RoleUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Update role details or permission matrix (Protected: Super Admin + 2FA). Invalidates cache."""
    verify_super_admin(admin)
    role = role_repository.get_by_id(role_id)
    if not role:
        raise NotFoundException(f"Role with ID '{role_id}' not found")

    if payload.name and payload.name.strip().lower() == "super admin" and role_id != "role_super_admin":
        raise ValidationException("The Super Admin name is reserved for the system role")

    if not role.is_custom and role.name.lower() == "super admin":
        raise ValidationException("Built-in Super Admin role permission matrix cannot be modified")

    updated_role = role_repository.update(
        role_id=role_id,
        name=payload.name,
        description=payload.description,
        permission_ids=payload.permissions,
    )
    rbac_engine.invalidate_role_cache(role_id)

    audit_service.log_action(
        admin=admin,
        action="role.updated",
        module="rbac",
        request=request,
        details={"role_id": role_id, "updated_fields": payload.model_dump(exclude_unset=True)},
        totp_verified=True,
    )
    return _to_role_schema(updated_role)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Delete custom role (Protected: Super Admin + 2FA). Blocked if staff are assigned."""
    verify_super_admin(admin)
    role = role_repository.get_by_id(role_id)
    if not role:
        raise NotFoundException(f"Role with ID '{role_id}' not found")

    if not role.is_custom:
        raise ValidationException("Built-in system roles cannot be deleted")

    role_repository.delete(role_id)
    rbac_engine.invalidate_role_cache(role_id)

    audit_service.log_action(
        admin=admin,
        action="role.deleted",
        module="rbac",
        request=request,
        details={"role_id": role_id, "name": role.name},
        totp_verified=True,
    )
    return None


@router.get("/permissions", response_model=List[PermissionSchema])
async def list_permissions(admin: AdminUserPayload = Depends(require_permission("rbac", "view"))):
    """List full permission catalogue (module x action) (Protected: Super Admin)."""
    verify_super_admin(admin)
    return PERMISSIONS_CATALOGUE


@router.get("/staff")
async def list_staff(admin: AdminUserPayload = Depends(require_permission("rbac", "view"))):
    """List admin staff accounts and statuses from dedicated admin database (Protected: Super Admin)."""
    verify_super_admin(admin)
    staff_members = admin_user_repository.list_all()
    out = []
    for u in staff_members:
        role = role_repository.get_by_id(u.role_id)
        role_name = role.name if role else "Staff"
        out.append({
            "admin_id": u.id,
            "email": u.email,
            "role": role_name,
            "status": u.status or "active",
        })
    return out


@router.post("/staff/invite", status_code=status.HTTP_201_CREATED)
async def invite_staff(
    payload: StaffInviteSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "create")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Invite new admin staff member into dedicated admin database (Protected: Super Admin + 2FA)."""
    verify_super_admin(admin)
    role = role_repository.get_by_id(payload.role_id)
    if not role:
        raise NotFoundException(f"Role with ID '{payload.role_id}' not found")

    if admin_user_repository.get_by_email(payload.email):
        raise ValidationException(f"An admin account with email '{payload.email}' already exists")

    # A real per-invite random password, not a fixed literal shared by every
    # invited admin account ever created — that meant anyone who knew (or
    # guessed) "TemporaryStaffPass123!" could log into any freshly-invited
    # account, and nothing ever emailed the invitee their credentials anyway.
    alphabet = string.ascii_letters + string.digits
    temp_password = "".join(secrets.choice(alphabet) for _ in range(16))
    pwd_hash = hash_password(temp_password)
    new_user = admin_user_repository.create(
        email=payload.email,
        password_hash=pwd_hash,
        role_id=role.id,
        name=payload.name or payload.email.split("@")[0],
    )

    email_result = email_service.send_staff_invite(
        to_email=payload.email,
        temp_password=temp_password,
        role_name=role.name,
    )
    email_sent = email_result.get("status") == "sent"

    audit_service.log_action(
        admin=admin,
        action="staff.invited",
        module="rbac",
        request=request,
        details={"invited_email": payload.email, "role_name": role.name, "invite_email_sent": email_sent},
        totp_verified=True,
    )
    return {
        "admin_id": new_user.id,
        "email": new_user.email,
        "role": role.name,
        "status": "pending_invite",
        "invite_email_sent": email_sent,
    }


def _require_active_super_admin_remaining(excluding_staff_id: str) -> None:
    """Raise if reassigning/disabling `excluding_staff_id` would leave zero active Super Admins."""
    remaining = [
        u for u in admin_user_repository.list_all()
        if u.role_id == "role_super_admin" and u.id != excluding_staff_id and (u.status or "active") == "active"
    ]
    if not remaining:
        raise ValidationException(
            "This would leave no active Super Admin account. Promote another admin to Super Admin first."
        )


@router.patch("/staff/{staff_id}")
async def update_staff(
    staff_id: str,
    payload: StaffUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Reassign an admin staff member's role, change their status, or force TOTP
    re-enrollment (Protected: Super Admin + 2FA)."""
    verify_super_admin(admin)
    target = admin_user_repository.get_by_id(staff_id)
    if not target:
        raise NotFoundException(f"Staff member with ID '{staff_id}' not found")

    if staff_id == admin.admin_id and (payload.role_id or payload.status):
        raise ValidationException("You cannot change your own role or status. Ask another Super Admin to do this.")

    updated_fields: dict = {}

    if payload.role_id:
        role = role_repository.get_by_id(payload.role_id)
        if not role:
            raise NotFoundException(f"Role with ID '{payload.role_id}' not found")
        if target.role_id == "role_super_admin" and role.id != "role_super_admin":
            _require_active_super_admin_remaining(staff_id)
        admin_user_repository.update_role(staff_id, payload.role_id)
        updated_fields["role_id"] = payload.role_id

    if payload.status:
        if target.role_id == "role_super_admin" and payload.status != "active":
            _require_active_super_admin_remaining(staff_id)
        admin_user_repository.update_status(staff_id, payload.status)
        updated_fields["status"] = payload.status

    if payload.force_totp_reenrollment:
        admin_user_repository.force_totp_reenrollment(staff_id)
        updated_fields["force_totp_reenrollment"] = True

    if not updated_fields:
        raise ValidationException("No fields to update were provided")

    updated = admin_user_repository.get_by_id(staff_id)
    role = role_repository.get_by_id(updated.role_id)

    audit_service.log_action(
        admin=admin,
        action="staff.updated",
        module="rbac",
        request=request,
        details={"staff_id": staff_id, "target_email": target.email, "updated_fields": updated_fields},
        totp_verified=True,
    )

    return {
        "admin_id": updated.id,
        "email": updated.email,
        "role": role.name if role else "Staff",
        "status": updated.status or "active",
    }


@router.delete("/staff/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_staff(
    staff_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("rbac", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Remove an admin staff account (Protected: Super Admin + 2FA).

    Soft-removes via status='disabled' rather than deleting the row, so the
    audit trail (who did what) stays intact and access can be restored via
    PATCH /staff/{id} if the removal was a mistake. login() rejects any
    account whose status isn't 'active'.
    """
    verify_super_admin(admin)
    target = admin_user_repository.get_by_id(staff_id)
    if not target:
        raise NotFoundException(f"Staff member with ID '{staff_id}' not found")

    if staff_id == admin.admin_id:
        raise ValidationException("You cannot remove your own account. Ask another Super Admin to do this.")

    if target.role_id == "role_super_admin":
        _require_active_super_admin_remaining(staff_id)

    admin_user_repository.update_status(staff_id, "disabled")

    audit_service.log_action(
        admin=admin,
        action="staff.removed",
        module="rbac",
        request=request,
        details={"staff_id": staff_id, "target_email": target.email},
        totp_verified=True,
    )
    return None
