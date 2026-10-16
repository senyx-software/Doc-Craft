from shared.entitlements import get_entitlements, require_entitlement
from shared.queue_auth import add_job, verified_job
from shared.service_auth import async_service_client
import os
import asyncio
import json
import httpx
from bullmq import Worker, Queue
from dotenv import load_dotenv

# Load service-specific environment file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "document.env"))

from app.services.db import SessionLocal
from app.models.document import Document
from app.services.sidecar import render_template_to_html, generate_pdf_via_sidecar
from app.services.watermark import apply_watermark_to_pdf
from app.services.storage import upload_pdf, get_signed_url
from app.services.product_tracking import track_product_event

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
QUOTA_SERVICE_URL = os.getenv("QUOTA_SERVICE_URL", "http://localhost:3015")
INTERNAL_SERVICE_SECRET = os.getenv("INTERNAL_SERVICE_SECRET", "REPLACE_WITH_STRONG_RANDOM_SECRET")


async def refund_quota_unit(user_id: str, user_plan: str, document_id: str) -> None:
    """Give back the quota unit /generate's synchronous quota/check already
    reserved before this job was even queued. Without this, a failed
    generation (this except block) still permanently burns the user's daily
    quota with nothing delivered — confirmed live: a free-tier user hit 5
    failed generations and was locked out for the rest of the day having
    received zero documents."""
    try:
        async with async_service_client("quota", timeout=5.0) as client:
            response = await client.post(
                f"{QUOTA_SERVICE_URL}/v1/quota/refund",
                headers={"X-Internal-Secret": INTERNAL_SERVICE_SECRET},
                json={"userId": user_id, "plan": user_plan, "reservationId": "generation:" + document_id},
            )
            response.raise_for_status()
    except Exception as refund_err:
        raise RuntimeError("Quota refund pending reconciliation") from refund_err


