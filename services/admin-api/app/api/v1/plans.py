from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.exceptions import NotFoundException, ValidationException
from app.models.plan import PlanStatusEnum
from app.repositories.plan_repository import SYSTEM_PLAN_CODES, plan_repository
from app.schemas.plan import (
    PlanCreateSchema,
    PlanResponseSchema,
    PlanUpdateSchema,
    QuotaOverrideCreateSchema,
    QuotaOverrideResponseSchema,
)
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service
from app.services.config_engine import config_engine
from app.integrations.services.payment_client import payment_client
from app.integrations.services.auth_client import auth_client

router = APIRouter(prefix="/admin", tags=["Plans & Billing Management"])


# ----------------------------------------------------------------------
# 1. Pricing Plans Management APIs
# ----------------------------------------------------------------------
@router.get("/plans", response_model=List[PlanResponseSchema])
async def list_plans(
    include_archived: bool = False,
    admin: AdminUserPayload = Depends(require_permission("plans", "view")),
):
    """List all pricing plans and feature flag matrices (Protected: plans:view)."""
    plans = plan_repository.list_plans(include_archived=include_archived)
    return [PlanResponseSchema(**p.model_dump()) for p in plans]


@router.get("/plans/performance")
async def get_plan_performance(admin: AdminUserPayload = Depends(require_permission("plans", "view"))):
    """Real signups vs. paid conversions per plan (Auth signup counts x Payment active subscriptions)."""
    plans = plan_repository.list_plans(include_archived=False)

    try:
        signups_result = await auth_client.get_user_counts_by_plan()
        signups_by_plan = signups_result.get("data", {})
    except Exception as e:
        signups_by_plan = {}
        print(f"[plans] get_plan_performance: auth_client.get_user_counts_by_plan failed: {e}")

    try:
        revenue = payment_client.get_revenue_summary()
        conversions_by_plan = revenue.get("subscriptions_by_plan", {})
    except Exception as e:
        conversions_by_plan = {}
        print(f"[plans] get_plan_performance: payment_client.get_revenue_summary failed: {e}")

    return {
        "data": [
            {
                "code": p.code,
                "name": p.name,
                "signups": signups_by_plan.get(p.code, 0),
                "conversions": conversions_by_plan.get(p.name, 0),
            }
            for p in plans
        ]
    }


@router.post("/plans", response_model=PlanResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: PlanCreateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "create")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Create a new pricing plan & feature flag set (Protected: plans:create + 2FA)."""
    if plan_repository.get_plan_by_code(payload.code):
        raise ValidationException(f"Plan with code '{payload.code}' already exists")

    plan = plan_repository.create_plan(
        name=payload.name,
        code=payload.code,
        description=payload.description,
        price_usd_monthly=payload.price_usd_monthly,
        price_usd_yearly=payload.price_usd_yearly,
        billing_interval=payload.billing_interval,
        monthly_quota=payload.monthly_quota,
        payhere_plan_id=payload.payhere_plan_id,
        paddle_price_id=payload.paddle_price_id,
        feature_flags=payload.feature_flags,
        price_lkr_monthly=payload.price_lkr_monthly,
        price_lkr_yearly=payload.price_lkr_yearly,
        paddle_price_yearly_id=payload.paddle_price_yearly_id,
        billing_currency=payload.billing_currency,
    )

    # Sync with ConfigEngine to broadcast Pub/Sub invalidation to microservices.
    # Only ACTIVE plans belong in this broadcast — a brand-new plan is always
    # created ACTIVE (see plan_repository.create_plan), so it's included here.
    all_plans_dict = {p.code: p.model_dump(mode="json") for p in plan_repository.dedupe_by_code(plan_repository.list_active_plans())}
    config_engine.update_domain_config("plans", all_plans_dict, admin_id=admin.admin_id)
    # Write per-plan quota limit key for Quota Service hot-path
    cache_manager.set(f"quota:plan:{plan.code}", plan.monthly_quota, ttl=None)

    audit_service.log_action(
        admin=admin,
        action="plan.created",
        module="plans",
        request=request,
        details={"plan_id": plan.id, "code": plan.code, "monthly_quota": plan.monthly_quota},
        totp_verified=True,
    )

    return PlanResponseSchema(**plan.model_dump())


@router.patch("/plans/{plan_id}", response_model=PlanResponseSchema)
async def update_plan(
    plan_id: str,
    payload: PlanUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Modify plan pricing, quota limits, billing interval, or feature flags (Protected: plans:edit + 2FA)."""
    plan = plan_repository.get_plan_by_id(plan_id)
    if not plan:
        raise NotFoundException(f"Plan with ID '{plan_id}' not found")

    updated_plan = plan_repository.update_plan(plan_id, payload.model_dump(exclude_unset=True))

    # Sync with ConfigEngine to broadcast Pub/Sub invalidation. Only ACTIVE
    # plans belong in this broadcast, so toggling a plan to DRAFT here drops
    # it out of config:domain:plans on the very next line.
    all_plans_dict = {p.code: p.model_dump(mode="json") for p in plan_repository.dedupe_by_code(plan_repository.list_active_plans())}
    config_engine.update_domain_config("plans", all_plans_dict, admin_id=admin.admin_id)
    # Write (or remove) the per-plan quota limit key — the Quota Service hot
    # path reads this immediately. Deactivating a plan (status != ACTIVE)
    # deletes its key so nobody still assigned to it can generate under it;
    # reactivating restores it.
    if updated_plan and updated_plan.monthly_quota is not None:
        if updated_plan.status == PlanStatusEnum.ACTIVE:
            cache_manager.set(f"quota:plan:{updated_plan.code}", updated_plan.monthly_quota, ttl=None)
        else:
            cache_manager.delete(f"quota:plan:{updated_plan.code}")

    audit_service.log_action(
        admin=admin,
        action="plan.updated",
        module="plans",
        request=request,
        details={"plan_id": plan_id, "updated_fields": payload.model_dump(exclude_unset=True)},
        totp_verified=True,
    )

    return PlanResponseSchema(**updated_plan.model_dump())


