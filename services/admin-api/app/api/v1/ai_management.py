"""Administrative control plane and narrowly scoped signed Chat inference API."""
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field, SecretStr, ValidationError
from app.db.admin_db import admin_db
from app.models.ai_management import StrictModel, Provider, Model, PlanPolicy
from app.security.authentication import AdminUserPayload
from app.security.dependencies import require_internal_secret, require_totp_2fa
from app.security.permissions import require_permission, check_permission
from app.services import ai_management as store
from app.services import ai_inference
from app.services.ai_budget import usage_report
from app.services.audit_service import audit_service
from app.repositories.plan_repository import plan_repository

router = APIRouter(tags=['AI Management'])
BASE = '/api/v1/admin/ai'


class ProviderWrite(StrictModel):
    expected_version: int = Field(ge=0)
    item: Provider


class ModelWrite(StrictModel):
    expected_version: int = Field(ge=0)
    item: Model


class PoliciesWrite(StrictModel):
    expected_version: int = Field(ge=0)
    plans: dict[str, PlanPolicy] | None = None
    routing: dict | None = None


class CredentialWrite(StrictModel):
    secret: SecretStr


class Rollback(StrictModel):
    expected_version: int = Field(ge=0)
    version: int = Field(ge=1)


def record(admin, request, action, **details):
    audit_service.log_action(admin, action, 'ai', request, details, totp_verified=True)


def save(data, expected_version, admin):
    try:
        return store.save_config(data, expected_version, admin.admin_id)
    except ValidationError as error:
        raise HTTPException(422, [{'location': list(item['loc']), 'message': item['msg']} for item in error.errors(include_input=False, include_context=False)]) from None


@router.get(BASE)
def snapshot(admin: AdminUserPayload = Depends(require_permission('ai_settings', 'view'))):
    result = store.configuration_view()
    result['available_plans'] = [{'code': plan.code, 'name': plan.name} for plan in plan_repository.list_active_plans()]
    result['permissions'] = {key: check_permission(admin, key, action) for key, action in [('ai_models', 'edit'), ('ai_assignments', 'edit'), ('ai_credentials', 'manage'), ('ai_routing', 'edit'), ('ai_usage', 'view'), ('ai_deployments', 'manage')]}
    return result


