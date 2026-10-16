from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional, Literal
from pydantic import BaseModel, Field

# Sentinel quota value meaning "no daily/monthly cap" — assignable to a plan's
# monthly_quota or a per-user override, alongside any natural number (>= 1).
# Distinct from 0, which is never a valid assignable quota.
UNLIMITED_QUOTA = -1


class PlanStatusEnum(str, Enum):
    ACTIVE = "active"
    DRAFT = "draft"
    ARCHIVED = "archived"


class BillingIntervalEnum(str, Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"
    BOTH = "both"


class CouponDurationEnum(str, Enum):
    ONCE = "once"
    REPEATING = "repeating"
    FOREVER = "forever"


class PlanModel(BaseModel):
    id: str
    name: str
    code: str
    description: Optional[str] = None
    price_usd_monthly: float = 0.0
    price_usd_yearly: float = 0.0
    price_lkr_monthly: Optional[float] = Field(None, ge=0.0)
    price_lkr_yearly: Optional[float] = Field(None, ge=0.0)
    paddle_price_yearly_id: Optional[str] = None
    billing_currency: Literal["USD", "LKR"] = "USD"
    billing_interval: BillingIntervalEnum = BillingIntervalEnum.BOTH
    # Daily generation cap (resets midnight UTC — field name kept for wire
    # compatibility, see plan_repository.py's SEED_PLANS note): natural
    # number, or UNLIMITED_QUOTA (-1) for no cap.
    monthly_quota: int = 0
    payhere_plan_id: Optional[str] = None
    paddle_price_id: Optional[str] = None
    status: PlanStatusEnum = PlanStatusEnum.ACTIVE
    feature_flags: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserQuotaOverrideModel(BaseModel):
    id: str
    user_id: str
    custom_quota: int  # daily cap (resets midnight UTC): natural number, or UNLIMITED_QUOTA (-1) for no cap
    reason: Optional[str] = None
    granted_by_admin_id: str
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CouponModel(BaseModel):
    id: str
    code: str
    discount_percent: Optional[float] = None
    discount_amount_usd: Optional[float] = None
    duration: CouponDurationEnum = CouponDurationEnum.ONCE
    duration_in_months: Optional[int] = None
    max_redemptions: int = 100
    times_redeemed: int = 0
    status: PlanStatusEnum = PlanStatusEnum.ACTIVE
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
