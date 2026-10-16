"""
conftest.py — shared test helpers.

Replaces the old per-file pattern of `create_admin_access_token(...)` +
`pyotp.TOTP(pyotp.random_base32()).now()`. That pattern generated a TOTP code
from a throwaway random secret that was never persisted anywhere — it only
"worked" because `require_totp_2fa` had a bug where it read the verification
secret off the JWT payload (which never carries `totp_secret`), so the check
silently no-op'd and accepted any non-empty code. Now that the dependency
correctly looks up the account's real, persisted secret, tests need one that
actually matches.

Two things to get right, not one:

1. Timing: `TOTP_WINDOW` tolerates roughly a ±30-90s drift (see
   app/core/config.py), but some test files make enough live requests to run
   well past that. A code baked in once at import time or the top of a test
   and reused across many requests will silently start failing partway
   through. `seed_admin_with_totp` returns the secret (which doesn't expire)
   — call `totp_code(secret)` fresh at each request site.

2. Identity collisions: earlier versions of this helper hardcoded
   `admin_id="adm_001"` and were called from several files, some reusing
   `tech@senyxsoftware.com` — the exact email `bootstrap_super_admin`
   provisions in test_security_and_api.py. Since `admin_user_repository.save`
   does `INSERT OR REPLACE` keyed by `id`, every one of those calls was
   silently overwriting the SAME row (including whichever bootstrapped
   account's password hash happened to already be there), and running the
   whole suite together meant whichever file's module body imported last
   "won," breaking every other file's already-computed tokens/codes. This
   helper now upserts by EMAIL and lets the repository assign the id — if
   the address already has a row (e.g. the bootstrapped super admin), it's
   updated in place (2FA enabled, new secret) rather than shadowed by a
   colliding new row.
"""

# Always use a disposable database, even when a developer's environment points remotely.
import os
import tempfile
from pathlib import Path
os.environ["ADMIN_DATABASE_URL"] = "sqlite:///" + str(Path(tempfile.mkdtemp(prefix="doccraft-admin-tests-")) / "admin.sqlite")
os.environ["REDIS_URL"] = "redis://127.0.0.1:0"
os.environ["RESEND_API_KEY"] = "dummy-test-transport"
os.environ["POSTHOG_API_KEY"] = "dummy-test-project"
os.environ["POSTHOG_PERSONAL_API_KEY"] = ""
os.environ["POSTHOG_PROJECT_ID"] = ""
os.environ["TRUSTED_PROXY_IPS"] = '["testclient"]'
for _service in ("AUTH", "QUOTA", "PAYMENT", "CHAT", "DOCUMENT", "NOTIFICATION", "ANALYTICS"):
    os.environ[f"{_service}_SERVICE_URL"] = "http://127.0.0.1:9"
os.environ["POSTHOG_HOST"] = "http://127.0.0.1:9"

import pyotp

from app.repositories.admin_user_repository import admin_user_repository
from app.security.authentication import create_admin_access_token as sign_admin_token


def seed_admin_with_totp(
    email: str,
    role_name: str,
    permissions: list[str],
    is_super_admin: bool = False,
) -> tuple[str, str]:
    """Ensures a real AdminUser exists for `email` with 2FA enabled, and
    returns (jwt_token, totp_secret). Upserts by email (never by a caller-
    supplied id) so this can't collide with — or shadow — any other account,
    bootstrapped or otherwise, that already owns that address."""
    secret = pyotp.random_base32()
    account = admin_user_repository.get_by_email(email)
    if account:
        account.totp_enabled = True
        account.totp_secret = secret
        if is_super_admin:
            account.role_id = "role_super_admin"
        account = admin_user_repository.save(account)
    else:
        account = admin_user_repository.create(
            email=email,
            password_hash="test_only_not_a_real_hash",
            role_id="role_super_admin" if is_super_admin else "role_staff",
            name=role_name,
        )
        account.totp_enabled = True
        account.totp_secret = secret
        account = admin_user_repository.save(account)

    token = create_test_admin_access_token(account.id, email, role_name, permissions, is_super_admin=is_super_admin)
    return token, secret


def totp_code(secret: str) -> str:
    """A fresh 6-digit code for `secret`, valid right now."""
    return pyotp.TOTP(secret).now()


def action_code(secret: str) -> str:
    """Seed a fresh test-only email action challenge, verified by the real dependency."""
    import secrets
    from datetime import datetime,timedelta,timezone
    from app.repositories.verification_repository import verification_repository
    account=next(user for user in admin_user_repository.list_all() if user.totp_secret==secret)
    code=f'{secrets.randbelow(1000000):06d}'
    verification_repository.save_code(account.email,code,datetime.now(timezone.utc)+timedelta(minutes=5),purpose='action')
    return code


def create_admin_token_with_totp(
    email: str,
    role_name: str,
    permissions: list[str],
    is_super_admin: bool = False,
) -> tuple[str, str]:
    """Convenience for a single immediate use (seed + use the code right
    away). For a module-level token/headers reused across many test
    functions in one file, prefer seed_admin_with_totp + totp_code(secret)
    called fresh at each request instead — see module docstring."""
    token, secret = seed_admin_with_totp(email, role_name, permissions, is_super_admin)
    return token, totp_code(secret)


def create_test_admin_access_token(admin_id, email, role_name, permissions, is_super_admin=False, **kwargs):
    """Issue a token backed by a real fixture account and persisted permissions."""
    import hashlib
    from app.repositories.role_repository import role_repository
    if is_super_admin or role_name.lower() == "super admin":
        role = role_repository.get_by_id("role_super_admin")
    else:
        name = "Fixture " + role_name + " " + hashlib.sha256(str(permissions).encode()).hexdigest()[:8]
        role = role_repository.get_by_name(name) or role_repository.create(name, "Test fixture", permissions)
    account = admin_user_repository.get_by_email(email)
    if not account:
        account = admin_user_repository.create(email, "fixture-only-unused-password", role.id, role_name)
    account.role_id = role.id
    account = admin_user_repository.save(account)
    return sign_admin_token(account.id, email, role.name, permissions, is_super_admin=is_super_admin, **kwargs)

# Test-only cryptographic identities; production authorization remains unchanged.
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from scripts.audit_fixtures.service_identity import configure, headers as service_headers
configure('admin-api')
import pytest
@pytest.fixture(autouse=True)
def isolated_service_nonces(monkeypatch):
    from app.db.admin_db import admin_db
    admin_db.execute("DELETE FROM admin_security_budgets")
    from shared import service_auth
    seen = set()
    async def claim(*args):
        nonce = args[:4]
        if nonce in seen: return False
        seen.add(nonce)
        return True
    monkeypatch.setattr(service_auth, 'claim_nonce', claim)
