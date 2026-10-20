from shared.entitlements import get_entitlements, require_entitlement
from app.services.recovery import signed_document_url
from shared.queue_auth import add_job
from shared.service_auth import async_service_client
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "document.env"))
import uuid
from typing import Optional, Dict, Any, List
from pydantic import BaseModel,ConfigDict,Field
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session
import httpx
from bullmq import Queue, Job
from app.services.db import get_db
from app.models.document import Document
from app.services.recovery import retained
from app.services.uploaded_templates import fetch_uploaded
from app.services.pdf_template import import_pdf_template
from app.services.editable_templates import editable_definition,render_editable_html
from shared.service_auth import service_request
from app.models.custom_template import CustomTemplate
from app.services.sidecar import render_template_to_html
from app.services.storage import get_signed_url, get_local_file_data, delete_pdf

router = APIRouter(tags=["Document"])

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
QUOTA_SERVICE_URL = os.getenv("QUOTA_SERVICE_URL", "http://localhost:3015")
INTERNAL_SERVICE_SECRET = os.getenv("INTERNAL_SERVICE_SECRET", "REPLACE_WITH_STRONG_RANDOM_SECRET")

# Built-in template schema and slot definitions are shared with chat/frontend.
from app.services.document_contract import TEMPLATES as TEMPLATE_DEFS
from app.services.template_policy import publication_policy, published


@router.get("/templates")
def get_templates(type: Optional[str] = None, x_user_id: str = Header(..., alias="x-user-id")):
    """
    List all templates, optionally filtered by type.
    """
    policy = publication_policy()
    entitlements=get_entitlements(x_user_id)
    templates = [{**t,"available":not policy.get(t["type"]+":"+t["variant"],{}).get("premium",False) or entitlements["premium_templates"]} for identity,t in list(TEMPLATE_DEFS.items()) if not identity.startswith('upl_') and published(identity,policy)]
    for template in fetch_uploaded(x_user_id)['templates']:
        TEMPLATE_DEFS[template['id']]=template
        templates.append({**template,'available':not template['premium'] or entitlements['premium_templates'],'can_rename':template.get('owner_id')==x_user_id})
    if type:
        templates = [t for t in templates if t['type'] == type]
    return {"templates": templates}


@router.post('/templates/uploads',status_code=201)
def upload_template(payload:Dict[str,Any],x_user_id:str=Header(...,alias='x-user-id')):
    forbidden={'owner_id','visibility','premium'} & set(payload)
    if forbidden:raise HTTPException(422,'Template visibility and ownership are set by the server')
    if 'pdf_base64' in payload:
        if 'html' in payload or 'assets' in payload:
            raise HTTPException(422,'Upload either a PDF or an HTML template bundle.')
        payload = dict(payload)
        try:
            source = import_pdf_template(payload.pop('pdf_base64'))
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        payload.update(source)
    payload={**payload,'owner_id':x_user_id,'visibility':'private','premium':False}
    try:
        response=service_request('admin-api','POST',os.getenv('ADMIN_API_SERVICE_URL','http://localhost:3018')+'/api/v1/internal/uploaded-templates',json=payload,timeout=20)
        if response.status_code in (403,404,409,422):
            body = response.json()
            details = body.get('details', {})
            detail = body.get('detail') or (details.get('validation_errors') if isinstance(details,dict) else None) or body.get('message')
            raise HTTPException(response.status_code, detail if isinstance(detail,(str,list)) else 'Template upload rejected; check the restricted format and version ownership')
        response.raise_for_status();return response.json()
    except HTTPException:raise
    except Exception as error:raise HTTPException(503,'Template upload unavailable') from error

