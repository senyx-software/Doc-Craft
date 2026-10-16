import pytest
from fastapi.testclient import TestClient
import pyotp

from app.main import app
from app.core.redis import cache_manager
from app.services.rbac_engine import rbac_engine
from tests.conftest import create_test_admin_access_token as create_admin_access_token
from app.repositories.role_repository import role_repository
from app.repositories.admin_user_repository import admin_user_repository
from tests.conftest import seed_admin_with_totp, action_code

client = TestClient(app)

SUPER_TOKEN, _SUPER_TOTP_SECRET = seed_admin_with_totp("rbac_test_super@doccraft.app", "Super Admin", ["*"], is_super_admin=True)


def super_2fa_headers() -> dict:
    """A fresh code each call — a module-level static one would expire
    across this file's full test run (see conftest.py's module docstring)."""
    return {
        "Authorization": f"Bearer {SUPER_TOKEN}",
        "X-Admin-2FA": action_code(_SUPER_TOTP_SECRET),
        "X-Forwarded-For": "127.0.0.1",
    }


# 1. Super Admin Unrestricted Tests
def test_super_admin_unrestricted_permission():
    """Verify Super Admin role is unrestricted and bypasses all permission matrix checks."""
    permissions = rbac_engine.get_role_permissions("role_super_admin")
    assert rbac_engine.has_permission("Super Admin", permissions, "users", "view") is True
    assert rbac_engine.has_permission("Super Admin", permissions, "plans", "delete") is True
    assert rbac_engine.has_permission("Super Admin", permissions, "non_existent_module", "random_action") is True
    assert rbac_engine.has_permission("Super Admin", [], "users", "delete") is False


# 2. Custom Roles & Permission Matching Tests
def test_custom_role_permission_resolution():
    """Verify custom role permissions match exact module:action pairs and reject unauthorized calls."""
    role = role_repository.create(
        name="Custom Auditor",
        description="Auditor role",
        permission_ids=["perm_users_view", "perm_plans_view"],
    )
    permissions = rbac_engine.get_role_permissions(role.id)
    assert "users:view" in permissions
    assert "plans:view" in permissions

    # Allowed actions
    assert rbac_engine.has_permission(role.name, permissions, "users", "view") is True
    assert rbac_engine.has_permission(role.name, permissions, "plans", "view") is True

    # Denied actions
    assert rbac_engine.has_permission(role.name, permissions, "users", "delete") is False
    assert rbac_engine.has_permission(role.name, permissions, "plans", "create") is False


# 3. Permission Caching & Invalidation on Role Mutation Tests
def test_permission_caching_and_invalidation():
    """Verify permission resolution is cached in Redis and invalidated on role update."""
    role_id = "role_finance_staff"

    # 1. First fetch populates cache
    perms_initial = rbac_engine.get_role_permissions(role_id, force_refresh=True)
    cache_key = f"rbac:permissions:role:{role_id}"
    cached_val = cache_manager.get(cache_key)
    assert cached_val is not None
    assert isinstance(cached_val, list)

    # 2. Invalidate cache
    rbac_engine.invalidate_role_cache(role_id)
    assert cache_manager.get(cache_key) is None

    # 3. Next fetch repopulates cache
    perms_after = rbac_engine.get_role_permissions(role_id)
    assert perms_after == perms_initial
    assert cache_manager.get(cache_key) is not None


# 4. Backend Security Boundary Enforcement Tests (Frontend cannot bypass)
def test_backend_permission_check_returns_403():
    """Verify backend enforces 403 Forbidden even if user attempts to call protected endpoints."""
    # Issue token for Support Staff (missing rbac:create and rbac:delete)
    token = create_admin_access_token(
        admin_id="adm_002",
        email="support@doccraft.app",
        role_name="Support Staff",
        permissions=["users:view", "support:view"],
        is_super_admin=False,
    )

    action_code = pyotp.TOTP(pyotp.random_base32()).now()

    # Attempt to call sensitive POST /admin/roles
    res = client.post(
        "/api/v1/admin/roles",
        json={"name": "Hacked Role", "permissions": ["*"]},
        headers={
            "Authorization": f"Bearer {token}",
            "X-Admin-2FA": action_code,
            "X-Forwarded-For": "127.0.0.1",
        },
    )
    assert res.status_code == 403
    data = res.json()
    assert data["code"] == "PERMISSION_DENIED"


