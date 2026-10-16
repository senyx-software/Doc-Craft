"""
promotions.py — A/B Tests (real PostHog Experiments) and Referral Program
(real, admin-managed schema in the Auth Service) admin endpoints.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.redis import cache_manager
from app.integrations.services.auth_client import auth_client
from app.integrations.services.posthog_client import posthog_client
from app.repositories.plan_repository import plan_repository
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service

router = APIRouter(prefix="/admin/promotions", tags=["Promotions"])

REFERRAL_REWARD_QUOTA = 20
REFERRAL_REWARD_DAYS = 30


# ── A/B Tests (real PostHog Experiments API) ────────────────────────────────

@router.get("/ab-tests")
async def list_ab_tests(admin: AdminUserPayload = Depends(require_permission("analytics", "view"))):
    """Fetch real A/B test experiments from PostHog. Returns configured=False
    (no fabricated data) if a PostHog personal API key isn't set up."""
    return posthog_client.get_experiments()


# ── Referral Program (real schema in Auth Service) ──────────────────────────

class ReferralCreateSchema(BaseModel):
    referrer_user_id: str = Field(..., min_length=1)
    referred_email: str = Field(..., min_length=3)
    code: str = Field(..., min_length=3)


@router.get("/referrals")
async def list_referrals(
    status: Optional[str] = None,
    admin: AdminUserPayload = Depends(require_permission("users", "view")),
):
    """List referral records from the Auth Service (Protected: users:view)."""
    try:
        return await auth_client.list_referrals(status)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Auth service error: {e}")


@router.post("/referrals", status_code=201)
async def create_referral(
    payload: ReferralCreateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Record a referral (Protected: users:edit + 2FA). Signup-time attribution
    is not automated yet — this is how an admin logs a referral they've
    verified (e.g. from a support conversation) so it can be tracked and
    rewarded on conversion."""
    try:
        result = await auth_client.create_referral(payload.referrer_user_id, payload.referred_email, payload.code)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Auth service error: {e}")

    audit_service.log_action(
        admin=admin,
        action="referral.created",
        module="users",
        request=request,
        details={"referrer_user_id": payload.referrer_user_id, "referred_email": payload.referred_email, "code": payload.code},
        totp_verified=True,
    )
    return result


@router.post("/referrals/{referral_id}/convert")
async def convert_referral(
    referral_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Mark a referral converted and grant the referrer a real quota bonus
    (Protected: users:edit + 2FA). There is no wallet/credit ledger in this
    platform, so the reward is a bonus-quota override — the same real
    mechanism the Users page's 'Grant Custom Quota Override' uses."""
    try:
        result = await auth_client.convert_referral(referral_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Auth service error: {e}")

    referral = result.get("data", {})
    referrer_user_id = referral.get("referrerUserId") or referral.get("referrer_user_id")
    warnings = []
    if referrer_user_id:
        try:
            plan_repository.set_user_quota_override(
                user_id=referrer_user_id,
                custom_quota=REFERRAL_REWARD_QUOTA,
                admin_id=admin.admin_id,
                reason="Referral program reward",
                expires_at=datetime.now(timezone.utc) + timedelta(days=REFERRAL_REWARD_DAYS),
            )
            cache_manager.set(f"quota:limit:{referrer_user_id}", REFERRAL_REWARD_QUOTA, ttl=None)
        except Exception as e:
            warnings.append(f"Referral marked converted, but reward grant failed: {e}")
    else:
        warnings.append("Referral marked converted, but no referrer_user_id was returned to grant a reward against.")

    audit_service.log_action(
        admin=admin,
        action="referral.converted",
        module="users",
        request=request,
        details={"referral_id": referral_id, "reward_quota": REFERRAL_REWARD_QUOTA},
        totp_verified=True,
    )
    return {"referral": referral, "warnings": warnings}
