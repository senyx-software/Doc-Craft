from shared.service_auth import async_service_client
import json
import logging
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.core.redis import cache_manager

logger = logging.getLogger("SharedConfigClient")


class SharedConfigClient:
    """
    Shared Config-Client used by consuming services (Gateway, Auth, Chat, Quota, Payment, Document)
    to access dynamic configuration without ever reading Admin's database directly.
    
    Implements 3-tier read strategy:
      Tier 1: Local memory LRU cache
      Tier 2: Redis cache
      Tier 3: admin-api internal HTTP endpoint fallback (GET /api/v1/internal/config/{domain})
      
    Subscribes to Redis Pub/Sub channel 'config_invalidation' to evict local memory cache sub-second.
    """

    PUB_SUB_CHANNEL = "config_invalidation"

    def __init__(self, admin_api_url: Optional[str] = None):
        self.admin_api_url = (admin_api_url or f"http://localhost:{settings.PORT}").rstrip("/")
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self.timeout = 5.0

        # Subscribe to Pub/Sub invalidation events
        cache_manager.subscribe(self.PUB_SUB_CHANNEL, self._on_invalidation_event)

    def _on_invalidation_event(self, message_str: str) -> None:
        """Callback invoked when admin-api publishes config invalidation event."""
        try:
            event_data = json.loads(message_str)
            domain = event_data.get("domain")
            if domain and domain in self._memory_cache:
                logger.info(f"Invalidating local memory cache for domain: {domain}")
                del self._memory_cache[domain]
            elif not domain:
                self._memory_cache.clear()
        except Exception as e:
            logger.warning(f"Error handling config Pub/Sub invalidation event: {str(e)}")

    async def get_config(self, domain: str) -> Dict[str, Any]:
        """
        Fetch domain configuration object via 3-tier strategy.
        Guarantees consuming microservices never query Admin DB directly.
        """
        domain_clean = domain.lower().strip()

        # Tier 1: Local memory cache
        if domain_clean in self._memory_cache:
            return self._memory_cache[domain_clean]

        # Tier 2: Redis cache
        cache_key = f"config:domain:{domain_clean}"
        redis_data = cache_manager.get(cache_key)
        if redis_data is not None and isinstance(redis_data, dict):
            payload = redis_data.get("data", {})
            self._memory_cache[domain_clean] = payload
            return payload

        # Tier 3: HTTP fallback call to admin-api internal read endpoint
        url = f"{self.admin_api_url}/api/v1/internal/config/{domain_clean}"
        async with async_service_client("admin-api", timeout=self.timeout) as client:
            try:
                res = await client.get(url, headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET})
                if res.status_code == 200:
                    body = res.json()
                    payload = body.get("data", {})
                    # Populate memory & Redis
                    self._memory_cache[domain_clean] = payload
                    cache_manager.set(cache_key, body, ttl=300)
                    return payload
            except Exception as exc:
                logger.error(f"Failed to fetch config for domain '{domain_clean}' from admin-api: {str(exc)}")

        # Fallback to local config engine in-process
        try:
            from app.services.config_engine import config_engine
            fallback_entry = config_engine.get_domain_config(domain_clean)
            if fallback_entry:
                self._memory_cache[domain_clean] = fallback_entry.data
                return fallback_entry.data
        except Exception:
            pass

        return {}

    async def is_feature_enabled(self, feature_key: str, plan_key: Optional[str] = None) -> bool:
        """Check if a feature flag is enabled globally or for a specific plan."""
        flags_config = await self.get_config("feature_flags")
        flag_info = flags_config.get(feature_key)
        if not flag_info:
            return False

        if plan_key and "plan_matrix" in flag_info:
            return bool(flag_info["plan_matrix"].get(plan_key.lower(), flag_info.get("default", False)))

        return bool(flag_info.get("default", False))

    async def is_mcp_tool_enabled(self, tool_name: str) -> bool:
        """Check if a Chat MCP tool is enabled via Admin config kill-switch."""
        mcp_config = await self.get_config("chat_mcp_tools")
        tool_info = mcp_config.get(tool_name)
        if not tool_info:
            return True  # Default enabled if unconfigured
        return bool(tool_info.get("enabled", True))


shared_config_client = SharedConfigClient()
