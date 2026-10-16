from datetime import datetime, timezone
from typing import Optional, Dict, Any
from app.db.admin_db import admin_db


class VerificationRepository:
    """Repository for managing active 6-digit password reset verification codes in the dedicated admin database."""

    def save_code(self, email: str, code: str, expires_at: datetime, purpose: str = "login"):
        email_clean = f"{purpose}:{email.lower().strip()}"
        expires_iso = expires_at.isoformat()
        admin_db.execute(
            """
            INSERT OR REPLACE INTO verification_codes (email, code, expires_at, attempts)
            VALUES (?, ?, ?, 0)
            """,
            (email_clean, code, expires_iso),
        )

    def get_code(self, email: str, purpose: str = "login") -> Optional[Dict[str, Any]]:
        email_clean = f"{purpose}:{email.lower().strip()}"
        row = admin_db.fetch_one("SELECT * FROM verification_codes WHERE LOWER(email) = ?", (email_clean,))
        if not row:
            return None
        return {
            "email": row["email"],
            "code": row["code"],
            "expires_at": datetime.fromisoformat(row["expires_at"]) if isinstance(row["expires_at"], str) else row["expires_at"],
        }

    def claim_attempt(self, email: str, purpose: str = "login") -> bool:
        """Atomically limit each persisted challenge to five verification attempts."""
        key = f"{purpose}:{email.lower().strip()}"
        return admin_db.execute(
            "UPDATE verification_codes SET attempts = attempts + 1 WHERE email = ? AND attempts < 5",
            (key,),
        ) == 1

    def consume_code(self, email: str, code: str, purpose: str = "login") -> bool:
        """Only one concurrent request can consume the observed challenge."""
        key = f"{purpose}:{email.lower().strip()}"
        return admin_db.execute("DELETE FROM verification_codes WHERE email = ? AND code = ?", (key, code)) == 1

    def delete_code(self, email: str, purpose: str = "login"):
        email_clean = f"{purpose}:{email.lower().strip()}"
        admin_db.execute("DELETE FROM verification_codes WHERE LOWER(email) = ?", (email_clean,))


verification_repository = VerificationRepository()
