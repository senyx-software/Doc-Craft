"""Repair durable generation intents and failed refunds after process/Redis loss."""
import asyncio
from datetime import datetime, timezone
from app.models.document import Document
from app.services.db import SessionLocal
from app.services.storage import delete_pdf


def retained(document):
    value=(document.slots or {}).get('_source',{}).get('retainedUntil')
    return not value or datetime.fromisoformat(value) > datetime.now(timezone.utc)


def signed_document_url(document):
    from app.services.storage import get_signed_url
    expiry=(document.slots or {}).get('_source',{}).get('retainedUntil')
    ttl=300 if not expiry else min(300,int((datetime.fromisoformat(expiry)-datetime.now(timezone.utc)).total_seconds()))
    if ttl<1:raise ValueError('Document retention expired')
    return get_signed_url(document.pdfKey,ttl)


_cursor = None


async def reconcile_documents():
    global _cursor
    from app.routers.document import _enqueue_saved_document
    from app.workers.pdf_worker import refund_quota_unit
    db=SessionLocal()
    try:
        # Ordered bounded batches with rotating cursor prevent poison records
        # starving later work. Each repair is idempotent across worker replicas.
        query=db.query(Document).order_by(Document.id)
        if _cursor: query=query.filter(Document.id > _cursor)
        records=query.limit(100).all()
        _cursor=records[-1].id if len(records)==100 else None
        for doc in records:
            try:
                if not retained(doc):
                    if doc.pdfKey: await asyncio.to_thread(delete_pdf,doc.pdfKey)
                    db.delete(doc);db.commit()
                elif doc.status=='failed' and doc.slots.get('_source',{}).get('refundState')=='pending':
                    await refund_quota_unit(doc.userId,doc.plan,doc.id)
                    doc.slots={**doc.slots,'_source':{**doc.slots.get('_source',{}),'refundState':'done'}}
                    db.commit()
                elif doc.status=='pending':
                    doc.slots={**doc.slots,'_source':{**doc.slots.get('_source',{}),'queueState':'pending'}}
                    await _enqueue_saved_document(doc,db)
            except Exception:
                db.rollback() # Keep durable state and retry; never erase an uncertain request.
    finally: db.close()


async def recovery_loop():
    while True:
        try: await reconcile_documents()
        except Exception: pass # Readiness/monitoring must report DB availability separately.
        await asyncio.sleep(30)
