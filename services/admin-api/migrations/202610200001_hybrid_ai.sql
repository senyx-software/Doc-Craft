CREATE TABLE IF NOT EXISTS ai_credentials (
    provider_id TEXT PRIMARY KEY,
    encrypted_secret TEXT,
    masked_identifier TEXT NOT NULL,
    generation INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    actor_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_model_health (
    model_id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    healthy INTEGER NOT NULL,
    checked_at TEXT NOT NULL,
    last_success_at TEXT,
    latency_ms INTEGER NOT NULL,
    code TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_inference_ledger (
    request_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    model_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    locality TEXT NOT NULL,
    policy_version INTEGER NOT NULL,
    month TEXT NOT NULL,
    status TEXT NOT NULL,
    input_tokens BIGINT NOT NULL,
    output_tokens BIGINT NOT NULL,
    cost_microusd BIGINT NOT NULL,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    fallback INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_ledger_month_plan_user ON ai_inference_ledger(month,plan,user_id);
CREATE INDEX IF NOT EXISTS ai_ledger_provider_date ON ai_inference_ledger(provider_id,created_at);
CREATE TABLE IF NOT EXISTS ai_inference_queue (
    request_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    locality TEXT NOT NULL,
    priority INTEGER NOT NULL,
    expires_at DOUBLE PRECISION NOT NULL,
    created_at DOUBLE PRECISION NOT NULL,
    state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_queue_expiry ON ai_inference_queue(expires_at,state);
