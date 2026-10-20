import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Union
from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.core.exceptions import ForbiddenException, NotFoundException, UnauthorizedException, ValidationException
from app.repositories.admin_user_repository import admin_user_repository
from app.repositories.role_repository import role_repository
from app.repositories.verification_repository import verification_repository
from app.schemas.auth import (
    AdminLoginCodeRequiredResponse,
    AdminLoginRequest,
    AdminProfileResponse,
    AdminTokenResponse,
    AdminVerifyLoginCodeRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    TOTPSetupResponse,
    TOTPVerifyRequest,
    UpdateAdminProfileRequest,
)
from app.security.authentication import (
    AdminUserPayload,
    create_admin_access_token,
    hash_password,
    verify_password,
)
from app.security.dependencies import get_current_admin, require_totp_2fa
from app.security.totp import (
    generate_qr_code_data_uri,
    generate_totp_secret,
    get_totp_provisioning_uri,
    verify_totp_code,
)
from app.services.audit_service import audit_service
from app.services.email_service import email_service

router = APIRouter(prefix="/admin/auth", tags=["Admin Auth"])


@router.post("/login", response_model=AdminLoginCodeRequiredResponse)
def login(payload: AdminLoginRequest, request: Request):
    """
    Step 1: Authenticate admin staff credentials (email & password).
    Generates a 6-digit email verification code and saves it to database.
    """
    account = admin_user_repository.get_by_email(payload.email)
    if not account or not verify_password(payload.password, account.password_hash):
        audit_service.log_security_event(
            action="login.failed",
            module="auth",
            request=request,
            details={"attempted_email": payload.email, "reason": "invalid_credentials"},
        )
        raise UnauthorizedException("Invalid email or password")

    if (account.status or "active") != "active":
        audit_service.log_security_event(
            action="login.blocked",
            module="auth",
            request=request,
            admin_id=account.id,
            admin_email=account.email,
            details={"reason": f"account_status_{account.status}"},
        )
        raise ForbiddenException(f"This account is {account.status}. Contact a Super Admin for access.")

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    verification_repository.save_code(account.email, code, expires_at)
    email_service.send_verification_code(account.email, code, reason="login")

    audit_service.log_security_event(
        action="login.code_sent",
        module="auth",
        request=request,
        admin_id=account.id,
        admin_email=account.email,
        details={"verification_code_generated": True},
    )

    return AdminLoginCodeRequiredResponse(
        status="verification_code_required",
        message=f"Credentials verified. A 6-digit verification code has been dispatched to {account.email}. Call /admin/auth/verify-login-code with email and verification_code to receive JWT access token.",
        email=account.email,
        expires_in_minutes=10,
    )


@router.post("/verify-login-code", response_model=AdminTokenResponse)
def verify_login_code(payload: AdminVerifyLoginCodeRequest, request: Request):
    """
    Step 2: Submit email and the 6-digit verification code to complete login and issue JWT access token.
    """
    account = admin_user_repository.get_by_email(payload.email)
    if not account:
        raise NotFoundException("Admin account not found")

    return _issue_token_for_valid_code(account, payload.verification_code.strip(), request)


