export interface AIProvider {
  id:string;name:string;kind:'ollama'|'openai_compatible'|'groq'|'anthropic'|'huggingface';endpoint:string;locality:'local'|'cloud';enabled:boolean;
  timeout_seconds:number;max_concurrency:number;requests_per_minute:number;credential_required:boolean;
}
export interface AIModel {
  id:string;name:string;provider_id:string;identifier:string;context_window:number;max_input_tokens:number;max_output_tokens:number;max_concurrency:number;
  capabilities:Array<'chat'|'tools'|'vision'>;deployment:'api'|'hosted_inference'|'dedicated_endpoint'|'self_hosted'|'repository_only';runtime:'openai'|'ollama'|'anthropic'|'vllm'|'tgi'|'llama_cpp'|'external';
  repository:string|null;revision:string|null;quantization:string|null;idle_unload_seconds:number;input_usd_per_million:number|null;output_usd_per_million:number|null;
  token_limit_parameter:'max_tokens'|'max_completion_tokens';enabled:boolean;
  ollama_think?:boolean|null;ollama_num_threads?:number|null;
}
export interface AIPlanPolicy {
  primary_model:string|null;secondary_model:string|null;cloud_fallback_model:string|null;
  allowed_features:Array<'chat'|'document_edit'|'visual_edit'|'language_correction'>;
  deterministic_enabled:boolean;local_enabled:boolean;cloud_fallback_enabled:boolean;fallback_on:string[];
  monthly_requests:number;monthly_tokens:number;monthly_cloud_usd:number;per_user_monthly_requests:number;per_user_monthly_tokens:number;per_user_monthly_cloud_usd:number;
  requests_per_minute:number;priority:number;require_healthy:boolean;health_max_age_seconds:number;
  language_correction_mode:'suggest'|'safe_apply'|'off';
}
export interface AIConfiguration {enabled:boolean;providers:AIProvider[];models:AIModel[];plans:Record<string,AIPlanPolicy>;monthly_cloud_usd:number;local_max_concurrency:number;queue_timeout_seconds:number;local_min_available_mb:number;local_max_cpu_percent:number}
export interface AISnapshot {
  version:number;data:AIConfiguration;available_plans:Array<{code:string;name:string}>;permissions:Record<string,boolean>;
  credentials:Array<{provider_id:string;masked_identifier:string;generation:number;revoked:number;actor_id:string;updated_at:string}>;
  health:Array<{model_id:string;healthy:number;current:boolean;fresh:boolean;checked_at:string;last_success_at:string|null;latency_ms:number;code:string}>;
}
export interface AIUsage {month:string;groups:Array<{plan:string;provider_id:string;model_id:string;locality:string;status:string;requests:number;input_tokens:number;output_tokens:number;cost_microusd:number;latency_ms:number;fallbacks:number}>;
  resources:{available_memory_mb:number|null;cpu_load_percent:number|null;logical_cpus:number|null;cpu_measurement?:string};queue:Array<{locality:string;state:string;requests:number}>;accounting:string;
  chat?:{total_messages:number;deterministic_messages:number;inference_messages:number;editor_successes:number;editor_attempts:number;document_ready_turns:number;successful_turns:number;available:boolean};
}
