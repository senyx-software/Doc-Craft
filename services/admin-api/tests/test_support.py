import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import pyotp

from app.main import app
from app.repositories.plan_repository import plan_repository
from tests.conftest import seed_admin_with_totp, action_code

client = TestClient(app)

TOKEN, _TOTP_SECRET = seed_admin_with_totp("support_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

@pytest.fixture(autouse=True)
def fresh_admin_session():
    global TOKEN, _TOTP_SECRET
    TOKEN, _TOTP_SECRET = seed_admin_with_totp("support_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)


def auth_2fa_headers() -> dict:
    """A fresh code each call — a module-level static one would expire
    across this file's full test run (see conftest.py's module docstring)."""
    return {
        "Authorization": f"Bearer {TOKEN}",
        "X-Admin-2FA": action_code(_TOTP_SECRET),
        "X-Forwarded-For": "127.0.0.1",
    }


def _submit_override_request(user_id: str) -> str:
    res = client.post(
        "/api/v1/support/plan-override-requests",
        json={
            "user_email": "override_target@doccraft.app",
            "requested_plan": "pro",
            "reason": "Needs more quota for a launch",
            "user_id": user_id,
            "requested_quota": 500,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["override_request"]["id"]


@patch("app.integrations.services.auth_client.auth_client.update_user_plan", new_callable=AsyncMock)
def test_approving_override_actually_applies_plan_and_quota(mock_update_plan):
    """Approval must reassign the real plan and persist the quota override —
    not just flip the request's own status field."""
    mock_update_plan.return_value = {"message": "User plan updated", "user": {"id": "usr_override_1", "plan": "pro"}}

    override_id = _submit_override_request("usr_override_1")

    res = client.post(
        f"/api/v1/admin/support/plan-overrides/{override_id}/approve",
        headers=auth_2fa_headers(),
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["override_request"]["status"] == "approved"
    assert body["applied"]["plan"] == "pro"
    mock_update_plan.assert_awaited_once_with("usr_override_1", "pro")

    # The quota grant's Quota-Service HTTP notify will fail in this test
    # environment (no live Quota service) — that's expected and caught as a
    # warning, not a test failure. What must be durable regardless is the
    # local override row itself, which is what actually gates the Lua check.
    persisted = plan_repository.get_user_quota_override("usr_override_1")
    assert persisted is not None
    assert persisted.custom_quota == 500


@patch("app.integrations.services.auth_client.auth_client.update_user_plan", new_callable=AsyncMock)
def test_patch_approve_also_applies_the_change(mock_update_plan):
    """The generic PATCH endpoint approving a request must apply the grant
    too, not only the dedicated /approve endpoint."""
    mock_update_plan.return_value = {"message": "User plan updated", "user": {"id": "usr_override_2", "plan": "pro"}}

    override_id = _submit_override_request("usr_override_2")

    res = client.patch(
        f"/api/v1/admin/support/plan-overrides/{override_id}",
        json={"status": "approved"},
        headers=auth_2fa_headers(),
    )
    assert res.status_code == 200, res.text
    assert res.json()["applied"]["plan"] == "pro"
    mock_update_plan.assert_awaited_once_with("usr_override_2", "pro")


def test_approve_requires_totp():
    override_id = _submit_override_request("usr_override_3")
    res = client.post(
        f"/api/v1/admin/support/plan-overrides/{override_id}/approve",
        headers={"Authorization": f"Bearer {TOKEN}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res.status_code in (401, 403)


def test_approve_without_linked_user_id_warns_instead_of_failing():
    """A request submitted without a resolvable user_id can't be applied
    automatically — that must surface as a warning, not a crash."""
    res = client.post(
        "/api/v1/support/plan-override-requests",
        json={
            "user_email": "no_id_user@doccraft.app",
            "requested_plan": "pro",
            "reason": "Manual review needed",
        },
    )
    override_id = res.json()["override_request"]["id"]

    approve_res = client.post(
        f"/api/v1/admin/support/plan-overrides/{override_id}/approve",
        headers=auth_2fa_headers(),
    )
    assert approve_res.status_code == 200
    body = approve_res.json()
    assert body["applied"] == {}
    assert any("user_id" in w for w in body["warnings"])