@router.post("/plans/{plan_id}/archive", response_model=PlanResponseSchema)
async def archive_plan(
    plan_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Archive a pricing plan (Protected: plans:delete + 2FA)."""
    plan = plan_repository.get_plan_by_id(plan_id)
    if not plan:
        raise NotFoundException(f"Plan with ID '{plan_id}' not found")

    if plan.code in SYSTEM_PLAN_CODES:
        raise ValidationException(f"Built-in system plan '{plan.code}' cannot be archived")

    archived_plan = plan_repository.archive_plan(plan_id)

    # Sync with ConfigEngine — only ACTIVE plans belong in this broadcast
    all_plans_dict = {p.code: p.model_dump(mode="json") for p in plan_repository.dedupe_by_code(plan_repository.list_active_plans())}
    config_engine.update_domain_config("plans", all_plans_dict, admin_id=admin.admin_id)
    # Remove per-plan quota key for archived plan
    cache_manager.delete(f"quota:plan:{plan.code}")

    audit_service.log_action(
        admin=admin,
        action="plan.archived",
        module="plans",
        request=request,
        details={"plan_id": plan_id, "code": plan.code},
        totp_verified=True,
    )

    return PlanResponseSchema(**archived_plan.model_dump())


# ----------------------------------------------------------------------
# 2. User Quota Overrides APIs
# ----------------------------------------------------------------------
from app.core.redis import cache_manager


@router.post("/users/{user_id}/quota-override", response_model=QuotaOverrideResponseSchema)
async def grant_user_quota_override(
    user_id: str,
    payload: QuotaOverrideCreateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Grant custom daily quota override to a customer user (Protected: users:edit + 2FA).

    Named `custom_quota` / `monthly_quota` for historical/wire-compatibility
    reasons, but the Quota Service actually resets this limit every day at
    midnight UTC, not monthly.
    """
    override = plan_repository.set_user_quota_override(
        user_id=user_id,
        custom_quota=payload.custom_quota,
        admin_id=admin.admin_id,
        reason=payload.reason,
        expires_at=payload.expires_at,
    )

    # Sync Redis quota override key so Quota service's Lua script reads it instantly
    cache_manager.set(f"quota:limit:{user_id}", payload.custom_quota, ttl=None)

    audit_service.log_action(
        admin=admin,
        action="user.quota_override_granted",
        module="users",
        request=request,
        details={"user_id": user_id, "custom_quota": payload.custom_quota, "reason": payload.reason},
        totp_verified=True,
    )

    return QuotaOverrideResponseSchema(**override.model_dump())


@router.delete("/users/{user_id}/quota-override", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user_quota_override(
    user_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Remove user custom quota override (Protected: users:edit + 2FA)."""
    if not plan_repository.get_user_quota_override(user_id):
        raise NotFoundException(f"Quota override for user '{user_id}' not found")
    # Clear the Quota Service's durable mirror before acknowledging removal;
    # otherwise a later billing synchronization can resurrect the old grant.
    from app.integrations.services.quota_client import quota_client
    try:
        await quota_client.remove_override(user_id)
    except Exception as error:
        raise HTTPException(status_code=503, detail="Quota service unavailable; override was not removed. Retry.") from error
    success = plan_repository.remove_user_quota_override(user_id)
    if not success:
        raise NotFoundException(f"Quota override for user '{user_id}' not found")

    # Remove Redis override key
    cache_manager.delete(f"quota:limit:{user_id}")

    audit_service.log_action(
        admin=admin,
        action="user.quota_override_removed",
        module="users",
        request=request,
        details={"user_id": user_id},
        totp_verified=True,
    )

    return None


# ----------------------------------------------------------------------
# 3. Coupons Management APIs — proxied to the Payment Service's own
#    `coupons` table, the same one `validateCoupon`/`applyCoupon` check at
#    real checkout. Admin-api never keeps a second, disconnected copy.
# ----------------------------------------------------------------------
class CouponCreateSchema(BaseModel):
    code: str = Field(..., min_length=3, description="Discount promo coupon code (e.g. WELCOME20)")
    discount_type: str = Field(..., description="'percent' or 'fixed'")
    value: float = Field(..., gt=0)
    expires_at: str = Field(..., description="ISO-8601 expiry date")
    usage_limit: Optional[int] = Field(None, ge=1)


@router.get("/coupons")
async def list_coupons(admin: AdminUserPayload = Depends(require_permission("plans", "view"))):
    """List all discount coupons from the Payment Service (Protected: plans:view)."""
    try:
        return payment_client.get_coupons()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")


@router.post("/coupons", status_code=status.HTTP_201_CREATED)
async def create_coupon(
    payload: CouponCreateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "create")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Create a new discount coupon in the Payment Service (Protected: plans:create + 2FA)."""
    try:
        result = payment_client.create_coupon(
            code=payload.code,
            discount_type=payload.discount_type,
            value=payload.value,
            expires_at=payload.expires_at,
            usage_limit=payload.usage_limit,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")

    audit_service.log_action(
        admin=admin,
        action="coupon.created",
        module="plans",
        request=request,
        details={"code": payload.code, "discount_type": payload.discount_type, "value": payload.value},
        totp_verified=True,
    )
    return result


@router.post("/coupons/{coupon_id}/archive")
async def archive_coupon(
    coupon_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Archive a discount coupon in the Payment Service (Protected: plans:delete + 2FA)."""
    try:
        result = payment_client.archive_coupon(coupon_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")

    audit_service.log_action(
        admin=admin,
        action="coupon.archived",
        module="plans",
        request=request,
        details={"coupon_id": coupon_id},
        totp_verified=True,
    )
    return result


# ----------------------------------------------------------------------
# 4. Trial Management APIs — proxied to the Payment Service's Subscription
#    table (status='trialing'). Starting/extending a trial takes effect
#    immediately; there is no scheduled job to auto-expire a trial, so an
#    expired-but-not-ended trial is flagged via `is_expired` for an admin
#    to act on.
# ----------------------------------------------------------------------
class TrialStartSchema(BaseModel):
    user_id: str = Field(..., min_length=1)
    plan: str = Field(..., min_length=1, description="Payment plan name, e.g. 'pro'")
    days: int = Field(..., ge=1, le=365)


class TrialExtendSchema(BaseModel):
    days: int = Field(..., ge=1, le=365)


@router.get("/trials")
async def list_trials(admin: AdminUserPayload = Depends(require_permission("plans", "view"))):
    """List all trialing subscriptions from the Payment Service (Protected: plans:view)."""
    try:
        return payment_client.get_trials()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")


@router.post("/trials", status_code=status.HTTP_201_CREATED)
async def start_trial(
    payload: TrialStartSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "create")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Start (or restart) a trial subscription for a user (Protected: plans:create + 2FA)."""
    try:
        result = payment_client.start_trial(payload.user_id, payload.plan, payload.days)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")

    audit_service.log_action(
        admin=admin,
        action="trial.started",
        module="plans",
        request=request,
        details={"user_id": payload.user_id, "plan": payload.plan, "days": payload.days},
        totp_verified=True,
    )
    return result


@router.patch("/trials/{trial_id}/extend")
async def extend_trial(
    trial_id: str,
    payload: TrialExtendSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Push a trial's expiry forward (Protected: plans:edit + 2FA)."""
    try:
        result = payment_client.extend_trial(trial_id, payload.days)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")

    audit_service.log_action(
        admin=admin,
        action="trial.extended",
        module="plans",
        request=request,
        details={"trial_id": trial_id, "days": payload.days},
        totp_verified=True,
    )
    return result


@router.post("/trials/{trial_id}/end")
async def end_trial(
    trial_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("plans", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """End a trial immediately (Protected: plans:delete + 2FA)."""
    try:
        result = payment_client.end_trial(trial_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")

    audit_service.log_action(
        admin=admin,
        action="trial.ended",
        module="plans",
        request=request,
        details={"trial_id": trial_id},
        totp_verified=True,
    )
    return result
