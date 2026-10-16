"""
reports.py — Real flat-file CSV export of the user registry, for the
Settings > Export Data (CSV) page. The previous frontend implementation's
"Download Full Database Export" button called toast.success() directly with
no backend call and produced no file at all; this streams a real CSV built
from the shared Postgres tables (same admin_db cross-service raw-SQL pattern
used by gdpr.py, analytics_client.py, and quota_client.py).
"""
import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.db.admin_db import admin_db
from app.security.authentication import AdminUserPayload
from app.security.permissions import require_permission

router = APIRouter(prefix="/admin/reports", tags=["Reports & Export"])


@router.get("/users-csv")
async def export_users_csv(
    admin: AdminUserPayload = Depends(require_permission("users", "view")),
):
    """Real user registry export: every account joined with its current
    subscription (if any), as a flat CSV."""
    rows = admin_db.fetch_all(
        'SELECT u.id, u.email, u."fullName", u.plan, u.status, u."isGuest", '
        'u."createdAt", u."lastLoginAt", s.status as subscription_status, s.gateway as subscription_gateway '
        'FROM users u LEFT JOIN subscriptions s ON s."userId" = u.id '
        'ORDER BY u."createdAt" DESC'
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "email", "full_name", "plan", "status", "is_guest",
        "created_at", "last_login_at", "subscription_status", "subscription_gateway",
    ])
    for row in rows:
        r = dict(row)
        writer.writerow([
            r.get("id"), r.get("email"), r.get("fullName") or "", r.get("plan"), r.get("status"),
            r.get("isGuest"), r.get("createdAt"), r.get("lastLoginAt") or "",
            r.get("subscription_status") or "", r.get("subscription_gateway") or "",
        ])

    body = buffer.getvalue().encode("utf-8")
    return StreamingResponse(
        io.BytesIO(body),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="doccraft_user_registry.csv"'},
    )
