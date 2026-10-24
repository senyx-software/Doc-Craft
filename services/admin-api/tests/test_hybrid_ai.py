"""Isolated control-plane, protocol and concurrency checks. No live inference charges."""
import base64
import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app.db.admin_db import admin_db
from app.models.ai_management import AIConfiguration, Provider, Model, PlanPolicy
from app.services import ai_management as store, ai_inference as inference, ai_budget as budget
from app.services.ai_security import endpoint_target, seal, unseal
from app.services.ai_budget import resources as actual_resources
from app.services.ai_providers import infer
from tests.conftest import seed_admin_with_totp, action_code, service_headers

BASE = '/api/v1/admin/ai'


def test_ollama_options_are_explicit_bounded_and_not_sent_to_other_protocols():
    provider=Provider(id='p',name='Local',kind='ollama',endpoint='http://127.0.0.1:11434/api',locality='local',credential_required=False)
    model=Model(provider_id='p',name='Model',identifier='configured',runtime='ollama',ollama_think=False,ollama_num_threads=4)
    requests=[]
    def transport(provider,path,payload,headers):
        requests.append(payload)
        return {'message':{'role':'assistant','content':'Ready'},'prompt_eval_count':10,'eval_count':2}
    infer(provider,model,None,[{'role':'user','content':'Hello'}],[],transport=transport)
    assert requests[0]['think'] is False and requests[0]['options']['num_thread']==4
    model.ollama_think=None;model.ollama_num_threads=None
    infer(provider,model,None,[{'role':'user','content':'Hello'}],[],transport=transport)
    assert 'think' not in requests[1] and 'num_thread' not in requests[1]['options']
    with pytest.raises(ValueError):Model(provider_id='p',name='M',identifier='configured',ollama_num_threads=0)


def test_local_host_memory_is_not_replaced_by_control_plane_cgroup(monkeypatch):
    from pathlib import Path
    original=Path.read_text
    def read(path,*args,**kwargs):
        if str(path)=='/sys/fs/cgroup/memory.max':return str(768*1048576)
        if str(path)=='/sys/fs/cgroup/memory.current':return str(256*1048576)
        return original(path,*args,**kwargs)
    monkeypatch.setattr(Path,'read_text',read)
    import builtins,io
    original_open=builtins.open
    def opened(path,*args,**kwargs):
        if str(path)=='/proc/meminfo':return io.StringIO('MemAvailable: 4194304 kB\n')
        return original_open(path,*args,**kwargs)
    monkeypatch.setattr(builtins,'open',opened)
    result=actual_resources()
    assert result['controller_container_available_mb']==512
    assert result['available_memory_mb'] is not None
    # /proc reports the host, separately from the 512 MiB controller headroom.
    assert result['available_memory_mb']==4096


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    monkeypatch.setenv('AI_CREDENTIAL_KEYRING', json.dumps({'active_kid': 'test', 'keys': {'test': base64.urlsafe_b64encode(b'x' * 32).decode()}}))
    for table in ('ai_credentials', 'ai_model_health', 'ai_inference_ledger', 'ai_inference_queue'):
        admin_db.execute('DELETE FROM ' + table)
    admin_db.execute('DELETE FROM config_history WHERE domain=?', (store.DOMAIN,))
    admin_db.execute('DELETE FROM config_entries WHERE domain=?', (store.DOMAIN,))
    store.config_engine.get_domain_config(store.DOMAIN, force_refresh=True)
    store.config_engine._cache_key_for_domain(store.DOMAIN)
    from app.core.redis import cache_manager
    cache_manager.delete('config:domain:hybrid_ai')
    monkeypatch.setattr(budget, 'resources', lambda: {'available_memory_mb': 16000, 'cpu_load_percent': 1})
    monkeypatch.setattr(inference, 'effective_entitlements', lambda user: {'account_enabled': True, 'ai_enabled': True, 'plan': 'free'})
    monkeypatch.setattr(inference, 'platform_quota', lambda *args: None)
    monkeypatch.setattr(inference, 'infer', lambda *args, **kwargs: {'message': {'role': 'assistant', 'content': '', 'tool_calls': [{'id': 'check', 'function': {'name': 'connection_check', 'arguments': '{"ok":true}'}}]}, 'finish_reason': 'stop', 'usage': {'input_tokens': 20, 'output_tokens': 10}})


def headers(email='hybrid-admin@example.com', permissions=None, super_admin=True):
    token, secret = seed_admin_with_totp(email, 'Super Admin' if super_admin else 'AI Staff', permissions or ['*'], super_admin)
    return lambda: {'Authorization': 'Bearer ' + token, 'X-Admin-2FA': action_code(secret)}


