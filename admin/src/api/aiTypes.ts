export interface AIProvider {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  base_url?: string;
  api_key_configured?: boolean;
  models?: string[];
  [key: string]: unknown;
}

export interface AIModel {
  id: string;
  name: string;
  provider_id: string;
  context_window?: number;
  max_output_tokens?: number;
  enabled: boolean;
  [key: string]: unknown;
}

export interface AIPlanPolicy {
  plan: string;
  daily_tokens?: number;
  monthly_requests?: number;
  models_allowed?: string[];
  features?: string[];
  [key: string]: unknown;
}

export interface AIConfiguration {
  default_provider?: string;
  default_model?: string;
  fallback_model?: string;
  timeout_ms?: number;
  retry_count?: number;
  [key: string]: unknown;
}

export interface AIUsage {
  total_tokens?: number;
  total_requests?: number;
  requests_today?: number;
  tokens_today?: number;
  by_model?: Record<string, number>;
  by_provider?: Record<string, number>;
  [key: string]: unknown;
}

export interface AISnapshot {
  version: number;
  providers: AIProvider[];
  models: AIModel[];
  assignments: Record<string, AIPlanPolicy>;
  routing: AIConfiguration;
  updated_at?: string;
}