def _issue_token_for_valid_code(account, code_clean: str, request: Request) -> AdminTokenResponse:
    if account.status != "active":
        raise ForbiddenException("Admin account is unavailable")
    record = verification_repository.get_code(account.email)
    if not record:
        raise UnauthorizedException("Complete the password step before verifying a login code")
    if not verification_repository.claim_attempt(account.email):
        raise UnauthorizedException("Verification attempt limit reached; repeat the password step")
    challenge_expiry = record["expires_at"]
    if challenge_expiry.tzinfo is None:
        challenge_expiry = challenge_expiry.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > challenge_expiry:
        verification_repository.delete_code(account.email)
        raise UnauthorizedException("Login challenge expired")
    totp_valid = False

    # Check 2FA TOTP secret if user enabled TOTP
    if account.totp_enabled and account.totp_secret:
        if verify_totp_code(account.totp_secret, code_clean, account.id):
            totp_valid = True

    # Check email verification code from database
    email_code_valid = False
    if record:
        now = datetime.now(timezone.utc)
        record_expires = record["expires_at"]
        if record_expires.tzinfo is None:
            record_expires = record_expires.replace(tzinfo=timezone.utc)

        if now <= record_expires and record["code"] == code_clean:
            email_code_valid = True

    if not totp_valid and not email_code_valid:
        audit_service.log_security_event(
            action="login.verification_code_failed",
            module="auth",
            request=request,
            admin_id=account.id,
            admin_email=account.email,
            details={"verification_failed": True},
        )
        raise UnauthorizedException("Invalid or expired 6-digit verification code")

    # Clear used verification code from database
    if not verification_repository.consume_code(account.email, record["code"]):
        raise UnauthorizedException("Login challenge already used or replaced")

    role = role_repository.get_by_id(account.role_id)
    role_name = role.name if role else "Staff"
    permissions = role.permission_ids if role else []
    is_super_admin = role_name.lower() == "super admin" or account.role_id == "role_super_admin"

    token = create_admin_access_token(
        admin_id=account.id,
        email=account.email,
        role_name=role_name,
        permissions=permissions,
        is_super_admin=is_super_admin,
        totp_enabled=account.totp_enabled,
    )

    audit_service.log_security_event(
        action="login.success",
        module="auth",
        request=request,
        admin_id=account.id,
        admin_email=account.email,
        totp_verified=True,
    )

    try:
        from app.repositories.security_repository import security_repository
        meta = audit_service._extract_request_meta(request)
        security_repository.record_session(
            user_email=account.email,
            ip_address=meta["ip_address"],
            device_agent=meta["user_agent"]
        )
    except Exception:
        pass

    return AdminTokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_seconds=3600,
        admin_id=account.id,
        email=account.email,
        name=account.name,
        role_name=role_name,
        permissions=permissions,
        is_super_admin=is_super_admin,
        totp_enabled=account.totp_enabled,
        requires_totp_setup=not account.totp_enabled,
    )


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, request: Request):
    """Initiate password recovery by generating a 6-digit email verification code."""
    email_clean = payload.email.lower().strip()
    account = admin_user_repository.get_by_email(email_clean)
    if not account:
        return {
            "status": "success",
            "message": "If the email is registered, a 6-digit verification code has been dispatched.",
        }

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    verification_repository.save_code(email_clean, code, expires_at, purpose="password_reset")
    email_service.send_verification_code(email_clean, code, reason="password_reset")

    audit_service.log_security_event(
        action="password.forgot_requested",
        module="auth",
        request=request,
        admin_id=account.id,
        admin_email=account.email,
        details={"verification_code_generated": True},
    )

    return {
        "status": "success",
        "message": f"Verification code sent to {account.email}.",
        "expires_in_minutes": 15,
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request):
    """Reset account password using valid 6-digit email verification code."""
    email_clean = payload.email.lower().strip()
    account = admin_user_repository.get_by_email(email_clean)
    if not account:
        raise NotFoundException("Admin account not found")

    record = verification_repository.get_code(email_clean, purpose="password_reset")
    if not record:
        raise ValidationException("No password reset request found for this email or code expired")
    if not verification_repository.claim_attempt(email_clean, purpose="password_reset"):
        raise ValidationException("Verification attempt limit reached; request a new code")

    now = datetime.now(timezone.utc)
    record_expires = record["expires_at"]
    if record_expires.tzinfo is None:
        record_expires = record_expires.replace(tzinfo=timezone.utc)

    if now > record_expires:
        verification_repository.delete_code(email_clean, purpose="password_reset")
        raise ValidationException("Verification code has expired. Please request a new one.")

    if record["code"] != payload.verification_code.strip():
        audit_service.log_security_event(
            action="password.reset_invalid_code",
            module="auth",
            request=request,
            admin_id=account.id,
            admin_email=account.email,
        )
        raise ValidationException("Invalid verification code")

    if not verification_repository.consume_code(email_clean, record["code"], purpose="password_reset"):
        raise ValidationException("Password reset challenge already used or replaced")
    admin_user_repository.update_password(email_clean, hash_password(payload.new_password))

    audit_service.log_security_event(
        action="password.reset_success",
        module="auth",
        request=request,
        admin_id=account.id,
        admin_email=account.email,
    )

    return {"status": "success", "message": "Password successfully reset. You may now log in with your new password."}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_admin: AdminUserPayload = Depends(get_current_admin),
):
    """Change logged-in admin user password from account settings."""
    account = admin_user_repository.get_by_email(current_admin.email)
    if not account or not verify_password(payload.current_password, account.password_hash):
        raise ValidationException("Current password is incorrect")

    admin_user_repository.update_password(current_admin.email, hash_password(payload.new_password))

    audit_service.log_action(
        admin=current_admin,
        action="password.changed",
        module="auth",
        request=request,
    )

    return {"status": "success", "message": "Account password successfully updated."}


@router.post("/totp/setup", response_model=TOTPSetupResponse)
def setup_totp(current_admin: AdminUserPayload = Depends(get_current_admin)):
    """Generate 32-character TOTP secret key & QR code provisioning URI."""
    account = admin_user_repository.get_by_email(current_admin.email)
    if account and account.totp_enabled:
        raise ForbiddenException("Disable the existing authenticator using 2FA before replacing it")
    secret = generate_totp_secret()
    provisioning_uri = get_totp_provisioning_uri(secret, current_admin.email)

    account = admin_user_repository.get_by_email(current_admin.email)
    if account:
        account.totp_secret = secret
        admin_user_repository.save(account)

    return TOTPSetupResponse(
        totp_secret=secret,
        provisioning_uri=provisioning_uri,
        qr_code_hint=f"Scan QR code or enter secret '{secret}' into Google Authenticator",
        qr_code_url=generate_qr_code_data_uri(provisioning_uri),
    )


