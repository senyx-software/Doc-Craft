import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
from app.main import app
from tests.conftest import seed_admin_with_totp, action_code

client = TestClient(app)

TOKEN, _TOTP_SECRET = seed_admin_with_totp("users_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)
AUTH_HEADERS = {"Authorization": f"Bearer {TOKEN}", "X-Forwarded-For": "127.0.0.1"}


def auth_2fa_headers() -> dict:
    """A fresh code each call — a module-level static one would expire
    across this file's full test run (see conftest.py's module docstring)."""
    return {**AUTH_HEADERS, "X-Admin-2FA": action_code(_TOTP_SECRET)}


def test_users_endpoints_require_authentication():
    """Verify user management endpoints reject requests with no JWT at all."""
    res = client.get("/api/v1/users?page=1&limit=10")
    assert res.status_code == 401

    res_status = client.patch("/api/v1/users/123/status", json={"status": "suspended"})
    assert res_status.status_code == 401


@patch("app.integrations.services.auth_client.auth_client.list_users", new_callable=AsyncMock)
def test_list_users(mock_list):
    mock_list.return_value = {"data": [], "meta": {"total": 0, "page": 1, "limit": 10}}
    response = client.get("/api/v1/users?page=1&limit=10", headers=AUTH_HEADERS)
    assert response.status_code == 200
    assert response.json() == {"data": [], "meta": {"total": 0, "page": 1, "limit": 10}}


@patch("app.integrations.services.auth_client.auth_client.get_user", new_callable=AsyncMock)
def test_get_user_not_found(mock_get):
    mock_get.return_value = None
    response = client.get("/api/v1/users/123", headers=AUTH_HEADERS)
    assert response.status_code == 404


@patch("app.integrations.services.auth_client.auth_client.update_user_status", new_callable=AsyncMock)
def test_update_user_status_invalid_literal(mock_update):
    response = client.patch("/api/v1/users/123/status", json={"status": "invalid_status"}, headers=auth_2fa_headers())
    assert response.status_code == 422  # Pydantic validation error


@patch("app.integrations.services.auth_client.auth_client.update_user_status", new_callable=AsyncMock)
def test_update_user_status_valid(mock_update):
    mock_update.return_value = {"message": "User status updated"}
    response = client.patch("/api/v1/users/123/status", json={"status": "suspended"}, headers=auth_2fa_headers())
    assert response.status_code == 200


@patch("app.integrations.services.auth_client.auth_client.update_user_status", new_callable=AsyncMock)
def test_update_user_status_requires_totp(mock_update):
    """Sensitive status changes (ban/suspend) must require 2FA even with a valid JWT."""
    mock_update.return_value = {"message": "User status updated"}
    response = client.patch("/api/v1/users/123/status", json={"status": "suspended"}, headers=AUTH_HEADERS)
    assert response.status_code in (401, 403)


def test_update_user_status_creates_audit_record():
    """Every state-changing user action must generate an immutable audit record."""
    from app.repositories.audit_repository import audit_repository

    with patch("app.integrations.services.auth_client.auth_client.update_user_status", new_callable=AsyncMock) as mock_update:
        mock_update.return_value = {"message": "User status updated"}
        response = client.patch("/api/v1/users/999/status", json={"status": "banned"}, headers=auth_2fa_headers())
        assert response.status_code == 200

    logs = audit_repository.search(action="user.status_updated")["items"]
    matching = [l for l in logs if l.details.get("user_id") == "999"]
    assert len(matching) > 0
    assert matching[0].details.get("new_status") == "banned"
    assert matching[0].totp_verified is True
