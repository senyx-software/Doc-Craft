"""Non-secret, versioned AI configuration. Identifiers come from administrators."""
from typing import Literal
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Provider(StrictModel):
    id: str = Field(default_factory=lambda: 'prv_' + uuid4().hex, pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    name: str = Field(min_length=1, max_length=100)
    kind: Literal['ollama', 'openai_compatible', 'groq', 'anthropic', 'huggingface']
    endpoint: str = Field(min_length=8, max_length=500)
    locality: Literal['local', 'cloud'] = 'cloud'
    enabled: bool = False
    timeout_seconds: int = Field(default=45, ge=2, le=90)
    max_concurrency: int = Field(default=1, ge=1, le=32)
    requests_per_minute: int = Field(default=30, ge=1, le=10000)
    credential_required: bool = True

    @model_validator(mode='after')
    def compatible(self):
        if self.kind == 'ollama' and self.locality != 'local':
            raise ValueError('Ollama must use an operator-approved local endpoint')
        if self.locality == 'cloud' and not self.credential_required:
            raise ValueError('Cloud providers require a server-side credential')
        return self


class Model(StrictModel):
    id: str = Field(default_factory=lambda: 'mdl_' + uuid4().hex, pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    name: str = Field(min_length=1, max_length=100)
    provider_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    identifier: str = Field(min_length=1, max_length=200, pattern=r'^[a-zA-Z0-9][a-zA-Z0-9_./:@+-]*$')
    context_window: int = Field(default=8192, ge=1024, le=2000000)
    max_input_tokens: int = Field(default=6000, ge=256, le=1000000)
    max_output_tokens: int = Field(default=2048, ge=64, le=64000)
    max_concurrency: int = Field(default=1, ge=1, le=32)
    capabilities: list[Literal['chat', 'tools', 'vision']] = Field(default_factory=lambda: ['chat', 'tools'], max_length=3)
    deployment: Literal['api', 'hosted_inference', 'dedicated_endpoint', 'self_hosted', 'repository_only'] = 'api'
    runtime: Literal['openai', 'ollama', 'anthropic', 'vllm', 'tgi', 'llama_cpp', 'external'] = 'openai'
    repository: str | None = Field(default=None, max_length=200, pattern=r'^[a-zA-Z0-9_./-]+$')
    revision: str | None = Field(default=None, max_length=100, pattern=r'^[a-zA-Z0-9_.-]+$')
    quantization: str | None = Field(default=None, max_length=40, pattern=r'^[a-zA-Z0-9_.-]+$')
    idle_unload_seconds: int = Field(default=0, ge=0, le=3600)
    ollama_think: bool | None = None
    ollama_num_threads: int | None = Field(default=None, ge=1, le=64)
    input_usd_per_million: float | None = Field(default=None, ge=0, le=10000)
    output_usd_per_million: float | None = Field(default=None, ge=0, le=10000)
    token_limit_parameter: Literal['max_tokens', 'max_completion_tokens'] = 'max_tokens'
    enabled: bool = False

    @model_validator(mode='after')
    def bounds(self):
        if self.max_input_tokens + self.max_output_tokens > self.context_window:
            raise ValueError('Input and output limits exceed the context window')
        if self.enabled and (self.deployment == 'repository_only' or not {'chat', 'tools'}.issubset(self.capabilities)):
            raise ValueError('Active assistant models require a callable chat endpoint and tool support')
        return self


class PlanPolicy(StrictModel):
    primary_model: str | None = Field(default=None, max_length=80)
    secondary_model: str | None = Field(default=None, max_length=80)
    cloud_fallback_model: str | None = Field(default=None, max_length=80)
    allowed_features: list[Literal['chat', 'document_edit', 'visual_edit', 'language_correction']] = Field(default_factory=lambda: ['chat', 'document_edit', 'visual_edit', 'language_correction'], max_length=4)
    deterministic_enabled: bool = True
    local_enabled: bool = True
    cloud_fallback_enabled: bool = False
    fallback_on: list[Literal['unavailable', 'timeout', 'rate_limit', 'invalid_response', 'unresolved']] = Field(default_factory=lambda: ['unavailable', 'timeout', 'rate_limit', 'invalid_response'], max_length=5)
    monthly_requests: int = Field(default=1000, ge=0, le=10000000)
    monthly_tokens: int = Field(default=1000000, ge=0, le=100000000000)
    monthly_cloud_usd: float = Field(default=0, ge=0, le=1000000)
    per_user_monthly_requests: int = Field(default=100, ge=0, le=1000000)
    per_user_monthly_tokens: int = Field(default=100000, ge=0, le=1000000000)
    per_user_monthly_cloud_usd: float = Field(default=0, ge=0, le=100000)
    requests_per_minute: int = Field(default=20, ge=1, le=1000)
    priority: int = Field(default=0, ge=0, le=10)
    require_healthy: bool = True
    health_max_age_seconds: int = Field(default=86400, ge=60, le=604800)
    language_correction_mode: Literal['suggest', 'safe_apply', 'off'] = 'suggest'


class AIConfiguration(StrictModel):
    enabled: bool = False
    providers: list[Provider] = Field(default_factory=list, max_length=30)
    models: list[Model] = Field(default_factory=list, max_length=100)
    plans: dict[str, PlanPolicy] = Field(default_factory=dict, max_length=50)
    monthly_cloud_usd: float = Field(default=0, ge=0, le=10000000)
    local_max_concurrency: int = Field(default=1, ge=1, le=8)
    queue_timeout_seconds: int = Field(default=8, ge=0, le=30)
    local_min_available_mb: int = Field(default=1024, ge=256, le=262144)
    local_max_cpu_percent: int = Field(default=95, ge=10, le=100)

    @model_validator(mode='after')
    def references(self):
        providers = {p.id: p for p in self.providers}
        models = {m.id: m for m in self.models}
        if len(providers) != len(self.providers) or len(models) != len(self.models):
            raise ValueError('Registry identifiers must be unique')
        for model in self.models:
            provider = providers.get(model.provider_id)
            if not provider:
                raise ValueError('A model references an unknown provider')
            if model.enabled:
                expected = 'ollama' if provider.kind == 'ollama' else 'anthropic' if provider.kind == 'anthropic' else None
                if expected and model.runtime != expected or not expected and model.runtime in ('ollama', 'anthropic'):
                    raise ValueError('Model runtime and provider protocol are incompatible')
                if provider.locality == 'cloud' and (model.input_usd_per_million is None or model.output_usd_per_million is None):
                    raise ValueError('Cloud models require explicit pricing metadata, including zero-priced models')
                if provider.kind == 'huggingface' and not model.repository:
                    raise ValueError('Hugging Face models require repository metadata and a callable deployment')
        for plan, policy in self.plans.items():
            if not __import__('re').fullmatch(r'[a-zA-Z0-9_-]{1,40}', plan):
                raise ValueError('Invalid subscription plan code')
            if self.enabled and not policy.primary_model:
                raise ValueError('Each configured active plan needs a primary model')
            for field in ('primary_model', 'secondary_model', 'cloud_fallback_model'):
                identity = getattr(policy, field)
                if identity and identity not in models:
                    raise ValueError('Assignments must reference available registered models')
            if policy.cloud_fallback_model and providers[models[policy.cloud_fallback_model].provider_id].locality != 'cloud':
                raise ValueError('Cloud fallback must reference a cloud deployment')
            for identity in filter(None, (policy.primary_model, policy.secondary_model)):
                if not policy.local_enabled and providers[models[identity].provider_id].locality == 'local':
                    raise ValueError('Local assignments require local inference to be enabled')
        return self
