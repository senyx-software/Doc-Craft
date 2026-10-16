from shared.service_auth import async_service_client
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.core.exceptions import AppException


class NotificationServiceClient:
    """Async HTTP client for Notification microservice."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.NOTIFICATION_SERVICE_URL).rstrip("/")
        self.timeout = 10.0

    async def send_staff_invite_email(self, email: str, invite_link: str, role_name: str) -> Dict[str, Any]:
        """Dispatch staff invitation email."""
        url = f"{self.base_url}/notification/send"
        payload = {
            "email": email,
            "userId": "staff-invite",
            "type": "admin_staff_invite",
            "payload": {"email": email, "invite_link": invite_link, "role_name": role_name},
        }
        async with async_service_client("notification", timeout=self.timeout) as client:
            try:
                res = await client.post(url, json=payload)
                if res.status_code < 300:
                    return res.json()
                return {"sent": False, "status": res.status_code}
            except httpx.HTTPError:
                return {"sent": False, "status": "failed"}
