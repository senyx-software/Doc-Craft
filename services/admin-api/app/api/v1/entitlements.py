from datetime import datetime,timezone
from typing import Any
from fastapi import APIRouter,Depends,HTTPException,Request
from pydantic import BaseModel,ConfigDict,Field,model_validator
from app.security.dependencies import require_internal_secret,require_totp_2fa
from app.security.permissions import require_permission
from app.services.entitlements import effective_entitlements,get_override,save_override,instant,FEATURES,MODELS
from app.services.audit_service import audit_service
from app.db.admin_db import admin_db
from app.repositories.plan_repository import plan_repository
router=APIRouter(tags=['Entitlements'])

class Override(BaseModel):
    model_config=ConfigDict(extra='forbid')
    plan:str|None=None
    features:dict[str,Any]=Field(default_factory=dict)
    expires_at:str|None=None
    reason:str=Field(min_length=5,max_length=500)
    @model_validator(mode='after')
    def validate_policy(self):
        if self.plan and not plan_repository.get_plan_by_code(self.plan):raise ValueError('Unknown plan')
        if self.expires_at and instant(self.expires_at)<=datetime.now(timezone.utc):raise ValueError('Expiry must be in the future')
        if set(self.features)-FEATURES:raise ValueError('Unknown entitlement')
        for key,value in self.features.items():
            if key in {'customLogo','allTemplates','watermark_removal','priority_pdf_rendering','ai_enabled'} and type(value) is not bool:raise ValueError('Expected boolean')
            if key=='retention_days' and value is not None and (type(value) is not int or not 1<=value<=3650):raise ValueError('Invalid retention')
            if key=='daily_quota' and (type(value) is not int or value != -1 and not 0<=value<=10000000):raise ValueError('Invalid quota')
            if key=='quota_window_hours' and (type(value) is not int or not 1<=value<=720):raise ValueError('Invalid quota window')
            if key=='max_model' and value not in MODELS:raise ValueError('Unsupported model')
            if key=='groq_models' and (not isinstance(value,list) or len(value)>30 or any(not isinstance(item,str) or len(item)>120 for item in value)):raise ValueError('Invalid models')
        return self

@router.get('/api/v1/internal/entitlements/{user_id}',dependencies=[Depends(require_internal_secret)])
def internal_policy(user_id:str):return effective_entitlements(user_id)

@router.get('/api/v1/users/{user_id}/entitlements')
def user_policy(user_id:str,admin=Depends(require_permission('users','view'))):
    return {'entitlements':effective_entitlements(user_id),'override':get_override(user_id)}

@router.put('/api/v1/users/{user_id}/entitlements')
def update_policy(user_id:str,payload:Override,request:Request,admin=Depends(require_permission('users','edit')),verified=Depends(require_totp_2fa)):
    effective_entitlements(user_id) # Verify account/dependencies before granting.
    save_override(user_id,payload.model_dump(),admin.admin_id)
    audit_service.log_action(admin=admin,action='entitlements.override',module='users',request=request,details={'user_id':user_id,'reason':payload.reason},totp_verified=True)
    return {'entitlements':effective_entitlements(user_id),'override':get_override(user_id)}

@router.delete('/api/v1/users/{user_id}/entitlements')
def delete_policy(user_id:str,request:Request,admin=Depends(require_permission('users','edit')),verified=Depends(require_totp_2fa)):
    admin_db.execute('DELETE FROM entitlement_overrides WHERE user_id=?',(user_id,))
    audit_service.log_action(admin=admin,action='entitlements.override_removed',module='users',request=request,details={'user_id':user_id},totp_verified=True)
    return {'entitlements':effective_entitlements(user_id)}

@router.get('/api/v1/internal/entitlement-plans',dependencies=[Depends(require_internal_secret)])
def plan_policies():
    from app.services.entitlements import evaluate
    from app.repositories.config_repository import config_repository
    plans={p.code:p.model_dump(mode='json') for p in plan_repository.list_active_plans()}
    def domain(name):
        entry=config_repository.get_domain_config(name)
        return entry.data if entry else {}
    return {code:evaluate({'id':'policy-preview','status':'active','isGuest':code=='guest'},None,plans,domain('feature_flags'),domain('ai_model_routing'),{'plan':code,'features':{}}) for code in plans}
