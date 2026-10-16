from shared.service_auth import async_service_client
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional, Literal
from app.integrations.services.auth_client import auth_client
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service
from pydantic import BaseModel, field_validator
from app.schemas.plan import _validate_quota_value
import httpx

router = APIRouter()

class UserStatusUpdate(BaseModel):
    status: Literal["active", "suspended", "banned", "inactive"]

@router.get("/")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    plan: Optional[str] = None,
    isGuest: Optional[bool] = None,
    admin: AdminUserPayload = Depends(require_permission("users", "view")),
):
    try:
        result = await auth_client.list_users(page, limit, search, status, plan, isGuest)
        if status in ("suspended", "banned") and isinstance(result, dict) and isinstance(result.get("data"), list):
            from app.repositories.audit_repository import audit_repository
            for u in result["data"]:
                latest = audit_repository.get_latest_by_target(u["id"], module="users")
                if latest:
                    u["status_reason"] = latest.details.get("reason", "No reason recorded")
                    u["status_changed_by"] = latest.admin_email or "system"
                    u["status_is_automatic"] = latest.action == "user.auto_blocked"
                else:
                    u["status_reason"] = None
                    u["status_changed_by"] = None
                    u["status_is_automatic"] = False
        return result
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{user_id}")
async def get_user(
    user_id: str,
    admin: AdminUserPayload = Depends(require_permission("users", "view")),
):
    try:
        user = await auth_client.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        import asyncio
        from app.services.entitlements import effective_entitlements
        from app.db.admin_db import admin_db
        policy=await asyncio.to_thread(effective_entitlements,user_id)
        used=None;generated=None
        try:
            row=admin_db.fetch_one('SELECT CASE WHEN "endsAt">CURRENT_TIMESTAMP THEN used ELSE 0 END AS used FROM quota_windows WHERE "userId"=?',(user_id,))
            used=int(row['used']) if row else 0
            row=admin_db.fetch_one("SELECT COUNT(*) AS count FROM documents WHERE \"userId\"=? AND status='success'",(user_id,))
            generated=int(row['count'])
        except Exception:pass # unavailable measurements are displayed as unknown
        return {**user,'plan':policy['plan'],'quota':policy['daily_quota'],'quota_used':used,'generatedDocs':generated,'entitlements':policy}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {str(e)}")
    except HTTPException:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UserPlanUpdate(BaseModel):
    plan: str

class UserQuotaUpdate(BaseModel):
    daily_limit: int
    _validate_daily_limit = field_validator("daily_limit")(_validate_quota_value)

class UserOverrideRequest(BaseModel):
    plan: Optional[str] = None
    daily_limit: Optional[int] = None
    status: Optional[str] = None
    _validate_daily_limit = field_validator("daily_limit")(_validate_quota_value)

