from shared.queue_auth import verified_job
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
sys.path.insert(0,str(Path(__file__).parents[1]))
from app.routers import document
from app.services.document_contract import validated_document
BASE={"businessName":"Nexora","clientName":"Acme","invoiceNumber":"INV-1","issueDate":"2026-10-12","dueDate":"2026-11-12","currency":"LKR","lineItems":[{"description":"Design","quantity":2,"unitPrice":100}],"taxRate":0}
@pytest.fixture
def isolated(monkeypatch):
    saved={"lookup_status":200,"state":{"userId":"u","documentType":"invoice","readyToGenerate":True,"canGenerate":True,"finalization":{"status":"confirmed"},"slots":validated_document("invoice",BASE)},"jobs":[]}
    class Client:
        def __init__(self,*a,**kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def get(self,*args,**kwargs):
            saved["auth"]=kwargs["headers"]["Authorization"]
            return SimpleNamespace(status_code=saved["lookup_status"],json=lambda:{"state":saved["state"],"userPlan":"free","userEmail":None})
        async def post(self,*args,**kwargs):return SimpleNamespace(status_code=200)
    class Queue:
        def __init__(self,*args,**kwargs):pass
        async def add(self,name,data,opts):saved["jobs"].append(verified_job("document",SimpleNamespace(name=name,data=data,id=opts["jobId"])));return SimpleNamespace(id=opts["jobId"])
        async def close(self):pass
    monkeypatch.setattr(document.httpx,"AsyncClient",Client)
    monkeypatch.setattr(document,"Queue",Queue)
    return saved,Mock()
@pytest.mark.asyncio
async def test_generation_preserves_authoritative_assets_and_ignores_client_media_injection(isolated):
    saved, db = isolated
    asset = {'id':'asset_one','role':'logo','name':'logo.png','width':1,'height':1,'src':'data:image/png;base64,AAAA'}
    saved['state']['assets'] = [asset]
    await document.generate_document({'documentType':'invoice','sessionId':'s','slots':{'documentAssets':[{'src':'Injected'}]}}, db=db, x_user_id='u', authorization='Bearer synthetic')
    assert saved['jobs'][0]['slots']['documentAssets'] == [asset]

@pytest.mark.asyncio
async def test_generation_uses_authorized_state_and_ignores_client_injection(isolated):
    saved,db=isolated
    r=await document.generate_document({"documentType":"invoice","sessionId":"s","slots":{"businessName":"Injected"}},db=db,x_user_id="u",x_user_plan="pro",x_user_email="spoof@test",authorization="Bearer synthetic")
    assert r["status"]=="queued"
    assert saved["jobs"][0]["slots"]["businessName"]=="Nexora"
    assert saved["jobs"][0]["userPlan"]=="free"
    assert saved["jobs"][0]["userEmail"] is None
    assert saved["auth"]=="Bearer synthetic"
    assert db.commit.call_count == 2
@pytest.mark.asyncio
@pytest.mark.parametrize("failure",["missing_auth","other_user","not_ready","unavailable","invalid"])
async def test_failed_lookup_validation_never_writes_or_queues(isolated,failure):
    saved,db=isolated
    if failure=="not_ready":saved["state"]["readyToGenerate"]=False
    if failure=="unavailable":saved["lookup_status"]=503
    if failure=="invalid":saved["state"]["slots"]["lineItems"]=[]
    with pytest.raises(document.HTTPException):
        await document.generate_document({"documentType":"invoice","sessionId":"s"},db=db,x_user_id="other" if failure=="other_user" else "u",authorization=None if failure=="missing_auth" else "Bearer synthetic")
    db.add.assert_not_called()
    db.commit.assert_not_called()
    assert saved["jobs"]==[]

@pytest.mark.parametrize("kind",["invoice","quotation","proposal","receipt","purchase_order"])
@pytest.mark.parametrize("variant",["classic","modern","minimal"])
def test_templates_render_only_validated_names_and_currency(kind,variant):
    from app.services.sidecar import render_template_to_html
    data=validated_document(kind,{**BASE,"paymentMethod":"Cash","subject":"Software project"})
    html=render_template_to_html(kind,variant,data)
    assert "Nexora" in html
    assert "Acme" in html
    assert "Software project" in html if kind=="proposal" else "Rs." in html
    assert "${" not in html
    if kind=="receipt":assert "200.00" in html

def test_proposal_text_is_html_escaped():
    from app.services.sidecar import render_template_to_html
    data=validated_document("proposal",{**BASE,"subject":"Project","businessServices":"<script>private()</script>"})
    html=render_template_to_html("proposal","classic",data)
    assert "<script>private()" not in html
    assert "&lt;script&gt;" in html

@pytest.mark.asyncio
async def test_generation_retry_returns_same_artifact_without_duplicate_queue_or_reservation(isolated):
    saved, db = isolated
    operation = "00000000-0000-4000-a000-000000000001"
    import uuid
    document_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"doccraft:u:s:{operation}"))
    existing = SimpleNamespace(id=document_id, userId="u", documentType="invoice", status="pending", slots={})
    db.query.return_value.filter.return_value.first.side_effect = [None, existing]
    payload = {"documentType": "invoice", "sessionId": "s", "operationId": operation}
    first = await document.generate_document(payload, db=db, x_user_id="u", authorization="Bearer synthetic")
    saved["state"]["readyToGenerate"] = False
    repeated = await document.generate_document(payload, db=db, x_user_id="u", authorization="Bearer synthetic")
    assert repeated["documentId"] == first["documentId"] == document_id
    assert repeated["replayed"] is True
    assert len(saved["jobs"]) == 1
    assert db.commit.call_count == 2

