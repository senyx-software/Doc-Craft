from shared.queue_auth import signed_job, verified_job
from scripts.audit_fixtures.service_identity import CONFIGS
from types import SimpleNamespace
from unittest.mock import Mock, AsyncMock
import pytest
from app.workers import pdf_worker

@pytest.mark.asyncio
@pytest.mark.parametrize("plan", ["pro", "max"])
async def test_notification_failure_cannot_invalidate_a_persisted_pdf_or_refund_its_quota(monkeypatch, plan):
    record = SimpleNamespace(id="doc",status="pending",pdfKey="",userId="u",documentType="invoice",templateId="classic",slots={},plan=plan)
    db = Mock()
    db.query.return_value.filter.return_value.first.return_value = record
    monkeypatch.setattr(pdf_worker, "SessionLocal", lambda: db)
    monkeypatch.setattr(pdf_worker, "render_template_to_html", lambda *args: "<p>Fixture</p>")
    monkeypatch.setattr(pdf_worker, "generate_pdf_via_sidecar", AsyncMock(return_value=b"%PDF-fixture"))
    monkeypatch.setattr(pdf_worker, "upload_pdf", lambda *args: "fixture.pdf")
    monkeypatch.setattr(pdf_worker, "get_signed_url", lambda *args: "http://fixture.invalid/document")
    monkeypatch.setattr(pdf_worker, "track_product_event", Mock())
    refund = AsyncMock()
    monkeypatch.setattr(pdf_worker, "refund_quota_unit", refund)
    queued = []
    class BrokenQueue:
        def __init__(self, *args): pass
        async def add(self, name, data, opts):
            queued.append((name, verified_job("email_queue_document",SimpleNamespace(name=name,data=data,id=opts["jobId"]),CONFIGS["notification"])))
            raise RuntimeError("synthetic queue outage")
        async def close(self): pass
    monkeypatch.setattr(pdf_worker, "Queue", BrokenQueue)
    job = SimpleNamespace(id="doc", data={"documentId":"doc", "userId":"u", "userPlan":plan, "userEmail":"fixture@example.com", "documentType":"invoice", "title":"Fixture", "slots":{}})
    job.name="generate_pdf"
    job.data=signed_job("document",job.name,job.data,job.id)["data"]
    await pdf_worker.process_pdf_job(job, None)
    assert record.status == "success"
    assert record.pdfKey == "fixture.pdf"
    refund.assert_not_called()
    assert queued[0][0] == "document_ready"
    assert queued[0][1]["documentUrl"] == "http://fixture.invalid/document"
    assert queued[0][1]["userId"] == "u"
    db.close.assert_called_once()


@pytest.mark.asyncio
async def test_signed_job_with_mismatched_owner_cannot_damage_or_refund_existing_document(monkeypatch):
    record=SimpleNamespace(id="victim",userId="owner",documentType="invoice",templateId="classic",slots={},plan="free",status="success",pdfKey="victim.pdf")
    db=Mock();db.query.return_value.filter.return_value.first.return_value=record
    monkeypatch.setattr(pdf_worker,"SessionLocal",lambda:db)
    refund=AsyncMock();monkeypatch.setattr(pdf_worker,"refund_quota_unit",refund)
    monkeypatch.setattr(pdf_worker,"track_product_event",Mock())
    job=SimpleNamespace(id="forged",name="generate_pdf",opts={"attempts":1},attemptsMade=0)
    job.data=signed_job("document",job.name,{"documentId":"victim","userId":"attacker","documentType":"invoice","slots":{}},job.id)["data"]
    with pytest.raises(ValueError,match="does not match"):
        await pdf_worker.process_pdf_job(job,None)
    assert record.status=="success"
    db.commit.assert_not_called()
    refund.assert_not_called()