async def process_pdf_job(job, job_token):
    """
    Worker task processor for the 'document' queue.
    """
    job_id = job.id
    data = verified_job("document",job)
    print(f"[pdf-worker] Processing job {job_id}")

    user_id = data.get("userId")
    user_plan = data.get("userPlan", "free")
    user_email = data.get("userEmail")
    doc_type = data.get("documentType")
    template_id = data.get("templateId", "classic")
    title = data.get("title", "Document")
    slots = data.get("slots", {})
    doc_id = data.get("documentId")

    db = SessionLocal()
    authorized_document = False
    try:
        if db.get_bind().dialect.name=='postgresql':
            from sqlalchemy import text
            db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:identity,4808))'),{'identity':doc_id})
        existing = db.query(Document).filter(Document.id == doc_id).first()
        if not existing:
            raise ValueError("Document record no longer exists")
        if existing.userId != user_id or existing.documentType != doc_type or existing.templateId != template_id or {key:value for key,value in existing.slots.items() if key != "_source"} != slots or existing.plan != user_plan:
            raise ValueError("Queue job does not match its persisted document")
        authorized_document = True
        if existing.status == "success" and existing.pdfKey:
            return  # A retried delivery must not render, upload, or notify twice.
        if existing.status == "failed": return
        policy=await asyncio.to_thread(get_entitlements,user_id)
        require_entitlement(policy,'account_enabled')
        if any(asset.get('role')=='logo' for asset in slots.get('documentAssets',[])):
            require_entitlement(policy,'custom_logo')
        from app.services.template_policy import publication_policy, published
        catalog=await asyncio.to_thread(publication_policy)
        if not template_id.startswith('upl_') and not published(template_id,catalog,doc_type): raise ValueError('Template withdrawn')
        from app.services.document_contract import TEMPLATES
        template=TEMPLATES.get(template_id) or TEMPLATES.get(doc_type+'-'+template_id)
        if template and catalog.get(template['type']+':'+template['variant'],{}).get('premium'):
            require_entitlement(policy,'premium_templates')
        # 1. Render template to HTML
        print(f"[pdf-worker] [{job_id}] Rendering template for {doc_type}...")
        html_string = render_template_to_html(doc_type, template_id, slots,user_id)

        # 2. Generate PDF via Puppeteer sidecar
        print(f"[pdf-worker] [{job_id}] Generating PDF from Puppeteer sidecar...")
        pdf_bytes = await generate_pdf_via_sidecar(html_string, slots.get('documentAssets'))

        # 3. Apply watermark if free tier
        if policy["pdf_watermark"]:
            print(f"[pdf-worker] [{job_id}] User is on free tier. Applying watermark...")
            pdf_bytes = apply_watermark_to_pdf(pdf_bytes)

        # 4. Upload to storage
        filename = f"{doc_id}.pdf"
        print(f"[pdf-worker] [{job_id}] Uploading PDF to storage as {filename}...")
        pdf_key = upload_pdf(filename, pdf_bytes)

        # 5. Update database record
        document = db.query(Document).filter(Document.id == doc_id).first()
        if document:
            document.pdfKey = pdf_key
            document.status = "success"
            from datetime import datetime,timezone,timedelta
            retention=policy.get('retention_days')
            if retention:
                document.slots={**document.slots,'_source':{**document.slots.get('_source',{}),'retainedUntil':(datetime.now(timezone.utc)+timedelta(days=retention)).isoformat()}}
            db.commit()
            print(f"[pdf-worker] [{job_id}] Updated database record {doc_id} with pdfKey: {pdf_key}")
            track_product_event(user_id, "document_generated", {"document_type": doc_type, "plan": user_plan, "template_id": template_id})
        else:
            print(f"[pdf-worker] [{job_id}] Warning: Document record {doc_id} not found in DB!")

        # Notification delivery cannot invalidate an already persisted PDF.
        try:
            # 6. Queue email notification
            if user_email:
                signed_url = get_signed_url(pdf_key)
                print(f"[pdf-worker] [{job_id}] Queuing document notification...")

                # Initialize BullMQ connection parameters for email queue
                # Note: Redis url parsing for python bullmq
                email_queue = Queue("email_queue_document", {"connection": REDIS_URL})
                await add_job(email_queue,"email_queue_document","document_ready", {
                    "userId": user_id,
                    "to": user_email,
                    "email": user_email,
                    "documentId": doc_id,
                    "documentName": title,
                    "documentUrl": signed_url
                })
                await email_queue.close()
                print(f"[pdf-worker] [{job_id}] Notification queued successfully.")
        except Exception:
            print(f"[pdf-worker] [{job_id}] Notification queue unavailable; PDF remains successful")

    except Exception as e:
        print(f"[pdf-worker] [{job_id}] Job failed with error: {e}")
        # Record the failure on the document row itself — previously this only
        # let BullMQ mark the job failed, leaving the row stuck at "pending"
        # forever with no error message for the admin Failed Generations page.
        try:
            document = db.query(Document).filter(Document.id == doc_id).first()
            if document and authorized_document:
                document.status = "failed" if getattr(job, "attemptsMade", 0) + 1 >= getattr(job, "opts", {}).get("attempts", 1) else "pending"
                document.errorMessage = "Document generation failed"
                if document.status=='failed':
                    document.slots={**document.slots,'_source':{**document.slots.get('_source',{}),'refundState':'pending'}}
                db.commit()
        except Exception as inner_e:
            print(f"[pdf-worker] [{job_id}] Failed to record failure status: {inner_e}")
        if authorized_document and getattr(job, "attemptsMade", 0) + 1 >= getattr(job, "opts", {}).get("attempts", 1):
            try:
                await refund_quota_unit(user_id, user_plan, doc_id)
                document.slots={**document.slots,'_source':{**document.slots.get('_source',{}),'refundState':'done'}}
                db.commit()
            except Exception:
                db.rollback() # durable pending marker is retried by the reconciler
        track_product_event(user_id, "document_generation_failed", {"document_type": doc_type, "plan": user_plan, "error": str(e)[:200]})
        raise e
    finally:
        db.close()


async def start_pdf_worker():
    """
    Starts the BullMQ Worker background task.
    """
    print("[pdf-worker] Starting document queue worker")
    worker=None
    try:
        # Construct and start the Worker
        worker = Worker("document", process_pdf_job, {"connection": REDIS_URL})
        # Wait forever to keep the worker running
        while True:
            await asyncio.sleep(3600)
    except Exception as e:
        print(f"[pdf-worker] Worker crashed: {e}")

    finally:
        if worker: await worker.close()
