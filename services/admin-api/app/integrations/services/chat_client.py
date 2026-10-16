from shared.service_auth import service_request
"""
chat_client.py — Admin-API HTTP client for the Chat/AI Service.

Currently used only to report whether the service's own third-party
secrets (e.g. Anthropic) are configured, for the admin API-Keys status
view. Never returns or forwards the real secret values.
"""
import os
from typing import Any, Dict

import httpx

from app.core.config import settings

CHAT_SERVICE_URL = os.getenv("CHAT_SERVICE_URL", settings.CHAT_SERVICE_URL)
INTERNAL_SECRET  = os.getenv("INTERNAL_SERVICE_SECRET", settings.INTERNAL_SERVICE_SECRET)
TIMEOUT          = 5.0  # seconds


class ChatServiceClient:
    def __init__(self, base_url: str = CHAT_SERVICE_URL):
        self.base_url = base_url.rstrip("/")

    def get_key_status(self) -> Dict[str, Any]:
        url = f"{self.base_url}/api/internal/status/keys"
        try:
            resp = service_request("chat", "GET", url, headers={"X-Internal-Secret": INTERNAL_SECRET}, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            raise RuntimeError(f"[chat_client] Request failed: {e}") from e


chat_client = ChatServiceClient()
