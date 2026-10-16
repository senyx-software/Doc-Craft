"""
automation_worker.py — Asyncio-based automation queue worker.

Architecture:
  - BLPOP `automation:queue` with 5s timeout (non-blocking, respects graceful shutdown)
  - Concurrency capped via asyncio.Semaphore (default: 5 parallel jobs)
  - Retry policy: up to rule.retry_limit attempts with exponential back-off
    - Delays: 0.5s → 1s → 2s … (capped at 30s)
  - On exhaustion: job moved to `automation:dlq`, log updated to DEAD_LETTER status

The worker is started as an asyncio background Task in main.py lifespan and
cancelled gracefully on shutdown.
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

logger = logging.getLogger("automation_worker")

_STOP_SIGNAL = asyncio.Event() if True else None  # declared at import time; reset in run_worker


class AutomationWorker:
    """Async automation job worker backed by Redis queue + retries + DLQ."""

    def __init__(self, redis_url: str, concurrency: int = 5) -> None:
        self._redis_url = redis_url
        self._concurrency = concurrency
        self._semaphore: asyncio.Semaphore | None = None
        self._stop = asyncio.Event()
        self._running=set()

    async def start(self) -> None:
        """
        Main loop:
          - BLPOP jobs from `automation:queue`
          - Dispatch each job concurrently (capped at _concurrency)
          - Retry + dead-letter on failure
        """
        try:
            import redis.asyncio as aioredis
        except ImportError:
            logger.warning("[AutomationWorker] redis package not installed. Worker disabled.")
            return

        from app.queues.bullmq import AutomationQueue
        from app.repositories.automation_repository import automation_repository
        from app.services.automation_engine import AutomationEngine

        engine = AutomationEngine()
        queue = AutomationQueue(self._redis_url)
        self._semaphore = asyncio.Semaphore(self._concurrency)

        logger.info(f"[AutomationWorker] Worker started (concurrency={self._concurrency})")

        while not self._stop.is_set():
            try:
                # Non-blocking poll with 5s timeout — lets the loop check the stop signal
                loop = asyncio.get_running_loop()
                job = await loop.run_in_executor(None, lambda: queue.blpop(timeout=5))

                if job is None:
                    continue  # Timeout — loop again

                # Process job concurrently, respecting the semaphore
                task=asyncio.create_task(self._process_job(job, engine, queue, automation_repository))
                self._running.add(task)
                task.add_done_callback(self._running.discard)

            except Exception as exc:
                logger.error(f"[AutomationWorker] Error in main loop: {exc}")
                await asyncio.sleep(1)

        if self._running:await asyncio.gather(*self._running,return_exceptions=True)
        queue.close()
        logger.info("[AutomationWorker] Worker stopped.")

    def stop(self) -> None:
        self._stop.set()

    async def _process_job(self, job: Dict[str, Any], engine, queue, repo) -> None:
        """Execute a single job with retry + dead-letter handling."""
        assert self._semaphore is not None
        async with self._semaphore:
            job_id = job.get("id", f"job_{uuid.uuid4().hex[:8]}")
            rule_id = job.get("rule_id", "unknown")
            trigger_event = job.get("trigger_event", "unknown")
            payload = job.get("payload", {})
            attempt = int(job.get("attempt", 0))

            logger.info(f"[AutomationWorker] Processing job={job_id} rule={rule_id} event={trigger_event} attempt={attempt}")

            rule = repo.get_rule_by_id(rule_id)
            if rule is None:
                logger.warning(f"[AutomationWorker] Rule '{rule_id}' not found — skipping job {job_id}")
                return

            # Evaluate conditions
            all_passed, _ = engine.evaluate_all_conditions(rule.conditions, payload)
            if not all_passed:
                logger.info(f"[AutomationWorker] Rule '{rule_id}' conditions not met for event '{trigger_event}' — skipping.")
                return

            # Execute actions
            t_start = time.monotonic()
            all_success = True
            action_results = []
            error_msg = None

            for action in rule.actions:
                try:
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        None, lambda a=action: engine.execute_action(a, payload, dry_run=False)
                    )
                    action_results.append(result)
                    if result.get("status") != "success":
                        all_success = False
                        error_msg = result.get("error", "Action failed")
                except Exception as exc:
                    all_success = False
                    error_msg = str(exc)
                    action_results.append({"action_type": action.action_type.value, "status": "failed", "error": str(exc)})

            duration_ms = int((time.monotonic() - t_start) * 1000)

            if all_success:
                logger.info(f"[AutomationWorker] job={job_id} completed in {duration_ms}ms")
            else:
                max_retries = rule.retry_limit
                if attempt < max_retries:
                    # Re-enqueue with incremented attempt count
                    delay_s = min((2 ** (attempt + 1)) * 0.5, 30.0)
                    logger.warning(
                        f"[AutomationWorker] job={job_id} failed (attempt {attempt + 1}/{max_retries + 1}). "
                        f"Re-enqueuing in {delay_s:.1f}s…"
                    )
                    await asyncio.sleep(delay_s)
                    job["attempt"] = attempt + 1
                    try:
                        import redis as syncredis
                        r = syncredis.from_url(self._redis_url, decode_responses=True)
                        r.lpush("automation:queue", json.dumps(job))
                        r.close()
                    except Exception as exc:
                        logger.error(f"[AutomationWorker] Failed to re-enqueue job: {exc}")
                else:
                    # Exhausted retries → dead-letter
                    logger.error(
                        f"[AutomationWorker] job={job_id} exhausted {max_retries} retries → DEAD_LETTER"
                    )
                    queue.send_to_dlq(job, reason=error_msg or "Retries exhausted")


automation_worker = AutomationWorker(
    redis_url="redis://localhost:6379",  # overridden in main.py with settings.REDIS_URL
    concurrency=5,
)
