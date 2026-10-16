from scripts.audit_fixtures.service_identity import headers as service_headers
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.repositories.admin_user_repository import admin_user_repository
from app.repositories.verification_repository import verification_repository
from app.security.authentication import hash_password
from app.security.middleware import is_ip_allowed
from tests.conftest import create_test_admin_access_token
import pytest

client = TestClient(app)

def fixture_admin(email="audit-regression@example.com"):
    token = create_test_admin_access_token("ignored", email, "Super Admin", ["*"], is_super_admin=True)
    admin_user_repository.update_password(email, hash_password("AuditFixturePassword123!"))
    token = create_test_admin_access_token("ignored", email, "Super Admin", ["*"], is_super_admin=True)
    return email, token

def test_password_recovery_does_not_disclose_its_code_or_authenticate_login():
    email, _ = fixture_admin()
    response = client.post("/api/v1/admin/auth/forgot-password", json={"email": email})
    assert response.status_code == 200
    assert "verification_code_hint" not in response.json()
    code = verification_repository.get_code(email, purpose="password_reset")["code"]
    response = client.post("/api/v1/admin/auth/verify-login-code", json={"email": email, "verification_code": code})
    assert response.status_code == 401

def test_password_step_does_not_return_the_email_second_factor():
    email, _ = fixture_admin("audit-login@example.com")
    response = client.post("/api/v1/admin/auth/login", json={"email": email, "password": "AuditFixturePassword123!"})
    assert response.status_code == 200
    assert "verification_code_hint" not in response.json()
    code = verification_repository.get_code(email)["code"]
    assert client.post("/api/v1/admin/auth/verify-login-code", json={"email": email, "verification_code": code}).status_code == 200
    assert client.post("/api/v1/admin/auth/verify-login-code", json={"email": email, "verification_code": code}).status_code == 401


def test_admin_login_challenge_locks_after_five_attempts():
    email, _ = fixture_admin("audit-budget@example.com")
    verification_repository.save_code(email, "543210", datetime.now(timezone.utc) + timedelta(minutes=10))
    for _ in range(5):
        assert client.post("/api/v1/admin/auth/verify-login-code", json={"email": email, "verification_code": "000000"}).status_code == 401
    assert client.post("/api/v1/admin/auth/verify-login-code", json={"email": email, "verification_code": "543210"}).status_code == 401
    verification_repository.save_code(email, "543210", datetime.now(timezone.utc) + timedelta(minutes=10))
    assert client.post("/api/v1/admin/auth/verify-login-code", json={"email": email, "verification_code": "543210"}).status_code == 200


def test_verification_challenge_consumption_is_atomic():
    from concurrent.futures import ThreadPoolExecutor
    email = "atomic-challenge@example.com"
    verification_repository.save_code(email, "543210", datetime.now(timezone.utc) + timedelta(minutes=10))
    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(lambda _: verification_repository.consume_code(email, "543210"), range(8)))
    assert sum(outcomes) == 1

def test_suspended_admin_cannot_continue_with_previously_valid_token():
    email, token = fixture_admin("audit-suspended@example.com")
    account = admin_user_repository.get_by_email(email)
    account.status = "suspended"
    admin_user_repository.save(account)
    assert client.get("/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 403

def test_user_id_claim_must_refer_to_a_persisted_admin():
    from app.security.authentication import create_admin_access_token
    token = create_admin_access_token("nonexistent", "nobody@example.com", "Super Admin", ["*"], is_super_admin=True)
    assert client.get("/api/v1/admin/plans", headers={"Authorization": f"Bearer {token}"}).status_code == 401

def test_internal_configuration_requires_internal_authentication():
    assert client.get("/api/v1/internal/config").status_code == 401
    assert client.get("/api/v1/internal/config", headers=service_headers("admin-api", "admin-api", "GET", "/api/v1/internal/config")).status_code == 200

def test_reset_and_action_codes_have_separate_namespaces():
    email = "code-scope@example.com"
    expiry = datetime.now(timezone.utc) + timedelta(minutes=1)
    verification_repository.save_code(email, "123456", expiry, purpose="action")
    assert verification_repository.get_code(email) is None
    assert verification_repository.get_code(email, purpose="password_reset") is None
    assert verification_repository.get_code(email, purpose="action")["code"] == "123456"

def test_untrusted_proxy_headers_cannot_bypass_the_ip_allowlist(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", [])
    external = TestClient(app, client=("198.51.100.55", 1234))
    assert external.get("/api/v1/internal/config", headers={"X-Forwarded-For": "127.0.0.1", "X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}).status_code == 403

def test_ipv6_cidr_addresses_are_not_destroyed_by_port_stripping():
    assert is_ip_allowed("2001:db8::1", ["2001:db8::/32"])
    assert not is_ip_allowed("2001:db9::1", ["2001:db8::/32"])

@pytest.mark.parametrize("endpoint", ["/api/v1/admin/analytics/posthog/config", "/api/v1/admin/notifications/settings", "/api/v1/admin/notifications/announcements", "/api/v1/admin/infrastructure/health"])
def test_support_only_role_cannot_read_unrelated_control_plane_domains(endpoint):
    token = create_test_admin_access_token("ignored", "audit-restricted@example.com", "Support Staff", ["support:view"])
    response = client.get(endpoint, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert response.json()["code"] == "PERMISSION_DENIED"

@pytest.mark.asyncio
async def test_mcp_connection_failure_cannot_report_a_found_mock_resource(monkeypatch):
    import httpx
    from app.integrations.mcp.chat_client import ReadOnlyChatMCPClient
    from app.core.exceptions import AppException
    class OfflineClient:
        def __init__(self, *args, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs): raise httpx.ConnectError("synthetic outage")
    monkeypatch.setattr(httpx, "AsyncClient", OfflineClient)
    with pytest.raises(AppException) as error:
        await ReadOnlyChatMCPClient().inspect_chat_session_resource("fixture", "synthetic")
    assert error.value.status_code == 503
    assert error.value.code == "CHAT_MCP_UNAVAILABLE"