class TemplateName(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
    name:str=Field(min_length=1,max_length=100)


@router.patch('/templates/uploads/{template_id}')
def rename_uploaded_template(template_id:str,payload:TemplateName,x_user_id:str=Header(...,alias='x-user-id')):
    from urllib.parse import quote
    try:
        response=service_request('admin-api','PATCH',os.getenv('ADMIN_API_SERVICE_URL','http://localhost:3018')+'/api/v1/internal/uploaded-templates/'+quote(template_id,safe=''),
            json={'name':payload.name,'owner_id':x_user_id},timeout=10)
        if response.status_code in (404,422):raise HTTPException(response.status_code,response.json().get('detail','Template could not be renamed'))
        response.raise_for_status()
        return response.json()
    except HTTPException:raise
    except Exception as error:raise HTTPException(503,'Template rename unavailable. Please retry.') from error


@router.post("/templates/custom", status_code=201)
def create_custom_template(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id"),
):
    """
    Save the current Builder canvas as a reusable custom template — a
    static snapshot (literal elements as they are right now), not a
    data-bound generator like the built-in templates.
    """
    name = payload.get("name")
    document_type = payload.get("documentType")
    canvas_elements = payload.get("canvasElements")
    if not name or not document_type or not isinstance(canvas_elements, list):
        raise HTTPException(status_code=400, detail="name, documentType, and canvasElements are required")

    tmpl = CustomTemplate(
        userId=x_user_id,
        documentType=document_type,
        name=name,
        canvasElements=canvas_elements,
        pageWidth=payload.get("pageWidth"),
        pageHeight=payload.get("pageHeight"),
        pageBackgroundColor=payload.get("pageBackgroundColor"),
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "documentType": tmpl.documentType,
        "canvasElements": tmpl.canvasElements,
        "pageWidth": tmpl.pageWidth,
        "pageHeight": tmpl.pageHeight,
        "pageBackgroundColor": tmpl.pageBackgroundColor,
        "createdAt": tmpl.createdAt,
    }


@router.get("/templates/custom")
def list_custom_templates(
    type: Optional[str] = None,
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id"),
):
    """
    List the current user's saved custom templates. Omits canvasElements
    to keep the list payload light — fetched via the detail endpoint when
    one is actually selected.
    """
    query = db.query(CustomTemplate).filter(CustomTemplate.userId == x_user_id)
    if type:
        query = query.filter(CustomTemplate.documentType == type)
    templates = query.order_by(CustomTemplate.createdAt.desc()).all()
    return {
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "documentType": t.documentType,
                "pageWidth": t.pageWidth,
                "pageHeight": t.pageHeight,
                "pageBackgroundColor": t.pageBackgroundColor,
                "createdAt": t.createdAt,
            }
            for t in templates
        ]
    }


