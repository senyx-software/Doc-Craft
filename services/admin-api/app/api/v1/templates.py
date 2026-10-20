"""Publish or withdraw reviewed built-in variants; no arbitrary code uploads."""
import json
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from app.security.permissions import require_permission
from app.security.dependencies import require_totp_2fa
from app.services.config_engine import config_engine
from app.services.audit_service import audit_service

router = APIRouter(prefix="/admin/templates", tags=["Template publication"])
REGISTRY = json.loads((Path(__file__).resolve().parents[5]/"shared/template-schemas.json").read_text())["templates"]


def policy():
    entry = config_engine.get_domain_config("template_catalog")
    return entry.data if entry else {}


@router.get("")
def list_templates(admin=Depends(require_permission("templates", "view"))):
    publication = policy()
    entries = {}
    for identity, template in REGISTRY.items():
        key = template["type"]+":"+template["variant"]
        saved = publication.get(key, {})
        entries.setdefault(key, {"id":identity,"name":template["name"],"type":template["type"],
            "version":str(saved.get("version",1)),"lastUpdated":saved.get("updated_at","Bundled release"),
            "status":"Published" if saved.get("published",True) else "Draft",
            "html_content":json.dumps(template,indent=2)})
    from app.services import uploaded_templates as uploads
    from app.db.admin_db import admin_db
    for row in admin_db.fetch_all('''SELECT v.*,p.version_id AS published_version_id,p.updated_at AS publication_updated_at
            FROM uploaded_template_versions v LEFT JOIN uploaded_template_publications p ON p.family_id=v.family_id
            ORDER BY v.created_at DESC,v.version DESC'''):
        status='Published' if row['published_version_id']==row['id'] else 'Withdrawn' if row['approved_at'] and row['publication_updated_at'] and not row['published_version_id'] else 'Approved' if row['approved_at'] else 'Rejected' if row['reviewed_by'] else 'Review required'
        entries[row['id']]={**uploads.descriptor(row),'version':str(row['version']),'lastUpdated':row['created_at'],
            'status':status,
            'html_content':__import__('json').loads(row['source_json'])['html']}
    return list(entries.values())


def set_publication(template_id, published, request, admin):
    if template_id.startswith('upl_'):
        from app.services import uploaded_templates as uploads
        from app.db.admin_db import admin_db
        row=uploads.version(template_id)
        if published: uploads.publish(template_id)
        else: admin_db.execute('UPDATE uploaded_template_publications SET version_id=NULL,updated_at=? WHERE family_id=? AND version_id=?',(datetime.now(timezone.utc).isoformat(),row['family_id'],template_id))
        audit_service.log_action(admin=admin,action='template.published' if published else 'template.withdrawn',module='templates',request=request,details={'version_id':template_id,'digest':row['digest']},totp_verified=True)
        return {'published':published,'template_id':template_id,'version':row['version']}
    template = REGISTRY.get(template_id)
    if not template:
        raise HTTPException(404, "Unknown bundled template")
    data = policy()
    key = template["type"]+":"+template["variant"]
    prior = data.get(key,{})
    data[key] = {"published":published,"version":int(prior.get("version",1))+1,"updated_at":datetime.now(timezone.utc).isoformat()}
    saved = config_engine.update_domain_config("template_catalog",data,admin.admin_id)
    audit_service.log_action(admin=admin,action="template.published" if published else "template.withdrawn",module="templates",request=request,details={"template_id":template_id,"version":saved.version},totp_verified=True)
    return {"published":published,"template_id":template_id,"version":saved.version}


@router.post("/{template_id}/publish")
def publish(template_id: str, request: Request, admin=Depends(require_permission("templates","approve")), verified=Depends(require_totp_2fa)):
    return set_publication(template_id,True,request,admin)


@router.post("/{template_id}/withdraw")
def withdraw(template_id: str, request: Request, admin=Depends(require_permission("templates","approve")), verified=Depends(require_totp_2fa)):
    return set_publication(template_id,False,request,admin)
