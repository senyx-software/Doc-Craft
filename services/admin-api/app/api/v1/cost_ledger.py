"""
cost_ledger.py — API Router for managing cost ledger entries and monthly summaries.
Allows admins to track real infrastructure, AI API, SaaS tool, and operational expenses.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field

from app.core.exceptions import ValidationException
from app.repositories.cost_ledger_repository import COST_CATEGORIES, cost_ledger_repository
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service

router = APIRouter(prefix="/admin/cost-ledger", tags=["Cost Ledger & Financial Data"])


class CostEntryCreateSchema(BaseModel):
    category: str = Field(..., description="infra | ai_api | saas | support | marketing | other")
    description: str = Field(..., min_length=2, description="Short summary of cost item")
    amount_usd: float = Field(..., gt=0, description="Amount in USD")
    period_month: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="Billing month in YYYY-MM format")
    currency: str = Field("USD", description="Currency code")
    vendor: Optional[str] = Field(None, description="Vendor name (e.g. AWS, OpenAI, Vercel)")
    invoice_ref: Optional[str] = Field(None, description="Invoice or receipt reference ID")


@router.get("")
async def list_cost_entries(
    period_month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="Filter by YYYY-MM"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    admin: AdminUserPayload = Depends(require_permission("settings", "view")),
):
    """List cost ledger entries with optional month/category filters."""
    entries = cost_ledger_repository.list_entries(
        period_month=period_month,
        category=category,
        limit=limit,
        offset=offset,
    )
    return {
        "status": "success",
        "data": [e.to_dict() for e in entries],
        "total": len(entries),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_cost_entry(
    payload: CostEntryCreateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("settings", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Create a new cost ledger entry (Protected: settings:edit + 2FA)."""
    if payload.category not in COST_CATEGORIES:
        raise ValidationException(f"Invalid category '{payload.category}'. Allowed: {', '.join(COST_CATEGORIES)}")

    entry = cost_ledger_repository.create_entry(
        category=payload.category,
        description=payload.description,
        amount_usd=payload.amount_usd,
        period_month=payload.period_month,
        currency=payload.currency,
        vendor=payload.vendor,
        invoice_ref=payload.invoice_ref,
        created_by=admin.email or admin.admin_id,
    )

    audit_service.log_action(
        admin=admin,
        action="cost_ledger.created",
        module="settings",
        request=request,
        details={"cost_id": entry.id, "amount_usd": entry.amount_usd, "category": entry.category, "period_month": entry.period_month},
        totp_verified=True,
    )

    return {"status": "success", "data": entry.to_dict()}


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cost_entry(
    entry_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("settings", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Delete a cost ledger entry (Protected: settings:delete + 2FA)."""
    success = cost_ledger_repository.delete_entry(entry_id)
    if not success:
        from app.core.exceptions import NotFoundException
        raise NotFoundException(f"Cost entry '{entry_id}' not found")

    audit_service.log_action(
        admin=admin,
        action="cost_ledger.deleted",
        module="settings",
        request=request,
        details={"entry_id": entry_id},
        totp_verified=True,
    )
    return None


@router.get("/summary")
async def get_cost_summary(
    admin: AdminUserPayload = Depends(require_permission("settings", "view")),
):
    """Get aggregated cost summary by month and category for margin analysis."""
    summary = cost_ledger_repository.get_monthly_summary()
    return {"status": "success", "data": summary}
