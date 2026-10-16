from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import create_test_admin_access_token as create_admin_access_token

client = TestClient(app)

def get_auth_headers():
    token = create_admin_access_token(
        admin_id="adm_001",
        email="tech@senyxsoftware.com",
        role_name="Super Admin",
        permissions=["*"],
        is_super_admin=True,
    )
    return {"Authorization": f"Bearer {token}", "X-Forwarded-For": "127.0.0.1"}


def test_analytics_overview_endpoint():
    """Verify GET /api/v1/admin/analytics/overview returns analytics data."""
    res = client.get("/api/v1/admin/analytics/overview", headers=get_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "total_users" in data
    assert "total_generations" in data
    assert "mrr" in data
    assert "arr" in data


def test_analytics_revenue_endpoint():
    """Verify GET /api/v1/admin/analytics/revenue returns MRR and ARR breakdown."""
    res = client.get("/api/v1/admin/analytics/revenue", headers=get_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "mrr" in data
    assert "arr" in data


def test_analytics_generations_endpoint():
    """Verify GET /api/v1/admin/analytics/generations returns document generation stats."""
    res = client.get("/api/v1/admin/analytics/generations", headers=get_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "by_type" in data
    assert "by_tier" in data


def test_detailed_generations_reflects_real_events_not_fabricated_split():
    """
    Regression test: get_detailed_generations() used to (a) invent a
    percentage split across document types when there was no real data, and
    (b) classify free/pro using Quota's `overrideLimit > 5` proxy, which
    misclassifies real Pro users who never got a manual override. Both are
    fixed to source directly from the Document Service's own `documents`
    table (admin-api and the Document Service share the same Postgres
    database — there is no longer a separate generation_events table or
    reporting endpoint), reading its real `plan`/`documentType` columns.
    """
    from datetime import datetime, timezone
    from app.db.admin_db import admin_db

    doc_ids = ["doc_pro_1", "doc_pro_2", "doc_free_1"]
    # This test writes directly into the real `documents` table (admin-api and
    # the Document Service share the same Postgres database — see module
    # docstring). Clean up both before and after so a hardcoded id doesn't
    # collide with a leftover row from a prior run.
    def _cleanup():
        for doc_id in doc_ids:
            admin_db.execute('DELETE FROM documents WHERE id = ?', (doc_id,))

    _cleanup()
    try:
        now = datetime.now(timezone.utc).isoformat()
        # Simulate what the Document Service itself writes directly to `documents`
        # (two real pro-tier invoice generations, one free-tier failure).
        for row in [
            ("doc_pro_1", "usr_pro_1", "pro1@doccraft.app", "pro", "invoice", "success", None),
            ("doc_pro_2", "usr_pro_1", "pro1@doccraft.app", "pro", "invoice", "success", None),
            ("doc_free_1", "usr_free_1", "free1@doccraft.app", "free", "quotation", "failed", "Missing client_name"),
        ]:
            doc_id, user_id, user_email, plan, doc_type, status, error_message = row
            admin_db.execute(
                'INSERT INTO documents (id, "userId", "userEmail", plan, "documentType", "templateId", title, slots, status, "errorMessage", "pdfKey", "createdAt") '
                "VALUES (?, ?, ?, ?, ?, 'classic', 'Test Doc', '{}', ?, ?, '', ?)",
                (doc_id, user_id, user_email, plan, doc_type, status, error_message, now),
            )

        res = client.get("/api/v1/admin/analytics/generations/detailed", headers=get_auth_headers())
        assert res.status_code == 200
        data = res.json()

        # by_type must reflect the real doc_type breakdown, not an invented split.
        invoice_row = next((t for t in data["by_type"] if t["name"] == "Invoice"), None)
        assert invoice_row is not None
        assert invoice_row["count"] >= 2

        # Top users must carry the real per-event plan, not a heuristic guess.
        pro_user = next((u for u in data["top_users"] if u["id"] == "usr_pro_1"), None)
        assert pro_user is not None
        assert pro_user["plan"] == "pro"
        assert pro_user["email"] == "pro1@doccraft.app"

        # The logged failure must appear verbatim, not a mislabeled audit-log row.
        failure = next((f for f in data["failed_generations"] if f["user"] == "free1@doccraft.app"), None)
        assert failure is not None
        assert failure["error"] == "Missing client_name"

        # recent_generations (the admin "Generated Document Logs" table's real
        # backing data) must show actual rows with their real status — not an
        # audit-log row mislabeled as a document, and never a fabricated file
        # size (there's no byte-size column on `documents` at all).
        recent_ids = {r["id"] for r in data["recent_generations"]}
        assert {"doc_pro_1", "doc_pro_2", "doc_free_1"}.issubset(recent_ids)
        failed_row = next(r for r in data["recent_generations"] if r["id"] == "doc_free_1")
        assert failed_row["status"] == "failed"
        assert failed_row["type"] == "Quotation"
        assert "size" not in failed_row
    finally:
        _cleanup()


def test_analytics_users_endpoint():
    """Verify GET /api/v1/admin/analytics/users returns user class breakdown."""
    res = client.get("/api/v1/admin/analytics/users", headers=get_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "by_status" in data


def test_analytics_traffic_endpoint():
    """Verify GET /api/v1/admin/analytics/traffic returns acquisition sources and funnel."""
    res = client.get("/api/v1/admin/analytics/traffic", headers=get_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "sources" in data
    assert "devices" in data
    assert "geographic" in data
    assert "funnel" in data


def test_posthog_config_endpoint():
    """Verify GET /api/v1/admin/analytics/posthog/config returns PostHog telemetry config."""
    res = client.get("/api/v1/admin/analytics/posthog/config", headers=get_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "partially_configured"
    assert "posthog_host" in data
    assert "api_key_masked" in data


def test_track_posthog_event_endpoint():
    """Verify POST /api/v1/admin/analytics/events enqueues PostHog event."""
    res = client.post(
        "/api/v1/admin/analytics/events",
        json={"event_name": "test_button_clicked", "properties": {"btn_id": "cta_signup"}},
        headers=get_auth_headers(),
    )
    assert res.status_code == 202
    data = res.json()
    assert data["status"] == "queued"
    assert data["event_name"] == "test_button_clicked"
