from shared.queue_auth import verified_job
import os
import asyncio
import hashlib
from bullmq import Worker, Queue
from posthog import Posthog
from dotenv import load_dotenv

load_dotenv()

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
posthog_api_key = os.getenv("POSTHOG_API_KEY", "phc_mock_key")
posthog_host = os.getenv("POSTHOG_HOST", "https://app.posthog.com")

# Initialize PostHog with explicit batching configuration
ph = Posthog(
    project_api_key=posthog_api_key,
    host=posthog_host,
    flush_at=100,  # Batch up to 100 events
    flush_interval=10  # Or flush every 10 seconds, whichever comes first
)

analytics_queue = Queue("analytics", {"connection": redis_url})

PII_FIELDS = {"email", "name", "first_name", "last_name", "phone", "address", "ip", "password"}


def anonymize_value(value):
    if isinstance(value, dict):
        return anonymize_properties(value)
    elif isinstance(value, list):
        return [anonymize_value(item) for item in value]
    return value


def anonymize_properties(properties: dict) -> dict:
    sanitized = {}
    for key, value in properties.items():
        if key.lower() in PII_FIELDS:
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = anonymize_value(value)
    return sanitized


async def process_event(job, job_token):
    try:
        data = verified_job("analytics",job)
        user_id = data.get("userId")
        event_name = data.get("eventName")
        properties = data.get("properties") or {}

        # PII Anonymization
        if data.get("anonymized"):
            if user_id:
                # Use a stable, cryptographic hash for userId, cast to str safely
                user_id = f"anon_{hashlib.sha256(str(user_id).encode()).hexdigest()[:16]}"
            properties = anonymize_properties(properties)

        final_user_id = str(user_id) if user_id else "anonymous"
        print(
            f"[PostHog Worker] Captured event '{event_name}' for user '{final_user_id}' ")

        ph.capture(
            distinct_id=final_user_id,
            event=event_name,
            properties=properties
        )
        return "success"
    except Exception as e:
        print(f"Error processing job {job.id}: {e}")
        raise e


async def start_posthog_worker():
    worker = Worker("analytics", process_event, {"connection": redis_url})
    print("PostHog worker started with batching enabled.")

    try:
        # Keep worker running
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        print("Worker shutting down. Flushing PostHog events...")
        ph.flush()
        await worker.close()