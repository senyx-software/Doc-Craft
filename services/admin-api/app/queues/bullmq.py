"""
bullmq.py — Redis-backed automation job queue (BullMQ-compatible semantic for Python).

Architecture:
  - Queue: Redis List `automation:queue` (LPUSH → BLPOP / LRANGE)
  - Dedup:  Redis SET  `automation:dedup:<idempotency_key>` (24h TTL)
  - DLQ:    Redis List `automation:dlq` (jobs that exhausted retries)

Job format:
  {
    "id":          "job_<uuid>",
    "rule_id":     "<rule-id>",
    "trigger_event": "quota.warning",
    "payload":     { ... },
    "enqueued_at": "2026-01-01T00:00:00Z",
    "attempt":     0
  }
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    import redis

    _redis_available = True
except ImportError:
    _redis_available = False

QUEUE_KEY = "automation:queue"
DLQ_KEY = "automation:dlq"
_DEDUP_TTL_S = 86_400  # 24 hours


class AutomationQueue:
    """Thin wrapper around a Redis List that provides BullMQ-like job queue semantics."""

    def __init__(self, redis_url: str = "redis://localhost:6379") -> None:
        self._redis_url = redis_url
        self._client: Optional[Any] = None
        self._connected = False

        if _redis_available:
            try:
                from redis.retry import Retry
                from redis.backoff import NoBackoff
                self._client = redis.from_url(redis_url,decode_responses=True,socket_connect_timeout=2,socket_timeout=8,retry=Retry(NoBackoff(),0))
                self._client.ping()
                self._connected = True
                print("[AutomationQueue] Connected to configured Redis endpoint")
            except Exception as exc:
                print(f"[AutomationQueue] Redis unavailable ({exc}). Queue disabled — engine will run synchronously.")

    def close(self):
        self._connected=False
        if self._client:self._client.close()

    @property
    def is_connected(self) -> bool:
        return self._connected and self._client is not None

    # ── Enqueue ──────────────────────────────────────────────────────────────

    def enqueue(
        self,
        rule_id: str,
        trigger_event: str,
        payload: Dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> Optional[str]:
        """
        Push a new job onto the queue.

        Returns the job ID, or None if deduplication detected a duplicate or Redis is unavailable.
        """
        if not self.is_connected:
            return None

        # Deduplication
        if idempotency_key:
            dedup_key = f"automation:dedup:{idempotency_key}"
            is_new = self._client.set(dedup_key, "1", nx=True, ex=_DEDUP_TTL_S)
            if not is_new:
                return None  # Duplicate — skip

        job_id = f"job_{uuid.uuid4().hex[:12]}"
        job = {
            "id": job_id,
            "rule_id": rule_id,
            "trigger_event": trigger_event,
            "payload": payload,
            "enqueued_at": datetime.now(timezone.utc).isoformat(),
            "attempt": 0,
        }
        self._client.lpush(QUEUE_KEY, json.dumps(job))
        return job_id

    # ── Blocking Pop (used by worker) ─────────────────────────────────────────

    def blpop(self, timeout: int = 5) -> Optional[Dict[str, Any]]:
        """
        Blocking right-pop from the queue.
        Returns a parsed job dict, or None on timeout.
        """
        if not self.is_connected:
            return None
        result = self._client.brpop(QUEUE_KEY, timeout=timeout)
        if result is None:
            return None
        _, raw = result
        return json.loads(raw)

    # ── Dead-Letter Queue ─────────────────────────────────────────────────────

    def send_to_dlq(self, job: Dict[str, Any], reason: str) -> None:
        """Push a failed job onto the DLQ for later inspection."""
        if not self.is_connected:
            return
        job["dlq_reason"] = reason
        job["dlq_at"] = datetime.now(timezone.utc).isoformat()
        self._client.lpush(DLQ_KEY, json.dumps(job))

    def list_dlq(self, limit: int = 100) -> List[Dict[str, Any]]:
        if not self.is_connected:
            return []
        items = self._client.lrange(DLQ_KEY, 0, limit - 1)
        return [json.loads(i) for i in items]

    def list_queue(self, limit: int = 100) -> List[Dict[str, Any]]:
        if not self.is_connected:
            return []
        items = self._client.lrange(QUEUE_KEY, 0, limit - 1)
        return [json.loads(i) for i in items]

    def queue_length(self) -> int:
        if not self.is_connected:
            return 0
        return self._client.llen(QUEUE_KEY)

    def dlq_length(self) -> int:
        if not self.is_connected:
            return 0
        return self._client.llen(DLQ_KEY)
