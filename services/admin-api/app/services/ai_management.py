"""Registry and credentials reuse the existing configuration and audit infrastructure."""
import hashlib
import json
from datetime import datetime, timezone
from fastapi import HTTPException
from app.db.admin_db import admin_db
from app.models.ai_management import AIConfiguration
from app.repositories.config_repository import config_repository
from app.services.config_engine import config_engine
from app.services.ai_security import endpoint_target, fingerprint, seal, unseal

DOMAIN = 'hybrid_ai'


def now():
    return datetime.now(timezone.utc).isoformat()


def read_config(version=None):
    if version is None:
        # Authorization, revocation and spending limits must not depend on a
        # worker-local cache during a Redis outage or a delayed cache write.
        entry = config_engine.get_domain_config(DOMAIN, force_refresh=True)
        return (entry.version, AIConfiguration.model_validate(entry.data)) if entry else (0, AIConfiguration())
    row = admin_db.fetch_one('SELECT data_json FROM config_history WHERE domain=? AND version=?', (DOMAIN, version))
    if not row:
        raise HTTPException(409, 'Routing policy version is unavailable')
    return version, AIConfiguration.model_validate(json.loads(row['data_json']))


def credential_metadata():
    return admin_db.fetch_all('SELECT provider_id,masked_identifier,generation,revoked,actor_id,updated_at FROM ai_credentials ORDER BY provider_id')


def credential_generation(provider_id):
    row = admin_db.fetch_one('SELECT generation,revoked FROM ai_credentials WHERE provider_id=?', (provider_id,))
    return row['generation'] if row and not row['revoked'] else 0


def secret_for(provider, with_generation=False):
    if not provider.credential_required:
        return (None, 0) if with_generation else None
    row = admin_db.fetch_one('SELECT encrypted_secret,revoked,generation FROM ai_credentials WHERE provider_id=?', (provider.id,))
    if not row or row['revoked'] or not row['encrypted_secret']:
        raise HTTPException(503, 'Provider credential is unavailable')
    secret = unseal(row['encrypted_secret'], provider.id)
    return (secret, row['generation']) if with_generation else secret


def replace_credential(provider_id, secret, actor):
    _, config = read_config()
    if provider_id not in {p.id for p in config.providers}:
        raise HTTPException(404, 'Provider not found')
    if len(secret) < 16 or len(secret) > 8192 or any(char.isspace() for char in secret):
        raise HTTPException(422, 'Enter a valid provider API credential')
    encrypted = seal(secret, provider_id)
    # The identifier is derived from ciphertext, never a plaintext prefix/suffix.
    masked = 'credential-' + hashlib.sha256(encrypted.encode()).hexdigest()[:12]
    admin_db.execute('''INSERT INTO ai_credentials(provider_id,encrypted_secret,masked_identifier,generation,revoked,actor_id,updated_at)
        VALUES(?,?,?,1,0,?,?) ON CONFLICT(provider_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,
        masked_identifier=excluded.masked_identifier,generation=ai_credentials.generation+1,revoked=0,actor_id=excluded.actor_id,updated_at=excluded.updated_at''',
        (provider_id, encrypted, masked, actor, now()))
    return next(item for item in credential_metadata() if item['provider_id'] == provider_id)


def revoke_credential(provider_id, actor):
    changed = admin_db.execute('UPDATE ai_credentials SET encrypted_secret=NULL,revoked=1,generation=generation+1,actor_id=?,updated_at=? WHERE provider_id=?', (actor, now(), provider_id))
    if not changed:
        raise HTTPException(404, 'Credential not found')


def health_rows():
    return admin_db.fetch_all('SELECT * FROM ai_model_health ORDER BY checked_at DESC')


def is_healthy(provider, model, max_age=86400):
    row = admin_db.fetch_one('SELECT * FROM ai_model_health WHERE model_id=?', (model.id,))
    return bool(row and row['healthy'] and row['fingerprint'] == fingerprint(provider, model, credential_generation(provider.id)) and
                (datetime.now(timezone.utc) - datetime.fromisoformat(row['checked_at'])).total_seconds() <= max_age)


def save_config(data, expected_version, actor):
    config = AIConfiguration.model_validate(data)
    _, previous = read_config()
    previous_models = {model.id: model for model in previous.models}
    for provider in config.providers:
        endpoint_target(provider, resolve=False)
    providers = {p.id: p for p in config.providers}
    for model in config.models:
        newly_enabled = model.enabled and not (previous_models.get(model.id) and previous_models[model.id].enabled)
        if newly_enabled and not providers[model.provider_id].enabled:
            raise HTTPException(409, 'Enable the provider before enabling its model')
        if model.enabled and providers[model.provider_id].enabled and not is_healthy(providers[model.provider_id], model, 604800):
            raise HTTPException(409, 'Test the model with its current endpoint and credential before enabling it')
    if config.enabled:
        if not config.plans:
            raise HTTPException(422, 'Configure plan assignments before enabling hybrid AI')
        for policy in config.plans.values():
            for identity in filter(None, (policy.primary_model, policy.secondary_model, policy.cloud_fallback_model)):
                model = next(m for m in config.models if m.id == identity)
                if not previous.enabled and identity == policy.primary_model and (not model.enabled or not providers[model.provider_id].enabled):
                    raise HTTPException(409, 'Active routing needs an enabled primary model and provider')
                if model.enabled and providers[model.provider_id].enabled and policy.require_healthy and not is_healthy(providers[model.provider_id], model, policy.health_max_age_seconds):
                    raise HTTPException(409, 'A plan references a model without a current successful connectivity check')
    entry = config_engine.update_domain_config(DOMAIN, config.model_dump(mode='json'), actor, expected_version=expected_version)
    return {'version': entry.version, 'data': entry.data}


def configuration_view():
    version, config = read_config()
    providers = {p.id: p for p in config.providers}
    models = {m.id: m for m in config.models}
    health = health_rows()
    for row in health:
        model = models.get(row['model_id'])
        row['current'] = bool(model and row['fingerprint'] == fingerprint(providers[model.provider_id], model, credential_generation(model.provider_id)))
        max_age = min([p.health_max_age_seconds for p in config.plans.values() if p.require_healthy and model and model.id in
                       (p.primary_model, p.secondary_model, p.cloud_fallback_model)] or [86400])
        row['fresh'] = bool(row['current'] and (datetime.now(timezone.utc) - datetime.fromisoformat(row['checked_at'])).total_seconds() <= max_age)
    return {'version': version, 'data': config.model_dump(mode='json'), 'credentials': credential_metadata(), 'health': health}