def configured(locality='local', enabled=True):
    provider = Provider(id='provider', name='Inference', kind='ollama' if locality == 'local' else 'openai_compatible', endpoint='http://127.0.0.1:11434/api' if locality == 'local' else 'https://api.openai.com/v1', locality=locality, credential_required=locality == 'cloud', enabled=True)
    model = Model(id='model', name='Assistant', provider_id='provider', identifier='fixture-model', runtime='ollama' if locality == 'local' else 'openai', context_window=32768, max_input_tokens=24000, input_usd_per_million=1, output_usd_per_million=2)
    config = AIConfiguration(providers=[provider], models=[model], monthly_cloud_usd=10)
    version = store.save_config(config.model_dump(), 0, 'fixture')['version']
    if locality == 'cloud':
        store.replace_credential('provider', 'fixture-only-provider-secret-123', 'fixture')
    assert inference.test_model('model', 'fixture')['healthy']
    config.models[0].enabled = True
    config.plans = {'free': PlanPolicy(primary_model='model', monthly_cloud_usd=5, per_user_monthly_cloud_usd=2)}
    config.enabled = enabled
    version = store.save_config(config.model_dump(), version, 'fixture')['version']
    return version, config


def request(version, **kwargs):
    return inference.InferenceRequest(request_id=uuid4().hex, user_id='owner', session_id='own-session', policy_version=version, model_id='model', messages=[{'role': 'user', 'content': 'Hello'}], **kwargs)


def test_admin_registers_provider_and_model_with_dependency_checks():
    client, auth = TestClient(app), headers()
    provider = Provider(id='p', name='Local inference', kind='ollama', endpoint='http://127.0.0.1:11434/api', locality='local', credential_required=False)
    response = client.post(BASE + '/providers', headers=auth(), json={'expected_version': 0, 'item': provider.model_dump()})
    assert response.status_code == 200, response.text
    model = Model(id='m', name='Registered model', provider_id='p', identifier='my-model', runtime='ollama')
    assert client.post(BASE + '/models', headers=auth(), json={'expected_version': 1, 'item': model.model_dump()}).status_code == 200
    assert client.delete(BASE + '/providers/p?expected_version=2', headers=auth()).status_code == 409
    assert client.delete(BASE + '/models/m?expected_version=2', headers=auth()).status_code == 200


def test_credential_add_rotate_revoke_never_returns_plaintext():
    configured()
    client, auth = TestClient(app), headers('credential-manager@example.com')
    endpoint = BASE + '/providers/provider/credential'
    for number in (1, 2):
        secret = f'only-fixture-provider-secret-{number}'
        response = client.put(endpoint, headers=auth(), json={'secret': secret})
        assert response.status_code == 200, response.text
        assert response.json()['generation'] == number
        assert secret not in response.text
        assert secret not in client.get(BASE, headers=auth()).text
        assert secret not in client.get(BASE + '/audit', headers=auth()).text
        encrypted = admin_db.fetch_one('SELECT encrypted_secret FROM ai_credentials WHERE provider_id=?', ('provider',))['encrypted_secret']
        assert encrypted.startswith('ai:v1:') and secret not in encrypted
        assert unseal(encrypted, 'provider') == secret
    assert client.delete(endpoint, headers=auth()).status_code == 200
    assert admin_db.fetch_one('SELECT encrypted_secret FROM ai_credentials')['encrypted_secret'] is None


def test_encryption_is_bound_to_provider_and_key_rotation_retains_old_keys(monkeypatch):
    value = seal('fixture-confidential-secret', 'one')
    with pytest.raises(HTTPException):
        unseal(value, 'two')
    monkeypatch.setenv('AI_CREDENTIAL_KEYRING', json.dumps({'active_kid': 'new', 'keys': {'test': base64.urlsafe_b64encode(b'x' * 32).decode(), 'new': base64.urlsafe_b64encode(b'y' * 32).decode()}}))
    assert unseal(value, 'one') == 'fixture-confidential-secret'
    assert seal('replacement-secret', 'one').startswith('ai:v1:new:')


def test_regular_users_and_staff_without_ai_scopes_cannot_manage():
    client = TestClient(app)
    assert client.get(BASE).status_code == 401
    auth = headers('ai-viewer@example.com', ['ai_settings:view'], False)
    assert client.get(BASE, headers=auth()).status_code == 200
    assert client.put(BASE + '/providers/p/credential', headers=auth(), json={'secret': 'fixture-secret-value'}).status_code == 403
    assert client.put(BASE + '/routing', headers=auth(), json={'expected_version': 0, 'routing': {'enabled': False}}).status_code == 403
    assert client.get(BASE + '/usage', headers=auth()).status_code == 403
    assert client.get('/api/v1/internal/ai/runtime/owner', headers=auth()).status_code in (401, 403)


