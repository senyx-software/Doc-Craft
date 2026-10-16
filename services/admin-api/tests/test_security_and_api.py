from scripts.audit_fixtures.service_identity import headers as service_headers
import pytest
from fastapi.testclient import TestClient
import pyotp

from app.main import app
from app.core.config import settings
from tests.conftest import create_test_admin_access_token as create_admin_access_token
from app.integrations.mcp.chat_client import ReadOnlyChatMCPClient
from app.core.exceptions import ForbiddenException
from app.cli.bootstrap import bootstrap_super_admin
from tests.conftest import create_admin_token_with_totp
from app.repositories.verification_repository import verification_repository

client = TestClient(app)

# `client = TestClient(app)` above does NOT run FastAPI's lifespan (that only
# fires inside a `with TestClient(app) as c:` block), so app.main's automatic
# bootstrap_super_admin() call never executes here — every other test file
# fabricates its JWT directly via create_admin_access_token() and never
# notices, but the tests below hit the real /auth/login DB lookup, so the
# 'tech@senyxsoftware.com' account has to be provisioned explicitly.
bootstrap_super_admin(email="tech@senyxsoftware.com", password="SyntheticSchemaExamplePass2026!")


# 1. IP Whitelisting Middleware Tests
def test_ip_whitelisting_allowed():
    """Verify request from allowed IP passes IPWhitelistMiddleware."""
    res = client.get("/health", headers={"X-Forwarded-For": "127.0.0.1"})
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_ip_whitelisting_blocked():
    """Verify request from unauthorized IP returns 403 Forbidden."""
    res = client.get("/api/v1/admin/auth/me", headers={"X-Forwarded-For": "198.51.100.55"})
    assert res.status_code == 403
    data = res.json()
    assert data["code"] == "IP_ACCESS_DENIED"
    assert "not authorized" in data["message"]


