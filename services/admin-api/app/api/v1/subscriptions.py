"""
subscriptions.py — Admin API router for subscription and billing management.

Fetches live data from the Payment Service via PaymentServiceClient.
No hardcoded values — all data comes from Payment Prisma DB through the payment_client.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException

from app.security.authentication import AdminUserPayload
from app.security.permissions import require_permission
from app.integrations.services.payment_client import payment_client

router = APIRouter(prefix="/admin", tags=["Subscriptions & Billing"])


@router.get("/subscriptions")
async def list_all_subscriptions(
    status: Optional[str] = Query(None, description="Filter by status: active, canceled, past_due"),
    limit:  int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin:  AdminUserPayload = Depends(require_permission("plans", "view")),
):
    """List all customer subscriptions from the Payment Service Prisma DB."""
    try:
        result = payment_client.get_subscriptions(status=status, limit=limit, offset=offset)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")


@router.get("/subscriptions/stats")
async def get_subscription_stats(
    admin: AdminUserPayload = Depends(require_permission("plans", "view")),
):
    """Return aggregated subscription counts grouped by status for KPI cards."""
    try:
        stats = payment_client.get_subscription_stats()
        return {"status": "success", **stats}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")


@router.get("/revenue")
async def get_revenue_summary(
    admin: AdminUserPayload = Depends(require_permission("plans", "view")),
):
    """Return MRR, ARR, and revenue breakdown from Payment Service."""
    try:
        revenue = payment_client.get_revenue_summary()
        return {"status": "success", **revenue}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")


@router.get("/invoices")
async def list_all_invoices(
    status: Optional[str] = Query(None, description="Filter by status: paid, open, void, failed"),
    limit:  int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin:  AdminUserPayload = Depends(require_permission("plans", "view")),
):
    """List all billing invoices from the Payment Service Prisma DB."""
    try:
        result = payment_client.get_invoices(status=status, limit=limit, offset=offset)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")


@router.get("/failed-payments")
async def list_failed_payments(
    limit:  int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin:  AdminUserPayload = Depends(require_permission("plans", "view")),
):
    """List failed payment records from Payment Service."""
    try:
        result = payment_client.get_failed_payments(limit=limit, offset=offset)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")


@router.get("/refunds")
async def list_refunds(
    limit:  int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin:  AdminUserPayload = Depends(require_permission("plans", "view")),
):
    """List refunded payment records from Payment Service."""
    try:
        result = payment_client.get_refunds(limit=limit, offset=offset)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment service error: {e}")
