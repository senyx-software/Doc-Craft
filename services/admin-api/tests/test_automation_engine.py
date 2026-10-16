import pytest
from fastapi.testclient import TestClient
import pyotp

from app.main import app
from app.repositories.automation_repository import automation_repository
from tests.conftest import create_test_admin_access_token as create_admin_access_token
from app.services.automation_engine import automation_engine
from tests.conftest import create_admin_token_with_totp

client = TestClient(app)


def test_rule_creation_and_listing():
    """Verify rule creation with 2FA TOTP verification and listing endpoint."""
    token, totp_code = create_admin_token_with_totp("automation_test_admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    payload = {
        "name": "Plan Upgrade Notification",
        "description": "Send welcome email when user upgrades to Pro tier",
        "trigger_event": "user.plan_upgraded",
        "conditions": [{"field": "new_plan", "operator": "equals", "value": "pro"}],
        "actions": [
            {
                "action_type": "send_email",
                "target": "notification_service",
                "payload": {"template": "welcome_pro"},
            }
        ],
        "retry_limit": 3,
    }

    res_create = client.post(
        "/api/v1/admin/automation/rules",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "X-Admin-2FA": totp_code, "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_create.status_code == 201
    created = res_create.json()
    assert created["trigger_event"] == "user.plan_upgraded"

    res_list = client.get(
        "/api/v1/admin/automation/rules",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 2


def test_dry_run_rule_evaluation():
    """Verify dry run mode evaluates conditions and previews action without executing side effects."""
    token = create_admin_access_token("adm_001", "admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    # Dry run passing condition
    res_pass = client.post(
        "/api/v1/admin/automation/rules/rule_quota_warning/dry-run",
        json={"payload": {"used_quota": 5, "user_id": "usr_771"}},
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_pass.status_code == 200
    body_pass = res_pass.json()
    assert body_pass["conditions_passed"] is True
    assert len(body_pass["action_previews"]) == 1
    assert body_pass["action_previews"][0]["dry_run"] is True

    # Dry run failing condition
    res_fail = client.post(
        "/api/v1/admin/automation/rules/rule_quota_warning/dry-run",
        json={"payload": {"used_quota": 2, "user_id": "usr_771"}},
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_fail.status_code == 200
    body_fail = res_fail.json()
    assert body_fail["conditions_passed"] is False
    assert len(body_fail["action_previews"]) == 0


def test_event_emission_and_execution_logs(monkeypatch):
    """Verify event emission triggers rules and creates execution run log."""
    token = create_admin_access_token("adm_001", "admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    # This test verifies the event -> rule -> execution-log pipeline, not live
    # delivery (that's execute_action's own real HTTP call to the Notification
    # Service, which isn't running here) — mock a successful dispatch, mirroring
    # how test_retry_and_dead_letter_queue_handling mocks the failure case below.
    def mock_success_action(action, payload, dry_run=False):
        return {"action_type": action.action_type.value, "status": "success", "details": "mocked dispatch"}

    monkeypatch.setattr(automation_engine, "execute_action", mock_success_action)

    # Emit domain event
    res_emit = client.post(
        "/api/v1/admin/automation/events/emit",
        json={"trigger_event": "quota.warning", "payload": {"used_quota": 4, "user_id": "usr_102"}},
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_emit.status_code == 200
    logs = res_emit.json()
    assert len(logs) >= 1
    assert logs[0]["conditions_passed"] is True
    assert logs[0]["status"] == "success"

    # List execution logs API
    res_logs = client.get(
        "/api/v1/admin/automation/execution-logs",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"},
    )
    assert res_logs.status_code == 200
    assert len(res_logs.json()) >= 1


def test_retry_and_dead_letter_queue_handling(monkeypatch):
    """Verify action failures retry up to retry_limit and transition to dead_letter status."""
    token = create_admin_access_token("adm_001", "admin@doccraft.app", "Super Admin", ["*"], is_super_admin=True)

    # Mock action executor to throw error
    def mock_fail_action(action, payload, dry_run=False):
        return {"action_type": action.action_type.value, "status": "failed", "error": "SMTP server connection timed out"}

    monkeypatch.setattr(automation_engine, "execute_action", mock_fail_action)

    logs = automation_engine.process_event("quota.warning", {"used_quota": 5, "user_id": "usr_retry_test"})
    assert len(logs) == 1
    assert logs[0].status == "dead_letter"
    assert logs[0].retry_count == 4  # Initial attempt + 3 retries
    assert "SMTP server" in logs[0].error_message
