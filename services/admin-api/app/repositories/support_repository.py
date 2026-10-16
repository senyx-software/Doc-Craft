"""
support_repository.py — Database repository for all support-related data.

Manages:
  - support_tickets       (user reported issues)
  - refund_requests       (refund requests)
  - contact_submissions   (contact form)
  - plan_override_requests (manual plan override requests)

All data persisted to PostgreSQL or SQLite via admin_db.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.admin_db import admin_db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ─── Support Tickets ──────────────────────────────────────────────────────────

def create_ticket(
    user_email: str,
    subject: str,
    message: str,
    category: str = "general",
    priority: str = "medium",
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    ticket_id = _gen_id("tkt")
    now = _now()
    admin_db.execute(
        """INSERT OR REPLACE INTO support_tickets
           (id, user_id, user_email, subject, message, category, priority,
            status, session_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)""",
        (ticket_id, user_id, user_email, subject, message, category, priority,
         session_id, now, now),
    )
    return get_ticket(ticket_id)  # type: ignore


def list_tickets(
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    conditions, params = [], []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if category:
        conditions.append("category = ?")
        params.append(category)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.extend([limit, offset])
    return admin_db.fetch_all(
        f"SELECT * FROM support_tickets {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        tuple(params),
    )


def get_ticket(ticket_id: str) -> Optional[Dict[str, Any]]:
    return admin_db.fetch_one("SELECT * FROM support_tickets WHERE id = ?", (ticket_id,))


def update_ticket(ticket_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [ticket_id]
    admin_db.execute(
        f"UPDATE support_tickets SET {set_clause} WHERE id = ?", tuple(values)
    )
    return get_ticket(ticket_id)


# ─── Refund Requests ──────────────────────────────────────────────────────────

def create_refund_request(
    user_email: str,
    reason: str,
    user_id: Optional[str] = None,
    subscription_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    amount: Optional[float] = None,
    currency: str = "USD",
    gateway: Optional[str] = None,
) -> Dict[str, Any]:
    refund_id = _gen_id("rfnd")
    now = _now()
    admin_db.execute(
        """INSERT OR REPLACE INTO refund_requests
           (id, user_id, user_email, subscription_id, invoice_id, amount, currency,
            gateway, reason, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)""",
        (refund_id, user_id, user_email, subscription_id, invoice_id, amount,
         currency, gateway, reason, now, now),
    )
    return get_refund_request(refund_id)  # type: ignore


def list_refund_requests(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    params: list = []
    where = ""
    if status:
        where = "WHERE status = ?"
        params.append(status)
    params.extend([limit, offset])
    return admin_db.fetch_all(
        f"SELECT * FROM refund_requests {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        tuple(params),
    )


def get_refund_request(refund_id: str) -> Optional[Dict[str, Any]]:
    return admin_db.fetch_one("SELECT * FROM refund_requests WHERE id = ?", (refund_id,))


def update_refund_request(refund_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [refund_id]
    admin_db.execute(
        f"UPDATE refund_requests SET {set_clause} WHERE id = ?", tuple(values)
    )
    return get_refund_request(refund_id)


# ─── Contact Submissions ──────────────────────────────────────────────────────

def create_contact_submission(
    name: str,
    email: str,
    subject: str,
    message: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    contact_id = _gen_id("ctct")
    now = _now()
    admin_db.execute(
        """INSERT OR REPLACE INTO contact_submissions
           (id, name, email, subject, message, user_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'unread', ?, ?)""",
        (contact_id, name, email, subject, message, user_id, now, now),
    )
    return get_contact_submission(contact_id)  # type: ignore


def list_contact_submissions(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    params: list = []
    where = ""
    if status:
        where = "WHERE status = ?"
        params.append(status)
    params.extend([limit, offset])
    return admin_db.fetch_all(
        f"SELECT * FROM contact_submissions {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        tuple(params),
    )


def get_contact_submission(contact_id: str) -> Optional[Dict[str, Any]]:
    return admin_db.fetch_one("SELECT * FROM contact_submissions WHERE id = ?", (contact_id,))


def update_contact_submission(contact_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [contact_id]
    admin_db.execute(
        f"UPDATE contact_submissions SET {set_clause} WHERE id = ?", tuple(values)
    )
    return get_contact_submission(contact_id)


# ─── Plan Override Requests ───────────────────────────────────────────────────

def create_override_request(
    user_email: str,
    requested_plan: str,
    reason: str,
    user_id: Optional[str] = None,
    current_plan: Optional[str] = None,
    requested_quota: Optional[int] = None,
) -> Dict[str, Any]:
    override_id = _gen_id("ovr")
    now = _now()
    admin_db.execute(
        """INSERT OR REPLACE INTO plan_override_requests
           (id, user_id, user_email, requested_plan, current_plan, reason,
            requested_quota, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)""",
        (override_id, user_id, user_email, requested_plan, current_plan, reason,
         requested_quota, now, now),
    )
    return get_override_request(override_id)  # type: ignore


def list_override_requests(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    params: list = []
    where = ""
    if status:
        where = "WHERE status = ?"
        params.append(status)
    params.extend([limit, offset])
    return admin_db.fetch_all(
        f"SELECT * FROM plan_override_requests {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        tuple(params),
    )


def get_override_request(override_id: str) -> Optional[Dict[str, Any]]:
    return admin_db.fetch_one("SELECT * FROM plan_override_requests WHERE id = ?", (override_id,))


def update_override_request(override_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [override_id]
    admin_db.execute(
        f"UPDATE plan_override_requests SET {set_clause} WHERE id = ?", tuple(values)
    )
    return get_override_request(override_id)
