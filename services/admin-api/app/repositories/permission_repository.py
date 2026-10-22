from typing import Dict, List, Optional
from app.models.permission import AdminPermission

SEED_PERMISSIONS = [
    AdminPermission(id="perm_users_view", module="users", action="view", description="View customer user accounts"),
    AdminPermission(id="perm_users_edit", module="users", action="edit", description="Edit customer profiles & quotas"),
    AdminPermission(id="perm_users_delete", module="users", action="delete", description="Ban or deactivate user accounts"),
    AdminPermission(id="perm_plans_view", module="plans", action="view", description="View plans & feature flags"),
    AdminPermission(id="perm_plans_create", module="plans", action="create", description="Create new plans"),
    AdminPermission(id="perm_plans_edit", module="plans", action="edit", description="Modify plan pricing & flags"),
    AdminPermission(id="perm_plans_delete", module="plans", action="delete", description="Archive plans"),
    AdminPermission(id="perm_templates_view", module="templates", action="view", description="View document templates"),
    AdminPermission(id="perm_templates_create", module="templates", action="create", description="Create template versions"),
    AdminPermission(id="perm_templates_approve", module="templates", action="approve", description="Publish templates"),
    AdminPermission(id="perm_rbac_view", module="rbac", action="view", description="View roles & admin staff"),
    AdminPermission(id="perm_rbac_create", module="rbac", action="create", description="Create roles & invite staff"),
    AdminPermission(id="perm_rbac_edit", module="rbac", action="edit", description="Modify role permissions & staff"),
    AdminPermission(id="perm_rbac_delete", module="rbac", action="delete", description="Delete custom roles"),
    AdminPermission(id="perm_automation_view", module="automation", action="view", description="View automation rules"),
    AdminPermission(id="perm_automation_edit", module="automation", action="edit", description="Modify automation rules"),
    AdminPermission(id="perm_analytics_view", module="analytics", action="view", description="View financial analytics"),
    AdminPermission(id="perm_support_view", module="support", action="view", description="View support & chat logs"),
]


# Expose scopes already enforced by routes so custom roles can actually grant them.
for _module, _action in [
    ("settings", "view"), ("settings", "edit"), ("settings", "delete"),
    ("analytics", "edit"), ("rbac", "manage"), ("support", "edit"),
    ("automation", "create"), ("automation", "delete"),
    ("ai_settings", "view"), ("ai_models", "edit"), ("ai_assignments", "edit"),
    ("ai_credentials", "manage"), ("ai_routing", "edit"), ("ai_usage", "view"),
    ("ai_deployments", "manage"),
]:
    SEED_PERMISSIONS.append(AdminPermission(
        id=f"perm_{_module}_{_action}", module=_module, action=_action,
        description=f"{_action.title()} {_module} operations",
    ))


class PermissionRepository:
    """Repository for querying the system permission catalogue."""

    def __init__(self):
        self._permissions: Dict[str, AdminPermission] = {p.id: p for p in SEED_PERMISSIONS}

    def list_all(self) -> List[AdminPermission]:
        return list(self._permissions.values())

    def get_by_id(self, permission_id: str) -> Optional[AdminPermission]:
        return self._permissions.get(permission_id)

    def get_by_module_action(self, module: str, action: str) -> Optional[AdminPermission]:
        target = f"{module}:{action}".lower()
        for p in self._permissions.values():
            if p.permission_key == target:
                return p
        return None


permission_repository = PermissionRepository()
