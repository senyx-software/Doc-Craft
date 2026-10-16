import json
from datetime import datetime, timezone
from typing import List, Optional
from app.db.admin_db import admin_db
from app.models.role import AdminRole
from app.repositories.permission_repository import permission_repository

SEED_ROLES = [
    AdminRole(
        id="role_super_admin",
        name="Super Admin",
        description="Unrestricted platform control plane access",
        is_custom=False,
        permission_ids=[p.id for p in permission_repository.list_all()],
    ),
    AdminRole(
        id="role_admin",
        name="Admin",
        description="Standard operational management role",
        is_custom=False,
        permission_ids=["perm_users_view", "perm_users_edit", "perm_plans_view", "perm_templates_view", "perm_rbac_view"],
    ),
    AdminRole(
        id="role_finance_staff",
        name="Finance Staff",
        description="Financial reporting & plan viewing",
        is_custom=False,
        permission_ids=["perm_plans_view", "perm_analytics_view"],
    ),
    AdminRole(
        id="role_support_staff",
        name="Support Staff",
        description="Customer support & ticket inspection",
        is_custom=False,
        permission_ids=["perm_users_view", "perm_support_view"],
    ),
]


class RoleRepository:
    """Repository for managing admin roles in the dedicated admin database."""

    def __init__(self):
        self._seed_default_roles()

    def _seed_default_roles(self):
        for role in SEED_ROLES:
            existing = self.get_by_id(role.id)
            if not existing:
                self.create(
                    name=role.name,
                    description=role.description,
                    permission_ids=role.permission_ids,
                    role_id=role.id,
                    is_custom=role.is_custom,
                )

    def _row_to_model(self, row: dict) -> AdminRole:
        perms = json.loads(row.get("permissions_json", "[]"))
        return AdminRole(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            is_custom=bool(row["is_custom"]),
            permission_ids=perms,
            created_at=datetime.fromisoformat(row["created_at"]) if isinstance(row.get("created_at"), str) else datetime.now(timezone.utc),
        )

    def list_all(self) -> List[AdminRole]:
        rows = admin_db.fetch_all("SELECT * FROM admin_roles")
        return [self._row_to_model(r) for r in rows]

    def get_by_id(self, role_id: str) -> Optional[AdminRole]:
        row = admin_db.fetch_one("SELECT * FROM admin_roles WHERE id = ?", (role_id,))
        return self._row_to_model(row) if row else None

    def get_by_name(self, name: str) -> Optional[AdminRole]:
        row = admin_db.fetch_one("SELECT * FROM admin_roles WHERE LOWER(name) = ?", (name.lower().strip(),))
        return self._row_to_model(row) if row else None

    def create(
        self,
        name: str,
        description: Optional[str],
        permission_ids: List[str],
        role_id: Optional[str] = None,
        is_custom: bool = True,
    ) -> AdminRole:
        r_id = role_id or f"role_{name.lower().replace(' ', '_')}"
        now_iso = datetime.now(timezone.utc).isoformat()
        perms_json = json.dumps(permission_ids)

        admin_db.execute(
            """
            INSERT OR REPLACE INTO admin_roles (id, name, description, is_custom, permissions_json, assigned_staff_count, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """,
            (r_id, name, description, 1 if is_custom else 0, perms_json, now_iso),
        )
        return AdminRole(
            id=r_id,
            name=name,
            description=description,
            is_custom=is_custom,
            permission_ids=permission_ids,
        )

    def update(
        self,
        role_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        permission_ids: Optional[List[str]] = None,
    ) -> Optional[AdminRole]:
        role = self.get_by_id(role_id)
        if not role:
            return None

        new_name = name or role.name
        new_desc = description if description is not None else role.description
        new_perms = permission_ids if permission_ids is not None else role.permission_ids
        perms_json = json.dumps(new_perms)

        admin_db.execute(
            """
            UPDATE admin_roles
            SET name = ?, description = ?, permissions_json = ?
            WHERE id = ?
            """,
            (new_name, new_desc, perms_json, role_id),
        )
        return self.get_by_id(role_id)

    def delete(self, role_id: str) -> bool:
        count = admin_db.execute("DELETE FROM admin_roles WHERE id = ?", (role_id,))
        return count > 0


role_repository = RoleRepository()
