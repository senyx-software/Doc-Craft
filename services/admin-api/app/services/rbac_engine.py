from typing import List, Optional
from app.core.redis import cache_manager
from app.repositories.admin_user_repository import admin_user_repository
from app.repositories.permission_repository import permission_repository
from app.repositories.role_repository import role_repository


class RBACEngine:
    """
    Central RBAC Engine owning permission resolution, caching, cache invalidation,
    and server-side authorization evaluation.
    """

    CACHE_TTL_SECONDS = 300  # 5-minute TTL

    def _cache_key_for_role(self, role_id: str) -> str:
        return f"rbac:permissions:role:{role_id}"

    def get_role_permissions(self, role_id: str, force_refresh: bool = False) -> List[str]:
        """
        Resolves permission strings ('module:action') for a role_id with Redis caching.
        Super Admin role returns wildcard ['*'].
        """
        role = role_repository.get_by_id(role_id)
        if not role:
            return []

        if role.id == "role_super_admin":
            return ["*"]

        cache_key = self._cache_key_for_role(role_id)
        if not force_refresh:
            cached = cache_manager.get(cache_key)
            if cached is not None and isinstance(cached, list):
                return [str(p) for p in cached]

        # Resolve from repository
        perm_keys: List[str] = []
        for perm_id in role.permission_ids:
            perm = permission_repository.get_by_id(perm_id)
            if perm:
                perm_keys.append(perm.permission_key)
            elif ":" in perm_id:
                perm_keys.append(perm_id.lower())

        # Store in Redis cache
        cache_manager.set(cache_key, perm_keys, ttl=self.CACHE_TTL_SECONDS)
        return perm_keys

    def invalidate_role_cache(self, role_id: Optional[str] = None) -> None:
        """
        Invalidates permission cache in Redis whenever a role's permissions are updated
        or when role assignment changes.
        """
        if role_id:
            cache_key = self._cache_key_for_role(role_id)
            cache_manager.delete(cache_key)
        else:
            cache_manager.invalidate_pattern("rbac:permissions:role:*")

    def resolve_user_permissions(self, user_id: str) -> List[str]:
        """Resolves active permissions for a user ID via their assigned role."""
        user = admin_user_repository.get_by_id(user_id)
        if not user:
            return []
        return self.get_role_permissions(user.role_id)

    def has_permission(self, role_name: str, permissions: List[str], module: str, action: str) -> bool:
        """
        Server-side permission evaluation logic.
        Super Admin role is unrestricted and bypasses all permission matrix checks.
        """
        if "*" in permissions:
            return True

        target_colon = f"{module}:{action}".lower()
        target_slash = f"{module}/{action}".lower()

        for p in permissions:
            p_lower = str(p).lower()
            if p_lower in [target_colon, target_slash, module.lower(), "*"]:
                return True

        return False


rbac_engine = RBACEngine()
