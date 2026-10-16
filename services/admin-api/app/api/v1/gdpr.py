"""
gdpr.py — Real GDPR "Right to be Forgotten" export & purge.

Reads/writes the shared Supabase Postgres tables directly via `admin_db`
(the same cross-service raw-SQL pattern already used by analytics_client.py
and quota_client.py for cross-service admin reporting) rather than fabricating
a success response — the previous frontend implementation of this page
called toast.success() directly with no backend call at all, so a "Purge
User Data" click did nothing while telling the admin it had.

Purge is a soft-delete: the account row is anonymized in place (email
replaced with a random placeholder, PII columns nulled, status set to
'deleted') rather than DELETEd, so foreign keys from documents/subscriptions/
billing_invoices stay valid and financial/billing records survive for
regulatory retention. Session and password-reset rows, which have no
retention value once the account is gone, are hard-deleted so no stale
refresh token can keep the account signed in anywhere.

Table names below were verified against the live database's actual
`information_schema`, not assumed from services/auth/prisma/schema.prisma —
that file's `LoginEvent`/`Referral` models were never migrated (no such
tables exist yet), and `users`/`sessions` are ambiguous names shared with
Supabase's own `auth` schema. The real login/session-activity tables here
are admin-api's own `ip_access_logs` and `active_sessions`, both keyed by
`user_email` rather than `userId` — so they're queried with the account's
*current* email before it gets overwritten below, never with `user_id`.
"""
import io
import json
import uuid
import hashlib
import os
from shared.service_auth import async_service_client
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.exceptions import NotFoundException, ValidationException
from app.db.admin_db import admin_db
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_totp_2fa
from app.security.permissions import require_permission
from app.services.audit_service import audit_service

router = APIRouter(prefix="/admin/gdpr", tags=["GDPR & Data Compliance"])


if os.getenv('ADMIN_RUN_MIGRATIONS','true')=='true':
    admin_db.execute('CREATE TABLE IF NOT EXISTS gdpr_purge_requests (email_digest TEXT PRIMARY KEY,user_id TEXT NOT NULL,status TEXT NOT NULL,anonymized_email TEXT)')


class GdprPurgeRequest(BaseModel):
    email: str


def _get_user_by_email(email: str) -> Dict[str, Any]:
    row = admin_db.fetch_one('SELECT id,email,"fullName",plan,status,"isGuest","createdAt","lastLoginAt" FROM users WHERE LOWER(email) = LOWER(?)', (email.strip(),))
    if not row:
        raise NotFoundException(f"No user account found with email '{email}'")
    return dict(row)


@router.get("/export")
async def export_user_data(
    email: str,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "view")),
):
    """Real per-account data export across every service's shared tables —
    account profile, documents, subscriptions, invoices, and recent login
    history. Returned as a downloadable JSON archive."""
    user = _get_user_by_email(email)
    user_id = user["id"]

    documents = admin_db.fetch_all(
        'SELECT id, "documentType", "templateId", title, status, "createdAt" '
        'FROM documents WHERE "userId" = ? ORDER BY "createdAt" DESC',
        (user_id,),
    )
    subscriptions = admin_db.fetch_all(
        'SELECT id, "planId", gateway, status, "currentPeriodStart", "currentPeriodEnd", "createdAt" '
        'FROM subscriptions WHERE "userId" = ?',
        (user_id,),
    )
    invoices = admin_db.fetch_all(
        'SELECT id, "gatewayInvoiceId", gateway, amount, currency, status, "createdAt", "paidAt" '
        'FROM billing_invoices WHERE "userId" = ?',
        (user_id,),
    )
    access_logs = admin_db.fetch_all(
        "SELECT ip_address, action, user_agent, created_at "
        "FROM ip_access_logs WHERE user_email = ? ORDER BY created_at DESC LIMIT 100",
        (user["email"],),
    )

    archive = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": {
            "id": user["id"],
            "email": user["email"],
            "fullName": user.get("fullName"),
            "plan": user.get("plan"),
            "status": user.get("status"),
            "isGuest": user.get("isGuest"),
            "createdAt": str(user.get("createdAt")),
            "lastLoginAt": str(user.get("lastLoginAt")) if user.get("lastLoginAt") else None,
        },
        "documents": [dict(d) for d in documents],
        "subscriptions": [dict(s) for s in subscriptions],
        "billing_invoices": [dict(i) for i in invoices],
        "recent_access_logs": [dict(a) for a in access_logs],
    }

    audit_service.log_action(
        admin=admin,
        action="gdpr.data_exported",
        module="gdpr",
        request=request,
        details={"exported_email": user["email"]},
    )

    body = json.dumps(archive, indent=2, default=str).encode("utf-8")
    filename = f"gdpr_export_{user_id}.json"
    return StreamingResponse(
        io.BytesIO(body),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/purge")
async def purge_user_data(
    payload: GdprPurgeRequest,
    request: Request,
    admin: AdminUserPayload = Depends(require_permission("users", "delete")),
    totp_admin: AdminUserPayload = Depends(require_totp_2fa),
):
    """Soft-delete purge: anonymizes the account's PII in place and hard-
    deletes session/password-reset rows, so the account is actually
    unusable and de-identified rather than merely flagged in the UI."""
    digest=hashlib.sha256(payload.email.strip().lower().encode()).hexdigest()
    intent=admin_db.fetch_one('SELECT * FROM gdpr_purge_requests WHERE email_digest=?',(digest,))
    if not intent:
        user=_get_user_by_email(payload.email)
        admin_db.execute("INSERT INTO gdpr_purge_requests(email_digest,user_id,status) VALUES(?,?,'pending') ON CONFLICT(email_digest) DO NOTHING",(digest,user['id']))
        intent=admin_db.fetch_one('SELECT * FROM gdpr_purge_requests WHERE email_digest=?',(digest,))
    user_id=intent['user_id']
    if intent['status']=='complete':return {'status':'purged','user_id':user_id,'anonymized_email':intent['anonymized_email']}
    from app.core.config import settings
    from fastapi import HTTPException
    try:
        from urllib.parse import quote
        async with async_service_client('auth',timeout=5) as client:
            result=await client.post(settings.AUTH_SERVICE_URL+'/internal/users/'+quote(user_id,safe='')+'/anonymize')
            result.raise_for_status();anonymized_email=result.json()['anonymized_email']
        async with async_service_client('document',timeout=5) as client:
            result=await client.post(settings.DOCUMENT_SERVICE_URL+'/v1/document/internal/users/'+quote(user_id,safe='')+'/anonymize')
            result.raise_for_status()
    except Exception as error:raise HTTPException(503,'Account purge remains pending; retry the same account to resume') from error
    admin_db.execute('DELETE FROM ip_access_logs WHERE user_email=?',(payload.email,))
    admin_db.execute('DELETE FROM active_sessions WHERE user_email=?',(payload.email,))

    audit_service.log_action(
        admin=admin,
        action="gdpr.user_purged",
        module="gdpr",
        request=request,
        details={"purged_email": payload.email, "user_id": user_id},
        totp_verified=True,
    )

    admin_db.execute("UPDATE gdpr_purge_requests SET status='complete',anonymized_email=? WHERE email_digest=?",(anonymized_email,digest))
    return {"status": "purged", "user_id": user_id, "anonymized_email": anonymized_email}