def test_generic_settings_cannot_bypass_ai_permissions():
    client, auth = TestClient(app), headers()
    response = client.put('/api/v1/admin/config/hybrid_ai', headers=auth(), json={'enabled': True})
    assert response.status_code == 422


def test_invalid_credential_payload_and_errors_do_not_echo_secrets():
    client, auth = TestClient(app), headers()
    secret = 'secret-that-must-never-appear'
    response = client.put(BASE + '/providers/p/credential', headers=auth(), json={'secret': {'value': secret}})
    assert response.status_code == 422
    assert secret not in response.text and '"input"' not in response.text


def test_model_activation_requires_successful_current_tool_check():
    provider = Provider(id='p', name='P', kind='ollama', endpoint='http://127.0.0.1:11434/api', locality='local', credential_required=False, enabled=True)
    model = Model(id='m', name='M', provider_id='p', identifier='fixture', runtime='ollama', enabled=True)
    with pytest.raises(HTTPException) as error:
        store.save_config(AIConfiguration(providers=[provider], models=[model]).model_dump(), 0, 'actor')
    assert error.value.status_code == 409


def test_runtime_assignments_change_without_redeployment_and_versions_compare():
    version, config = configured()
    assert inference.runtime('owner')['models']['model']['locality'] == 'local'
    config.plans['pro'] = config.plans['free'].model_copy()
    config.plans['free'].monthly_requests = 12
    saved = store.save_config(config.model_dump(), version, 'actor')
    assert inference.runtime('owner')['policy']['monthly_requests'] == 12
    assert inference.runtime('owner')['version'] == saved['version']
    with pytest.raises(HTTPException) as error:
        store.save_config(config.model_dump(), version, 'actor')
    assert error.value.status_code == 409


def test_inference_uses_current_entitlements_and_prohibits_unassigned_model(monkeypatch):
    version, _ = configured()
    payload = request(version)
    payload.model_id = 'not-assigned'
    with pytest.raises(HTTPException) as error:
        inference.execute(payload)
    assert error.value.status_code == 403
    monkeypatch.setattr(inference, 'effective_entitlements', lambda user: {'account_enabled': False, 'ai_enabled': True, 'plan': 'free'})
    with pytest.raises(HTTPException):
        inference.execute(request(version))


def test_new_assignments_do_not_invalidate_inflight_snapshot_but_revocation_does(monkeypatch):
    version, config = configured()
    config.plans['free'].priority = 5
    version2 = store.save_config(config.model_dump(), version, 'actor')['version']
    monkeypatch.setattr(inference, 'infer', lambda *args, **kwargs: {'message': {'role': 'assistant', 'content': 'Hello'}, 'finish_reason': 'stop', 'usage': {'input_tokens': 10, 'output_tokens': 5}})
    assert inference.execute(request(version))['message']['content'] == 'Hello'
    config.enabled = False
    store.save_config(config.model_dump(), version2, 'actor')
    with pytest.raises(HTTPException):
        inference.execute(request(version))


def test_concurrent_requests_cannot_exceed_monthly_budget():
    version, config = configured('cloud')
    policy = config.plans['free'].model_copy(update={'monthly_requests': 3, 'per_user_monthly_requests': 3})
    provider, model = config.providers[0], config.models[0]
    def attempt(index):
        try:
            budget.reserve(request(version), provider, model, policy, config, 'free', 100)
            return True
        except HTTPException:
            return False
    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(attempt, range(12)))
    assert sum(outcomes) == 3
    assert admin_db.fetch_one('SELECT COUNT(*) AS total FROM ai_inference_ledger WHERE plan=?', ('free',))['total'] == 3


def test_cloud_fallback_spending_and_request_deduplication():
    version, config = configured('cloud')
    policy = config.plans['free'].model_copy(update={'per_user_monthly_cloud_usd': .000001})
    with pytest.raises(HTTPException) as error:
        budget.reserve(request(version), config.providers[0], config.models[0], policy, config, 'free', 100)
    assert error.value.detail['code'] == 'AI_BUDGET_EXCEEDED'
    payload = request(version)
    budget.reserve(payload, config.providers[0], config.models[0], config.plans['free'], config, 'free', 100)
    with pytest.raises(HTTPException) as error:
        budget.reserve(payload, config.providers[0], config.models[0], config.plans['free'], config, 'free', 100)
    assert error.value.status_code == 409