# 5. Staff Lifecycle Tests — invite, reassign role, suspend/reactivate, remove
def _invite_test_staff(email: str) -> str:
    support_role = role_repository.get_by_name("Support Staff")
    res = client.post(
        "/api/v1/admin/staff/invite",
        json={"email": email, "role_id": support_role.id, "name": "Test Staffer"},
        headers=super_2fa_headers(),
    )
    assert res.status_code == 201, res.text
    staff_id = res.json()["admin_id"]
    from app.security.authentication import hash_password
    admin_user_repository.update_password(email, hash_password("TemporaryStaffPass123!"))
    return staff_id


def test_invite_staff_appears_in_list():
    staff_id = _invite_test_staff("invited_staffer@doccraft.app")
    res = client.get("/api/v1/admin/staff", headers=super_2fa_headers())
    assert res.status_code == 200
    emails = [s["email"] for s in res.json()]
    assert "invited_staffer@doccraft.app" in emails
    assert admin_user_repository.get_by_id(staff_id).status == "active"


def test_update_staff_role_reassignment():
    staff_id = _invite_test_staff("reassign_target@doccraft.app")
    finance_role = role_repository.get_by_name("Finance Staff")

    res = client.patch(
        f"/api/v1/admin/staff/{staff_id}",
        json={"role_id": finance_role.id},
        headers=super_2fa_headers(),
    )
    assert res.status_code == 200, res.text
    assert res.json()["role"] == "Finance Staff"
    assert admin_user_repository.get_by_id(staff_id).role_id == finance_role.id


def test_suspend_staff_blocks_login():
    """A suspended admin's credentials must be rejected at /login (not just hidden in the UI)."""
    staff_id = _invite_test_staff("suspend_target@doccraft.app")

    res = client.patch(
        f"/api/v1/admin/staff/{staff_id}",
        json={"status": "suspended"},
        headers=super_2fa_headers(),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "suspended"

    login_res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "suspend_target@doccraft.app", "password": "TemporaryStaffPass123!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert login_res.status_code == 403
    assert login_res.json()["code"] == "PERMISSION_DENIED"

    # Reactivating restores login
    reactivate_res = client.patch(
        f"/api/v1/admin/staff/{staff_id}",
        json={"status": "active"},
        headers=super_2fa_headers(),
    )
    assert reactivate_res.status_code == 200
    login_res2 = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "suspend_target@doccraft.app", "password": "TemporaryStaffPass123!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert login_res2.status_code == 200


def test_remove_staff_soft_disables_and_blocks_login():
    staff_id = _invite_test_staff("remove_target@doccraft.app")

    res = client.delete(f"/api/v1/admin/staff/{staff_id}", headers=super_2fa_headers())
    assert res.status_code == 204

    assert admin_user_repository.get_by_id(staff_id).status == "disabled"

    login_res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "remove_target@doccraft.app", "password": "TemporaryStaffPass123!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert login_res.status_code == 403


def test_staff_cannot_modify_own_role_or_status():
    staff_id = _invite_test_staff("self_edit_attempt@doccraft.app")
    self_token = create_admin_access_token(staff_id, "self_edit_attempt@doccraft.app", "Support Staff", ["*"], is_super_admin=True)

    # This request has full permissions, so — unlike the permission-boundary
    # test above — it actually reaches require_totp_2fa: the invited staffer
    # needs a real, matching secret too, not just a random one.
    self_secret = pyotp.random_base32()
    invited_account = admin_user_repository.get_by_id(staff_id)
    invited_account.totp_enabled = True
    invited_account.totp_secret = self_secret
    admin_user_repository.save(invited_account)

    self_headers = {
        "Authorization": f"Bearer {self_token}",
        "X-Admin-2FA": action_code(self_secret),
        "X-Forwarded-For": "127.0.0.1",
    }

    res = client.patch(f"/api/v1/admin/staff/{staff_id}", json={"status": "active"}, headers=self_headers)
    assert res.status_code == 422

    self_headers["X-Admin-2FA"]=action_code(self_secret)
    res2 = client.delete(f"/api/v1/admin/staff/{staff_id}", headers=self_headers)
    assert res2.status_code == 422
