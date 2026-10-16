import time
import json
import threading
from typing import Any, Dict, Optional, List, Callable

try:
    import redis as redis_lib
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

from app.core.config import settings


class MemoryCacheStore:
    """In-memory cache fallback store with Pub/Sub support."""

    def __init__(self):
        self._store: Dict[str, Any] = {}
        self._ttl: Dict[str, float] = {}
        self._subscribers: Dict[str, List[Callable[[str], None]]] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            if key in self._ttl and time.time() > self._ttl[key]:
                del self._store[key]
                del self._ttl[key]
                return None
            return self._store[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = 300) -> None:
        self._store[key] = value
        if ttl:
            self._ttl[key] = time.time() + ttl
        elif key in self._ttl:
            del self._ttl[key]

    def delete(self, key: str) -> None:
        self._store.pop(key, None)
        self._ttl.pop(key, None)

    def delete_pattern(self, pattern: str) -> int:
        """Evict all keys matching pattern (e.g. 'rbac:permissions:*')."""
        prefix = pattern.replace("*", "")
        keys_to_del = [k for k in self._store.keys() if k.startswith(prefix)]
        for k in keys_to_del:
            self.delete(k)
        return len(keys_to_del)

    def publish(self, channel: str, message: str) -> int:
        """Publish message to in-memory channel subscribers."""
        subs = self._subscribers.get(channel, [])
        for callback in subs:
            try:
                callback(message)
            except Exception:
                pass
        return len(subs)

    def subscribe(self, channel: str, callback: Callable[[str], None]) -> None:
        """Subscribe callback function to channel events."""
        if channel not in self._subscribers:
            self._subscribers[channel] = []
        self._subscribers[channel].append(callback)

    def clear(self) -> None:
        self._store.clear()
        self._ttl.clear()


class RedisCacheManager:
    """
    Cache manager backed by real Redis — the SAME Redis instance the Node
    services (Gateway, Quota, Payment) connect to via ioredis, so a value
    admin-api writes here (e.g. config:domain:plans, quota:plan:{code}) is
    actually visible to them, and config_invalidation pub/sub events actually
    reach their subscribers.

    Falls back to an in-process MemoryCacheStore if Redis is unreachable, so
    admin-api keeps working (single-process only — no cross-service or
    cross-worker visibility in that mode) rather than hard-failing. Every
    Redis call uses a short socket timeout so a stalled Redis can't block
    this process's request handling for long.
    """

    def __init__(self):
        self._fallback = MemoryCacheStore()
        self._client: Optional["redis_lib.Redis"] = None
        self._pubsub_threads: List[threading.Thread] = []

        if HAS_REDIS:
            try:
                client = redis_lib.Redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2,
                )
                client.ping()
                self._client = client
                print("[cache_manager] Connected to configured Redis endpoint")
            except Exception as e:
                print(f"[cache_manager] Redis unavailable ({e}) — falling back to in-memory cache")
        else:
            print("[cache_manager] 'redis' package not installed — falling back to in-memory cache")

    @staticmethod
    def _encode(value: Any) -> str:
        return value if isinstance(value, str) else json.dumps(value)

    @staticmethod
    def _decode(raw: Optional[str]) -> Optional[Any]:
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return raw

    def get(self, key: str) -> Optional[Any]:
        if self._client is not None:
            try:
                return self._decode(self._client.get(key))
            except Exception as e:
                print(f"[cache_manager] GET '{key}' failed ({e}) — falling back to in-memory cache")
        return self._decode(self._fallback.get(key))

    def set(self, key: str, value: Any, ttl: Optional[int] = 300) -> None:
        encoded = self._encode(value)
        if self._client is not None:
            try:
                self._client.set(key, encoded, ex=ttl if ttl else None)
                return
            except Exception as e:
                print(f"[cache_manager] SET '{key}' failed ({e}) — falling back to in-memory cache")
        self._fallback.set(key, encoded, ttl=ttl)

    def delete(self, key: str) -> None:
        if self._client is not None:
            try:
                self._client.delete(key)
                return
            except Exception as e:
                print(f"[cache_manager] DELETE '{key}' failed ({e}) — falling back to in-memory cache")
        self._fallback.delete(key)

    def invalidate_pattern(self, pattern: str) -> int:
        if self._client is not None:
            try:
                keys = list(self._client.scan_iter(match=pattern, count=200))
                return self._client.delete(*keys) if keys else 0
            except Exception as e:
                print(f"[cache_manager] invalidate_pattern '{pattern}' failed ({e}) — falling back to in-memory cache")
        return self._fallback.delete_pattern(pattern)

    def publish(self, channel: str, message: str) -> int:
        if self._client is not None:
            try:
                return self._client.publish(channel, message)
            except Exception as e:
                print(f"[cache_manager] publish to '{channel}' failed ({e}) — falling back to in-memory cache")
        return self._fallback.publish(channel, message)

    def subscribe(self, channel: str, callback: Callable[[str], None]) -> None:
        """
        Subscribe a Python-side callback to a Redis pub/sub channel.
        Runs a dedicated background thread (redis-py's sync client blocks on
        pubsub.listen()), so this never runs on — or blocks — the event loop.
        """
        if self._client is not None:
            try:
                pubsub = self._client.pubsub()
                pubsub.subscribe(channel)

                def _listen() -> None:
                    for message in pubsub.listen():
                        if message.get("type") == "message":
                            try:
                                callback(message["data"])
                            except Exception as cb_err:
                                print(f"[cache_manager] subscriber callback error on '{channel}': {cb_err}")

                thread = threading.Thread(target=_listen, daemon=True, name=f"redis-subscriber-{channel}")
                thread.start()
                self._pubsub_threads.append(thread)
                return
            except Exception as e:
                print(f"[cache_manager] subscribe to '{channel}' failed ({e}) — falling back to in-memory cache")
        self._fallback.subscribe(channel, callback)


cache_manager = RedisCacheManager()
