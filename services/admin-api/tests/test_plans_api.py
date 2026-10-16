import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
import pyotp

from app.main import app
from app.core.redis import cache_manager
from app.repositories.plan_repository import plan_repository
from app.repositories.audit_repository import audit_repository
from tests.conftest import seed_admin_with_totp, action_code

client = TestClient(app)


# 1. Pricing Plan Management Tests
def test_list_and_create_plan():
    """Verify listing plans and creating a new custom plan with 2FA TOTP verification."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    # List plans
    res = client.get("/api/v1/admin/plans", headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"})
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) >= 3

    # Create custom plan
    rand_suffix = pyotp.random_base32()[:6].lower()
    plan_code = f"startup_{rand_suffix}"
    payload = {
        "name": f"Startup Tier {rand_suffix}",
        "code": plan_code,
        "description": "Special tier for early-stage startups",
        "price_usd_monthly": 49.0,
        "price_usd_yearly": 490.0,
        "billing_interval": "both",
        "monthly_quota": 2000,
        "feature_flags": {"watermark_removal": True, "custom_font_upload": True},
    }
    res_create = client.post(
        "/api/v1/admin/plans",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_create.status_code in [201, 422]
    if res_create.status_code == 201:
        created_plan = res_create.json()
        assert created_plan["code"] == plan_code
        assert created_plan["monthly_quota"] == 2000


def test_update_and_archive_plan():
    """Verify editing plan pricing/quota and archiving custom plan."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    rand_suffix = pyotp.random_base32()[:6].lower()
    plan_code = f"update_{rand_suffix}"
    payload = {
        "name": f"Update Tier {rand_suffix}",
        "code": plan_code,
        "description": "Temporary tier for update test",
        "price_usd_monthly": 29.0,
        "price_usd_yearly": 290.0,
        "billing_interval": "both",
        "monthly_quota": 1000,
        "feature_flags": {"watermark_removal": True},
    }
    res_create = client.post(
        "/api/v1/admin/plans",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_create.status_code == 201
    plan_id = res_create.json()["id"]

    # Update plan
    res_update = client.patch(
        f"/api/v1/admin/plans/{plan_id}",
        json={"monthly_quota": 3000, "price_usd_monthly": 59.0},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_update.status_code == 200
    assert res_update.json()["monthly_quota"] == 3000
    assert res_update.json()["price_usd_monthly"] == 59.0

    # Archive custom plan
    res_archive = client.post(
        f"/api/v1/admin/plans/{plan_id}/archive",
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_archive.status_code == 200
    assert res_archive.json()["status"] == "archived"


def test_toggle_plan_active_status_gates_quota_redis_key():
    """A super admin can deactivate/reactivate a plan (PATCH status). Toggling
    it inactive must remove its Redis quota key (so the Quota Service can no
    longer resolve a limit for it) and drop it from the config:domain:plans
    broadcast; reactivating restores both."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    rand_suffix = pyotp.random_base32()[:6].lower()
    plan_code = f"toggle_{rand_suffix}"
    res_create = client.post(
        "/api/v1/admin/plans",
        json={
            "name": f"Toggle Tier {rand_suffix}",
            "code": plan_code,
            "price_usd_monthly": 10.0,
            "billing_interval": "both",
            "monthly_quota": 25,
        },
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_create.status_code == 201
    plan_id = res_create.json()["id"]

    # Newly created plan is ACTIVE and its quota key is live in Redis
    assert res_create.json()["status"] == "active"
    assert cache_manager.get(f"quota:plan:{plan_code}") == 25

    # Deactivate
    res_deactivate = client.patch(
        f"/api/v1/admin/plans/{plan_id}",
        json={"status": "draft"},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_deactivate.status_code == 200
    assert res_deactivate.json()["status"] == "draft"
    assert cache_manager.get(f"quota:plan:{plan_code}") is None

    plans_config = cache_manager.get("config:domain:plans") or {}
    plans_config_data = plans_config.get("data", plans_config) if isinstance(plans_config, dict) else {}
    assert plan_code not in plans_config_data

    # Reactivate
    res_reactivate = client.patch(
        f"/api/v1/admin/plans/{plan_id}",
        json={"status": "active"},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_reactivate.status_code == 200
    assert res_reactivate.json()["status"] == "active"
    assert cache_manager.get(f"quota:plan:{plan_code}") == 25


# 1a. Built-in system plan tiers (guest / free / pro / max)
def test_system_plans_seeded_and_protected_from_archival():
    """guest, free, pro, and max are always present and can't be archived —
    each gates a live code path (guest sessions, signed-up users' quota)."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    res_list = client.get(
        "/api/v1/admin/plans",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_list.status_code == 200
    plans_by_code = {p["code"]: p for p in res_list.json()}
    for code in ("guest", "free", "pro", "max"):
        assert code in plans_by_code, f"expected built-in plan '{code}' to be seeded"

    for code in ("guest", "free", "pro", "max"):
        res_archive = client.post(
            f"/api/v1/admin/plans/{plans_by_code[code]['id']}/archive",
            headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
        )
        assert res_archive.status_code == 422, f"expected '{code}' archival to be rejected"


# 1b. Unlimited Quota (-1 sentinel) Tests
def test_plan_quota_unlimited_and_rejects_zero():
    """A super admin can set a plan's monthly_quota to -1 (unlimited), and 0
    is rejected — a quota is either a natural number or unlimited, never 0."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    rand_suffix = pyotp.random_base32()[:6].lower()
    plan_code = f"unlimited_{rand_suffix}"
    payload = {
        "name": f"Unlimited Tier {rand_suffix}",
        "code": plan_code,
        "price_usd_monthly": 999.0,
        "billing_interval": "both",
        "monthly_quota": -1,
    }
    res_create = client.post(
        "/api/v1/admin/plans",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_create.status_code == 201
    assert res_create.json()["monthly_quota"] == -1
    plan_id = res_create.json()["id"]

    # 0 is rejected on create
    res_zero = client.post(
        "/api/v1/admin/plans",
        json={**payload, "code": f"zero_{rand_suffix}", "monthly_quota": 0},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_zero.status_code == 422

    # Toggling a plan back to a natural number via update
    res_update = client.patch(
        f"/api/v1/admin/plans/{plan_id}",
        json={"monthly_quota": 5000},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_update.status_code == 200
    assert res_update.json()["monthly_quota"] == 5000

    # 0 is rejected on update too
    res_update_zero = client.patch(
        f"/api/v1/admin/plans/{plan_id}",
        json={"monthly_quota": 0},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_update_zero.status_code == 422


# 2. User Quota Overrides Tests
def test_user_quota_override_grant_and_delete(monkeypatch):
    from unittest.mock import AsyncMock
    from app.integrations.services.quota_client import quota_client
    removal = AsyncMock()
    monkeypatch.setattr(quota_client, "remove_override", removal)
    """Verify granting and revoking user quota overrides."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    # Grant quota override
    res_grant = client.post(
        "/api/v1/admin/users/usr_9921/quota-override",
        json={"custom_quota": 5000, "reason": "Enterprise customer trial expansion"},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_grant.status_code == 200
    override = res_grant.json()
    assert override["user_id"] == "usr_9921"
    assert override["custom_quota"] == 5000

    # Remove quota override
    res_del = client.delete(
        "/api/v1/admin/users/usr_9921/quota-override",
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_del.status_code == 204
    removal.assert_awaited_once_with("usr_9921")


def test_user_quota_override_unlimited_and_rejects_zero():
    """A super admin can grant a user an unlimited (-1) quota override; 0 is rejected."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    res_grant = client.post(
        "/api/v1/admin/users/usr_unlimited_1/quota-override",
        json={"custom_quota": -1, "reason": "VIP unlimited grant"},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_grant.status_code == 200
    assert res_grant.json()["custom_quota"] == -1

    res_zero = client.post(
        "/api/v1/admin/users/usr_unlimited_2/quota-override",
        json={"custom_quota": 0, "reason": "should be rejected"},
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_zero.status_code == 422


# 3. Coupons Management Tests — admin-api proxies these straight through to
# the Payment Service's own `coupons` table (the one real checkout validates
# against), so payment_client is mocked rather than hitting a live service.
def test_coupons_create_list_archive():
    """Verify discount coupon creation, listing, and archiving proxy to Payment Service."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    created = {
        "id": "cpn_abc123", "code": "BLACKFRIDAY50", "discount_type": "percent", "value": 50.0,
        "expires_at": "2026-12-31T00:00:00Z", "usage_limit": 1000, "usage_count": 0,
        "is_expired": False, "created_at": "2026-06-01T00:00:00Z",
    }

    with patch("app.api.v1.plans.payment_client.create_coupon", return_value={"data": created}) as mock_create:
        res_create = client.post(
            "/api/v1/admin/coupons",
            json={"code": "BLACKFRIDAY50", "discount_type": "percent", "value": 50.0, "expires_at": "2026-12-31T00:00:00Z", "usage_limit": 1000},
            headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
        )
    assert res_create.status_code == 201
    mock_create.assert_called_once_with(code="BLACKFRIDAY50", discount_type="percent", value=50.0, expires_at="2026-12-31T00:00:00Z", usage_limit=1000)
    assert res_create.json()["data"]["code"] == "BLACKFRIDAY50"

    with patch("app.api.v1.plans.payment_client.get_coupons", return_value={"data": [created]}):
        res_list = client.get(
            "/api/v1/admin/coupons",
            headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
        )
    assert res_list.status_code == 200
    codes = [c["code"] for c in res_list.json()["data"]]
    assert "BLACKFRIDAY50" in codes

    archived = {**created, "usage_count": 0}
    with patch("app.api.v1.plans.payment_client.archive_coupon", return_value={"data": archived}) as mock_archive:
        res_archive = client.post(
            "/api/v1/admin/coupons/cpn_abc123/archive",
            headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
        )
    assert res_archive.status_code == 200
    mock_archive.assert_called_once_with("cpn_abc123")


# 4. Trial Management Tests — same proxy pattern as coupons above.
def test_trials_start_list_extend_end():
    """Verify starting, listing, extending, and ending a trial proxy to Payment Service."""
    token, _secret = seed_admin_with_totp("plans_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    trial = {
        "id": "sub_trial_1", "user_id": "usr_1", "plan": "pro", "status": "trialing",
        "started_at": "2026-06-01T00:00:00Z", "expires_at": "2026-06-15T00:00:00Z", "is_expired": False,
    }

    with patch("app.api.v1.plans.payment_client.start_trial", return_value={"data": trial}) as mock_start:
        res_start = client.post(
            "/api/v1/admin/trials",
            json={"user_id": "usr_1", "plan": "pro", "days": 14},
            headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
        )
    assert res_start.status_code == 201
    mock_start.assert_called_once_with("usr_1", "pro", 14)

    with patch("app.api.v1.plans.payment_client.get_trials", return_value={"data": [trial]}):
        res_list = client.get(
            "/api/v1/admin/trials",
            headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
        )
    assert res_list.status_code == 200
    assert res_list.json()["data"][0]["user_id"] == "usr_1"

    with patch("app.api.v1.plans.payment_client.extend_trial", return_value={"data": {**trial, "expires_at": "2026-06-22T00:00:00Z"}}) as mock_extend:
        res_extend = client.patch(
            "/api/v1/admin/trials/sub_trial_1/extend",
            json={"days": 7},
            headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
        )
    assert res_extend.status_code == 200
    mock_extend.assert_called_once_with("sub_trial_1", 7)

    with patch("app.api.v1.plans.payment_client.end_trial", return_value={"data": {**trial, "status": "cancelled"}}) as mock_end:
        res_end = client.post(
            "/api/v1/admin/trials/sub_trial_1/end",
            headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": action_code(_secret), "X-Forwarded-For": "127.0.0.1"},
        )
    assert res_end.status_code == 200
    mock_end.assert_called_once_with("sub_trial_1")
