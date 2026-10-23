import json
import time
from datetime import datetime, timezone
from typing import Literal
from pydantic import Field
from fastapi import HTTPException
from app.db.admin_db import admin_db
from app.models.ai_management import StrictModel, PlanPolicy
from app.services import ai_management as store
from app.services.ai_security import fail, fingerprint
from app.services.ai_budget import admission, reserve, settle
from app.services.ai_providers import infer
from app.services.entitlements import effective_entitlements
from shared.service_auth import service_request
from app.core.config import settings

TOOL_NAMES = Literal['update_slots', 'get_session_state', 'edit_canvas', 'get_editor_selection', 'undo_document', 'redo_document', 'propose_language_correction']


class FunctionCall(StrictModel):
    name: TOOL_NAMES
    arguments: str = Field(max_length=16000)


class ToolCall(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    type: Literal['function'] = 'function'
    function: FunctionCall


class Message(StrictModel):
    role: Literal['system', 'user', 'assistant', 'tool']
    content: str | None = Field(default=None, max_length=40000)
    tool_calls: list[ToolCall] | None = Field(default=None, max_length=20)
    tool_call_id: str | None = Field(default=None, max_length=100)


class ToolFunction(StrictModel):
    name: TOOL_NAMES
    description: str = Field(default='', max_length=2500)
    parameters: dict


class Tool(StrictModel):
    type: Literal['function'] = 'function'
    function: ToolFunction


class InferenceRequest(StrictModel):
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,100}$')
    user_id: str = Field(min_length=1, max_length=100)
    session_id: str = Field(min_length=1, max_length=100)
    policy_version: int = Field(ge=1)
    model_id: str = Field(min_length=1, max_length=80)
    messages: list[Message] = Field(min_length=1, max_length=60)
    tools: list[Tool] = Field(default_factory=list, max_length=8)
    fallback: bool = False
    feature: Literal['chat', 'document_edit', 'visual_edit', 'language_correction'] = 'chat'


def entitlement(user_id):
    policy = effective_entitlements(user_id)
    if not policy['account_enabled'] or not policy['ai_enabled']:
        raise HTTPException(403, 'AI access is not enabled for this account')
    return policy


def platform_quota(request, plan):
    try:
        response = service_request('quota', 'POST', settings.QUOTA_SERVICE_URL + '/v1/quota/check',
                                   json={'userId': request.user_id, 'plan': plan, 'reservationId': 'hybrid:' + request.request_id}, timeout=5)
        if response.status_code == 403:
            fail('QUOTA_EXCEEDED', 403)
        if response.status_code != 200:
            fail('QUOTA_UNAVAILABLE')
    except HTTPException:
        raise
    except Exception:
        fail('QUOTA_UNAVAILABLE')


def runtime(user_id):
    version, config = store.read_config()
    if not config.enabled:
        return {'enabled': False, 'version': version}
    account = entitlement(user_id)
    policy = config.plans.get(account['plan'])
    if not policy:
        raise HTTPException(403, 'No assistant policy is assigned to this plan')
    model_ids = set(filter(None, [policy.primary_model, policy.secondary_model, policy.cloud_fallback_model]))
    models = {model.id: model for model in config.models if model.id in model_ids}
    providers = {provider.id: provider for provider in config.providers}
    return {'enabled': True, 'version': version, 'plan': account['plan'], 'policy': policy.model_dump(),
            'models': {identity: {'id': identity, 'locality': providers[model.provider_id].locality, 'max_input_tokens': model.max_input_tokens} for identity, model in models.items()},
            'private_terms': list(set([value for model in config.models for value in (model.identifier, model.name, model.id)] +
                                      [value for provider in config.providers for value in (provider.name, provider.endpoint, provider.id)]))}


