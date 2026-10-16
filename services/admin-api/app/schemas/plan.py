from datetime import datetime
from typing import Any, Dict, Optional, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
from app.models.plan import UNLIMITED_QUOTA, BillingIntervalEnum, CouponDurationEnum, PlanStatusEnum
from decimal import Decimal
import math


def _validate_money(value):
    if value is not None and (not math.isfinite(value) or Decimal(str(value))*100 != (Decimal(str(value))*100).to_integral_value()):
        raise ValueError("Prices must be finite amounts with at most two decimal places")
    return value


def _validate_quota_value(v: Optional[int]) -> Optional[int]:
    """A quota must be a natural number (>= 1) or UNLIMITED_QUOTA (-1). 0 and
    other negative values are rejected — 0 has no "generate nothing" use case
    here and would silently lock a plan/user out."""
    if v is not None and v != UNLIMITED_QUOTA and v < 1:
        raise ValueError(f"must be a natural number (>= 1), or {UNLIMITED_QUOTA} for unlimited")
    return v


class PlanCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, description="Plan name (e.g. Pro Professional)")
    code: str = Field(..., min_length=2, description="Unique plan code (e.g. pro, max)")
    description: Optional[str] = None
    price_usd_monthly: float = Field(0.0, ge=0.0)
    price_usd_yearly: float = Field(0.0, ge=0.0)
    price_lkr_monthly: Optional[float] = Field(None, ge=0.0)
    price_lkr_yearly: Optional[float] = Field(None, ge=0.0)
    paddle_price_yearly_id: Optional[str] = None
    billing_currency: Literal["USD", "LKR"] = "USD"
    billing_interval: BillingIntervalEnum = BillingIntervalEnum.BOTH
    monthly_quota: int = Field(
        ..., description="Daily generation limit (resets midnight UTC): natural number, or -1 for unlimited"
    )
    payhere_plan_id: Optional[str] = None
    paddle_price_id: Optional[str] = None
    feature_flags: Dict[str, Any] = Field(default_factory=dict)

    _validate_monthly_quota = field_validator("monthly_quota")(_validate_quota_value)
    _validate_prices = field_validator("price_usd_monthly", "price_usd_yearly", "price_lkr_monthly", "price_lkr_yearly")(_validate_money)


class PlanUpdateSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_usd_monthly: Optional[float] = Field(None, ge=0.0)
    price_usd_yearly: Optional[float] = Field(None, ge=0.0)
    price_lkr_monthly: Optional[float] = Field(None, ge=0.0)
    price_lkr_yearly: Optional[float] = Field(None, ge=0.0)
    paddle_price_yearly_id: Optional[str] = None
    billing_currency: Optional[Literal["USD", "LKR"]] = None
    billing_interval: Optional[BillingIntervalEnum] = None
    monthly_quota: Optional[int] = Field(
        None, description="Daily generation limit (resets midnight UTC): natural number, or -1 for unlimited"
    )
    payhere_plan_id: Optional[str] = None
    paddle_price_id: Optional[str] = None
    status: Optional[PlanStatusEnum] = None
    feature_flags: Optional[Dict[str, Any]] = None

    _validate_monthly_quota = field_validator("monthly_quota")(_validate_quota_value)
    _validate_prices = field_validator("price_usd_monthly", "price_usd_yearly", "price_lkr_monthly", "price_lkr_yearly")(_validate_money)


class PlanResponseSchema(BaseModel):
    id: str
    name: str
    code: str
    description: Optional[str] = None
    price_usd_monthly: float
    price_usd_yearly: float
    price_lkr_monthly: Optional[float] = Field(None, ge=0.0)
    price_lkr_yearly: Optional[float] = Field(None, ge=0.0)
    paddle_price_yearly_id: Optional[str] = None
    billing_currency: Literal["USD", "LKR"] = "USD"
    billing_interval: BillingIntervalEnum
    monthly_quota: int
    payhere_plan_id: Optional[str] = None
    paddle_price_id: Optional[str] = None
    status: PlanStatusEnum
    feature_flags: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class QuotaOverrideCreateSchema(BaseModel):
    custom_quota: int = Field(
        ..., description="Custom daily quota grant (resets midnight UTC): natural number, or -1 for unlimited"
    )
    reason: Optional[str] = Field(None, description="Reason for quota override grant")
    expires_at: Optional[datetime] = None

    _validate_custom_quota = field_validator("custom_quota")(_validate_quota_value)


class QuotaOverrideResponseSchema(BaseModel):
    id: str
    user_id: str
    custom_quota: int
    reason: Optional[str] = None
    granted_by_admin_id: str
    expires_at: Optional[datetime] = None
    created_at: datetime


class CouponCreateSchema(BaseModel):
    code: str = Field(..., min_length=3, description="Discount promo coupon code (e.g. WELCOME20)")
    discount_percent: Optional[float] = Field(None, ge=0.0, le=100.0)
    discount_amount_usd: Optional[float] = Field(None, ge=0.0)
    duration: CouponDurationEnum = CouponDurationEnum.ONCE
    duration_in_months: Optional[int] = Field(None, ge=1)
    max_redemptions: int = Field(100, ge=1)

    @model_validator(mode="after")
    def validate_discount(self):
        if self.discount_percent is None and self.discount_amount_usd is None:
            raise ValueError("Either discount_percent or discount_amount_usd must be provided")
        return self


class CouponResponseSchema(BaseModel):
    id: str
    code: str
    discount_percent: Optional[float] = None
    discount_amount_usd: Optional[float] = None
    duration: CouponDurationEnum
    duration_in_months: Optional[int] = None
    max_redemptions: int
    times_redeemed: int
    status: PlanStatusEnum
    created_at: datetime
