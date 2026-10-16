from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid
import jwt
import bcrypt
from pydantic import BaseModel

from app.core.config import settings
from app.core.exceptions import UnauthorizedException


class AdminUserPayload(BaseModel):
    session_id: str
    admin_id: str
    email: str
    role_name: str
    permissions: List[str] = []
    is_super_admin: bool = False
    totp_enabled: bool = False
    totp_secret: Optional[str] = None


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode("utf-8")[:72]
    return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))


def create_admin_access_token(
    admin_id: str,
    email: str,
    role_name: str,
    permissions: List[str],
    is_super_admin: bool = False,
    totp_enabled: bool = False,
    expires_delta: Optional[timedelta] = None,
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: Dict[str, Any] = {
        "jti":str(uuid.uuid4()),
        "sub": admin_id,
        "admin_id": admin_id,
        "email": email,
        "role": role_name,
        "permissions": permissions,
        "is_super_admin": is_super_admin or (role_name.lower() == "super admin"),
        "totp_enabled": totp_enabled,
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "type": "admin_jwt",
        "iss": "doccraft-admin",
        "aud": "doccraft-admin-api",
    }
    from app.db.admin_db import admin_db
    admin_db.execute("INSERT INTO admin_login_sessions (id,admin_id,user_email,expires_at,created_at) VALUES (?,?,?,?,?)",(payload['jti'],admin_id,email,int(expire.timestamp()),payload['iat']))
    encoded_jwt = jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256',headers={'typ':'doccraft-admin+jwt'})
    return encoded_jwt


def decode_admin_access_token(token: str) -> AdminUserPayload:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], issuer="doccraft-admin", audience="doccraft-admin-api", options={"require": ["sub", "iat", "exp", "jti"]})
        if payload.get('type')!='admin_jwt' or jwt.get_unverified_header(token).get('typ')!='doccraft-admin+jwt':
            raise UnauthorizedException('Invalid admin token profile')
        admin_id = payload.get("admin_id") or payload.get("sub")
        email = payload.get("email")
        role_name = payload.get("role", "Guest")
        permissions = payload.get("permissions", [])
        is_super_admin = payload.get("is_super_admin", False) or (role_name.lower() == "super admin")
        totp_enabled = payload.get("totp_enabled", False)

        if not admin_id or not email:
            raise UnauthorizedException("Malformed JWT claims: missing admin identity")

        return AdminUserPayload(
            session_id=str(payload['jti']),
            admin_id=str(admin_id),
            email=str(email),
            role_name=str(role_name),
            permissions=[str(p) for p in permissions],
            is_super_admin=bool(is_super_admin),
            totp_enabled=bool(totp_enabled),
        )
    except jwt.ExpiredSignatureError:
        raise UnauthorizedException("Admin access token has expired")
    except jwt.PyJWTError as e:
        raise UnauthorizedException(f"Invalid authentication token: {str(e)}")
