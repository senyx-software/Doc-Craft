from datetime import datetime, timezone
from typing import Optional
from fastapi import Header, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.exceptions import UnauthorizedException, TOTPRequiredException, ForbiddenException
from app.repositories.admin_user_repository import admin_user_repository
from app.repositories.verification_repository import verification_repository
from app.security.authentication import AdminUserPayload, decode_admin_access_token
from app.security.totp import verify_totp_code

security_bearer = HTTPBearer(auto_error=False)


def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> AdminUserPayload:
    """FastAPI dependency extracting and verifying admin JWT Bearer token."""
    if not credentials or not credentials.credentials:
        raise UnauthorizedException("Missing authentication token in Authorization header")

    token = credentials.credentials
    admin_payload = decode_admin_access_token(token)
    from app.db.admin_db import admin_db
    import time
    session=admin_db.fetch_one('SELECT admin_id,expires_at FROM admin_login_sessions WHERE id=?',(admin_payload.session_id,))
    if not session or session['admin_id']!=admin_payload.admin_id or int(session['expires_at'])<=time.time():
        raise UnauthorizedException('Admin session expired or revoked')
    account = admin_user_repository.get_by_id(admin_payload.admin_id)
    if not account or account.email.lower() != admin_payload.email.lower():
        raise UnauthorizedException("Admin account no longer exists")
    if account.status != "active":
        raise ForbiddenException("Admin account is unavailable")
    from app.repositories.role_repository import role_repository
    from app.services.rbac_engine import rbac_engine
    role = role_repository.get_by_id(account.role_id)
    if not role:
        raise ForbiddenException("Admin role is unavailable")
    admin_payload.role_name = role.name
    admin_payload.permissions = rbac_engine.get_role_permissions(role.id)
    admin_payload.is_super_admin = account.role_id == "role_super_admin"
    admin_payload.totp_enabled = account.totp_enabled
    return admin_payload


async def require_internal_secret(request: Request):
    from shared.service_auth import authorize_service
    return await authorize_service("admin-api", request)


def require_totp_2fa(
    request: Request,
    current_admin: AdminUserPayload = Depends(get_current_admin),
    x_admin_2fa: Optional[str] = Header(None, alias="X-Admin-2FA"),
) -> AdminUserPayload:
    """
    FastAPI dependency for sensitive write/mutate routes (NFR-ADM-06, SRS §10.9).
    Requires a valid, fresh 6-digit code in the X-Admin-2FA header — either a
    TOTP authenticator code, or an emailed code requested via
    POST /admin/auth/request-action-code. This mirrors exactly how /login
    already accepts either alongside a password (see
    _issue_token_for_valid_code in auth.py) — an admin who hasn't set up (or
    doesn't want) an authenticator app still has a working path here.

    The TOTP secret is deliberately re-fetched from the database on every call
    (not read off the JWT payload) — the access token never carries
    `totp_secret` in its claims (only `totp_enabled` does), so trusting the
    payload here silently no-ops the whole check: any non-empty header value
    would pass. Looking the account up fresh also picks up 2FA being
    enabled/disabled mid-session without waiting for the token to expire.
    """
    if not x_admin_2fa:
        raise TOTPRequiredException(
            message="Sensitive admin operation requires 2FA verification. Please include X-Admin-2FA header."
        )

    account = admin_user_repository.get_by_email(current_admin.email)
    if not account:
        raise TOTPRequiredException(message="Admin account not found")

    code_clean = x_admin_2fa.strip()
    from app.security.budgets import claim_budget, clear_budget
    budget = claim_budget("sensitive-action", current_admin.admin_id, 5, 300)

    if account.totp_enabled and account.totp_secret and verify_totp_code(account.totp_secret, code_clean, account.id):
        clear_budget(budget)
        return current_admin

    record = verification_repository.get_code(account.email, purpose="action")
    if record and verification_repository.claim_attempt(account.email, purpose="action"):
        expires_at = record["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) <= expires_at and record["code"] == code_clean:
            # One-time use, same as the login flow — consume it so it can't
            # be replayed for a second action.
            if verification_repository.consume_code(account.email, record["code"], purpose="action"):
                clear_budget(budget)
                return current_admin

    raise TOTPRequiredException(
        message="Invalid or expired code. Use your authenticator app, or request a fresh email code."
    )