@router.post("/totp/verify")
def verify_and_enable_totp(
    payload: TOTPVerifyRequest,
    request: Request,
    current_admin: AdminUserPayload = Depends(get_current_admin),
):
    """Verify 6-digit TOTP code and activate 2FA for admin account."""
    account = admin_user_repository.get_by_email(current_admin.email)
    secret = account.totp_secret if account else None

    if not secret:
        raise ValidationException("TOTP setup has not been initiated. Call /admin/auth/totp/setup first.")

    if not verify_totp_code(secret, payload.totp_code, account.id):
        audit_service.log_security_event(
            action="totp.activation_failed",
            module="auth",
            request=request,
            admin_id=current_admin.admin_id,
            admin_email=current_admin.email,
        )
        raise ValidationException("Invalid TOTP verification code. Verification failed.")

    if account:
        account.totp_enabled = True
        admin_user_repository.save(account)

    audit_service.log_action(
        admin=current_admin,
        action="totp.enabled",
        module="auth",
        request=request,
        totp_verified=True,
    )

    return {"status": "success", "message": "2FA TOTP authentication successfully enabled for account"}


@router.post("/totp/disable")
def disable_totp(
    request: Request,
    current_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Disable 2FA and clear the stored secret so the account can run setup again.

    Gated by require_totp_2fa rather than a bare login session — same
    protection as any other sensitive action, and it accepts either a real
    authenticator code OR the emailed fallback code (POST
    /admin/auth/request-action-code), so an admin whose account shows 2FA as
    enabled but who never actually has it configured in an app (e.g. it was
    turned on before they set one up) isn't permanently locked out of ever
    reconfiguring it — there was previously no disable endpoint at all.
    """
    account = admin_user_repository.get_by_email(current_admin.email)
    if account:
        account.totp_enabled = False
        account.totp_secret = None
        admin_user_repository.save(account)

    audit_service.log_action(
        admin=current_admin,
        action="totp.disabled",
        module="auth",
        request=request,
        totp_verified=True,
    )

    return {"status": "success", "message": "2FA TOTP authentication disabled for account"}


@router.post("/request-action-code")
def request_action_code(request: Request, current_admin: AdminUserPayload = Depends(get_current_admin)):
    """
    Emails a 6-digit code the admin can submit in X-Admin-2FA for a sensitive
    action, as an alternative to a TOTP authenticator code — the exact same
    email-code mechanism /login already accepts alongside TOTP (see
    _issue_token_for_valid_code). Without this, an admin who hasn't set up
    (or doesn't want) an authenticator app has no way to ever pass
    require_totp_2fa.
    """
    account = admin_user_repository.get_by_id(current_admin.admin_id)
    if not account:
        raise NotFoundException("Admin account not found")

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    verification_repository.save_code(account.email, code, expires_at, purpose="action")
    email_service.send_verification_code(account.email, code, reason="sensitive_action")

    audit_service.log_security_event(
        action="sensitive_action.code_sent",
        module="auth",
        request=request,
        admin_id=account.id,
        admin_email=account.email,
    )

    return {
        "status": "success",
        "message": f"A 6-digit verification code has been sent to {account.email}.",
        "expires_in_minutes": 10,
    }


@router.get("/me", response_model=AdminProfileResponse)
def get_my_profile(current_admin: AdminUserPayload = Depends(get_current_admin)):
    """Return active authenticated admin profile and permissions."""
    account = admin_user_repository.get_by_id(current_admin.admin_id)
    return AdminProfileResponse(
        admin_id=current_admin.admin_id,
        email=current_admin.email,
        name=account.name if account else None,
        role_name=current_admin.role_name,
        permissions=current_admin.permissions,
        is_super_admin=current_admin.is_super_admin,
        totp_enabled=current_admin.totp_enabled,
    )


@router.patch("/me", response_model=AdminProfileResponse)
def update_my_profile(
    payload: UpdateAdminProfileRequest,
    request: Request,
    current_admin: AdminUserPayload = Depends(get_current_admin),
):
    """Update the authenticated admin's own display name. Email is the login
    identifier and isn't self-service editable here."""
    account = admin_user_repository.update_name(current_admin.admin_id, payload.name.strip())
    if not account:
        raise NotFoundException("Admin account not found")

    audit_service.log_action(
        admin=current_admin,
        action="profile.name_updated",
        module="auth",
        request=request,
        details={"name": account.name},
    )

    return AdminProfileResponse(
        admin_id=current_admin.admin_id,
        email=current_admin.email,
        name=account.name,
        role_name=current_admin.role_name,
        permissions=current_admin.permissions,
        is_super_admin=current_admin.is_super_admin,
        totp_enabled=current_admin.totp_enabled,
    )


@router.post('/logout')
def logout_admin(current_admin: AdminUserPayload = Depends(get_current_admin)):
    from app.repositories.security_repository import security_repository
    security_repository.terminate_session(current_admin.session_id)
    return {'revoked': True}