# 2. Authentication & JWT Validation Tests
def test_admin_login_success():
    """Verify 2-step login process: credentials return code_required, then submitting code returns JWT token."""
    # Step 1: Submit email & password -> Expect code dispatch response
    step1_res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "tech@senyxsoftware.com", "password": "SyntheticSchemaExamplePass2026!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert step1_res.status_code == 200
    step1_data = step1_res.json()
    assert step1_data["status"] == "verification_code_required"
    assert "verification_code_hint" not in step1_data
    code = verification_repository.get_code("tech@senyxsoftware.com")["code"]

    # Step 2: Submit email and verification_code -> Expect JWT access token
    step2_res = client.post(
        "/api/v1/admin/auth/verify-login-code",
        json={"email": "tech@senyxsoftware.com", "verification_code": code},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert step2_res.status_code == 200
    step2_data = step2_res.json()
    assert "access_token" in step2_data
    assert step2_data["role_name"] == "Super Admin"
    assert step2_data["is_super_admin"] is True


def test_admin_login_invalid_password():
    """Verify invalid login password returns 401 Unauthorized."""
    res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "tech@senyxsoftware.com", "password": "WrongPassword!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHORIZED"


def test_protected_route_missing_jwt():
    """Verify accessing protected endpoint without JWT returns 401 Unauthorized."""
    res = client.get("/api/v1/admin/auth/me", headers={"X-Forwarded-For": "127.0.0.1"})
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHORIZED"


def test_protected_route_valid_jwt():
    """Verify accessing protected endpoint with valid JWT returns profile."""
    token = create_admin_access_token(
        admin_id="adm_001",
        email="tech@senyxsoftware.com",
        role_name="Super Admin",
        permissions=["*"],
        is_super_admin=True,
    )
    res = client.get(
        "/api/v1/admin/auth/me",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "tech@senyxsoftware.com"
    assert data["is_super_admin"] is True


# 3. TOTP 2FA Validation Tests
def test_sensitive_route_missing_totp_header():
    """Verify sensitive mutate route without X-Admin-2FA header returns 403 TOTP_REQUIRED."""
    token = create_admin_access_token(
        admin_id="adm_001",
        email="tech@senyxsoftware.com",
        role_name="Super Admin",
        permissions=["*"],
        is_super_admin=True,
    )
    res = client.post(
        "/api/v1/admin/roles",
        json={"name": "Custom Accountant", "description": "Finance team", "permissions": ["plans:view"]},
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 403
    assert res.json()["code"] == "TOTP_REQUIRED"


def test_sensitive_route_with_totp_header_success():
    """Verify sensitive mutate route with valid TOTP code in X-Admin-2FA header succeeds."""
    from app.repositories.role_repository import role_repository
    role_repository.delete("role_auditor_role")

    # seed_admin_with_totp upserts by email — this enables 2FA on the real
    # bootstrapped "tech@senyxsoftware.com" account (without touching its
    # password) rather than creating a colliding placeholder row, and
    # returns a token for it directly.
    token, totp_code = create_admin_token_with_totp("tech@senyxsoftware.com", "Super Admin", ["*"], is_super_admin=True)

    # Create role with valid TOTP header
    res = client.post(
        "/api/v1/admin/roles",
        json={"name": "Auditor Role", "description": "Audit access", "permissions": ["rbac:view"]},
        headers={
            "Authorization": f"Bearer {token}",
            "X-Admin-2FA": totp_code,
            "X-Forwarded-For": "127.0.0.1",
        },
    )
    assert res.status_code == 201
    assert res.json()["name"] == "Auditor Role"


# 4. Granular RBAC Permission Middleware & Super Admin Bypass Tests
def test_non_super_admin_cannot_access_rbac_endpoints():
    """Verify non-super-admin staff with rbac:view permission receives 403 PERMISSION_DENIED on RBAC endpoints."""
    token = create_admin_access_token(
        admin_id="adm_002",
        email="support@doccraft.app",
        role_name="Support Staff",
        permissions=["rbac:view"],
        is_super_admin=False,
    )
    # 1. GET /admin/roles
    res = client.get(
        "/api/v1/admin/roles",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 403
    assert "Only Super Admin" in res.json()["message"]

    # 2. GET /admin/permissions
    res_perm = client.get(
        "/api/v1/admin/permissions",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_perm.status_code == 403
    assert "Only Super Admin" in res_perm.json()["message"]

    # 3. GET /admin/staff
    res_staff = client.get(
        "/api/v1/admin/staff",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_staff.status_code == 403
    assert "Only Super Admin" in res_staff.json()["message"]


def test_super_admin_permission_bypass():
    """Verify Super Admin bypasses granular permission check and successfully accesses RBAC endpoints."""
    token = create_admin_access_token(
        admin_id="adm_001",
        email="tech@senyxsoftware.com",
        role_name="Super Admin",
        permissions=[],  # Empty list, but Super Admin role bypasses check
        is_super_admin=True,
    )
    res = client.get(
        "/api/v1/admin/roles",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 200
    assert isinstance(res.json(), list)


# 5. Standardized Error Handling Tests
def test_validation_error_format():
    """Verify invalid JSON payload returns standardized 422 VALIDATION_ERROR JSON."""
    res = client.post(
        "/api/v1/admin/auth/login",
        json={"invalid_field": "test"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 422
    data = res.json()
    assert data["code"] == "VALIDATION_ERROR"
    assert "validation_errors" in data["details"]


# 6. Read-only Chat MCP Client Security Tests
@pytest.mark.asyncio
async def test_read_only_mcp_client_blocks_mutating_tools():
    """Verify ReadOnlyChatMCPClient raises 403 Forbidden when invoking mutating tools."""
    mcp_client = ReadOnlyChatMCPClient()
    with pytest.raises(ForbiddenException) as exc_info:
        await mcp_client.invoke_tool("start_chat_session", {"prompt": "Hello"}, "mock_jwt")
    assert "read-only MCP resources" in str(exc_info.value.message)


# 7. Forgot Password, Reset Password & Change Password Tests
def test_forgot_and_reset_password_flow():
    """Verify forgot password generates 6-digit code and reset password updates account password."""
    # 1. Request forgot password
    forgot_res = client.post(
        "/api/v1/admin/auth/forgot-password",
        json={"email": "tech@senyxsoftware.com"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert forgot_res.status_code == 200
    forgot_data = forgot_res.json()
    assert "verification_code_hint" not in forgot_data
    code = verification_repository.get_code("tech@senyxsoftware.com", purpose="password_reset")["code"]

    # 2. Reset password with verification code
    reset_res = client.post(
        "/api/v1/admin/auth/reset-password",
        json={"email": "tech@senyxsoftware.com", "verification_code": code, "new_password": "NewResetPass123!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert reset_res.status_code == 200
    assert reset_res.json()["status"] == "success"

    # 3. Verify login with new password succeeds
    login_res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "tech@senyxsoftware.com", "password": "NewResetPass123!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert login_res.status_code == 200

    # 4. Restore original password
    restore_response = client.post(
        "/api/v1/admin/auth/forgot-password",
        json={"email": "tech@senyxsoftware.com"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )
    assert restore_response.status_code == 200
    restore_code = verification_repository.get_code("tech@senyxsoftware.com", purpose="password_reset")["code"]
    client.post(
        "/api/v1/admin/auth/reset-password",
        json={"email": "tech@senyxsoftware.com", "verification_code": restore_code, "new_password": "SyntheticSchemaExamplePass2026!"},
        headers={"X-Forwarded-For": "127.0.0.1"},
    )


def test_change_password_authenticated():
    """Verify authenticated admin can change account password from settings."""
    token = create_admin_access_token(
        admin_id="adm_001",
        email="tech@senyxsoftware.com",
        role_name="Super Admin",
        permissions=["*"],
        is_super_admin=True,
    )
    res = client.post(
        "/api/v1/admin/auth/change-password",
        json={"current_password": "SyntheticSchemaExamplePass2026!", "new_password": "ChangedPass123!"},
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "success"

    # Restore original password
    client.post(
        "/api/v1/admin/auth/change-password",
        json={"current_password": "ChangedPass123!", "new_password": "SyntheticSchemaExamplePass2026!"},
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )


def test_non_super_admin_cannot_create_or_delete_roles():
    """Verify non-super-admin receives 403 Forbidden when attempting role creation."""
    # require_permission (and its permissions:True check) passes for this
    # token, so the request actually reaches require_totp_2fa before
    # verify_super_admin's PERMISSION_DENIED — needs a real matching code.
    token, totp_code = create_admin_token_with_totp(
        "support@doccraft.app", "Support Staff", ["rbac:create", "rbac:edit", "rbac:delete"], is_super_admin=False
    )

    res = client.post(
        "/api/v1/admin/roles",
        json={"name": "Illegal Role", "description": "Attempted by non-super-admin", "permissions": ["users:view"]},
        headers={
            "Authorization": f"Bearer {token}",
            "X-Admin-2FA": totp_code,
            "X-Forwarded-For": "127.0.0.1",
        },
    )
    assert res.status_code == 403
    data = res.json()
    assert data["code"] == "PERMISSION_DENIED"
    assert "Only Super Admin can create, modify, or delete roles" in data["message"]


def test_rate_limit_violation_reported_by_gateway_appears_on_security_page():
    """
    Regression test: the Rate Limit Violations page used to reinterpret ANY
    audit_logs row matching '%blocked%|%rate%|%failed%|%security%' as a
    gateway rate-limit violation — including unrelated admin events like a
    failed login. It must now only show real 429s the Gateway reports.

    This writes a real row into the live `rate_limit_violations` table (the
    same one the admin Security page reads from) — clean it up, or repeated
    runs leave fake-looking "attacks" sitting in a real admin dashboard.
    """
    from app.db.admin_db import admin_db

    def _cleanup():
        admin_db.execute(
            "DELETE FROM rate_limit_violations WHERE ip_address = %s" if admin_db.is_postgres
            else "DELETE FROM rate_limit_violations WHERE ip_address = ?",
            ("203.0.113.9",),
        )

    _cleanup()
    try:
        import json
        path = "/api/v1/admin/security/rate-limit-violation"
        body = json.dumps({"ip_address": "203.0.113.9", "identifier": "203.0.113.9", "group_name": "public", "path": "/v1/document/generate", "limit_val": 20},separators=(",",":")).encode()
        res = client.post(path,content=body, headers={"Content-Type":"application/json",**service_headers("gateway","admin-api","POST",path,body)})
        assert res.status_code == 201

        token = create_admin_access_token("adm_001", "admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)
        res_list = client.get(
            "/api/v1/admin/security/rate-limits",
            headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
        )
        assert res_list.status_code == 200
        violations = res_list.json()
        match = next((v for v in violations if v["ip_address"] == "203.0.113.9"), None)
        assert match is not None
        assert "20 req/min" in match["action"]
        assert "/v1/document/generate" in match["action"]
    finally:
        _cleanup()


def test_rate_limit_violation_rejects_bad_internal_secret():
    res = client.post(
        "/api/v1/admin/security/rate-limit-violation",
        json={"ip_address": "203.0.113.9", "identifier": "203.0.113.9", "group_name": "public", "path": "/v1/document/generate", "limit_val": 20},
        headers={"X-Internal-Secret": "wrong-secret"},
    )
    assert res.status_code == 401