@router.patch("/{user_id}/status")
async def update_user_status(
    user_id: str,
    data: UserStatusUpdate,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Activate, suspend, or ban a user account (Protected: users:edit + 2FA)."""
    try:
        result = await auth_client.update_user_status(user_id, data.status)
        audit_service.log_action(
            admin=admin,
            action="user.status_updated",
            module="users",
            request=request,
            details={"target_id": user_id, "user_id": user_id, "new_status": data.status, "reason": "Manual action by admin"},
            totp_verified=True,
        )
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{user_id}/plan")
async def update_user_plan(
    user_id: str,
    data: UserPlanUpdate,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Override user billing plan tier (Protected: users:edit + 2FA)."""
    try:
        from app.services.entitlements import save_override
        from app.repositories.plan_repository import plan_repository
        if not plan_repository.get_plan_by_code(data.plan): raise HTTPException(422,'Unknown plan')
        save_override(user_id, {'plan':data.plan,'features':{},'reason':'Admin plan override'}, admin.admin_id)
        updated = await auth_client.update_user_plan(user_id, data.plan)
        audit_service.log_action(
            admin=admin,
            action="user.plan_updated",
            module="users",
            request=request,
            details={"user_id": user_id, "new_plan": data.plan},
            totp_verified=True,
        )
        return {"status": "success", "user_id": user_id, "plan": data.plan, "message": f"User plan updated to {data.plan}", "user": updated.get("user")}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Auth service unavailable: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{user_id}/quota")
async def update_user_quota(
    user_id: str,
    data: UserQuotaUpdate,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Override user daily generation quota limit (persists to Cloud DB, Redis, and Quota Service). Protected: users:edit + 2FA."""
    try:
        from app.repositories.plan_repository import plan_repository
        from app.core.redis import cache_manager

        # 1. Persist override to Cloud DB (user_quota_overrides table)
        plan_repository.set_user_quota_override(
            user_id=user_id,
            custom_quota=data.daily_limit,
            admin_id=admin.admin_id,
            reason="Admin custom daily quota limit update",
        )

        # 2. Sync Redis live limit so Quota Service Lua script reads it instantly
        cache_manager.set(f"quota:limit:{user_id}", data.daily_limit, ttl=None)

        # 3. Notify Quota Service
        try:
            from app.integrations.services.quota_client import quota_client
            async with async_service_client("quota", timeout=3.0) as client:
                response = await client.post(
                    f"{quota_client.base_url}/v1/quota/override",
                    headers={"X-Internal-Secret": quota_client.secret},
                    json={"userId": user_id, "overrideLimit": data.daily_limit, "reason": "Admin limit override", "adminId": admin.admin_id}
                )
                response.raise_for_status()
        except httpx.HTTPError as q_err:
            raise HTTPException(status_code=503, detail="Quota override was stored but service synchronization failed; retry the same limit") from q_err

        audit_service.log_action(
            admin=admin,
            action="user.quota_updated",
            module="users",
            request=request,
            details={"user_id": user_id, "daily_limit": data.daily_limit},
            totp_verified=True,
        )

        return {
            "status": "success",
            "user_id": user_id,
            "daily_limit": data.daily_limit,
            "message": f"User daily quota limit updated to {data.daily_limit}/day",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{user_id}/override")
async def apply_user_override(
    user_id: str,
    data: UserOverrideRequest,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Unified override endpoint for plan, daily limit, and status (Protected: users:edit + 2FA)."""
    try:
        updated = {"user_id": user_id}
        if data.status:
            await auth_client.update_user_status(user_id, data.status)
            updated["status"] = data.status
        if data.plan:
            from app.services.entitlements import save_override
            from app.repositories.plan_repository import plan_repository
            if not plan_repository.get_plan_by_code(data.plan): raise HTTPException(422,'Unknown plan')
            save_override(user_id, {'plan':data.plan,'features':{},'reason':'Admin unified override'}, admin.admin_id)
            await auth_client.update_user_plan(user_id, data.plan)
            updated["plan"] = data.plan
        if data.daily_limit is not None:
            from app.repositories.plan_repository import plan_repository
            from app.core.redis import cache_manager

            # Persist to DB and Redis
            plan_repository.set_user_quota_override(
                user_id=user_id,
                custom_quota=data.daily_limit,
                admin_id=admin.admin_id,
                reason="Admin unified override grant",
            )
            cache_manager.set(f"quota:limit:{user_id}", data.daily_limit, ttl=None)
            updated["daily_limit"] = data.daily_limit

            # Sync Quota service
            try:
                from app.integrations.services.quota_client import quota_client
                async with async_service_client("quota", timeout=3.0) as client:
                    response = await client.post(
                        f"{quota_client.base_url}/v1/quota/override",
                        headers={"X-Internal-Secret": quota_client.secret},
                        json={"userId": user_id, "overrideLimit": data.daily_limit, "reason": "Admin limit override", "adminId": admin.admin_id}
                    )
                    response.raise_for_status()
            except httpx.HTTPError as q_err:
                raise HTTPException(status_code=503, detail="Override was partially stored; quota synchronization failed. Retry the same values") from q_err

        audit_service.log_action(
            admin=admin,
            action="user.override_applied",
            module="users",
            request=request,
            details={"target_id": user_id, "user_id": user_id, "overrides": updated, "reason": "Manual override by admin"},
            totp_verified=True,
        )

        return {"status": "success", "user_id": user_id, "overrides": updated, "message": "User override privileges applied successfully"}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Auth service error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
