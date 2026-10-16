from shared.service_auth import async_service_client
"""
support.py — Admin API router for Support Management.

Provides admin-facing endpoints to view, triage, and resolve:
  - User Reported Issues (support tickets)
  - Refund Requests
  - Contact Form Submissions
  - Manual Plan Override Requests

Also exposes PUBLIC user-facing endpoints (no admin auth) for
users to actually submit each type of request.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr
import httpx

from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service
from app.repositories import support_repository
from app.integrations.services.auth_client import auth_client

router = APIRouter(tags=["Support Management"])


@router.get("/admin/support/sessions/{session_id}")
async def inspect_support_session(session_id: str, request: Request, admin: AdminUserPayload = Depends(require_permission("support", "view"))):
    from uuid import UUID
    from app.integrations.mcp.chat_client import ReadOnlyChatMCPClient
    try:
        UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session identifier")
    resource = await ReadOnlyChatMCPClient().inspect_chat_session_resource(session_id, "")
    audit_service.log_action(admin=admin, module="support", action="support.session_inspected", details={"session_id": session_id}, request=request)
    return resource


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class TicketCreateSchema(BaseModel):
    user_email: str
    subject: str
    message: str
    category: str = "general"
    priority: str = "medium"
    user_id: Optional[str] = None
    session_id: Optional[str] = None


class TicketUpdateSchema(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    resolution_notes: Optional[str] = None
    priority: Optional[str] = None


class RefundCreateSchema(BaseModel):
    user_email: str
    reason: str
    user_id: Optional[str] = None
    subscription_id: Optional[str] = None
    invoice_id: Optional[str] = None
    amount: Optional[float] = None
    currency: str = "USD"
    gateway: Optional[str] = None


class RefundUpdateSchema(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    resolved_by: Optional[str] = None


class ContactCreateSchema(BaseModel):
    name: str
    email: str
    subject: str
    message: str
    user_id: Optional[str] = None


class ContactUpdateSchema(BaseModel):
    status: Optional[str] = None
    admin_reply: Optional[str] = None


class OverrideRequestCreateSchema(BaseModel):
    user_email: str
    requested_plan: str
    reason: str
    user_id: Optional[str] = None
    current_plan: Optional[str] = None
    requested_quota: Optional[int] = None


class OverrideRequestUpdateSchema(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    resolved_by: Optional[str] = None


# ─── PUBLIC endpoints (user-submitted) ───────────────────────────────────────
# These are called from the USER frontend without admin auth.

@router.post("/support/tickets", status_code=status.HTTP_201_CREATED)
async def public_submit_ticket(payload: TicketCreateSchema):
    """Submit a new user reported issue / support ticket."""
    ticket = support_repository.create_ticket(
        user_email=payload.user_email,
        subject=payload.subject,
        message=payload.message,
        category=payload.category,
        priority=payload.priority,
        user_id=payload.user_id,
        session_id=payload.session_id,
    )
    return {"status": "created", "ticket": ticket}


@router.post("/support/refunds", status_code=status.HTTP_201_CREATED)
async def public_submit_refund(payload: RefundCreateSchema):
    """Submit a new refund request from user."""
    req = support_repository.create_refund_request(
        user_email=payload.user_email,
        reason=payload.reason,
        user_id=payload.user_id,
        subscription_id=payload.subscription_id,
        invoice_id=payload.invoice_id,
        amount=payload.amount,
        currency=payload.currency,
        gateway=payload.gateway,
    )
    return {"status": "created", "refund_request": req}


@router.post("/support/contact", status_code=status.HTTP_201_CREATED)
async def public_submit_contact(payload: ContactCreateSchema):
    """Submit a new contact form message."""
    submission = support_repository.create_contact_submission(
        name=payload.name,
        email=payload.email,
        subject=payload.subject,
        message=payload.message,
        user_id=payload.user_id,
    )
    return {"status": "created", "submission": submission}


@router.post("/support/plan-override-requests", status_code=status.HTTP_201_CREATED)
async def public_submit_override_request(payload: OverrideRequestCreateSchema):
    """Submit a manual plan upgrade / override request from user."""
    req = support_repository.create_override_request(
        user_email=payload.user_email,
        requested_plan=payload.requested_plan,
        reason=payload.reason,
        user_id=payload.user_id,
        current_plan=payload.current_plan,
        requested_quota=payload.requested_quota,
    )
    return {"status": "created", "override_request": req}


# ─── ADMIN endpoints ──────────────────────────────────────────────────────────

# --- Support Tickets (admin) ---

@router.get("/admin/support/tickets")
async def admin_list_tickets(
    status_filter: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUserPayload = Depends(require_permission("support", "view")),
):
    """List all support tickets (admin)."""
    tickets = support_repository.list_tickets(
        status=status_filter,
        category=category,
        limit=limit,
        offset=offset,
    )
    return {"status": "success", "data": tickets, "total": len(tickets)}


@router.get("/admin/support/tickets/{ticket_id}")
async def admin_get_ticket(
    ticket_id: str,
    admin: AdminUserPayload = Depends(require_permission("support", "view")),
):
    ticket = support_repository.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"status": "success", "ticket": ticket}


@router.patch("/admin/support/tickets/{ticket_id}")
async def admin_update_ticket(
    ticket_id: str,
    payload: TicketUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("support", "edit")),
):
    """Update ticket status, assignment, or resolution notes."""
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    ticket = support_repository.update_ticket(ticket_id, updates)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    audit_service.log_action(
        admin=admin, action="support.ticket_updated", module="support",
        request=request, details={"ticket_id": ticket_id, "updates": updates},
    )
    return {"status": "success", "ticket": ticket}


@router.post("/admin/support/tickets/{ticket_id}/resolve")
async def admin_resolve_ticket(
    ticket_id: str,
    payload: TicketUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("support", "edit")),
):
    """Mark a ticket as resolved with optional resolution notes."""
    updates: dict = {"status": "resolved"}
    if payload.resolution_notes:
        updates["resolution_notes"] = payload.resolution_notes
    ticket = support_repository.update_ticket(ticket_id, updates)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    audit_service.log_action(
        admin=admin, action="support.ticket_resolved", module="support",
        request=request, details={"ticket_id": ticket_id},
    )
    return {"status": "success", "ticket": ticket}


# --- Refund Requests (admin) ---

@router.get("/admin/support/refunds")
async def admin_list_refunds(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUserPayload = Depends(require_permission("support", "view")),
):
    """List all refund requests (admin)."""
    refunds = support_repository.list_refund_requests(
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return {"status": "success", "data": refunds, "total": len(refunds)}


@router.patch("/admin/support/refunds/{refund_id}")
async def admin_update_refund(
    refund_id: str,
    payload: RefundUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("support", "edit")),
):
    """Approve, deny, or add notes to a refund request."""
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not updates.get("resolved_by") and payload.status in ("approved", "denied"):
        updates["resolved_by"] = admin.email
    refund = support_repository.update_refund_request(refund_id, updates)
    if not refund:
        raise HTTPException(status_code=404, detail="Refund request not found")
    audit_service.log_action(
        admin=admin, action="support.refund_updated", module="support",
        request=request, details={"refund_id": refund_id, "updates": updates},
    )
    return {"status": "success", "refund_request": refund}


# --- Contact Submissions (admin) ---

@router.get("/admin/support/contact")
async def admin_list_contacts(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUserPayload = Depends(require_permission("support", "view")),
):
    """List all contact form submissions (admin)."""
    contacts = support_repository.list_contact_submissions(
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return {"status": "success", "data": contacts, "total": len(contacts)}


@router.patch("/admin/support/contact/{contact_id}")
async def admin_update_contact(
    contact_id: str,
    payload: ContactUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("support", "edit")),
):
    """Mark a contact submission as read / replied."""
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    contact = support_repository.update_contact_submission(contact_id, updates)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact submission not found")
    audit_service.log_action(
        admin=admin, action="support.contact_updated", module="support",
        request=request, details={"contact_id": contact_id, "updates": updates},
    )
    return {"status": "success", "submission": contact}


# --- Plan Override Requests (admin) ---

@router.get("/admin/support/plan-overrides")
async def admin_list_overrides(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: AdminUserPayload = Depends(require_permission("support", "view")),
):
    """List all manual plan override requests (admin)."""
    overrides = support_repository.list_override_requests(
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return {"status": "success", "data": overrides, "total": len(overrides)}


async def _apply_override_grant(existing: dict, override_id: str, admin: AdminUserPayload) -> tuple:
    """
    Actually applies an approved override: reassigns the user's plan in the
    Auth Service and, if a specific quota was requested, grants it via the
    Quota Service. Returns (applied, warnings) — never raises, so a
    downstream failure doesn't block the status change itself; it's surfaced
    in `warnings` and the audit record instead.
    """
    applied: dict = {}
    warnings: list = []
    user_id = existing.get("user_id")

    if not user_id:
        warnings.append("Request has no linked user_id — plan/quota could not be applied automatically.")
        return applied, warnings

    if existing.get("requested_plan"):
        try:
            await auth_client.update_user_plan(user_id, existing["requested_plan"])
            applied["plan"] = existing["requested_plan"]
        except Exception as e:
            warnings.append(f"Failed to update plan in Auth Service: {e}")

    if existing.get("requested_quota") is not None:
        try:
            from app.repositories.plan_repository import plan_repository
            from app.integrations.services.quota_client import quota_client

            plan_repository.set_user_quota_override(
                user_id=user_id,
                custom_quota=int(existing["requested_quota"]),
                admin_id=admin.admin_id,
                reason=f"Approved plan override request {override_id}",
            )
            async with async_service_client("quota", timeout=5.0) as client:
                await client.post(
                    f"{quota_client.local_url}/v1/quota/override",
                    headers={"X-Internal-Secret": quota_client.secret},
                    json={
                        "userId": user_id,
                        "overrideLimit": int(existing["requested_quota"]),
                        "reason": f"Approved plan override request {override_id}",
                        "adminId": admin.admin_id,
                    },
                )
            applied["quota"] = existing["requested_quota"]
        except Exception as e:
            warnings.append(f"Failed to grant quota override in Quota Service: {e}")

    return applied, warnings


@router.patch("/admin/support/plan-overrides/{override_id}")
async def admin_update_override(
    override_id: str,
    payload: OverrideRequestUpdateSchema,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("support", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Approve or deny a plan override request. Approving actually applies the
    plan/quota change (Protected: support:edit + 2FA)."""
    existing = support_repository.get_override_request(override_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Override request not found")

    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    if not updates.get("resolved_by") and payload.status in ("approved", "denied"):
        updates["resolved_by"] = admin.email

    applied, warnings = ({}, [])
    if payload.status == "approved":
        applied, warnings = await _apply_override_grant(existing, override_id, admin)

    override = support_repository.update_override_request(override_id, updates)
    audit_service.log_action(
        admin=admin, action="support.override_request_updated", module="support",
        request=request, details={"override_id": override_id, "updates": updates, "applied": applied, "warnings": warnings},
        totp_verified=True,
    )
    return {"status": "success", "override_request": override, "applied": applied, "warnings": warnings}


@router.post("/admin/support/plan-overrides/{override_id}/approve")
async def admin_approve_override(
    override_id: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("support", "edit")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """
    Approve a plan override request and actually apply it: reassigns the
    user's plan in the Auth Service and, if a specific quota was requested,
    grants it via the Quota Service — not just a status flip on the request row.
    """
    existing = support_repository.get_override_request(override_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Override request not found")

    applied, warnings = await _apply_override_grant(existing, override_id, admin)

    override = support_repository.update_override_request(override_id, {
        "status": "approved",
        "resolved_by": admin.email,
    })

    audit_service.log_action(
        admin=admin, action="support.override_request_approved", module="support",
        request=request, details={"override_id": override_id, "applied": applied, "warnings": warnings},
        totp_verified=True,
    )
    return {"status": "success", "override_request": override, "applied": applied, "warnings": warnings}
