"""Authenticate callers even when the service is reached without the gateway."""
import hmac
import os

import httpx
from fastapi import Header, HTTPException, Request


async def require_internal_secret(request: Request):
    from shared.service_auth import authorize_service
    return await authorize_service("analytics", request)


async def current_user(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    base = os.getenv("AUTH_SERVICE_URL", "http://localhost:3011").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{base}/v1/auth/me", headers={"Authorization": authorization})
        if response.status_code in (401, 403):
            raise HTTPException(status_code=response.status_code, detail="Account access denied")
        response.raise_for_status()
        payload = response.json()
        user = payload.get("user", payload)
        user_id = user.get("id")
        if not isinstance(user_id, str) or not user_id:
            raise ValueError("Missing current user identity")
        return user_id
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="Account verification unavailable") from exc
