from unittest.mock import AsyncMock

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.integrations.services.auth_client import auth_client
from app.integrations.services.quota_client import quota_client
from app.repositories.plan_repository import plan_repository
from tests.conftest import seed_admin_with_totp, action_code

client = TestClient(app)


def headers():
    token, secret = seed_admin_with_totp("phase2-mutations@example.com", "Super Admin", ["*"], is_super_admin=True)
    return {"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(secret)}


def test_unified_override_really_changes_the_account_plan(monkeypatch):
    update = AsyncMock(return_value={"user": {"plan": "pro"}})
    monkeypatch.setattr(auth_client, "update_user_plan", update)
    result = client.post("/api/v1/users/fixture-plan/override", headers=headers(), json={"plan": "pro"})
    assert result.status_code == 200
    update.assert_awaited_once_with("fixture-plan", "pro")


def test_failed_durable_quota_removal_preserves_admin_override(monkeypatch):
    token_headers = headers()
    plan_repository.set_user_quota_override("fixture-retain", 9, "fixture-admin", "Test retention")
    monkeypatch.setattr(quota_client, "remove_override", AsyncMock(side_effect=httpx.ConnectError("isolated failure")))
    result = client.delete("/api/v1/admin/users/fixture-retain/quota-override", headers=token_headers)
    assert result.status_code == 503
    assert plan_repository.get_user_quota_override("fixture-retain").custom_quota == 9


def test_invalid_quota_values_are_rejected_before_persistence():
    request_headers = headers()
    for method, suffix in (("PATCH", "quota"), ("POST", "override")):
        for value in (0, -2, 2.5):
            result = client.request(method, f"/api/v1/users/invalid-limit/{suffix}",
                                    headers=headers(), json={"daily_limit": value})
            assert result.status_code == 422, (method, value, result.text)
            assert plan_repository.get_user_quota_override("invalid-limit") is None
