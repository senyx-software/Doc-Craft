import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.redis import cache_manager
from app.models.config import ConfigEntry, ConfigInvalidationEvent, ConfigVersionHistory
from app.repositories.config_repository import config_repository


class ConfigEngine:
    """
    Central Dynamic Configuration Engine owning configuration storage, versioning,
    Redis caching, and Redis Pub/Sub invalidation broadcasting.
    """

    CACHE_TTL_SECONDS = 300  # 5-minute TTL backstop
    PUB_SUB_CHANNEL = "config_invalidation"

    def _cache_key_for_domain(self, domain: str) -> str:
        return f"config:domain:{domain.lower().strip()}"

    def get_domain_config(self, domain: str, force_refresh: bool = False) -> Optional[ConfigEntry]:
        """Fetch active configuration for a domain with Redis caching."""
        domain_clean = domain.lower().strip()
        cache_key = self._cache_key_for_domain(domain_clean)

        if not force_refresh:
            cached_data = cache_manager.get(cache_key)
            if cached_data is not None and isinstance(cached_data, dict):
                return ConfigEntry(**cached_data)

        # Cache miss or forced refresh: query repository
        entry = config_repository.get_domain_config(domain_clean)
        if entry:
            # Store in Redis
            cache_manager.set(cache_key, entry.model_dump(mode="json"), ttl=self.CACHE_TTL_SECONDS)
        return entry

    def update_domain_config(self, domain: str, data: Dict[str, Any], admin_id: str, expected_version: Optional[int] = None) -> ConfigEntry:
        """
        Updates domain configuration payload, increments version tag, records history,
        updates Redis cache, and broadcasts Pub/Sub invalidation event.
        """
        domain_clean = domain.lower().strip()
        
        # 1. Write to repository & increment version
        updated_entry = config_repository.update_domain_config(domain_clean, data, admin_id, **({'expected_version': expected_version} if expected_version is not None else {}))

        # 2. Update Redis Cache
        cache_key = self._cache_key_for_domain(domain_clean)
        cache_manager.set(cache_key, updated_entry.model_dump(mode="json"), ttl=self.CACHE_TTL_SECONDS)

        # 3. Broadcast Pub/Sub Invalidation Event
        event = ConfigInvalidationEvent(
            domain=domain_clean,
            version=updated_entry.version,
            timestamp=datetime.now(timezone.utc).timestamp(),
        )
        cache_manager.publish(self.PUB_SUB_CHANNEL, json.dumps(event.model_dump()))

        return updated_entry

    def get_version_history(self, domain: str) -> List[ConfigVersionHistory]:
        """Fetch version audit history for a domain."""
        return config_repository.get_version_history(domain)


config_engine = ConfigEngine()
