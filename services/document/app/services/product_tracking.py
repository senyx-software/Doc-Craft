from shared.service_auth import async_service_client
"""
product_tracking.py — reports real document-generation lifecycle events to
PostHog via the Analytics Service's /v1/analytics/event endpoint (the one
place holding the real API key — this service never talks to PostHog
directly). Fire-and-forget: a tracking failure must never affect, and a slow
Analytics Service must never block, a real PDF generation job.
"""
import asyncio
import os
import httpx

ANALYTICS_SERVICE_URL = os.getenv("ANALYTICS_SERVICE_URL", "http://localhost:3017")
INTERNAL_SERVICE_SECRET = os.getenv("INTERNAL_SERVICE_SECRET", "REPLACE_WITH_STRONG_RANDOM_SECRET")


async def _post_event(user_id: str, event_name: str, properties: dict) -> None:
    try:
        async with async_service_client("analytics", timeout=3.0) as client:
            await client.post(
                f"{ANALYTICS_SERVICE_URL}/v1/analytics/event",
                json={"userId": user_id, "eventName": event_name, "properties": properties},
                headers={"X-Internal-Secret": INTERNAL_SERVICE_SECRET},
            )
    except Exception as err:
        print(f"[pdf-worker] track_product_event('{event_name}') failed: {err}")


def track_product_event(user_id: str, event_name: str, properties: dict) -> None:
    """Never awaited by callers — schedules the report and returns immediately."""
    asyncio.ensure_future(_post_event(user_id, event_name, properties))
