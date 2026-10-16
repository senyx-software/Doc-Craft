from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import pyotp

from app.main import app
from tests.conftest import seed_admin_with_totp, action_code

client = TestClient(app)

TOKEN, _TOTP_SECRET = seed_admin_with_totp("promotions_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)


def auth_2fa_headers() -> dict:
    """A fresh code each call — a module-level static one would expire
    across this file's full test run (see conftest.py's module docstring)."""
    return {
        "Authorization": f"Bearer {TOKEN}",
        "X-Admin-2FA": action_code(_TOTP_SECRET),
        "X-Forwarded-For": "127.0.0.1",
    }


AUTH_HEADERS = {"Authorization": f"Bearer {TOKEN}", "X-Forwarded-For": "127.0.0.1"}


def test_ab_tests_reports_not_configured_without_posthog_key():
    """No fabricated experiments — an unconfigured PostHog key must say so explicitly."""
    res = client.get("/api/v1/admin/promotions/ab-tests", headers=AUTH_HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert body["configured"] is False
    assert body["experiments"] == []


@patch("app.api.v1.promotions.auth_client.create_referral", new_callable=AsyncMock)
@patch("app.api.v1.promotions.auth_client.list_referrals", new_callable=AsyncMock)
@patch("app.api.v1.promotions.auth_client.convert_referral", new_callable=AsyncMock)
def test_referral_create_list_convert_grants_reward(mock_convert, mock_list, mock_create):
    mock_create.return_value = {"data": {"id": "ref_1", "referrerUserId": "usr_referrer", "referredEmail": "new@doccraft.app", "code": "REF123", "status": "pending"}}
    mock_list.return_value = {"data": [{"id": "ref_1", "status": "pending"}]}
    mock_convert.return_value = {"data": {"id": "ref_1", "referrerUserId": "usr_referrer", "status": "converted"}}

    res_create = client.post(
        "/api/v1/admin/promotions/referrals",
        json={"referrer_user_id": "usr_referrer", "referred_email": "new@doccraft.app", "code": "REF123"},
        headers=auth_2fa_headers(),
    )
    assert res_create.status_code == 201
    mock_create.assert_awaited_once_with("usr_referrer", "new@doccraft.app", "REF123")

    res_list = client.get("/api/v1/admin/promotions/referrals", headers=AUTH_HEADERS)
    assert res_list.status_code == 200
    assert res_list.json()["data"][0]["id"] == "ref_1"

    res_convert = client.post("/api/v1/admin/promotions/referrals/ref_1/convert", headers=auth_2fa_headers())
    assert res_convert.status_code == 200
    body = res_convert.json()
    assert body["referral"]["status"] == "converted"
    assert body["warnings"] == []

    from app.repositories.plan_repository import plan_repository
    override = plan_repository.get_user_quota_override("usr_referrer")
    assert override is not None
    assert override.custom_quota == 20