def test_failed_inference_keeps_conservative_cost_reservation(monkeypatch):
    version, _ = configured('cloud')
    def unavailable(*args, **kwargs):
        raise HTTPException(504, {'code': 'PROVIDER_TIMEOUT'})
    monkeypatch.setattr(inference, 'infer', unavailable)
    with pytest.raises(HTTPException):
        inference.execute(request(version))
    row = admin_db.fetch_one('SELECT * FROM ai_inference_ledger WHERE plan=?', ('free',))
    assert row['status'] == 'failed_estimated' and row['cost_microusd'] > 0


@pytest.mark.parametrize('endpoint,locality', [('http://169.254.169.254', 'cloud'), ('https://127.0.0.1/v1', 'cloud'), ('http://localhost:3011', 'local'), ('https://api.openai.com@evil.example/v1', 'cloud'), ('https://api.openai.com/v1?api_key=secret', 'cloud')])
def test_ssrf_endpoints_are_rejected(endpoint, locality):
    provider = Provider(name='P', kind='openai_compatible', endpoint=endpoint, locality=locality)
    with pytest.raises(HTTPException):
        endpoint_target(provider)


def test_dns_rebinding_is_checked_and_pinned(monkeypatch):
    provider = Provider(name='P', kind='openai_compatible', endpoint='https://api.openai.com/v1')
    monkeypatch.setattr('socket.getaddrinfo', lambda *args, **kwargs: [(2, 1, 6, '', ('169.254.169.254', 443))])
    with pytest.raises(HTTPException):
        endpoint_target(provider)


@pytest.mark.parametrize('kind,runtime,path', [('openai_compatible', 'openai', '/chat/completions'), ('groq', 'openai', '/chat/completions'), ('huggingface', 'tgi', '/chat/completions'), ('ollama', 'ollama', '/chat'), ('anthropic', 'anthropic', '/messages')])
def test_provider_protocols_preserve_tools_and_limits(kind, runtime, path):
    provider = Provider(name='P', kind=kind, endpoint='http://127.0.0.1:11434/api' if kind == 'ollama' else 'https://api.openai.com/v1', locality='local' if kind == 'ollama' else 'cloud', credential_required=kind != 'ollama')
    model = Model(name='M', provider_id=provider.id, identifier='configured-model', runtime=runtime)
    seen = []
    def transport(p, target, payload, headers):
        seen.append((target, payload, headers))
        if kind == 'anthropic':
            return {'content': [{'type': 'tool_use', 'id': 'call1', 'name': 'get_session_state', 'input': {}}], 'usage': {'input_tokens': 10, 'output_tokens': 20}, 'stop_reason': 'tool_use'}
        if kind == 'ollama':
            return {'message': {'role': 'assistant', 'content': '', 'tool_calls': [{'function': {'name': 'get_session_state', 'arguments': {}}}]}, 'prompt_eval_count': 10, 'eval_count': 20}
        return {'choices': [{'message': {'role': 'assistant', 'content': '', 'tool_calls': [{'id': 'call1', 'function': {'name': 'get_session_state', 'arguments': '{}'}}]}, 'finish_reason': 'tool_calls'}], 'usage': {'prompt_tokens': 10, 'completion_tokens': 20}}
    result = infer(provider, model, 'fixture-provider-secret', [{'role': 'user', 'content': 'Show state'}], [{'type': 'function', 'function': {'name': 'get_session_state', 'parameters': {'type': 'object'}}}], transport=transport)
    assert seen[0][0] == path
    assert result['message']['tool_calls'][0]['function']['arguments'] == '{}'
    assert seen[0][1]['model'] == 'configured-model'


def test_provider_secret_echo_is_blocked():
    provider = Provider(name='P', kind='openai_compatible', endpoint='https://api.openai.com/v1')
    model = Model(name='M', provider_id=provider.id, identifier='model')
    with pytest.raises(HTTPException) as error:
        infer(provider, model, 'confidential-api-key', [{'role': 'user', 'content': 'Hello'}], [], transport=lambda *args: {'choices': [{'message': {'role': 'assistant', 'content': 'confidential-api-key'}}]})
    assert 'confidential-api-key' not in str(error.value.detail)


def test_hugging_face_repository_is_not_automatically_callable():
    with pytest.raises(ValueError):
        Model(name='Repository', provider_id='p', identifier='org/model', deployment='repository_only', enabled=True)


