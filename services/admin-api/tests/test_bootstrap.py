import os
import pytest
from app.cli.bootstrap import bootstrap_super_admin
from app.repositories.admin_user_repository import admin_user_repository
from app.repositories.role_repository import role_repository
from app.repositories.audit_repository import audit_repository
from app.security.authentication import verify_password


def test_initial_super_admin_bootstrap():
    """Verify initial bootstrap provisions Super Admin account, role, and TOTP secret key."""
    test_email = "bootstrap_unit_test@doccraft.app"
    test_pass = "UnitTestPass123!"

    result = bootstrap_super_admin(
        email=test_email,
        password=test_pass,
        name="Unit Test Admin",
        force_reset=True,
    )

    assert result["status"] == "success"
    assert result["email"] == test_email
    assert result["role_name"] == "Super Admin"
    assert result["totp_secret"] is not None
    assert len(result["totp_secret"]) == 32
    assert "otpauth://totp/DocCraft" in result["provisioning_uri"]

    # Verify user account in repository
    user = admin_user_repository.get_by_email(test_email)
    assert user is not None
    assert user.role_id == "role_super_admin"
    assert verify_password(test_pass, user.password_hash) is True
    assert user.totp_secret == result["totp_secret"]


def test_bootstrap_idempotency():
    """Verify second bootstrap run skips gracefully without modifying password or user ID."""
    test_email = "idempotent_admin@doccraft.app"
    test_pass = "OriginalPass123!"

    # 1. First run creates user
    res1 = bootstrap_super_admin(email=test_email, password=test_pass, force_reset=True)
    assert res1["status"] == "success"
    user_id_1 = res1["admin_id"]

    # 2. Second run without force_reset must skip
    res2 = bootstrap_super_admin(email=test_email, password="NewDifferentPass!", force_reset=False)
    assert res2["status"] == "skipped"
    assert res2["admin_id"] == user_id_1

    # Verify original password hash is preserved
    user = admin_user_repository.get_by_email(test_email)
    assert user is not None
    assert verify_password(test_pass, user.password_hash) is True


def test_bootstrap_environment_variables(monkeypatch):
    """Verify environment variable overrides SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD."""
    monkeypatch.setenv("SUPER_ADMIN_EMAIL", "env_admin@doccraft.app")
    monkeypatch.setenv("SUPER_ADMIN_PASSWORD", "EnvPass123!")

    result = bootstrap_super_admin(force_reset=True)
    assert result["status"] == "success"
    assert result["email"] == "env_admin@doccraft.app"

    user = admin_user_repository.get_by_email("env_admin@doccraft.app")
    assert user is not None
    assert verify_password("EnvPass123!", user.password_hash) is True


def test_bootstrap_audit_log():
    """Verify bootstrap writes system.super_admin_bootstrapped audit record."""
    audit_logs = audit_repository.search(action="system.super_admin_bootstrapped")["items"]
    assert len(audit_logs) > 0
    assert audit_logs[0].action == "system.super_admin_bootstrapped"
    assert audit_logs[0].totp_verified is True
