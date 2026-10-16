import os
import sys
from typing import Any, Dict, Optional

from app.repositories.admin_user_repository import admin_user_repository
from app.repositories.role_repository import role_repository
from app.security.authentication import hash_password
from app.security.totp import generate_totp_secret, get_totp_provisioning_uri
from app.services.audit_service import audit_service


def bootstrap_super_admin(
    email: Optional[str] = None,
    password: Optional[str] = None,
    name: Optional[str] = None,
    force_reset: bool = False,
) -> Dict[str, Any]:
    """
    Idempotent Super Admin provisioning routine.
    Creates or validates initial Super Admin account, assigns unrestricted role,
    generates 2FA TOTP secret & provisioning URI, and logs audit record.
    """
    target_email = (email or os.getenv("SUPER_ADMIN_EMAIL", "tech@senyxsoftware.com")).lower().strip()
    target_password = password or os.getenv("SUPER_ADMIN_PASSWORD")
    target_name = name or os.getenv("SUPER_ADMIN_NAME", "Super Admin User")

    # 1. Ensure Super Admin role exists in repository
    super_admin_role = role_repository.get_by_name("Super Admin")
    if not super_admin_role:
        super_admin_role = role_repository.create(
            name="Super Admin",
            description="Unrestricted platform control plane access",
            permission_ids=["*"],
        )

    # 2. Check if Super Admin user already exists
    existing_user = admin_user_repository.get_by_email(target_email)
    if existing_user and not force_reset:
        return {
            "status": "skipped",
            "message": f"Super Admin account '{target_email}' already exists. Bootstrap skipped (idempotent).",
            "admin_id": existing_user.id,
            "email": existing_user.email,
            "role_id": existing_user.role_id,
            "totp_enabled": existing_user.totp_enabled,
        }

    if not target_password:
        raise ValueError("Set SUPER_ADMIN_PASSWORD before provisioning or resetting the initial administrator")

    # 3. Provision new password hash & 2FA TOTP secret key
    pwd_hash = hash_password(target_password)
    totp_secret = generate_totp_secret()
    provisioning_uri = get_totp_provisioning_uri(totp_secret, target_email)

    if existing_user:
        existing_user.password_hash = pwd_hash
        existing_user.role_id = super_admin_role.id
        existing_user.name = target_name
        existing_user.totp_secret = totp_secret
        user = admin_user_repository.save(existing_user)
    else:
        user = admin_user_repository.create(
            email=target_email,
            password_hash=pwd_hash,
            role_id=super_admin_role.id,
            name=target_name,
        )
        user.totp_secret = totp_secret
        user = admin_user_repository.save(user)

    # 4. Log Immutable Audit Record
    audit_service.log_security_event(
        action="system.super_admin_bootstrapped",
        module="system",
        admin_id=user.id,
        admin_email=user.email,
        details={
            "bootstrapped_email": target_email,
            "role_name": "Super Admin",
            "totp_secret_generated": True,
        },
        totp_verified=True,
    )

    return {
        "status": "success",
        "message": f"Super Admin account '{target_email}' successfully bootstrapped.",
        "admin_id": user.id,
        "email": user.email,
        "role_name": "Super Admin",
        "totp_secret": totp_secret,
        "provisioning_uri": provisioning_uri,
        "qr_code_hint": f"Scan QR code or enter secret '{totp_secret}' into Google Authenticator / 2FA app",
    }


if __name__ == "__main__":
    print("=== DocCraft Admin API — Super Admin Bootstrap ===")
    result = bootstrap_super_admin()
    print(f"Status: {result['status']}")
    print(f"Message: {result['message']}")
    if result["status"] == "success":
        print(f"Admin ID: {result['admin_id']}")
        print(f"Email: {result['email']}")
        print(f"Role: {result['role_name']}")
        print(f"TOTP Secret: {result['totp_secret']}")
        print(f"Provisioning URI: {result['provisioning_uri']}")
    sys.exit(0)
