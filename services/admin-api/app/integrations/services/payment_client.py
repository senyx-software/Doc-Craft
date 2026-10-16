from shared.service_auth import service_request
"""
payment_client.py — Admin-API HTTP client for the Payment Service.

Provides typed methods to fetch subscription data, revenue summaries,
failed payments, and refunds from the Payment Prisma database.
The Payment Service is the authoritative source for this data.
Admin-API never reads the Payment DB directly.
"""
import os
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

PAYMENT_SERVICE_URL = os.getenv("PAYMENT_SERVICE_URL", settings.PAYMENT_SERVICE_URL)
INTERNAL_SECRET    = os.getenv("INTERNAL_SERVICE_SECRET", settings.INTERNAL_SERVICE_SECRET)
TIMEOUT            = 10.0  # seconds


def _headers() -> Dict[str, str]:
    return {"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"}


class PaymentServiceClient:
    """HTTP client wrapping the Payment Service internal admin endpoints."""

    def __init__(self, base_url: str = PAYMENT_SERVICE_URL):
        self.base_url = base_url.rstrip("/")

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        try:
            resp = service_request("payment", "GET", url, headers=_headers(), params=params or {}, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"[payment_client] {path} returned {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"[payment_client] Request failed for {path}: {e}") from e

    def _post(self, path: str, json: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        try:
            resp = service_request("payment", "POST", url, headers=_headers(), json=json or {}, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"[payment_client] {path} returned {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"[payment_client] Request failed for {path}: {e}") from e

    def _patch(self, path: str, json: Optional[Dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        try:
            resp = service_request("payment", "PATCH", url, headers=_headers(), json=json or {}, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"[payment_client] {path} returned {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            raise RuntimeError(f"[payment_client] Request failed for {path}: {e}") from e

    # ── Subscriptions ──────────────────────────────────────────────────────────

    def get_subscriptions(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Fetch all subscriptions with plan details from Payment Service."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        return self._get("/v1/payment/admin/subscriptions", params)

    def get_subscription_stats(self) -> Dict[str, Any]:
        """Fetch subscription counts grouped by status (active/cancelled/past_due…)."""
        return self._get("/v1/payment/admin/subscriptions/stats")

    # ── Revenue ────────────────────────────────────────────────────────────────

    def get_revenue_summary(self) -> Dict[str, Any]:
        """Fetch MRR, ARR, total paid revenue, and gateway/plan breakdowns."""
        return self._get("/v1/payment/admin/revenue")

    def get_revenue_trajectory(self) -> Dict[str, Any]:
        """Fetch the last 12 months of paid-invoice revenue for the MRR growth chart."""
        return self._get("/v1/payment/admin/revenue/trajectory")

    # ── Invoices ───────────────────────────────────────────────────────────────

    def get_invoices(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Fetch all billing invoices."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        return self._get("/v1/payment/admin/invoices", params)

    # ── Failed Payments ────────────────────────────────────────────────────────

    def get_failed_payments(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """Fetch failed payment invoice records."""
        return self._get("/v1/payment/admin/failed-payments", {"limit": limit, "offset": offset})

    # ── Refunds ────────────────────────────────────────────────────────────────

    def get_refunds(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """Fetch refunded payment records with total refund amount."""
        return self._get("/v1/payment/admin/refunds", {"limit": limit, "offset": offset})

    # ── Key Status ─────────────────────────────────────────────────────────────

    def get_key_status(self) -> Dict[str, Any]:
        """Fetch PayHere/Paddle gateway secret configuration status (never real values)."""
        return self._get("/v1/payment/admin/keys/status")

    # ── Coupons (Payment's own `coupons` table — the same one validated at checkout) ──

    def get_coupons(self) -> Dict[str, Any]:
        """Fetch all non-deleted discount coupons."""
        return self._get("/v1/payment/admin/coupons")

    def create_coupon(self, code: str, discount_type: str, value: float, expires_at: str, usage_limit: Optional[int] = None) -> Dict[str, Any]:
        """Create a discount coupon in the real checkout-validated table."""
        return self._post("/v1/payment/admin/coupons", {
            "code": code, "discount_type": discount_type, "value": value,
            "expires_at": expires_at, "usage_limit": usage_limit,
        })

    def archive_coupon(self, coupon_id: str) -> Dict[str, Any]:
        """Soft-delete a discount coupon."""
        return self._post(f"/v1/payment/admin/coupons/{coupon_id}/archive")

    # ── Trial Management ──────────────────────────────────────────────────────

    def get_trials(self) -> Dict[str, Any]:
        """Fetch all trialing subscriptions."""
        return self._get("/v1/payment/admin/trials")

    def start_trial(self, user_id: str, plan: str, days: int) -> Dict[str, Any]:
        """Start (or restart) a trial subscription for a user."""
        return self._post("/v1/payment/admin/trials", {"user_id": user_id, "plan": plan, "days": days})

    def extend_trial(self, trial_id: str, days: int) -> Dict[str, Any]:
        """Push a trial's expiry forward by N days."""
        return self._patch(f"/v1/payment/admin/trials/{trial_id}/extend", {"days": days})

    def end_trial(self, trial_id: str) -> Dict[str, Any]:
        """End a trial immediately."""
        return self._post(f"/v1/payment/admin/trials/{trial_id}/end")


payment_client = PaymentServiceClient()
