from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.core.exceptions import AppException


class DocumentServiceClient:
    """Async HTTP client for Document microservice."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.DOCUMENT_SERVICE_URL).rstrip("/")
        self.timeout = 10.0

    async def validate_template_html(self, html_content: str, sample_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Validate Jinja2 HTML template slot coverage."""
        url = f"{self.base_url}/templates/validate"
        payload = {"html_content": html_content, "sample_data": sample_data or {}}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                res = await client.post(url, json=payload)
                res.raise_for_status()
                return res.json()
            except httpx.HTTPError as exc:
                return {"valid": False, "slots": [], "error": "Document template validation unavailable"}
