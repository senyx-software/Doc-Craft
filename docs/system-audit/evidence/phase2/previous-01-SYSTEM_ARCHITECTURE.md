# System architecture

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

DocCraft is a document-building application with two browser applications, nine backend services including the gateway, and a PDF-rendering sidecar. It is a mixed Node/TypeScript and Python monorepo. Frontend packages are separate from the root backend workspaces.

The checked-in `.env` and service-specific environment files use **chat 3016** and **notification 3012**. Earlier documentation reversed them. Explicit configuration takes precedence over fallback ports. The audit corrected documentation and relevant fallbacks; it did not start the full remotely configured stack.

## Components

| Component | Source | Responsibility | Port | Dependencies |
| --- | --- | --- | --- | --- |
| User frontend | [user-frontend/src/App.tsx:1](../../user-frontend/src/App.tsx#L1) | React 19, Vite, TypeScript, React Router, Zustand; API clients and builder canvas/export | 5173 configured; 5183 audit | Gateway; browser localStorage/cookies; Firebase; html2canvas/html2pdf/jsPDF |
| Admin frontend | [admin/src/App.tsx:1](../../admin/src/App.tsx#L1) | Separate React/Vite app; 81 navigation IDs, shared subviews, TOTP prompt and admin auth store | 5174 configured; 5184 audit | Direct Admin API; localStorage admin session; Recharts |
| Gateway | [services/gateway/src/index.ts:1](../../services/gateway/src/index.ts#L1) | Express ingress, raw webhook parser, alias translation, JWT/account checks, proxy/SSE, rate limiting | 3001 | Auth, chat, document, payment, quota, notification, analytics, admin API, Redis |
| Auth | [services/auth/src/server.ts:1](../../services/auth/src/server.ts#L1) | Fastify; persistent accounts, guests, password/email/Google/TOTP flows, sessions and internal account APIs | 3011 | Prisma/PostgreSQL, Firebase token verification, Redis email queue, analytics |
| Chat / AI | [services/chat/src/server.ts:1](../../services/chat/src/server.ts#L1) | Fastify SSE and MCP; committed document state, field collection, tool execution, provider orchestration | 3016 | Prisma/PostgreSQL, Redis, Auth, quota, Groq; separate Claude adapter |
| Document | [services/document/app/main.py:1](../../services/document/app/main.py#L1) | FastAPI, SQLAlchemy, Jinja2, embedded BullMQ PDF worker; custom templates, downloads/shares | 3013 | Auth, chat state, quota, Redis document queue, storage, Puppeteer sidecar |
| PDF sidecar | [services/document/puppeteer/server.ts:1](../../services/document/puppeteer/server.ts#L1) | Fastify and Chromium/Puppeteer; self-contained HTML/assets to PDF, loopback-bound | 3023 default; 3029 audit | Node browser process, installed Chromium/fonts; external fetches blocked |
| Payment | [services/payment/src/app.ts:1](../../services/payment/src/app.ts#L1) | Express; plans, subscriptions, provider checkout, webhooks/worker, invoices, coupons, methods | 3014 | Prisma/PostgreSQL, Redis, Paddle, PayHere, Auth, quota, notification |
| Quota | [services/quota/src/app.ts:1](../../services/quota/src/app.ts#L1) | Express; daily counters, atomic Lua reservation, overrides/refunds, guest limits and admin config client | 3015 | Redis, Prisma/PostgreSQL sync, Auth, admin configuration |
| Notification | [services/notification/src/server.ts:1](../../services/notification/src/server.ts#L1) | Fastify; authenticated preferences/logs, internal dispatch, Resend callback, BullMQ email worker | 3012 | Redis email_queue, PostgreSQL, Resend, Auth, admin template/settings feed |
| Analytics | [services/analytics/app/main.py:1](../../services/analytics/app/main.py#L1) | FastAPI, pandas/SQLAlchemy reporting, events and BullMQ/PostHog worker | 3017 | Shared application tables, Redis analytics queue, PostHog |
| Admin API | [services/admin-api/app/main.py:1](../../services/admin-api/app/main.py#L1) | FastAPI control plane; RBAC, TOTP, config/version history, plans, users/support, reporting/automation | 3018 | SQL manager: PostgreSQL or SQLite; Redis; service clients; PostHog/Resend |
| Shared contracts | [shared/document-contract.mjs:1](../../shared/document-contract.mjs#L1) | Cross-runtime field/schema/amount/conversation/stream/assets/tool contracts and tests | Library | JavaScript/TypeScript clients; Python document_contract.py mirror |

## Overall microservices architecture

```mermaid
flowchart LR
  U[User browser] --> UF[User React app]
  A[Admin browser] --> AF[Admin React app]
  UF --> GW[Gateway 3001]
  AF --> ADM[Admin API 3018]
  GW --> AUTH[Auth 3011]
  GW --> CHAT[Chat 3016]
  GW --> DOC[Document 3013]
  GW --> PAY[Payment 3014]
  GW --> Q[Quota 3015]
  GW --> N[Notification 3012]
  GW --> AN[Analytics 3017]
  GW --> ADM
  CHAT --> AUTH
  DOC --> AUTH
  PAY --> AUTH
  Q --> AUTH
  CHAT --> GROQ[Groq provider]
  DOC --> SIDE[Puppeteer sidecar 3023]
  DOC --> STORAGE[Supabase or local PDF storage]
  PAY --> PROVIDERS[Paddle or PayHere]
  N --> RESEND[Resend]
  AN --> PH[PostHog]
  AUTH --> DB[(PostgreSQL)]
  CHAT --> DB
  DOC --> DB
  PAY --> DB
  AN --> DB
  Q --> DB
  ADM --> ADB[(Admin PostgreSQL or SQLite)]
  ADM --> R[(Redis)]
  CHAT --> R
  DOC --> R
  PAY --> R
  Q --> R
  AUTH --> R
  N --> R
  AN --> R
```

Database hosting is inferred from configuration only. Several environment files point to a remote Supabase-hosted PostgreSQL project. Database schema/ownership compatibility was not verified against that remote instance. Admin and payment both declare a physical `plans` table with different columns; quota and admin both declare `audit_logs` with different schemas. Treat these as migration blockers rather than assuming their create-if-missing statements reconcile them.

## User request lifecycle

```mermaid
sequenceDiagram
  participant B as User browser
  participant G as Gateway
  participant A as Auth
  participant S as Selected service
  participant D as Database or queue
  B->>G: HTTP request and access bearer
  G->>G: Verify access JWT and strip forged identity headers
  G->>A: Internal current-account status/plan lookup
  A-->>G: Active identity and current plan
  G->>S: Translate alias and forward bearer/body
  S->>A: Verify current account where protected
  S->>D: Authorized operation
  D-->>S: Result
  S-->>G: JSON, binary, redirect, or SSE
  G-->>B: Preserve result/error/stream
```

Protected Auth, gateway, chat, payment, quota, and document paths now reject unverified identity headers; current-account lookups prevent stale token plans/status from controlling those workflows. This introduces an Auth availability/latency dependency. Notification user preferences delegate bearer verification to Auth. No load benchmark was performed.

## Admin request lifecycle

```mermaid
sequenceDiagram
  participant UI as Admin UI
  participant API as Admin API
  participant DB as Admin database
  participant S as Consuming service
  UI->>API: Bearer request
  API->>DB: Re-read account status and assigned role
  API->>API: Check permission and sensitive-action 2FA
  API->>DB: Validate and persist change
  API->>DB: Record audit action where implemented
  API->>S: Service call or configuration publication
  API-->>UI: Actual result or error
```

The admin browser calls port 3018 directly by default. Gateway admin aliases are also registered, but admin JWTs are distinct from user JWTs; the default direct admin path is the supported browser flow. Do not assume the user gateway accepts admin tokens.

## Authentication workflow

```mermaid
flowchart TD
  R[Email registration] --> DB[Persist unverified account]
  DB --> EQ[email_queue verification message]
  EQ --> V[Submit matching unexpired verification code]
  V --> EV[Persist verified flag]
  L[Password login] --> C[Check account and password]
  GG[Google login] --> F[Verify Firebase ID token]
  F --> C
  C --> T{Second factor enabled}
  T -->|yes| MFA[MFA challenge and TOTP]
  MFA --> TOK[Access and refresh tokens]
  T -->|no| TOK
  G[Guest entry] --> GP[Persist unique guest identity]
  GP --> GT[24-hour guest access token]
  TOK --> S[Persist refresh session]
  S --> ROT[Refresh-token rotation]
  ROT --> S
```

Admin login is a separate password-plus-code flow. Login, password-reset, and sensitive-action email codes now use separate namespaces; codes are not returned in login/reset responses. Admin tokens are checked against current persisted identity/role on each protected request. Missing bootstrap passwords no longer select a source-code fallback. A stable admin signing secret must be configured for sessions to survive process restarts.

## AI chat workflow

```mermaid
sequenceDiagram
  participant UI as Chat store/UI
  participant API as Chat route
  participant F as Shared field engine
  participant DB as Conversation repository
  participant Q as Quota
  participant P as Groq adapter
  participant M as MCP tools
  UI->>API: Session, turn ID, message
  API->>DB: Authorize session, claim turn and lease
  API->>F: Classify intent and extract explicit facts
  F->>DB: Validate/commit candidates and revision
  alt Semantic provider work required
    API->>Q: Idempotent quota reservation
    API->>P: Bounded authorized context
    P->>M: Validated tool calls
    M->>DB: Authorized mutations and checkpoints
    P-->>API: Completed text or typed failure
  end
  API->>DB: Persist outcome and authoritative snapshot
  API-->>UI: SSE result, changed state, or explicit error
```

The production route's default provider is `runGroqAgenticLoop`. Local extraction may complete a turn without a provider call. Claude adapter/model-router/config helper modules exist, but their plan-ceiling helpers are not called by the active Groq route. Do not describe stored Claude routing preferences as verified enforcement of Groq model access.

## Document generation and export

```mermaid
flowchart TD
  STATE[Committed conversation fields and revision] --> PREVIEW[Browser canvas or HTML preview]
  PREVIEW --> CONFIRM[Read saved snapshot and confirm fingerprint]
  CONFIRM --> CLIENT[Client html2canvas and jsPDF export]
  CONFIRM --> API[Server generate endpoint when invoked]
  API --> READ[Fetch authorized chat snapshot]
  READ --> VALID[Python contract validation]
  VALID --> QUOTA[Reserve generation allowance]
  QUOTA --> ROW[Persist document request and stable operation ID]
  ROW --> QUEUE[Redis document queue]
  QUEUE --> WORKER[Python PDF worker]
  WORKER --> JINJA[Jinja2 template]
  JINJA --> SIDE[Puppeteer PDF]
  SIDE --> WM[Plan watermark handling]
  WM --> STORE[Upload PDF and persist result]
  STORE --> DL[Owner download or expiring signed/share link]
  STORE --> EMAIL[Best-effort document_ready notification]
```

These are two actual export paths, not a single mandatory pipeline. The primary canvas export can produce a browser PDF without creating a server `documents` row or running the BullMQ worker. Client canvas layout customizations are not generally persisted as the server Jinja template. Automated tests cover semantic synchronization and export guards; a full signed-in browser save/reopen/export journey against PostgreSQL remains BLOCKED.

## Payment and subscription lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant P as Payment API
  participant X as Paddle or PayHere
  participant Q as Webhook queue
  participant W as Worker
  participant D as Subscription database
  participant A as Auth
  participant L as Quota
  B->>P: Create checkout
  P-->>B: Provider URL or form fields
  B->>X: Hosted checkout
  X->>P: Signed callback with original bytes
  P->>Q: Durably enqueue callback
  Q-->>P: Accepted
  P-->>X: Acknowledge
  Q->>W: Deliver event with retries
  W->>D: Check event ID and write subscription/invoice
  W->>A: Synchronize persisted account plan
  W->>L: Apply configured allowance
  W->>D: Mark event processed
```

Queue acceptance precedes HTTP success after the fix. Account/quota synchronization failures are retryable worker failures. This is still a distributed sequence, not an atomic transaction/outbox; concurrent duplicate/out-of-order events and crashes between effects need further validation. Provider sandbox behavior was not exercised.

## Admin configuration propagation

```mermaid
flowchart LR
  UI[Admin plan or config edit] --> API[Permission and 2FA checks]
  API --> DB[Plan row or versioned config]
  DB --> SNAP[Redis config:domain:plans]
  DB --> KEY[Redis quota:plan:code]
  SNAP --> PUB[config_invalidation publication]
  PUB --> MEM[Evict Node consumer memory cache]
  KEY --> Q[Quota client resolves new limit]
  Q --> USER[Next user quota request]
  SNAP -.-> PRICE[Payment config merge]
  PRICE -.-> STATIC[Hardcoded pricing UI still diverges]
  DB -.-> FLAGS[Some UI and export feature gates remain hardcoded]
```

Solid quota propagation was exercised with the real admin API, SQLite persistence, Redis, and one long-lived Node consumer. Dashed pricing/flag paths have implementation gaps and are not verified end to end. The historical `monthly_quota` field actually feeds a counter that resets daily at midnight UTC.

## Database and service dependencies

```mermaid
flowchart TD
  AUTH[Auth Prisma] --> USERS[users / sessions / password_resets]
  AUTH --> LOGIN[login_events / referrals]
  CHAT[Chat Prisma] --> CT[document_types / templates]
  CHAT --> CS[chat_sessions / chat_messages]
  CHAT --> META[generated_documents / tool_executions / ai_usages]
  DOC[Document SQLAlchemy] --> DOCS[documents / custom_templates]
  PAY[Payment Prisma] --> PLANS[plans / subscriptions / billing_invoices]
  PAY --> COUPON[coupons / webhook_events]
  QUOTA[Quota Prisma] --> QC[quotas / quota_reset_logs / audit_logs]
  ADM[Admin SQL manager] --> CONTROL[admin_users / admin_roles / config and support tables]
  ADM --> OVERLAP[Also declares plans / coupons / audit_logs]
  OVERLAP -.-> PLANS
  OVERLAP -.-> COUPON
  OVERLAP -.-> QC
  ANALYTICS[Analytics reporting] --> USERS
  ANALYTICS --> CS
  ANALYTICS --> DOCS
  ANALYTICS --> PLANS
```

Logical relationships from Prisma include User→Session/PasswordReset/LoginEvent, DocumentType→Template/ChatSession, ChatSession→ChatMessage, and Plan→Subscription→BillingInvoice. Cross-service user IDs and admin role IDs also form logical references; this report does not claim all are enforced foreign keys in the live database. SQLAlchemy `documents` and Prisma `generated_documents` are different tables.

## Infrastructure, configuration and recovery

Root Compose defines Redis plus application containers; it does not define a PostgreSQL container. Service Compose files are separate alternatives, not automatically additional root services. `infrastructure/` contains no implemented deployment stack beyond its checked-in contents. Docker image execution was NOT TESTED because Docker is unavailable in this audit environment.

Auth/chat have checked-in Prisma migrations. Payment/quota declare Prisma schemas but do not have equivalent checked-in migration directories. Document startup performs `create_all` plus selected PostgreSQL `ALTER TABLE` statements; admin database construction performs schema initialization on import. Starting a Python service is therefore not necessarily read-only. No migrations were run against shared resources.

Health endpoints mostly establish process liveness. Redis/database/provider readiness, worker restart recovery, browser state reconciliation, resource caps, and sustained latency need separate checks. Puppeteer launches a browser per request; provider timeouts, chat concurrency/rate limits, payment queue retries, logging, Prometheus/Sentry-related integration points, and graceful shutdown code exist, but full operational reliability is not proven by their presence.
