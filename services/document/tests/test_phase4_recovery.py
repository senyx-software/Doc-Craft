from types import SimpleNamespace
from unittest.mock import Mock,AsyncMock
from datetime import datetime,timedelta,timezone
import pytest
from app.services import recovery
from app.workers import pdf_worker
from app.routers import document

@pytest.mark.asyncio
async def test_recovery_retries_failed_refund_and_preserves_pending_marker_until_success(monkeypatch):
    record=SimpleNamespace(id='doc',userId='u',plan='free',status='failed',slots={'_source':{'refundState':'pending'}})
    db=Mock();db.query.return_value.order_by.return_value.limit.return_value.all.return_value=[record]
    monkeypatch.setattr(recovery,'SessionLocal',lambda:db);monkeypatch.setattr(recovery,'_cursor',None)
    refund=AsyncMock(side_effect=RuntimeError('Quota offline'));monkeypatch.setattr(pdf_worker,'refund_quota_unit',refund)
    await recovery.reconcile_documents();assert record.slots['_source']['refundState']=='pending';db.rollback.assert_called_once()
    refund.side_effect=None
    await recovery.reconcile_documents();assert record.slots['_source']['refundState']=='done';refund.assert_awaited_with('u','free','doc')

@pytest.mark.asyncio
async def test_lost_queue_delivery_is_reconstructed_from_durable_intent(monkeypatch):
    record=SimpleNamespace(id='doc',userId='u',status='pending',slots={'_source':{'queueState':'queued'}})
    db=Mock();db.query.return_value.order_by.return_value.limit.return_value.all.return_value=[record]
    monkeypatch.setattr(recovery,'SessionLocal',lambda:db);monkeypatch.setattr(recovery,'_cursor',None)
    enqueue=AsyncMock();monkeypatch.setattr(document,'_enqueue_saved_document',enqueue)
    await recovery.reconcile_documents();enqueue.assert_awaited_once_with(record,db)
    assert record.slots['_source']['queueState']=='pending'

@pytest.mark.asyncio
async def test_retention_delete_failure_retains_row_for_later_cleanup(monkeypatch):
    record=SimpleNamespace(id='doc',pdfKey='artifact.pdf',status='success',slots={'_source':{'retainedUntil':(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()}})
    db=Mock();db.query.return_value.order_by.return_value.limit.return_value.all.return_value=[record]
    monkeypatch.setattr(recovery,'SessionLocal',lambda:db);monkeypatch.setattr(recovery,'_cursor',None)
    delete=Mock(side_effect=RuntimeError('Storage offline'));monkeypatch.setattr(recovery,'delete_pdf',delete)
    assert not recovery.retained(record)
    await recovery.reconcile_documents();db.delete.assert_not_called();db.rollback.assert_called_once()
    delete.side_effect=None;await recovery.reconcile_documents();db.delete.assert_called_once_with(record)


def test_private_uploaded_descriptor_cache_cannot_leak_to_another_account_catalog(monkeypatch):
    private={'id':'upl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_v1','type':'invoice','variant':'upl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_v1','name':'Private company format','premium':False}
    monkeypatch.setattr(document,'fetch_uploaded',lambda owner:{'templates':[private] if owner=='owner' else []})
    monkeypatch.setattr(document,'TEMPLATE_DEFS',dict(document.TEMPLATE_DEFS))
    own=document.get_templates(x_user_id='owner')['templates']
    assert private['id'] in [row['id'] for row in own]
    other=document.get_templates(x_user_id='another')['templates']
    assert private['id'] not in [row['id'] for row in other]
    assert private['id'] not in [row['id'] for row in document.get_templates(x_user_id='another')['templates']]
