import json
from shared.sealed_secret import seal_secret,open_secret
from datetime import datetime, timezone
from typing import List, Optional
from app.db.admin_db import admin_db
from app.models.admin_user import AdminUser
from app.core.exceptions import AppException


class AdminUserRepository:
    """Repository for managing admin staff user accounts in the dedicated admin database."""

    def _row_to_model(self, row: dict) -> AdminUser:
        try:
            totp_secret = open_secret(row.get('totp_secret'), row['id'])
        except Exception as error:
            raise AppException('Administrator authenticator configuration requires repair. Contact your administrator.',
                code='AUTH_CONFIGURATION_UNAVAILABLE',status_code=503) from error
        return AdminUser(
            id=row["id"],
            email=row["email"],
            password_hash=row["password_hash"],
            name=row["name"],
            role_id=row["role_id"],
            status=row["status"],
            totp_enabled=bool(row["totp_enabled"]),
            totp_secret=totp_secret,
            created_at=datetime.fromisoformat(row["created_at"]) if isinstance(row.get("created_at"), str) else datetime.now(timezone.utc),
            updated_at=datetime.fromisoformat(row["updated_at"]) if isinstance(row.get("updated_at"), str) else datetime.now(timezone.utc),
        )

    def list_all(self) -> List[AdminUser]:
        rows = admin_db.fetch_all("SELECT * FROM admin_users")
        return [self._row_to_model(r) for r in rows]

    def get_by_id(self, user_id: str) -> Optional[AdminUser]:
        row = admin_db.fetch_one("SELECT * FROM admin_users WHERE id = ?", (user_id,))
        return self._row_to_model(row) if row else None

    def get_by_email(self, email: str) -> Optional[AdminUser]:
        row = admin_db.fetch_one("SELECT * FROM admin_users WHERE LOWER(email) = ?", (email.lower().strip(),))
        return self._row_to_model(row) if row else None

    def save(self, user: AdminUser) -> AdminUser:
        now_iso = datetime.now(timezone.utc).isoformat()
        is_super = 1 if user.role_id == "role_super_admin" or getattr(user, "is_super_admin", False) else 0

        admin_db.execute(
            """
            INSERT OR REPLACE INTO admin_users 
            (id, email, password_hash, name, role_id, role_name, is_super_admin, totp_enabled, totp_secret, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user.id,
                user.email.lower().strip(),
                user.password_hash,
                user.name,
                user.role_id,
                "Super Admin" if is_super else "Staff",
                is_super,
                1 if user.totp_enabled else 0,
                seal_secret(user.totp_secret,user.id),
                user.status or "active",
                now_iso,
                now_iso,
            ),
        )
        return self.get_by_id(user.id) or user

    def create(self, email: str, password_hash: str, role_id: str, name: Optional[str] = None) -> AdminUser:
        # MAX(existing numeric suffix) + 1, not COUNT(rows) + 1 — a count-based
        # id is only safe if rows are never deleted. Once any row is removed
        # (e.g. staff removal, or just test cleanup), the count drops and a
        # freshly generated id can coincide with a still-existing row's id;
        # since `save()` does INSERT OR REPLACE keyed by id, that silently
        # overwrites the unrelated existing account (a real, observed bug —
        # a staff invite corrupted an unrelated super admin's row this way).
        max_num = 0
        for row in self.list_all():
            suffix = row.id.removeprefix("adm_")
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))
        user_id = f"adm_{max_num + 1:03d}"
        user = AdminUser(
            id=user_id,
            email=email,
            password_hash=password_hash,
            role_id=role_id,
            name=name,
            status="active",
        )
        return self.save(user)

    def update_password(self, email: str, new_password_hash: str) -> bool:
        account=self.get_by_email(email)
        if account:admin_db.execute('DELETE FROM admin_login_sessions WHERE admin_id=?',(account.id,))
        count = admin_db.execute(
            "UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE LOWER(email) = ?",
            (new_password_hash, datetime.now(timezone.utc).isoformat(), email.lower().strip()),
        )
        return count > 0

    def update_role(self, user_id: str, new_role_id: str) -> Optional[AdminUser]:
        now_iso = datetime.now(timezone.utc).isoformat()
        is_super = 1 if new_role_id == "role_super_admin" else 0
        admin_db.execute(
            "UPDATE admin_users SET role_id = ?, is_super_admin = ?, updated_at = ? WHERE id = ?",
            (new_role_id, is_super, now_iso, user_id),
        )
        return self.get_by_id(user_id)

    def update_name(self, user_id: str, new_name: str) -> Optional[AdminUser]:
        admin_db.execute(
            "UPDATE admin_users SET name = ?, updated_at = ? WHERE id = ?",
            (new_name, datetime.now(timezone.utc).isoformat(), user_id),
        )
        return self.get_by_id(user_id)

    def update_status(self, user_id: str, new_status: str) -> Optional[AdminUser]:
        """active | suspended | disabled — enforced at login (see auth.py's /login)."""
        admin_db.execute(
            "UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?",
            (new_status, datetime.now(timezone.utc).isoformat(), user_id),
        )
        return self.get_by_id(user_id)

    def force_totp_reenrollment(self, user_id: str) -> Optional[AdminUser]:
        """Clears the TOTP secret so the account must run through 2FA setup again."""
        admin_db.execute(
            "UPDATE admin_users SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), user_id),
        )
        return self.get_by_id(user_id)


admin_user_repository = AdminUserRepository()