@router.post(BASE + '/providers')
def put_provider(body: ProviderWrite, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_models', 'edit')), factor=Depends(require_totp_2fa)):
    version, config = store.read_config()
    previous = next((p for p in config.providers if p.id == body.item.id), None)
    if (body.item.locality == 'local' or previous and previous.locality == 'local') and not check_permission(admin, 'ai_deployments', 'manage'):
        raise HTTPException(403, 'Local deployment management permission is required')
    data = config.model_dump()
    data['providers'] = [item for item in data['providers'] if item['id'] != body.item.id] + [body.item.model_dump()]
    result = save(data, body.expected_version, admin)
    record(admin, request, 'provider.saved', provider_id=body.item.id, version=result['version'])
    return result


@router.delete(BASE + '/providers/{identity}')
def delete_provider(identity: str, request: Request, expected_version: int = Query(ge=0), admin: AdminUserPayload = Depends(require_permission('ai_models', 'edit')), factor=Depends(require_totp_2fa)):
    _, config = store.read_config()
    provider = next((p for p in config.providers if p.id == identity), None)
    if not provider:
        raise HTTPException(404, 'Provider not found')
    if provider.locality == 'local' and not check_permission(admin, 'ai_deployments', 'manage'):
        raise HTTPException(403, 'Local deployment management permission is required')
    if any(model.provider_id == identity for model in config.models):
        raise HTTPException(409, 'Remove dependent models before deleting this provider')
    if store.credential_generation(identity):
        raise HTTPException(409, 'Revoke the provider credential before deleting the provider')
    data = config.model_dump()
    data['providers'] = [item for item in data['providers'] if item['id'] != identity]
    result = save(data, expected_version, admin)
    record(admin, request, 'provider.deleted', provider_id=identity, version=result['version'])
    return result


@router.post(BASE + '/models')
def put_model(body: ModelWrite, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_models', 'edit')), factor=Depends(require_totp_2fa)):
    _, config = store.read_config()
    provider = next((p for p in config.providers if p.id == body.item.provider_id), None)
    previous = next((m for m in config.models if m.id == body.item.id), None)
    previous_provider = next((p for p in config.providers if previous and p.id == previous.provider_id), None)
    if (provider and provider.locality == 'local' or previous_provider and previous_provider.locality == 'local') and not check_permission(admin, 'ai_deployments', 'manage'):
        raise HTTPException(403, 'Local deployment management permission is required')
    data = config.model_dump()
    data['models'] = [item for item in data['models'] if item['id'] != body.item.id] + [body.item.model_dump()]
    result = save(data, body.expected_version, admin)
    record(admin, request, 'model.saved', model_id=body.item.id, version=result['version'])
    return result


@router.delete(BASE + '/models/{identity}')
def delete_model(identity: str, request: Request, expected_version: int = Query(ge=0), admin: AdminUserPayload = Depends(require_permission('ai_models', 'edit')), factor=Depends(require_totp_2fa)):
    _, config = store.read_config()
    model = next((m for m in config.models if m.id == identity), None)
    if not model:
        raise HTTPException(404, 'Model not found')
    provider = next(p for p in config.providers if p.id == model.provider_id)
    if provider.locality == 'local' and not check_permission(admin, 'ai_deployments', 'manage'):
        raise HTTPException(403, 'Local deployment management permission is required')
    if any(identity in (p.primary_model, p.secondary_model, p.cloud_fallback_model) for p in config.plans.values()):
        raise HTTPException(409, 'Change plan assignments before deleting this model')
    data = config.model_dump()
    data['models'] = [item for item in data['models'] if item['id'] != identity]
    result = save(data, expected_version, admin)
    record(admin, request, 'model.deleted', model_id=identity, version=result['version'])
    return result


@router.put(BASE + '/assignments')
def assignments(body: PoliciesWrite, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_assignments', 'edit')), factor=Depends(require_totp_2fa)):
    if body.plans is None or body.routing is not None:
        raise HTTPException(422, 'Supply plan assignments only')
    known = {p.code for p in plan_repository.list_active_plans()}
    if set(body.plans) - known:
        raise HTTPException(422, 'Assignments reference an unknown active plan')
    _, config = store.read_config()
    data = config.model_dump()
    data['plans'] = {name: policy.model_dump() for name, policy in body.plans.items()}
    result = save(data, body.expected_version, admin)
    record(admin, request, 'assignments.saved', plans=list(body.plans), version=result['version'])
    return result


@router.put(BASE + '/routing')
def routing(body: PoliciesWrite, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_routing', 'edit')), factor=Depends(require_totp_2fa)):
    if body.routing is None or body.plans is not None or not set(body.routing).issubset({'enabled', 'monthly_cloud_usd', 'local_max_concurrency', 'queue_timeout_seconds', 'local_min_available_mb', 'local_max_cpu_percent'}):
        raise HTTPException(422, 'Supply only supported global routing settings')
    _, config = store.read_config()
    if any(key.startswith('local_') and value != config.model_dump().get(key) for key,value in body.routing.items()) and not check_permission(admin, 'ai_deployments', 'manage'):
        raise HTTPException(403, 'Local deployment management permission is required')
    result = save({**config.model_dump(), **body.routing}, body.expected_version, admin)
    record(admin, request, 'routing.saved', fields=list(body.routing), version=result['version'])
    return result


@router.put(BASE + '/providers/{identity}/credential')
def credential(identity: str, body: CredentialWrite, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_credentials', 'manage')), factor=Depends(require_totp_2fa)):
    result = store.replace_credential(identity, body.secret.get_secret_value(), admin.admin_id)
    record(admin, request, 'credential.replaced', provider_id=identity, generation=result['generation'])
    return result


@router.delete(BASE + '/providers/{identity}/credential')
def revoke(identity: str, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_credentials', 'manage')), factor=Depends(require_totp_2fa)):
    store.revoke_credential(identity, admin.admin_id)
    record(admin, request, 'credential.revoked', provider_id=identity)
    return {'revoked': True}


@router.post(BASE + '/models/{identity}/test')
def connectivity(identity: str, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_models', 'edit')), factor=Depends(require_totp_2fa)):
    _, config = store.read_config()
    model = next((m for m in config.models if m.id == identity), None)
    if model and next(p for p in config.providers if p.id == model.provider_id).locality == 'local' and not check_permission(admin, 'ai_deployments', 'manage'):
        raise HTTPException(403, 'Local deployment management permission is required')
    result = ai_inference.test_model(identity, admin.admin_id)
    record(admin, request, 'model.tested', model_id=identity, healthy=result['healthy'], code=result['code'])
    return result


@router.get(BASE + '/history')
def history(admin: AdminUserPayload = Depends(require_permission('ai_settings', 'view'))):
    return [{'version': item.version, 'created_at': item.created_at, 'changed_by_admin_id': item.changed_by_admin_id} for item in store.config_engine.get_version_history(store.DOMAIN)]


@router.post(BASE + '/rollback')
def rollback(body: Rollback, request: Request, admin: AdminUserPayload = Depends(require_permission('ai_routing', 'edit')), factor=Depends(require_totp_2fa)):
    # Rollback affects registry and assignments too; it cannot bypass those scopes.
    for module, action in [('ai_models', 'edit'), ('ai_assignments', 'edit'), ('ai_deployments', 'manage')]:
        if not check_permission(admin, module, action):
            raise HTTPException(403, 'Rollback requires model, assignment and deployment management permissions')
    _, config = store.read_config(body.version)
    result = save(config.model_dump(), body.expected_version, admin)
    record(admin, request, 'routing.rolled_back', restored_version=body.version, version=result['version'])
    return result


@router.get(BASE + '/usage')
def usage(admin: AdminUserPayload = Depends(require_permission('ai_usage', 'view'))):
    result = usage_report()
    try:
        from shared.service_auth import service_request
        from app.core.config import settings
        response = service_request('chat', 'GET', settings.CHAT_SERVICE_URL + '/internal/ai/outcomes', timeout=5)
        response.raise_for_status()
        result['chat'] = response.json()
    except Exception:
        result['chat'] = {'available': False}
    return result


@router.get(BASE + '/audit')
def audit(page: int = Query(default=1, ge=1), admin: AdminUserPayload = Depends(require_permission('ai_settings', 'view'))):
    rows = admin_db.fetch_all('SELECT id,admin_email,action,details_json,created_at FROM audit_logs WHERE module=? ORDER BY created_at DESC LIMIT 10 OFFSET ?', ('ai', (page - 1) * 10))
    total = admin_db.fetch_one('SELECT COUNT(*) AS total FROM audit_logs WHERE module=?', ('ai',))['total']
    return {'items': rows, 'total': total, 'page': page, 'page_size': 10}


@router.get('/api/v1/internal/ai/runtime/{user_id}', dependencies=[Depends(require_internal_secret)])
def internal_runtime(user_id: str):
    return ai_inference.runtime(user_id)


@router.post('/api/v1/internal/ai/infer', dependencies=[Depends(require_internal_secret)])
def internal_infer(body: ai_inference.InferenceRequest):
    return ai_inference.execute(body)