@router.get("/templates/custom/{template_id}")
def get_custom_template(
    template_id: str,
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id"),
):
    t = db.query(CustomTemplate).filter(CustomTemplate.id == template_id, CustomTemplate.userId == x_user_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return {
        "id": t.id,
        "name": t.name,
        "documentType": t.documentType,
        "canvasElements": t.canvasElements,
        "pageWidth": t.pageWidth,
        "pageHeight": t.pageHeight,
        "pageBackgroundColor": t.pageBackgroundColor,
        "createdAt": t.createdAt,
    }


@router.delete("/templates/custom/{template_id}")
def delete_custom_template(
    template_id: str,
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id"),
):
    t = db.query(CustomTemplate).filter(CustomTemplate.id == template_id, CustomTemplate.userId == x_user_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"success": True}


@router.patch('/templates/custom/{template_id}')
def rename_custom_template(template_id:str,payload:TemplateName,db:Session=Depends(get_db),x_user_id:str=Header(...,alias='x-user-id')):
    template=db.query(CustomTemplate).filter(CustomTemplate.id==template_id,CustomTemplate.userId==x_user_id).first()
    if not template:raise HTTPException(404,'Template not found')
    template.name=payload.name
    db.commit()
    return {'id':template.id,'name':template.name}


@router.get("/templates/{template_id}")
def get_template_detail(template_id: str):
    """
    Get template details including slot definitions.
    """
    # 1. Direct match
    if template_id in TEMPLATE_DEFS:
        return TEMPLATE_DEFS[template_id]

    # 2. Try match document type (fallback to classic variant)
    fallback_id = f"{template_id}-classic"
    if fallback_id in TEMPLATE_DEFS:
        return TEMPLATE_DEFS[fallback_id]

    # 3. Match by internal name or search values
    for temp in TEMPLATE_DEFS.values():
        if temp["id"] == template_id or temp["name"].lower() == template_id.lower():
            return temp

    raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")


@router.post('/template-preview')
def uploaded_preview(payload:Dict[str,Any],x_user_id:str=Header(...,alias='x-user-id')):
    template_id=payload.get('templateId','')
    if not isinstance(template_id,str) or not template_id.startswith('upl_'):raise HTTPException(422,'Uploaded template required')
    item=fetch_uploaded(x_user_id,template_id)
    policy=get_entitlements(x_user_id)
    require_entitlement(policy,'account_enabled')
    if item['premium']:require_entitlement(policy,'premium_templates')
    # The reviewed template owns its embedded artwork. Premium access follows
    # the template's explicit setting, independently of adding a new PRO logo.
    try:
        definition=editable_definition(item['source'],item['type'])
        html=render_editable_html(definition,payload.get('slots',{}))
    except ValueError as error:raise HTTPException(422,str(error)) from error
    csp="""<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">"""
    return {'html':csp+html,'canvasDefinition':definition}


@router.post("/preview", response_class=HTMLResponse)
def get_preview(payload: Dict[str, Any], x_user_id:str=Header(...,alias="x-user-id")):
    """
    Renders live HTML preview with provided slots.
    """
    doc_type = payload.get("documentType")
    template_id = payload.get("templateId", "classic")
    slots = payload.get("slots", {})

    if not doc_type:
        raise HTTPException(status_code=400, detail="documentType is required")

    policy=get_entitlements(x_user_id)
    if template_id.startswith('upl_'):
        uploaded=fetch_uploaded(x_user_id,template_id)
        if uploaded['premium']:require_entitlement(policy,'premium_templates')
    try:
        html = render_template_to_html(doc_type, template_id, slots,x_user_id)
        return html
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _enqueue_saved_document(record, db):
    """Resume a durable generation request using its saved facts and stable job ID."""
    source = (record.slots or {}).get("_source", {})
    if record.status in ("success", "failed") or source.get("queueState") != "pending":
        return {"jobId": record.id, "documentId": record.id,
                "status": "completed" if record.status == "success" else "failed" if record.status == "failed" else "queued", "replayed": True}
    import asyncio
    policy=await asyncio.to_thread(get_entitlements,record.userId)
    require_entitlement(policy,'account_enabled')
    async with async_service_client("quota", timeout=5.0) as client:
        try:
            quota_res = await client.post(
                f"{QUOTA_SERVICE_URL}/v1/quota/check",
                headers={"X-Internal-Secret": INTERNAL_SERVICE_SECRET},
                json={"userId": record.userId, "plan": policy["plan"], "reservationId": "generation:" + record.id}
            )
            if quota_res.status_code == 403:
                record.status="failed"
                record.errorMessage="Quota denied"
                db.commit()
                raise HTTPException(
                    status_code=403,
                    detail="Your allowance is exhausted. Review your plan or wait until its reset time."
                )
            if quota_res.status_code != 200:
                raise HTTPException(status_code=503, detail="Quota verification unavailable. Please retry.")
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="Quota verification unavailable. Please retry.")

    queue = None
    try:
        queue = Queue("document", {"connection": REDIS_URL})
        await add_job(queue,"document",name="generate_pdf", opts={"jobId": record.id,"priority":1 if policy["priority_processing"] else 10,"attempts":3,"backoff":{"type":"exponential","delay":1000}}, data={
            "documentId": record.id, "userId": record.userId, "userPlan": record.plan,
            "userEmail": record.userEmail, "documentType": record.documentType,
            "templateId": record.templateId, "title": record.title,
            "slots": {key: value for key, value in record.slots.items() if key != "_source"},
        })
        # If storage fails here, the next attempt reuses the same queue job ID.
        record.slots = {**record.slots, "_source": {**source, "queueState": "queued"}}
        db.commit()
        return {"jobId": record.id, "documentId": record.id, "status": "queued"}
    except Exception:
        db.rollback()
        # Never delete a durable record: a queue acknowledgement might have been lost.
        raise HTTPException(status_code=503, detail="Generation queue unavailable. Retry the same operation to reconcile it.")
    finally:
        if queue is not None:
            try:
                await queue.close()
            except Exception:
                pass  # Queue acceptance was already established; close is resource cleanup.


