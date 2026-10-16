from typing import Literal
from datetime import datetime,timezone
from fastapi import APIRouter,Depends,Request,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from app.security.dependencies import require_internal_secret,require_totp_2fa
from app.security.permissions import require_permission
from app.services import uploaded_templates as store
from app.services.audit_service import audit_service
from app.db.admin_db import admin_db

router=APIRouter(tags=['Uploaded templates'])

class Upload(BaseModel):
    model_config=ConfigDict(extra='forbid')
    name:str=Field(min_length=1,max_length=100)
    owner_id:str=Field(min_length=1,max_length=100,pattern=r'^[a-zA-Z0-9_-]+$')
    document_type:Literal['invoice','quotation','proposal','receipt','purchase_order']
    visibility:Literal['private','public']='private'
    premium:bool=False
    family_id:str|None=Field(None,pattern=r'^upl_[a-f0-9]{32}$')
    html:str=Field(min_length=1,max_length=150000)
    assets:dict[str,str]=Field(default_factory=dict)


@router.get('/api/v1/internal/uploaded-templates',dependencies=[Depends(require_internal_secret)])
def list_available(user_id:str):return {'templates':store.available(user_id)}

@router.get('/api/v1/internal/uploaded-templates/{identity}',dependencies=[Depends(require_internal_secret)])
def read_available(identity:str,user_id:str):return store.content(identity,user_id)

@router.post('/api/v1/internal/uploaded-templates',dependencies=[Depends(require_internal_secret)],status_code=201)
def user_upload(data:Upload):
    # The receiving Document service has independently verified the owner JWT.
    if data.visibility!='private' or data.premium:raise HTTPException(403,'User uploads must remain private until administrator review')
    if data.family_id and store.version(data.family_id+'_v1')['owner_id']!=data.owner_id:raise HTTPException(404,'Template family unavailable')
    return store.create(data,'user:'+data.owner_id)

@router.post('/api/v1/admin/templates/uploads',status_code=201)
def admin_upload(data:Upload,request:Request,admin=Depends(require_permission('templates','create'))):
    result=store.create(data,admin.admin_id)
    audit_service.log_action(admin=admin,action='template.uploaded',module='templates',request=request,details={'version_id':result['id'],'digest':result['digest']})
    return result

@router.get('/api/v1/admin/templates/uploads/{identity}')
def inspect(identity:str,admin=Depends(require_permission('templates','view'))):
    import json
    row=store.version(identity)
    return {**store.descriptor(row),'source':json.loads(row['source_json'])}

@router.post('/api/v1/admin/templates/uploads/{identity}/approve')
def approve(identity:str,request:Request,admin=Depends(require_permission('templates','approve')),verified=Depends(require_totp_2fa)):
    row=store.version(identity)
    admin_db.execute('UPDATE uploaded_template_versions SET reviewed_by=?,approved_at=? WHERE id=?',(admin.admin_id,datetime.now(timezone.utc).isoformat(),identity))
    audit_service.log_action(admin=admin,action='template.approved',module='templates',request=request,details={'version_id':identity,'digest':row['digest']},totp_verified=True)
    return store.descriptor(store.version(identity))
