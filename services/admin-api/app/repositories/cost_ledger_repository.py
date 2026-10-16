"""
cost_ledger_repository.py — Persistent repository for operational cost entries.

Stores infrastructure, AI API, SaaS tool, and other operational costs that
feed the gross margin calculation in the admin analytics dashboard.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.admin_db import admin_db


class CostEntry:
    """In-memory representation of a cost ledger entry."""
    def __init__(
        self,
        id: str,
        category: str,
        description: str,
        amount_usd: float,
        currency: str,
        vendor: Optional[str],
        invoice_ref: Optional[str],
        period_month: str,
        created_at: str,
        created_by: Optional[str],
    ):
        self.id           = id
        self.category     = category
        self.description  = description
        self.amount_usd   = amount_usd
        self.currency     = currency
        self.vendor       = vendor
        self.invoice_ref  = invoice_ref
        self.period_month = period_month
        self.created_at   = created_at
        self.created_by   = created_by

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__


COST_CATEGORIES = ["infra", "ai_api", "saas", "support", "marketing", "other"]


class CostLedgerRepository:
    """CRUD operations for cost_ledger table."""

    def _row_to_entry(self, row: Dict) -> CostEntry:
        return CostEntry(
            id           = row["id"],
            category     = row["category"],
            description  = row["description"],
            amount_usd   = float(row.get("amount_usd", 0.0)),
            currency     = row.get("currency", "USD"),
            vendor       = row.get("vendor"),
            invoice_ref  = row.get("invoice_ref"),
            period_month = row["period_month"],
            created_at   = row["created_at"],
            created_by   = row.get("created_by"),
        )

    def list_entries(
        self,
        period_month: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> List[CostEntry]:
        """List cost entries, optionally filtered by month (YYYY-MM) and category."""
        conditions = []
        params     = []
        if period_month:
            conditions.append("period_month = ?")
            params.append(period_month)
        if category:
            conditions.append("category = ?")
            params.append(category)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"SELECT * FROM cost_ledger {where} ORDER BY period_month DESC, created_at DESC LIMIT ? OFFSET ?"
        params += [limit, offset]

        rows = admin_db.fetch_all(query, tuple(params))
        return [self._row_to_entry(r) for r in rows]

    def create_entry(
        self,
        category: str,
        description: str,
        amount_usd: float,
        period_month: str,
        currency: str = "USD",
        vendor: Optional[str] = None,
        invoice_ref: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> CostEntry:
        """Insert a new cost ledger entry."""
        entry_id = f"cost_{uuid.uuid4().hex[:12]}"
        now_iso  = datetime.now(timezone.utc).isoformat()

        admin_db.execute(
            """INSERT INTO cost_ledger
               (id, category, description, amount_usd, currency, vendor, invoice_ref, period_month, created_at, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (entry_id, category, description, amount_usd, currency, vendor, invoice_ref, period_month, now_iso, created_by),
        )

        return CostEntry(
            id=entry_id, category=category, description=description,
            amount_usd=amount_usd, currency=currency, vendor=vendor,
            invoice_ref=invoice_ref, period_month=period_month,
            created_at=now_iso, created_by=created_by,
        )

    def delete_entry(self, entry_id: str) -> bool:
        """Delete a cost entry by ID. Returns True if deleted."""
        rowcount = admin_db.execute("DELETE FROM cost_ledger WHERE id = ?", (entry_id,))
        return rowcount > 0

    def get_monthly_summary(self) -> List[Dict[str, Any]]:
        """Return total cost grouped by month and category — feeds gross margin chart."""
        rows = admin_db.fetch_all(
            """SELECT period_month, category, SUM(amount_usd) as total_usd
               FROM cost_ledger
               GROUP BY period_month, category
               ORDER BY period_month DESC"""
        )
        # Aggregate into monthly buckets
        months: Dict[str, Dict] = {}
        for row in rows:
            m = row["period_month"]
            if m not in months:
                months[m] = {"period_month": m, "total_usd": 0.0, "by_category": {}}
            months[m]["total_usd"]                         += float(row["total_usd"])
            months[m]["by_category"][row["category"]]       = float(row["total_usd"])

        return list(months.values())

    def get_total_for_month(self, period_month: str) -> float:
        """Return total cost for a given month (YYYY-MM)."""
        row = admin_db.fetch_one(
            "SELECT SUM(amount_usd) as total FROM cost_ledger WHERE period_month = ?",
            (period_month,)
        )
        return float((row or {}).get("total", 0.0) or 0.0)


cost_ledger_repository = CostLedgerRepository()