@router.post("/generate", status_code=202)
async def generate_document(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id"),
    x_user_plan: str = Header("free", alias="x-user-plan"),
    x_user_email: Optional[str] = Header(None, alias="x-user-email"),
    authorization: Optional[str] = Header(None)
):
    """
    Queue an asynchronous PDF generation job after checking quota.
    """
    doc_type = payload.get("documentType")
    template_id = payload.get("templateId", "classic")
    title = payload.get("title", f"New {doc_type}")
    slots = payload.get("slots", {})

    if not doc_type:
        raise HTTPException(status_code=400, detail="documentType is required")

    # Generation from chat uses the authorized committed state, never sample/guessed client values.
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Verified authentication required")
    session_id = payload.get("sessionId") or payload.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="sessionId is required")
    operation_id = payload.get("operationId")
    generation_id = None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            result = await client.get(
                f"{os.getenv('AI_SERVICE_URL', 'http://localhost:3016')}/api/chat/session/{session_id}/messages",
                headers={"Authorization": authorization},
            )
        if result.status_code in (401, 403, 404):
            raise HTTPException(status_code=result.status_code, detail="Conversation access denied")
        if result.status_code != 200:
            raise HTTPException(status_code=503, detail="Conversation state unavailable")
        state = result.json()["state"]
        if state.get("userId") != x_user_id:
            raise HTTPException(status_code=403, detail="Conversation identity mismatch")
        x_user_plan = result.json().get("userPlan", "free")
        x_user_email = result.json().get("userEmail")
        if operation_id is not None:
            try:
                uuid.UUID(operation_id)
            except (ValueError, TypeError, AttributeError):
                raise HTTPException(status_code=400, detail="Valid generation operationId required")
            generation_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"doccraft:{x_user_id}:{session_id}:{operation_id}"))
            existing = db.query(Document).filter(Document.id == generation_id, Document.userId == x_user_id).first()
            if existing:
                if existing.documentType != doc_type:
                    raise HTTPException(status_code=409, detail="Generation operation belongs to a different document type")
                return await _enqueue_saved_document(existing, db)
        expected_revision = payload.get("expectedRevision")
        if expected_revision is not None and (not isinstance(expected_revision, int) or isinstance(expected_revision, bool) or state.get("revision") != expected_revision):
            raise HTTPException(status_code=409, detail="Document state changed; review it before generating")
        if not state.get("readyToGenerate") or state["documentType"] != doc_type:
            raise HTTPException(status_code=422, detail="Required document fields are incomplete")
        if not state.get('canGenerate') or state.get('finalization', {}).get('status') != 'confirmed':
            raise HTTPException(status_code=422, detail='Review and confirm the document details before finalizing')
        selected_template = state.get('templateId') or template_id
        if payload.get('templateId') and payload['templateId'] != selected_template:
            raise HTTPException(status_code=409, detail='Template changed; review the selected template before generating')
        template_id = selected_template
        import asyncio
        if template_id.startswith('upl_'):
            uploaded=await asyncio.to_thread(fetch_uploaded,x_user_id,template_id)
            if uploaded['type']!=doc_type:raise HTTPException(422,'Incompatible uploaded template')
            TEMPLATE_DEFS[template_id]=uploaded
        if not template_id.startswith('upl_') and not published(template_id, await asyncio.to_thread(publication_policy), doc_type):
            raise HTTPException(status_code=403, detail="This template is currently unavailable")
        from app.services.document_contract import validated_document
        slots = validated_document(doc_type, state["slots"], template_id, state.get('schema'))
        if state.get('assets'):
            slots['documentAssets'] = state['assets']
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=503, detail="Could not retrieve validated document information")

    import asyncio
    policy=await asyncio.to_thread(get_entitlements,x_user_id)
    require_entitlement(policy,'account_enabled')
    catalog=await asyncio.to_thread(publication_policy)
    template=TEMPLATE_DEFS.get(template_id) or TEMPLATE_DEFS.get(doc_type+'-'+template_id)
    if template and (template.get('premium') or catalog.get(template['type']+':'+template['variant'],{}).get('premium')):
        require_entitlement(policy,'premium_templates')
    if any(asset.get('role')=='logo' for asset in slots.get('documentAssets',[])):
        require_entitlement(policy,'custom_logo')
    x_user_plan=policy['plan']
    doc_id = generation_id or str(uuid.uuid4())
    # 2. Create pending document record in PostgreSQL
    db_doc = Document(
        id=doc_id,
        userId=x_user_id,
        userEmail=x_user_email,
        plan=x_user_plan,
        documentType=doc_type,
        templateId=template_id,
        title=title,
        slots={**slots, "_source": {"sessionId": session_id, "revision": state.get("revision"), "operationId": operation_id, "queueState": "pending"}},
        status="pending",
        pdfKey=""  # Will be set by the worker
    )
    db.add(db_doc)
    try:
        db.commit()
    except Exception:
        db.rollback()
        if generation_id:
            existing = db.query(Document).filter(Document.id == generation_id, Document.userId == x_user_id).first()
            if existing:
                return await _enqueue_saved_document(existing, db)
        raise HTTPException(status_code=503, detail="Could not persist the generation request")

    # 3. Queue from the persisted snapshot. Retrying reconciles this same job.
    return await _enqueue_saved_document(db_doc, db)