def authorize_attempt(request: InferenceRequest):
    _, current = store.read_config()
    _, config = store.read_config(request.policy_version)
    if not current.enabled or not config.enabled:
        fail('PROVIDER_UNCONFIGURED')
    account = entitlement(request.user_id)
    policy = config.plans.get(account['plan'])
    current_policy = current.plans.get(account['plan'])
    if not policy or not current_policy or request.feature not in policy.allowed_features or request.feature not in current_policy.allowed_features:
        raise HTTPException(403, 'This assistant feature is not enabled for the account')
    permitted = [policy.primary_model, policy.secondary_model]
    if policy.cloud_fallback_enabled and current_policy.cloud_fallback_enabled:
        permitted.append(policy.cloud_fallback_model)
    if request.model_id not in permitted:
        raise HTTPException(403, 'Model is not assigned to the current subscription')
    model = next((m for m in config.models if m.id == request.model_id), None)
    if not model or not model.enabled:
        fail('PROVIDER_UNCONFIGURED')
    provider = next(p for p in config.providers if p.id == model.provider_id)
    live_model = next((m for m in current.models if m.id == model.id), None)
    live_provider = next((p for p in current.providers if p.id == provider.id), None)
    # Assignment-only changes allow in-flight turns to finish. Revocations and
    # endpoint/protocol changes stop immediately, before credentials are opened.
    if not live_provider or not live_model or not live_provider.enabled or not live_model.enabled or provider.model_dump(exclude={'name', 'enabled'}) != live_provider.model_dump(exclude={'name', 'enabled'}) or model.model_dump(exclude={'name', 'enabled'}) != live_model.model_dump(exclude={'name', 'enabled'}):
        fail('POLICY_CHANGED', 409)
    if provider.locality == 'local' and (not policy.local_enabled or not current_policy.local_enabled):
        raise HTTPException(403, 'Local inference is disabled for this plan')
    if request.fallback and provider.locality == 'cloud' and not (policy.cloud_fallback_enabled and current_policy.cloud_fallback_enabled):
        raise HTTPException(403, 'Cloud fallback is disabled for this plan')
    if (policy.require_healthy or current_policy.require_healthy) and not store.is_healthy(provider, model, min(policy.health_max_age_seconds, current_policy.health_max_age_seconds)):
        fail('PROVIDER_UNAVAILABLE')
    return current, current_policy, model, provider, account


def execute(request: InferenceRequest):
    current, current_policy, model, provider, account = authorize_attempt(request)
    messages = [item.model_dump(exclude_none=True) for item in request.messages]
    tools = [item.model_dump() for item in request.tools]
    packed = json.dumps({'messages': messages, 'tools': tools}, ensure_ascii=False).encode()
    # A byte upper bound avoids trusting a tokenizer estimate across unrelated
    # runtimes. Never truncate system instructions or the user's latest facts.
    input_tokens = len(packed) + len(messages) * 16 + 256
    if input_tokens > model.max_input_tokens:
        fail('CONTEXT_LIMIT', 422)
    with admission(request.request_id, provider, model, current_policy, current):
        # Queue waits are an authorization boundary: configuration, budgets,
        # feature access and credential revocation may have changed meanwhile.
        current, current_policy, model, provider, account = authorize_attempt(request)
        reserve(request, provider, model, current_policy, current, account['plan'], input_tokens)
        started = time.monotonic()
        dispatched = False
        try:
            platform_quota(request, account['plan'])
            secret = store.secret_for(provider)
            dispatched = True
            result = infer(provider, model, secret, messages, tools)
            usage = result['usage']
            known = all(type(usage.get(key)) is int and usage[key] >= 0 for key in ('input_tokens', 'output_tokens'))
            if known and (usage['input_tokens'] > input_tokens or usage['output_tokens'] > model.max_output_tokens):
                fail('PROVIDER_RESPONSE_INVALID')
            settle(request.request_id, 'success' if known else 'success_estimated', int((time.monotonic() - started) * 1000), model, provider.locality,
                   (usage['input_tokens'], usage['output_tokens']) if known else None)
            return {'message': result['message'], 'finish_reason': result['finish_reason']}
        except BaseException:
            settle(request.request_id, 'failed_estimated' if dispatched else 'not_dispatched', int((time.monotonic() - started) * 1000), model, provider.locality, None if dispatched else (0, 0))
            raise


