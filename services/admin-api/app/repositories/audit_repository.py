import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.db.admin_db import admin_db
from app.models.audit_log import AuditLogEntry


class AuditRepository:
    """
    Immutable append-only repository for admin action and security event logging in the dedicated admin database.
    Strictly forbids update or deletion of records per NFR-ADM-06 and Tech Design §13.
    """

    def __init__(self):
        self._seed_initial_logs()

    def _seed_initial_logs(self):
        existing = self.get_by_id("audit_001")
        if not existing:
            self.append(AuditLogEntry(
                id="audit_001",
                admin_id="adm_001",
                admin_email="tech@senyxsoftware.com",
                action="system.bootstrap",
                module="system",
                ip_address="127.0.0.1",
                user_agent="DocCraft-System/1.0",
                totp_verified=True,
                details={"message": "Admin API control plane initialized"},
            ))

    def _row_to_model(self, row: dict) -> AuditLogEntry:
        details = json.loads(row.get("details_json", "{}")) if row.get("details_json") else {}
        created_at_val = row.get("created_at")
        if isinstance(created_at_val, str):
            try:
                dt = datetime.fromisoformat(created_at_val)
            except Exception:
                dt = datetime.now(timezone.utc)
        else:
            dt = datetime.now(timezone.utc)

        return AuditLogEntry(
            id=row["id"],
            admin_id=row.get("admin_id"),
            admin_email=row.get("admin_email"),
            action=row["action"],
            module=row["module"],
            ip_address=row.get("ip_address") or "127.0.0.1",
            user_agent="internal",
            totp_verified=bool(row.get("totp_verified", 0)),
            details=details,
            created_at=dt,
        )

    def append(self, entry: AuditLogEntry) -> AuditLogEntry:
        """Append an immutable audit log entry into the dedicated admin database."""
        now_iso = entry.created_at.isoformat() if entry.created_at else datetime.now(timezone.utc).isoformat()
        if not entry.id:
            entry.id = f"audit_{uuid.uuid4().hex[:12]}"

        details_json = json.dumps(entry.details or {})
        admin_db.execute(
            """
            INSERT INTO audit_logs 
            (id, admin_id, admin_email, module, action, target_id, details_json, ip_address, totp_verified, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.id,
                entry.admin_id,
                entry.admin_email,
                entry.module,
                entry.action,
                entry.details.get("target_id") if entry.details else None,
                details_json,
                entry.ip_address,
                1 if entry.totp_verified else 0,
                now_iso,
            ),
        )
        return entry

    def get_by_id(self, log_id: str) -> Optional[AuditLogEntry]:
        row = admin_db.fetch_one("SELECT * FROM audit_logs WHERE id = ?", (log_id,))
        return self._row_to_model(row) if row else None

    def get_all(self) -> List[AuditLogEntry]:
        """Fetch all immutable audit logs ordered by creation timestamp descending."""
        rows = admin_db.fetch_all("SELECT * FROM audit_logs ORDER BY created_at DESC")
        return [self._row_to_model(r) for r in rows]

    def get_latest_by_target(self, target_id: str, module: Optional[str] = None) -> Optional[AuditLogEntry]:
        """Fetch the most recent audit record touching a given target entity (e.g. a user id)."""
        if module:
            row = admin_db.fetch_one(
                "SELECT * FROM audit_logs WHERE target_id = ? AND module = ? ORDER BY created_at DESC LIMIT 1",
                (target_id, module),
            )
        else:
            row = admin_db.fetch_one(
                "SELECT * FROM audit_logs WHERE target_id = ? ORDER BY created_at DESC LIMIT 1",
                (target_id,),
            )
        return self._row_to_model(row) if row else None

    def search(
        self,
        admin_id: Optional[str] = None,
        admin_email: Optional[str] = None,
        module: Optional[str] = None,
        action: Optional[str] = None,
        ip_address: Optional[str] = None,
        totp_verified: Optional[bool] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """Search and filter audit logs from dedicated database with pagination."""
        rows = admin_db.fetch_all("SELECT * FROM audit_logs ORDER BY created_at DESC")
        results: List[AuditLogEntry] = [self._row_to_model(r) for r in rows]

        if admin_id:
            results = [r for r in results if r.admin_id and r.admin_id == admin_id]
        if admin_email:
            target = admin_email.lower().strip()
            results = [r for r in results if r.admin_email and target in r.admin_email.lower()]
        if module:
            target_mod = module.lower().strip()
            results = [r for r in results if r.module.lower() == target_mod]
        if action:
            target_act = action.lower().strip()
            results = [r for r in results if target_act in r.action.lower()]
        if ip_address:
            results = [r for r in results if r.ip_address == ip_address.strip()]
        if totp_verified is not None:
            results = [r for r in results if r.totp_verified == totp_verified]

        total_count = len(results)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_items = results[start_idx:end_idx]

        return {
            "items": paginated_items,
            "total": total_count,
            "page": page,
            "limit": limit,
            "total_pages": (total_count + limit - 1) // limit if limit > 0 else 1,
        }

    def update(self, *args, **kwargs):
        raise NotImplementedError("Audit records are immutable and cannot be updated.")

    def delete(self, *args, **kwargs):
        raise NotImplementedError("Audit records are immutable and cannot be deleted.")


audit_repository = AuditRepository()