@router.get("/job/{job_id}")
async def get_job_status(job_id: str, db: Session = Depends(get_db), x_user_id: str = Header(..., alias="x-user-id")):
    """
    Poll PDF generation job status.
    """
    # Authorize against the durable record before exposing queue state.
    doc = db.query(Document).filter(Document.id == job_id, Document.userId == x_user_id).first()
    if not doc or not retained(doc):
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status == "failed":
        return {"status": "failed", "documentId": doc.id}
    if doc.status == "success" and doc.pdfKey:
        return {"status": "completed", "documentId": doc.id}
    # Try looking in the BullMQ queue first
    try:
        document_queue = Queue("document", {"connection": REDIS_URL})
        job = await Job.fromId(document_queue, job_id)
        await document_queue.close()

        if job:
            state = await job.getState()
            # map bullmq states to client states
            if state in ["waiting", "delayed", "prioritized"]:
                return {"status": "pending"}
            elif state == "active":
                return {"status": "processing"}
            elif state == "completed":
                return {"status": "completed"}
            elif state == "failed":
                return {"status": "failed"}
    except Exception as e:
        print(f"[document] BullMQ job lookup failed: {e}")

    # Fallback to database check
    # If the document ID was passed, or if we can find the doc where the ID or pdfKey is set
    if doc:
        if doc.pdfKey:
            return {"status": "completed", "documentId": doc.id}
        else:
            return {"status": "pending", "documentId": doc.id}

    return {"status": "unknown"}


@router.get("/history")
def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id")
):
    """
    Get user document history, paginated.
    """
    offset = (page - 1) * limit
    query = db.query(Document).filter(Document.userId == x_user_id)

    total = query.count()
    documents = query.order_by(Document.createdAt.desc()).offset(offset).limit(limit).all()

    # Enrich with download signed URLs
    enriched_docs = []
    for doc in documents:
        if not retained(doc): continue
        doc_data = {
            "id": doc.id,
            "title": doc.title,
            "documentType": doc.documentType,
            "templateId": doc.templateId,
            "slots": doc.slots,
            "createdAt": doc.createdAt,
            "updatedAt": doc.updatedAt,
            "downloadUrl": signed_document_url(doc) if doc.pdfKey and not x_user_id.startswith("guest_") else None
        }
        enriched_docs.append(doc_data)

    return {
        "documents": enriched_docs,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": (total + limit - 1) // limit
        }
    }


