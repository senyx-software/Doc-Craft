"""
events.py — Redis pub/sub event subscriber for the Automation Engine.

Subscribes to the `doccraft:events` channel on startup.
Any message received is decoded and dispatched to the automation engine as a domain event.

Message format expected from other microservices:
  {
    "event":   "quota.warning",
    "payload": { "user_id": "usr_01", "used_quota": 5, ... }
  }

This module is started as an asyncio background task in main.py.
It is gracefully tolerant if Redis is unavailable (warns and exits silently).
"""

import asyncio
import json
import logging

logger = logging.getLogger("automation_events")

CHANNEL = "doccraft:events"


async def run_event_subscriber(redis_url: str) -> None:
    """
    Async event loop that subscribes to `doccraft:events` on the given Redis URL
    and dispatches matching messages to automation_engine.process_event().

    Automatically reconnects on transient failures.
    """
    # Late import to keep startup fast if redis not installed
    try:
        import redis.asyncio as aioredis
    except ImportError:
        logger.warning("[EventSubscriber] redis package not installed. Event subscriber disabled.")
        return

    # Lazy import engine here to avoid circular imports
    from app.services.automation_engine import automation_engine

    reconnect_delay = 5  # seconds between reconnect attempts

    while True:
        client=None;pubsub=None
        try:
            client = aioredis.from_url(redis_url, decode_responses=True)
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            logger.info(f"[EventSubscriber] Subscribed to '{CHANNEL}'")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                try:
                    from shared.event_auth import verified_event
                    trigger_event, payload = await verified_event(message["data"])

                    logger.info(f"[EventSubscriber] Processing event '{trigger_event}' from Redis pub/sub")

                    # Run in thread pool executor to avoid blocking the event loop
                    # (automation_engine.process_event uses sync httpx)
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(
                        None, automation_engine.process_event, trigger_event, payload
                    )

                except json.JSONDecodeError as exc:
                    logger.error(f"[EventSubscriber] Failed to parse message JSON: {exc}")
                except Exception as exc:
                    logger.error(f"[EventSubscriber] Unhandled error processing event: {exc}")

        except Exception as exc:
            logger.warning(f"[EventSubscriber] Redis connection error: {exc}. Reconnecting in {reconnect_delay}s…")
            await asyncio.sleep(reconnect_delay)

        finally:
            if pubsub:await pubsub.aclose()
            if client:await client.aclose()
