# Current system audit

Recorded 2026-10-20, before hybrid implementation, on `eranda-dev` after `f984d1d`.

## Existing architecture and reuse decisions

| Area | Existing implementation | Decision |
| --- | --- | --- |
| Chat orchestration | `services/chat/src/routes/chat.routes.ts`: authenticated SSE turns, deduplication, fenced leases, resumable checkpoints, local extraction before inference | Extend this pipeline; retain its idempotency and recovery behavior |
| Conversation storage | Prisma PostgreSQL `chat_sessions`, `chat_messages`, `tool_executions`, `ai_usages`; `conversation.repository.ts` uses optimistic transactions | Keep durable state in session slots and bounded metadata, never Redis-only conversation memory |
| Deterministic intelligence | `shared/conversation-state.mjs`, `conversation-intent.mjs`, `field-processing.mjs`, `item-table.mjs` | Reuse extraction, questions, corrections, validation, calculations and natural response planning |
| Model routing | `provider-router.service.ts`, legacy `ai_model_routing` config; Groq and Claude loops | Keep legacy behavior until a validated hybrid policy is activated; add a registry-backed path |
| Provider limitations | Groq endpoint and deployment model list are fixed in code; Claude uses two fixed model ceilings | Add extensible protocol adapters and identifiers from the registry |
| Secrets | Provider credentials currently come from server environment variables; existing AES-GCM TOTP sealing has account-bound associated data | Add purpose-separated provider credential encryption, masked read APIs and revocation; never put secrets in shared config/history/Redis |
| Admin configuration | `config_engine.py` and `config_repository.py`: PostgreSQL/SQLite persistence, atomic version increments, history, Redis cache and invalidation | Reuse versioned configuration rather than create another settings database |
| Admin access | Live admin session and role checks, granular permission dependency, sensitive-action 2FA, audit service | Add explicit AI scopes and reuse these controls on every management operation |
| Plans and billing | Authoritative entitlements from admin plans and billing snapshots; separate quota service with durable reservations | Keep plan/document quota behavior; add inference-specific budgets around each actual provider request |
| Tools | MCP `update_slots` and `get_session_state`; typed proposal validation, literal evidence, ownership checks, financial DAG | Reuse validated tools; add restricted editor operations rather than arbitrary model code |
| Editor | Native elements, semantic fields, server-persisted canvas layout and layout revision, frontend selection and browser undo/redo | Add selected element context and server-backed chat edits/history; preserve frontend editing and uploaded templates |
| Monitoring | Prometheus default process CPU/RAM and chat outcome counters; PostHog spans; `AIUsage` schema | Add durable inference reservations/usage and deterministic/local/cloud counters; expose real observations only |
| Gateway/auth | Gateway JWT verification, service identity signing, request validation and rate limits; chat repeats authentication | Preserve these boundaries, add narrowly scoped signed internal AI routes |

## Gaps found

1. No registry for local/Ollama/Hugging Face/OpenAI-compatible endpoints or capability validation.
2. No secure admin credential replacement/revocation interface.
3. Existing plan model configuration cannot express local-first fallback, token/spend budgets or concurrency.
4. `AIUsage` exists but current Groq processing primarily sends telemetry; no atomic cloud spending reservation prevents concurrent overspend.
5. Selection and frontend undo history are not durable chat tools. Visual edits need typed, tenant-scoped backend operations and revision conflict handling.
6. Configurable network endpoints require explicit egress restrictions, DNS validation/pinning, no redirects, and distinct local/cloud rules.
7. Model repository IDs do not imply hosted Hugging Face inference; runtime/deployment metadata and connectivity checks must be separate.
8. No local runtime/model is assumed available. Hardware sizing, live model accuracy and inference benchmarks require an installed model and representative full-stack load.

## Implementation boundaries

The upgrade will add an AI management API and UI, registry-backed inference gateway, versioned plan policies, encrypted credentials, atomic budgets, queue/concurrency coordination and editor tools. It will not replace authentication, billing, the document contract, MCP transport or existing session state. Mandatory ownership, schema and financial validation remain enforced even when deterministic routing is disabled.

Existing remote database policies and user documents will not be changed during validation. Database migrations are supplied for operator execution; isolated test databases and local fixtures will validate the change. No production deployment or model download occurs from an admin HTTP request.

## Continuation audit — 2026-10-21

The working tree already contains the registry, credential, routing, editor and conversation extensions described below. They are uncommitted work and must be preserved. Review and validation continue against that working tree, rather than replacing it or claiming those files were newly authored in this pass.

Initial validation found a deterministic add-item regression (an explicit quantity followed by a price falls through to inference), missing Python test tooling, and a missing browser binary for the existing PDF alignment test. These are the first remediation targets. Only the initial audit report existed; the remaining ten requested reports still need to be completed. Live model accuracy, local hardware sizing and production integration remain unmeasured until a runtime and isolated deployment are available.
