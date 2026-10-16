import pytest
from fastapi.testclient import TestClient
import pyotp

from app.main import app
from app.repositories.audit_repository import audit_repository
from tests.conftest import create_test_admin_access_token as create_admin_access_token

from app.repositories.role_repository import role_repository
from app.repositories.admin_user_repository import admin_user_repository
from tests.conftest import create_admin_token_with_totp

client = TestClient(app)


# 1. State-Changing Admin Action Audit Logging Test
def test_state_changing_action_audit_logging():
    """Verify state-changing actions (e.g. role creation) generate immutable audit records."""
    role_repository.delete("role_compliance_officer")
    token, totp_code = create_admin_token_with_totp("tech@senyxsoftware.com", "Super Admin", ["*"], is_super_admin=True)
    # The id is derived (upserted by email), not a fixed "adm_001" — see
    # conftest.py's module docstring on why a hardcoded id collides across files.
    expected_admin_id = admin_user_repository.get_by_email("tech@senyxsoftware.com").id

    initial_log_count = len(audit_repository.search()["items"])

    res = client.post(
        "/api/v1/admin/roles",
        json={"name": "Compliance Officer", "permissions": ["perm_001", "perm_004"]},
        headers={
            "Authorization": f"Bearer {token}",
            "X-Admin-2FA": totp_code,
            "X-Forwarded-For": "127.0.0.1",
        },
    )
    assert res.status_code == 201

    logs = audit_repository.search(action="role.created")["items"]
    assert len(logs) > 0
    latest_log = logs[0]
    assert latest_log.admin_id == expected_admin_id
    assert latest_log.module == "rbac"
    assert latest_log.totp_verified is True
    assert latest_log.details["name"] == "Compliance Officer"


# 2. Security Event Audit Logging Test
def test_security_event_audit_logging():
    """Verify security events (IP block, failed login) log audit records automatically."""
    # Failed login
    res = client.post("/api/v1/admin/auth/login", json={"email": "tech@senyxsoftware.com", "password": "WrongPassword!"})
    assert res.status_code == 401

    failed_login_logs = audit_repository.search(action="login.failed")["items"]
    assert len(failed_login_logs) > 0
    assert failed_login_logs[0].details["attempted_email"] == "tech@senyxsoftware.com"


# 3. Audit Search & Filter API Test
def test_audit_search_and_filter_api():
    """Verify GET /api/v1/admin/audit-logs filters correctly across module, TOTP, and action."""
    token = create_admin_access_token("adm_001", "tech@senyxsoftware.com", "Super Admin", ["*"], is_super_admin=True)

    # Search module=rbac
    res = client.get(
        "/api/v1/admin/audit-logs?module=rbac",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    for item in data["items"]:
        assert item["module"].lower() == "rbac"

    # Search totp_verified=true
    res_totp = client.get(
        "/api/v1/admin/audit-logs?totp_verified=true",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_totp.status_code == 200
    totp_items = res_totp.json()["items"]
    for item in totp_items:
        assert item["totp_verified"] is True


# 4. Audit Log Detail View & Get All Test
def test_get_all_audit_logs():
    """Verify GET /api/v1/admin/audit-logs/all returns list of all audit records without parameters."""
    token = create_admin_access_token("adm_001", "tech@senyxsoftware.com", "Super Admin", ["*"], is_super_admin=True)

    res = client.get(
        "/api/v1/admin/audit-logs/all",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)
    assert len(items) > 0
    assert items[0]["id"].startswith("audit_")


def test_audit_log_detail_view():
    """Verify fetching audit record detail by ID."""
    token = create_admin_access_token("adm_001", "tech@senyxsoftware.com", "Super Admin", ["*"], is_super_admin=True)

    res = client.get(
        "/api/v1/admin/audit-logs/audit_001",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code == 200
    detail = res.json()
    assert detail["id"] == "audit_001"
    assert detail["action"] == "system.bootstrap"


# 5. Strict Immutability Test (No updates or deletions)
def test_audit_log_immutability():
    """Verify audit records cannot be mutated or deleted."""
    with pytest.raises(NotImplementedError):
        audit_repository.update("audit_001", {})

    with pytest.raises(NotImplementedError):
        audit_repository.delete("audit_001")