@pytest.mark.asyncio
async def test_generation_revision_conflict_never_queues(isolated):
    saved, db = isolated
    saved["state"]["revision"] = 12
    with pytest.raises(document.HTTPException) as error:
        await document.generate_document({"documentType":"invoice", "sessionId":"s", "expectedRevision":11}, db=db, x_user_id="u", authorization="Bearer synthetic")
    assert error.value.status_code == 409
    assert not saved["jobs"]
    db.add.assert_not_called()

@pytest.mark.asyncio
async def test_generation_invalid_operation_id_never_writes(isolated):
    saved, db = isolated
    with pytest.raises(document.HTTPException) as error:
        await document.generate_document({"documentType":"invoice", "sessionId":"s", "operationId":"invalid"}, db=db, x_user_id="u", authorization="Bearer synthetic")
    assert error.value.status_code == 400
    db.add.assert_not_called()
    db.commit.assert_not_called()
    assert not saved["jobs"]

@pytest.mark.asyncio
async def test_queue_failure_retains_durable_request_and_retries_same_job(isolated, monkeypatch):
    saved, db = isolated
    from app.models.document import Document
    record = Document(id="saved-id", userId="u", userEmail=None, plan="free", documentType="invoice", templateId="classic", title="Draft", status="pending", slots={**saved["state"]["slots"], "_source":{"queueState":"pending"}})
    attempts = []
    class FlakyQueue:
        def __init__(self, *args): pass
        async def add(self, **kwargs):
            attempts.append(kwargs)
            if len(attempts) == 1: raise RuntimeError("synthetic failure")
        async def close(self): pass
    monkeypatch.setattr(document, "Queue", FlakyQueue)
    with pytest.raises(document.HTTPException) as error:
        await document._enqueue_saved_document(record, db)
    assert error.value.status_code == 503
    db.delete.assert_not_called()
    assert record.slots["_source"]["queueState"] == "pending"
    result = await document._enqueue_saved_document(record, db)
    assert result["status"] == "queued"
    assert attempts[0]["opts"]["jobId"] == attempts[1]["opts"]["jobId"] == "saved-id"
    assert record.slots["_source"]["queueState"] == "queued"
    assert (await document._enqueue_saved_document(record, db))["replayed"] is True
    assert len(attempts) == 2

@pytest.mark.asyncio
async def test_queue_close_failure_does_not_delete_or_fail_accepted_job(isolated, monkeypatch):
    saved, db = isolated
    class Queue:
        def __init__(self,*args): pass
        async def add(self,**kwargs): saved["jobs"].append(kwargs)
        async def close(self): raise RuntimeError("synthetic cleanup failure")
    monkeypatch.setattr(document,"Queue",Queue)
    result=await document.generate_document({"documentType":"invoice","sessionId":"s"},db=db,x_user_id="u",authorization="Bearer synthetic")
    assert result["status"]=="queued"
    db.delete.assert_not_called()
    assert len(saved["jobs"])==1


@pytest.mark.asyncio
async def test_quota_unavailable_retains_intent_without_queuing(isolated, monkeypatch):
    saved, db = isolated
    async def offline(self, *args, **kwargs):
        raise document.httpx.ConnectError("synthetic quota outage")
    monkeypatch.setattr(document.httpx.AsyncClient, "post", offline)
    with pytest.raises(document.HTTPException) as error:
        await document.generate_document({"documentType":"invoice", "sessionId":"s"}, db=db, x_user_id="u", authorization="Bearer synthetic")
    assert error.value.status_code == 503
    db.add.assert_called_once()
    db.commit.assert_called_once()
    assert not saved["jobs"]

@pytest.mark.asyncio
async def test_job_status_does_not_expose_another_users_queue(isolated):
    saved, db = isolated
    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(document.HTTPException) as error:
        await document.get_job_status("other-document", db=db, x_user_id="u")
    assert error.value.status_code == 404

@pytest.mark.asyncio
async def test_failed_document_is_not_reported_pending_when_queue_data_is_gone(isolated):
    saved, db = isolated
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id="doc", status="failed", pdfKey="",slots={})
    assert (await document.get_job_status("doc", db=db, x_user_id="u"))["status"] == "failed"

def test_guest_document_details_do_not_leak_a_public_download_capability(isolated):
    _, db = isolated
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id="doc", title="Fixture", status="success", documentType="invoice", templateId="classic", slots={}, createdAt=None, updatedAt=None, pdfKey="fixture.pdf", shareToken=None, shareExpiresAt=None)
    assert document.get_document_details("doc", db=db, x_user_id="guest_fixture")["downloadUrl"] is None

def test_guest_cannot_bypass_download_restriction_by_creating_a_share(isolated):
    _, db = isolated
    with pytest.raises(document.HTTPException) as error:
        document.share_document("doc", {}, db=db, x_user_id="guest_fixture")
    assert error.value.status_code == 403
    db.query.assert_not_called()

@pytest.mark.asyncio
async def test_document_intent_commits_before_quota_reservation_and_survives_outage(isolated,monkeypatch):
    saved,db=isolated
    from contextlib import asynccontextmanager
    observed=[]
    class QuotaUnavailable:
        async def post(self,*args,**kwargs):
            observed.append(db.commit.call_count)
            raise document.httpx.ConnectError('Isolated quota outage')
    @asynccontextmanager
    async def service_client(*args,**kwargs):yield QuotaUnavailable()
    monkeypatch.setattr(document,'async_service_client',service_client)
    with pytest.raises(document.HTTPException):
        await document.generate_document({'documentType':'invoice','sessionId':'s'},db=db,x_user_id='u',authorization='Bearer synthetic')
    assert observed==[1]
    intent=db.add.call_args[0][0]
    assert intent.status=='pending' and intent.slots['_source']['queueState']=='pending'
    assert saved['jobs']==[]
