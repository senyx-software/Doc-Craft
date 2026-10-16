import concurrent.futures
import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.main import app
from app.security.budgets import claim_budget
from app.security.middleware import client_address
from tests.conftest import create_test_admin_access_token, seed_admin_with_totp, totp_code


def test_concurrent_budget_is_shared_and_atomic():
    identity = str(uuid.uuid4())
    def attempt(_):
        try:
            claim_budget("concurrency", identity, 5, 300)
            return True
        except HTTPException as error:
            assert error.status_code == 429
            return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        assert sum(pool.map(attempt, range(24))) == 5


def test_auth_burst_cannot_bypass_budget_with_forged_forwarded_headers(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "IP_WHITELIST_ENABLED", False)
    with TestClient(app, client=("198.51.100.7", 1234)) as client:
        statuses = [client.post("/api/v1/admin/auth/login", json={}, headers={"X-Forwarded-For": str(i)}).status_code for i in range(21)]
    assert statuses[:20] == [422] * 20
    assert statuses[20] == 429


def test_sensitive_action_budget_limits_totp_guesses():
    token, secret = seed_admin_with_totp("budget@example.com", "Super Admin", ["*"], True)
    correct = totp_code(secret)
    wrong = "000000" if correct != "000000" else "111111"
    client = TestClient(app)
    headers = {"Authorization": "Bearer " + token, "X-Admin-2FA": wrong}
    statuses = [client.post("/api/v1/admin/auth/totp/disable", headers=headers).status_code for _ in range(6)]
    assert all(status not in (200, 204) for status in statuses)
    assert statuses[-1] == 429


def test_enabled_authenticator_cannot_be_replaced_using_session_alone():
    token, _ = seed_admin_with_totp("replace-totp@example.com", "Super Admin", ["*"], True)
    response = TestClient(app).post("/api/v1/admin/auth/totp/setup", headers={"Authorization": "Bearer " + token})
    assert response.status_code == 403


def test_forwarded_chain_uses_nearest_untrusted_client(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", ["127.0.0.1"])
    request = Request({"type": "http", "client": ("127.0.0.1", 99), "headers": [(b"x-forwarded-for", b"1.2.3.4, 198.51.100.9")]})
    assert client_address(request) == "198.51.100.9"