@router.get("/download-file/{pdf_key}")
def download_local_file(pdf_key: str, expires: int = Query(...), signature: str = Query(...), db: Session = Depends(get_db)):
    """
    Public endpoint for local file download fallback.
    """
    from app.services.storage import valid_local_download
    doc=db.query(Document).filter(Document.pdfKey==pdf_key).first()
    if not doc or not retained(doc): raise HTTPException(404,"Document not found")
    if not valid_local_download(pdf_key, expires, signature):
        raise HTTPException(status_code=403, detail="Download link is invalid or expired")
    try:
        file_bytes = get_local_file_data(pdf_key)
        return StreamingResponse(
            iter([file_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={pdf_key}"}
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@router.get("/{document_id}")
def get_document_details(
    document_id: str,
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id")
):
    """
    Get generated document details.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.userId == x_user_id).first()
    if not doc or not retained(doc):
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "id": doc.id,
        "title": doc.title,
        "status": doc.status,
        "errorMessage": "Document generation failed" if doc.status == "failed" else None,
        "documentType": doc.documentType,
        "templateId": doc.templateId,
        "slots": doc.slots,
        "createdAt": doc.createdAt,
        "updatedAt": doc.updatedAt,
        "downloadUrl": signed_document_url(doc) if doc.pdfKey and not x_user_id.startswith("guest_") else None,
        "shareToken": doc.shareToken,
        "shareExpiresAt": doc.shareExpiresAt
    }


@router.get("/{document_id}/download")
def download_document(
    document_id: str,
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id")
):
    """
    Stream PDF binary for download.
    """
    if x_user_id.startswith("guest_"):
        raise HTTPException(
            status_code=403,
            detail="Registration required. Guest users can generate and preview documents, but must register for a free account to download files."
        )

    doc = db.query(Document).filter(Document.id == document_id, Document.userId == x_user_id).first()
    if not doc or not retained(doc) or not doc.pdfKey:
        raise HTTPException(status_code=404, detail="Document or PDF file not found")

    try:
        file_bytes = get_local_file_data(doc.pdfKey)
        return StreamingResponse(
            iter([file_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={doc.title.replace(' ', '_')}.pdf"}
        )
    except FileNotFoundError:
        # If not local, redirect to the signed Supabase Storage URL
        signed_url = signed_document_url(doc)
        return Response(status_code=307, headers={"Location": signed_url})


@router.post("/{document_id}/share")
def share_document(
    document_id: str,
    payload: Dict[str, int],
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id")
):
    """
    Generate shareable link with expiry of 1 to 30 days.
    """
    if x_user_id.startswith("guest_"):
        raise HTTPException(status_code=403, detail="Registration required to share documents")
    days = payload.get("expiresInDays", 7)
    if not (1 <= days <= 30):
        raise HTTPException(status_code=400, detail="expiresInDays must be between 1 and 30")

    doc = db.query(Document).filter(Document.id == document_id, Document.userId == x_user_id).first()
    if not doc or not retained(doc):
        raise HTTPException(status_code=404, detail="Document not found")

    import datetime
    share_token = str(uuid.uuid4())
    expiry = datetime.datetime.utcnow() + datetime.timedelta(days=days)

    doc.shareToken = share_token
    doc.shareExpiresAt = expiry
    db.commit()

    gateway_url = os.getenv("GATEWAY_URL", "http://localhost:3001")
    share_link = f"{gateway_url}/v1/document/shared/{share_token}"

    return {
        "shareLink": share_link,
        "shareToken": share_token,
        "expiresAt": expiry
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    x_user_id: str = Header(..., alias="x-user-id")
):
    """
    Delete document and invalidate share links.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.userId == x_user_id).first()
    if not doc or not retained(doc):
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from storage
    if doc.pdfKey:
        delete_pdf(doc.pdfKey)

    db.delete(doc)
    db.commit()

    return {"success": True, "message": "Document deleted successfully"}


@router.get("/shared/{share_token}")
def get_shared_document(share_token: str, db: Session = Depends(get_db)):
    """
    Public unauthenticated endpoint to view shared documents.
    """
    import datetime
    doc = db.query(Document).filter(
        Document.shareToken == share_token,
        Document.shareExpiresAt > datetime.datetime.utcnow()
    ).first()

    if not doc or not retained(doc):
        raise HTTPException(status_code=404, detail="Shared document link is invalid or expired")

    # Redirect to signed URL
    signed_url = signed_document_url(doc)
    return Response(status_code=307, headers={"Location": signed_url})


@router.post('/internal/users/{user_id}/anonymize')
def anonymize_document_identity(user_id:str,db:Session=Depends(get_db)):
    db.query(Document).filter(Document.userId==user_id).update({'userEmail':None})
    db.commit()
    return {'anonymized':True}
