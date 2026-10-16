from shared.service_auth import async_service_client
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings


def get_auth_internal_base_url() -> str:
    """Auth Service's internal API base URL, from settings.AUTH_SERVICE_URL (env-configurable)."""
    url = settings.AUTH_SERVICE_URL.rstrip("/")
    if not url.endswith("/internal"):
        url = f"{url}/internal"
    return url


class AuthClient:
    async def list_users(
        self,
        page: int = 1,
        limit: int = 10,
        search: Optional[str] = None,
        status: Optional[str] = None,
        plan: Optional[str] = None,
        isGuest: Optional[bool] = None
    ) -> Dict[str, Any]:
        params = {"page": page, "limit": limit}
        if search: params["search"] = search
        if status: params["status"] = status
        if plan: params["plan"] = plan
        if isGuest is not None: params["isGuest"] = str(isGuest).lower()
        
        base_url = get_auth_internal_base_url()
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.get(f"{base_url}/users", params=params)
            response.raise_for_status()
            return response.json()
            
    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        base_url = get_auth_internal_base_url()
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.get(f"{base_url}/users/{user_id}")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
            
    async def update_user_status(self, user_id: str, status: str) -> Dict[str, Any]:
        base_url = get_auth_internal_base_url()
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.patch(f"{base_url}/users/{user_id}/status", json={"status": status})
            response.raise_for_status()
            return response.json()

    async def update_user_plan(self, user_id: str, plan: str) -> Dict[str, Any]:
        base_url = get_auth_internal_base_url()
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.patch(f"{base_url}/users/{user_id}/plan", json={"plan": plan})
            response.raise_for_status()
            return response.json()

    async def list_referrals(self, status: Optional[str] = None) -> Dict[str, Any]:
        base_url = get_auth_internal_base_url()
        params = {"status": status} if status else {}
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.get(f"{base_url}/referrals", params=params)
            response.raise_for_status()
            return response.json()

    async def create_referral(self, referrer_user_id: str, referred_email: str, code: str) -> Dict[str, Any]:
        base_url = get_auth_internal_base_url()
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.post(f"{base_url}/referrals", json={
                "referrer_user_id": referrer_user_id, "referred_email": referred_email, "code": code,
            })
            response.raise_for_status()
            return response.json()

    async def get_user_counts_by_plan(self) -> Dict[str, Any]:
        base_url = get_auth_internal_base_url()
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.get(f"{base_url}/users/stats-by-plan")
            response.raise_for_status()
            return response.json()

    async def convert_referral(self, referral_id: str) -> Dict[str, Any]:
        base_url = get_auth_internal_base_url()
        async with async_service_client("auth", headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET}, timeout=10.0) as client:
            response = await client.patch(f"{base_url}/referrals/{referral_id}/convert")
            response.raise_for_status()
            return response.json()


auth_client = AuthClient()