def test_model(identity, actor):
    version, config = store.read_config()
    model = next((m for m in config.models if m.id == identity), None)
    if not model:
        raise HTTPException(404, 'Model not found')
    if model.deployment == 'repository_only':
        raise HTTPException(422, 'A repository is not an inference API; register a deployed endpoint first')
    provider = next(p for p in config.providers if p.id == model.provider_id)
    secret, tested_generation = store.secret_for(provider, with_generation=True)
    tested_fingerprint = fingerprint(provider, model, tested_generation)
    from types import SimpleNamespace
    from uuid import uuid4
    request = SimpleNamespace(request_id='health_' + uuid4().hex, user_id='admin:' + actor, session_id='connectivity', policy_version=version, fallback=False)
    policy = PlanPolicy(monthly_cloud_usd=config.monthly_cloud_usd, per_user_monthly_cloud_usd=config.monthly_cloud_usd, per_user_monthly_requests=100, monthly_requests=1000)
    started, code, healthy = time.monotonic(), 'PROVIDER_UNAVAILABLE', False
    try:
        with admission(request.request_id, provider, model, policy, config):
            _, live = store.read_config()
            live_model = next((item for item in live.models if item.id == identity), None)
            live_provider = next((item for item in live.providers if item.id == provider.id), None)
            secret, generation = store.secret_for(provider, with_generation=True)
            if not live_model or not live_provider or fingerprint(live_provider, live_model, generation) != tested_fingerprint:
                fail('POLICY_CHANGED', 409)
            policy.monthly_cloud_usd = live.monthly_cloud_usd
            policy.per_user_monthly_cloud_usd = live.monthly_cloud_usd
            reserve(request, provider, model, policy, live, '__connectivity__', 512)
            result = infer(provider, model, secret, [{'role': 'user', 'content': 'Connectivity check. Call connection_check with ok true. Do not answer in prose.'}],
                           [{'type': 'function', 'function': {'name': 'connection_check', 'description': 'Confirm tool compatibility', 'parameters': {'type': 'object', 'properties': {'ok': {'type': 'boolean'}}, 'required': ['ok'], 'additionalProperties': False}}}], output_limit=128)
            healthy = any(call['function']['name'] == 'connection_check' and json.loads(call['function']['arguments']) == {'ok': True} for call in result['message'].get('tool_calls', []))
            code = 'OK' if healthy else 'TOOLS_UNSUPPORTED'
            usage = result['usage']
            known = all(type(usage.get(key)) is int and usage[key] >= 0 for key in ('input_tokens', 'output_tokens'))
            settle(request.request_id, 'health_success' if healthy else 'health_failed', int((time.monotonic() - started) * 1000), model, provider.locality,
                   (usage['input_tokens'], usage['output_tokens']) if known else None)
    except HTTPException as error:
        code = error.detail.get('code', 'PROVIDER_UNAVAILABLE') if isinstance(error.detail, dict) else 'PROVIDER_UNAVAILABLE'
        settle(request.request_id, 'health_failed_estimated', int((time.monotonic() - started) * 1000), model, provider.locality)
    stamp, latency = store.now(), int((time.monotonic() - started) * 1000)
    previous = admin_db.fetch_one('SELECT last_success_at FROM ai_model_health WHERE model_id=?', (identity,))
    admin_db.execute('''INSERT INTO ai_model_health(model_id,fingerprint,healthy,checked_at,last_success_at,latency_ms,code) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(model_id) DO UPDATE SET fingerprint=excluded.fingerprint,healthy=excluded.healthy,checked_at=excluded.checked_at,
        last_success_at=excluded.last_success_at,latency_ms=excluded.latency_ms,code=excluded.code''',
        (identity, tested_fingerprint, int(healthy), stamp, stamp if healthy else (previous or {}).get('last_success_at'), latency, code))
    return {'model_id': identity, 'healthy': healthy, 'code': code, 'checked_at': stamp, 'latency_ms': latency}
