from shared.service_auth import async_service_client
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.core.exceptions import AppException, ForbiddenException


class ReadOnlyChatMCPClient:
    """
    Read-only MCP client for admin-api to inspect live chat session resources
    for the Support module (FR-ADM-59, Tech Design §3.5).
    Code-restricted to resources/read only — cannot call mutating tools.
    """

    def __init__(self, mcp_url: Optional[str] = None):
        self.mcp_url = (mcp_url or settings.CHAT_SERVICE_MCP_URL).rstrip("/")
        self.timeout = 10.0

    async def inspect_chat_session_resource(self, session_id: str, admin_jwt: str) -> Dict[str, Any]:
        """Read live chat session state via MCP resources/read transport."""
        # RBAC is enforced by the admin endpoint. The user-session SSE endpoint
        # deliberately does not accept administrator JWTs.
        headers = {"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET, "Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        payload = {
            "jsonrpc": "2.0",
            "method": "resources/read",
            "params": {"uri": f"chat://sessions/{session_id}"},
            "id": 1,
        }
        async with async_service_client("chat", timeout=self.timeout) as client:
            try:
                init = await client.post(self.mcp_url, headers=headers, json={
                    "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {
                        "protocolVersion": "2025-03-26", "capabilities": {},
                        "clientInfo": {"name": "doccraft-admin-support", "version": "1.0.0"},
                    },
                })
                init.raise_for_status()
                headers["MCP-Protocol-Version"] = init.json()["result"]["protocolVersion"]
                ready = await client.post(self.mcp_url, headers=headers, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
                ready.raise_for_status()
                res = await client.post(self.mcp_url, json=payload, headers=headers)
                if res.status_code == 404:
                    return {"session_id": session_id, "found": False}
                res.raise_for_status()
                body = res.json()
                if body.get("error"):
                    raise ValueError("Resource lookup failed")
                import json
                return json.loads(body["result"]["contents"][0]["text"])
            except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
                raise AppException(
                    message="Chat MCP resource lookup is unavailable",
                    code="CHAT_MCP_UNAVAILABLE",
                    status_code=503,
                ) from exc

    async def invoke_tool(self, tool_name: str, params: Dict[str, Any], admin_jwt: str) -> None:
        """Explicitly blocked: admin-api is read-only MCP client and cannot invoke mutating tools."""
        raise ForbiddenException(
            message=f"Access denied: admin-api is restricted to read-only MCP resources. Mutating tool '{tool_name}' cannot be invoked."
        )