def test_queued_requests_recheck_revocations_before_dispatch(monkeypatch):
    from contextlib import contextmanager
    version, config = configured('cloud')
    @contextmanager
    def queue_then_revoke(*args):
        store.revoke_credential('provider', 'security-admin')
        yield
    calls = []
    monkeypatch.setattr(inference, 'admission', queue_then_revoke)
    monkeypatch.setattr(inference, 'infer', lambda *args: calls.append(args))
    with pytest.raises(HTTPException):
        inference.execute(request(version))
    assert calls == []
    assert admin_db.fetch_one('SELECT COUNT(*) AS total FROM ai_inference_ledger WHERE plan=?', ('free',))['total'] == 0


def test_stale_cache_cannot_restore_disabled_routing(monkeypatch):
    from app.core.redis import cache_manager
    version, config = configured()
    stale = store.config_engine.get_domain_config(store.DOMAIN).model_dump(mode='json')
    config.enabled = False
    store.save_config(config.model_dump(), version, 'security-admin')
    cache_manager.set('config:domain:hybrid_ai', stale)
    assert inference.runtime('owner')['enabled'] is False


def test_plan_assignments_select_different_registered_models(monkeypatch):
    version, config = configured()
    second = config.models[0].model_copy(update={'id': 'paid-model', 'identifier': 'paid-fixture', 'enabled': False})
    config.models.append(second)
    version = store.save_config(config.model_dump(), version, 'actor')['version']
    assert inference.test_model(second.id, 'actor')['healthy']
    second.enabled = True
    config.plans['pro'] = config.plans['free'].model_copy(update={'primary_model': second.id})
    store.save_config(config.model_dump(), version, 'actor')
    assert inference.runtime('owner')['policy']['primary_model'] == 'model'
    monkeypatch.setattr(inference, 'effective_entitlements', lambda user: {'account_enabled': True, 'ai_enabled': True, 'plan': 'pro'})
    assert inference.runtime('owner')['policy']['primary_model'] == 'paid-model'


def test_model_concurrency_is_enforced_independently_of_provider():
    version, config = configured('cloud')
    provider, model, policy = config.providers[0], config.models[0], config.plans['free']
    provider.max_concurrency = 5
    config.queue_timeout_seconds = 0
    with budget.admission('running', provider, model, policy, config):
        with pytest.raises(HTTPException) as error:
            with budget.admission('waiting', provider, model, policy, config):
                pytest.fail('Exceeded model concurrency')
        assert error.value.detail['code'] == 'AI_QUEUE_TIMEOUT'
    assert admin_db.fetch_one('SELECT COUNT(*) AS total FROM ai_inference_queue')['total'] == 0


@pytest.mark.parametrize('payload', [None, [], {'choices': None}, {'choices': [{'message': {'role': 'assistant', 'content': {'bad': 'shape'}}}]}])
def test_malformed_upstream_responses_are_sanitized(payload):
    provider = Provider(name='P', kind='openai_compatible', endpoint='https://api.openai.com/v1')
    model = Model(name='M', provider_id=provider.id, identifier='fixture')
    with pytest.raises(HTTPException) as error:
        infer(provider, model, 'fixture-secret', [{'role': 'user', 'content': 'Hello'}], [], transport=lambda *args: payload)
    assert error.value.detail['code'] == 'PROVIDER_RESPONSE_INVALID'
    assert 'fixture-secret' not in str(error.value.detail)


def test_mounted_keyring_supports_managed_secret_files(monkeypatch, tmp_path):
    keyfile = tmp_path / 'keyring.json'
    keyfile.write_text(__import__('os').environ['AI_CREDENTIAL_KEYRING'])
    monkeypatch.setenv('AI_CREDENTIAL_KEYRING_FILE', str(keyfile))
    monkeypatch.delenv('AI_CREDENTIAL_KEYRING')
    assert unseal(seal('mounted-fixture-secret', 'p'), 'p') == 'mounted-fixture-secret'


def test_generic_internal_snapshot_omits_registry():
    from app.api.v1.config import get_internal_all_configs
    configured()
    assert store.DOMAIN not in [entry.domain for entry in get_internal_all_configs()]


def test_connectivity_wait_does_not_dispatch_a_revoked_credential(monkeypatch):
    from contextlib import contextmanager
    configured('cloud')
    @contextmanager
    def queue_then_revoke(*args):
        store.revoke_credential('provider', 'security-admin')
        yield
    calls = []
    monkeypatch.setattr(inference, 'admission', queue_then_revoke)
    monkeypatch.setattr(inference, 'infer', lambda *args: calls.append(args))
    assert inference.test_model('model', 'actor')['healthy'] is False
    assert calls == []
