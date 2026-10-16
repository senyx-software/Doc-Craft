"""Generate linked audit reports from the retained evidence and source inventory.

Narrative conclusions are deliberately narrower than the static inventory.
Run system_audit_inventory.cjs first, and run this after verification completes.
"""
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs/system-audit"
EVIDENCE = DOC / "evidence"
inventory = json.loads((EVIDENCE / "inventory.json").read_text())
baseline = json.loads((EVIDENCE / "baseline.json").read_text())
entries = inventory["entries"]
kinds = collections.Counter(row["kind"] for row in entries)
checks = {}
for file in EVIDENCE.glob("*.json"):
    data = json.loads(file.read_text())
    if isinstance(data, dict) and "exit_code" in data:
        checks[data["id"]] = data


def load(name):
    return json.loads((EVIDENCE / f"{name}.json").read_text())


def source(file, needle=None):
    p = ROOT / file
    line = 1
    if isinstance(needle, int):
        line = needle
    elif p.exists() and needle:
        line = next((i for i, text in enumerate(p.read_text().splitlines(), 1) if needle in text), 1)
    return f"[{file}:{line}](../../{file}#L{line})"


def cell(value):
    return str(value if value is not None else "—").replace("|", "\\|").replace("\n", " ")


def table(headings, rows):
    return "| " + " | ".join(headings) + " |\n| " + " | ".join("---" for _ in headings) + " |\n" + "\n".join("| " + " | ".join(cell(value) for value in row) + " |" for row in rows) + "\n"


legend = """Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.
"""

components = [
    ("User frontend", "user-frontend/src/App.tsx", "React 19, Vite, TypeScript, React Router, Zustand; API clients and builder canvas/export", "5173 configured; 5183 audit", "Gateway; browser localStorage/cookies; Firebase; html2canvas/html2pdf/jsPDF"),
    ("Admin frontend", "admin/src/App.tsx", "Separate React/Vite app; 81 navigation IDs, shared subviews, TOTP prompt and admin auth store", "5174 configured; 5184 audit", "Direct Admin API; localStorage admin session; Recharts"),
    ("Gateway", "services/gateway/src/index.ts", "Express ingress, raw webhook parser, alias translation, JWT/account checks, proxy/SSE, rate limiting", "3001", "Auth, chat, document, payment, quota, notification, analytics, admin API, Redis"),
    ("Auth", "services/auth/src/server.ts", "Fastify; persistent accounts, guests, password/email/Google/TOTP flows, sessions and internal account APIs", "3011", "Prisma/PostgreSQL, Firebase token verification, Redis email queue, analytics"),
    ("Chat / AI", "services/chat/src/server.ts", "Fastify SSE and MCP; committed document state, field collection, tool execution, provider orchestration", "3016", "Prisma/PostgreSQL, Redis, Auth, quota, Groq; separate Claude adapter"),
    ("Document", "services/document/app/main.py", "FastAPI, SQLAlchemy, Jinja2, embedded BullMQ PDF worker; custom templates, downloads/shares", "3013", "Auth, chat state, quota, Redis document queue, storage, Puppeteer sidecar"),
    ("PDF sidecar", "services/document/puppeteer/server.ts", "Fastify and Chromium/Puppeteer; self-contained HTML/assets to PDF, loopback-bound", "3023 default; 3029 audit", "Node browser process, installed Chromium/fonts; external fetches blocked"),
    ("Payment", "services/payment/src/app.ts", "Express; plans, subscriptions, provider checkout, webhooks/worker, invoices, coupons, methods", "3014", "Prisma/PostgreSQL, Redis, Paddle, PayHere, Auth, quota, notification"),
    ("Quota", "services/quota/src/app.ts", "Express; daily counters, atomic Lua reservation, overrides/refunds, guest limits and admin config client", "3015", "Redis, Prisma/PostgreSQL sync, Auth, admin configuration"),
    ("Notification", "services/notification/src/server.ts", "Fastify; authenticated preferences/logs, internal dispatch, Resend callback, BullMQ email worker", "3012", "Redis email_queue, PostgreSQL, Resend, Auth, admin template/settings feed"),
    ("Analytics", "services/analytics/app/main.py", "FastAPI, pandas/SQLAlchemy reporting, events and BullMQ/PostHog worker", "3017", "Shared application tables, Redis analytics queue, PostHog"),
    ("Admin API", "services/admin-api/app/main.py", "FastAPI control plane; RBAC, TOTP, config/version history, plans, users/support, reporting/automation", "3018", "SQL manager: PostgreSQL or SQLite; Redis; service clients; PostHog/Resend"),
    ("Shared contracts", "shared/document-contract.mjs", "Cross-runtime field/schema/amount/conversation/stream/assets/tool contracts and tests", "Library", "JavaScript/TypeScript clients; Python document_contract.py mirror"),
]

architecture = """# System architecture

DocCraft is a document-building application with two browser applications, nine backend services including the gateway, and a PDF-rendering sidecar. It is a mixed Node/TypeScript and Python monorepo. Frontend packages are separate from the root backend workspaces.

The checked-in `.env` and service-specific environment files use **chat 3016** and **notification 3012**. Earlier documentation reversed them. Explicit configuration takes precedence over fallback ports. The audit corrected documentation and relevant fallbacks; it did not start the full remotely configured stack.

## Components

""" + table(["Component", "Source", "Responsibility", "Port", "Dependencies"], [(a, source(b), c, d, e) for a,b,c,d,e in components]) + """
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
"""

workflow_rows = [
    ("U01", "Landing/pricing/navigation", "/, /pricing", "Page → router → UI actions; plan cards are hardcoded", "VERIFIED rendering/error states; UNRESOLVED dynamic pricing", "browser-scenarios.json; U-R02"),
    ("U02", "Email registration and verification", "/register, /verify-email", "Auth client → gateway → Auth → users → email_queue → verification update", "VERIFIED focused controllers; BLOCKED live email/DB journey", "final-auth-tests.log"),
    ("U03", "Password login and MFA", "/login", "Credentials → user lookup → optional MFA token/TOTP → refresh session → access bearer", "VERIFIED typed-token/account checks; BLOCKED real account journey", "final-auth-tests.log"),
    ("U04", "Google sign-in", "/login, /register", "Firebase UI → ID token → Auth signature/provider/email checks → existing/new user → session", "VERIFIED mocked token/account cases; BLOCKED interactive Firebase", "final-auth-tests.log"),
    ("U05", "Password recovery/reset", "/password-reset, /reset-password", "Token email → stored reset row → password mutation", "INFERRED user flow; BLOCKED live delivery", "services/auth/src/controllers/auth.controller.ts"),
    ("U06", "Guest creation", "Guest CTA / builder", "guestLogin → persisted unique guest → 24-hour access bearer → chat session", "VERIFIED mocked persistence and failure cases", "final-auth-tests.log"),
    ("U07", "Guest restrictions", "Builder export and document APIs", "Guest identity → frontend gate + no public URL/share bypass", "VERIFIED export guards and server regressions", "final-chat-tests.log; final-document-python.log"),
    ("U08", "Guest-to-account transition", "Login/register while guest", "Identity subscription resets chat/document stores; no guest migration endpoint found", "NOT IMPLEMENTED preservation/migration; NOT TESTED live transition", "user-frontend/src/App.tsx; U-R11"),
    ("U09", "Dashboard overview", "/dashboard", "Dashboard queries → APIs/stores → cards/history/quota", "VERIFIED unavailable-backend rendering; BLOCKED real data accuracy", "browser-scenarios.json"),
    ("U10", "Profile/timezone/security", "/dashboard/profile", "users client → /auth/me → persisted profile; TOTP endpoints", "FIXED timezone persistence; VERIFIED focused controller cases", "final-auth-tests.log; browser-scenarios.json"),
    ("U11", "History and reopen", "/dashboard/document-history", "Chat/session history + document history APIs → restored state", "VERIFIED isolated owner/snapshot tests; BLOCKED complete PostgreSQL reopen", "final-chat-tests.log"),
    ("U12", "Billing and methods", "/dashboard/billing", "Payment client → payment routes → subscriptions/invoices/method metadata", "FIXED path/serialization/error behavior; UNRESOLVED memory-only methods", "final-chat-tests.log; U-R05"),
    ("U13", "Support submission", "/dashboard/support", "Public /support endpoints → gateway → Admin API → support tables → admin views", "FIXED gateway connection; VERIFIED isolated admin support tests", "final-admin-python.log; gateway-notification-tests.log"),
    ("U14", "Document type/template selection", "/builder", "Builder → template definitions → chat session/template revision", "VERIFIED shared schema/template tests; NOT TESTED every browser variant", "final-chat-tests.log"),
    ("U15", "Required/optional collection", "Builder chat", "Intent/local extraction → field validation → conversation revision → next missing field", "VERIFIED isolated field/conversation tests", "final-chat-tests.log"),
    ("U16", "Multiple values/ambiguous input", "Builder chat", "Explicit clauses/table extraction → candidates or clarification → commit", "VERIFIED shared/route tests; BLOCKED live model accuracy", "final-chat-tests.log"),
    ("U17", "Natural-language corrections", "Builder chat", "Scoped change/remove/add intent → tool/field processing → committed snapshot", "VERIFIED isolated provider/tool/field tests", "final-chat-tests.log"),
    ("U18", "Amounts/taxes/discounts", "All supported types", "Shared decimal-safe calculation → preview data → Python equivalent → template", "VERIFIED contract tests and exported fixture totals", "final-chat-tests.log; final-document-python.log; pdf-scenarios.json"),
    ("U19", "Manual/canvas edits", "Builder canvas", "Semantic field mapping → revision-checked update → regenerated canvas", "VERIFIED store/field tests; NOT TESTED all visual edit controls", "final-chat-tests.log"),
    ("U20", "Images/logos/attachments", "Builder attachments", "Validate/prepare asset → owned session revision → canvas/sidecar asset placement", "VERIFIED unit contracts; BLOCKED live persisted asset journey", "final-chat-tests.log; final-document-python.log"),
    ("U21", "SSE/resilience", "Chat message endpoint", "Lease/turn ID → bounded provider/tools → checkpoint → framed completion/error", "VERIFIED mocked failures, relay, cancellation and duplicate handling", "final-chat-tests.log; gateway-notification-tests.log"),
    ("U22", "Session recovery/ownership", "Builder refresh/history", "Authenticated account → repository ownership/revision → persisted snapshot", "VERIFIED isolated repository cases; BLOCKED live browser recovery", "final-chat-tests.log"),
    ("U23", "Client PDF export", "Builder download", "Re-read/confirm snapshot → clone rendered canvas → image/font capture → jsPDF", "VERIFIED mocked capture/guard tests; NOT TESTED full real-user export", "final-chat-tests.log"),
    ("U24", "Queued PDF generation", "POST /document/generate", "Validated chat snapshot → reserve → durable request → queue → Python worker → sidecar → storage", "VERIFIED isolated generation contracts + real renderer; BLOCKED full distributed job", "final-document-python.log; pdf-scenarios.json"),
    ("U25", "Download/share/delete", "Document API", "Owner lookup → signed URL or binary; share token+expiry; delete storage/row", "FIXED ownership/capability checks; BLOCKED real storage lifecycle", "final-document-python.log"),
    ("U26", "Custom reusable templates", "Builder save/load template", "Canvas elements → custom_templates CRUD → user-scoped restore", "INFERRED implementation; NOT TESTED full CRUD/reload", "services/document/app/routers/document.py"),
    ("U27", "Checkout and cancellation", "Pricing/billing", "Actual provider URL/form → signed callback → queue/worker → subscription and Auth/quota", "FIXED simulated success; VERIFIED focused handlers; BLOCKED sandbox", "final-payment-tests.log; final-chat-tests.log"),
    ("U28", "Coupons/trials", "Billing + admin promotions", "Admin APIs → Payment service table → validation/checkout/trial functions", "VERIFIED focused coupon/config tests; BLOCKED provider application", "final-payment-tests.log; final-admin-python.log"),
    ("U29", "Quota and plan updates", "Profile/dashboard/builder", "Admin plan row → Redis keys/pubsub → cached Node client → user request", "VERIFIED real consumer invalidation and isolated counters", "synchronization-scenarios.json; final-quota-tests.log"),
    ("U30", "Notifications/preferences", "Notification API", "Current Auth identity → own preferences/logs; internal send → queue → Resend", "FIXED authorization/signature/queue contracts; BLOCKED live delivery", "gateway-notification-tests.log; final-document-python.log"),
    ("U31", "Announcements", "Admin notifications", "Admin persists announcement; no matching user fetch/display consumer found", "NOT IMPLEMENTED end-to-end delivery", "U-R06"),
    ("U32", "Responsive/theme/keyboard", "Both applications", "Responsive utility styles and theme stores; form controls and route shells", "VERIFIED desktop render only; NOT TESTED mobile/a11y matrix", "browser-scenarios.json"),
]

user_report = "# User workflows\n\n" + table(["ID", "Workflow", "Route", "Actual path", "Evidence status", "Evidence / issue"], workflow_rows) + """
## Trace the outcomes rather than the screen alone

The complete control inventory links each input, button, form, navigation element, and event-bearing custom component to its source line. An attached handler establishes only a source connection. Validation, API behavior, persistence, and visible success are separate assertions. Controls not exercised have NOT TESTED entries; browser error-state success must not be upgraded to CRUD success.

### Authentication and account state

The browser stores access tokens in localStorage and a JavaScript-readable cookie. Its generic request wrapper clears the session on a matching-token 401; an Auth dependency outage now returns 503 at the protected boundaries instead of falsely expiring a valid session. No claim is made that browser storage protects tokens from all XSS risks. Refresh-token endpoints exist; full automatic frontend refresh behavior was not verified.

Registration/verification no longer substitute process-local users for failed persistence or provision an email-verified account from an arbitrary six-character code. Google verification, account reuse, disabled accounts, guest persistence failure, and MFA-token rejection have focused regression coverage. Profile timezone-only edits now write and serialize the timezone instead of silently discarding it.

### Builder and persistence

User messages can populate several fields, amend existing facts, add/remove items, and ask questions without blindly filling the next field. The shared field engine tracks confirmed/missing/ambiguous states, conditional requirements, provenance, and finalization fingerprints. Saved facts remain authoritative when provider output fails. Business names preserve supplied spelling/capitalization; uncertain identity values are not invented. The tests exercise `Nexora` fixtures, not a guarantee that arbitrary brand normalization is correct.

The JavaScript contract uses `purchase_order`; server template directories also use `purchaseOrder`. This alias is explicit. All five types and 17 server template files were rendered into real PDFs. The fixture includes 3 × 2.675 = 8.03 subtotal, 7.5% tax = 0.60, and total 8.63. Tests also cover supported discounts, dates, item edits, and schema disagreement. This does not cover every locale, discount/tax combination, pagination limit, or provider response.

Semantic session fields and browser layout state have different persistence paths. A downloaded canvas PDF is not proof of a server `documents` record. Custom template CRUD exists independently of admin template publishing, whose module is a placeholder. Browser save/reload, long documents, external storage, and guest migration still need dedicated environment-backed checks.

### Payments and communication

Pricing no longer upgrades a browser after a timer or accepts a simulated card payment. Checkout uses server-returned provider navigation/form data; backend failures propagate. Payment-method stores update UI state after a successful API result. The backend methods implementation remains memory-only metadata; it is not verified provider tokenization or durable storage.

Support submission routes now have both a registry destination and the correct Admin API path. Public support endpoints still accept submitted identity/contact fields and need abuse/ownership validation beyond the existing fixture checks. Announcements can be persisted/administered, but no user-facing announcement feed/display was found.
"""

admin_nav = [e for e in entries if e["kind"] == "admin-section"]
prefix_views = {"home":"HomeView", "users":"UsersView", "subs":"SubscriptionsView", "rev":"RevenueView", "promo":"PromotionsView", "pack":"PackagesView", "gen":"GenerationsView", "doc":"DocumentsView", "an":"AnalyticsView", "sec":"SecurityView", "sup":"SupportView", "not":"NotificationsView", "inf":"InfrastructureView", "set":"SettingsView"}


def view_for(section):
    return {"rev_cost_ledger":"CostLedgerView", "set_dynamic_config":"ConfigView", "not_automation":"AutomationsView", "not_execution_logs":"AutomationsView", "not_emit_events":"AutomationsView"}.get(section, prefix_views[section.split('_')[0]])


browser = load("browser-scenarios")
browser_by_route = {(x["actor"], x["route"]): x for x in browser}
admin_rows = []
for item in admin_nav:
    section = item["section"]
    view = f"admin/src/pages/subviews/{view_for(section)}.tsx"
    control_count = sum(e["kind"] == "ui-control" and e["source"] == view for e in entries)
    calls = [x for x in inventory["calls"] if x["source"] == view]
    admin_rows.append((section, item["name"].split(' — ',1)[-1], source(view, section), f"{control_count} definitions shared across this view; {len(calls)} direct HTTP calls (most use adminApiClient)", "VERIFIED render/error state; NOT TESTED complete CRUD/provider/data accuracy"))
admin_report = "# Admin workflows\n\nAll 81 declared navigation IDs were opened in Chromium with a synthetic browser session and intercepted backend 503 responses. No page exception or error boundary was observed. This proves the exercised rendering/error-state path only; it does not authenticate the synthetic session against the real admin backend or execute every action.\n\n" + table(["Section ID", "Navigation feature", "Rendered source", "Control trace scope", "Verification"], admin_rows) + """
## Actions and backend contracts

`admin/src/api/adminApiClient.ts` owns authenticated calls, sensitive-action code prompts/retries, and error propagation. `adminAuthStore.ts` separately handles the two-step login/password/profile flow. Both now honor `VITE_ADMIN_API_BASE_URL`. `DashboardPage.tsx` selects the subview by the actual section ID/prefix. Its top-level refresh now remounts the selected view to trigger its data reads instead of displaying an unearned success toast, and its error boundary resets when the selected view changes.

The coverage report records every source control with its event names and handler expression. Detailed client-call targets are in the integration report. Shared subviews contain multiple section branches, so a control count for a source file must not be interpreted as the number visible on one route.

### Verified backend workflows

Isolated API tests exercise plans/overrides, RBAC/staff lifecycle, config versioning, audit logging, support operations, promotions, analytics response shapes, and automation logic. The mounted API authorization probe exercises every discovered protected method/path without a bearer, using valid internal-event payloads where validation otherwise precedes handler authentication. This proves denial at that boundary; it does not verify successful operations for every method.

Protected admin dependencies re-read persisted account status and role. Suspension/removal and changed permissions cannot be bypassed by an old token's role claims. Analytics requires analytics permissions; notifications/infrastructure use settings permissions; previously enforced but unlisted scopes are now available in the permission catalogue. Restricted support-role regression checks cover unrelated configuration/infrastructure/analytics reads.

### Admin-to-user synchronization

"""
sync_rows = [
    ("Plan quota 7 → 12", "Admin API → Redis → QuotaConfigClient", "SQLite plan row, config snapshot, quota:plan:free", "Long-lived cached Node consumer returns 12 after publication", "VERIFIED real probe; measured delay in evidence"),
    ("New read after plan update", "Admin API", "Stored plan row", "Fresh admin API read returns 12", "VERIFIED isolated API/DB"),
    ("User suspension/plan change", "Admin API → Auth → gateway/chat/payment/quota/document", "Auth-owned current user status/plan", "New requests re-read account; stale token claims no longer grant old access/plan", "VERIFIED focused mocked boundary regressions; BLOCKED live distributed PostgreSQL"),
    ("Paid activation/downgrade", "Payment → Auth + quota", "Subscription row, user plan, configured allowance", "Subsequent protected requests resolve current Auth plan", "VERIFIED mocked HTTP contracts; BLOCKED provider sandbox"),
    ("Plan prices/features", "Admin config → Payment config merge", "Admin plan/config values", "Payment merge has tests; pricing page and some gates remain hardcoded", "PARTIAL / UNRESOLVED U-R02,U-R04"),
    ("AI model ceiling", "Admin ai_model_routing config", "Versioned config payload", "Stored Claude preferences do not cap active Groq route", "UNRESOLVED U-R03"),
    ("Template publishing/disabling", "Admin templates module", "No implemented admin publishing router found", "No validated public template publication path", "NOT IMPLEMENTED U-R06"),
    ("Announcements", "Admin notification repository", "Announcement row", "No user feed/display consumer found", "NOT IMPLEMENTED U-R06"),
    ("Notification templates/settings", "Admin API → Notification fetchAdminConfig", "Active templates and server settings", "Consumer code reads the feed; worker respects applicable preferences/settings", "INFERRED plus signature/auth units; BLOCKED live email"),
    ("Coupons/trials", "Admin API → Payment", "Payment-owned coupon/subscription data", "Validation helpers and isolated API tests exist", "VERIFIED focused fixtures; BLOCKED real checkout application"),
]
admin_report += table(["Admin change", "Backend service", "Stored state", "User effect", "Test result"], sync_rows)
admin_report += """
### Incomplete areas

`services/admin-api/app/api/v1/templates.py`, `dashboard.py`, `monitoring.py`, and `settings.py` are placeholder modules, not mounted functional routers. Some equivalent data comes from other implemented routers; module names alone cannot establish functionality. Admin template/version model files also include placeholders. Revenue/payout/deployment/Sentry/PostHog screens require external data sources and were not validated for numerical accuracy or successful integration.

CSV/GDPR operations, real refunds, trial expiration, active-session revocation semantics, automation delivery, and every individual CRUD control remain explicitly NOT TESTED or BLOCKED where no dedicated execution evidence exists. A local security-session row is not demonstrated token revocation for all clients.
"""

chat_report = "# Chat and document lifecycle\n\n" + """The active chat route is `services/chat/src/routes/chat.routes.ts`. `ConversationRepository` owns authorized reads, optimistic revision updates, turn leases, idempotent turn/operation receipts, persisted checkpoints, finalization, and asset ownership. No provider request runs inside its short database transaction. `shared/` owns the field/amount/stream contracts consumed by stores and the service.

## Implemented state transitions

1. Create a session for a supported type/template and validated timezone.
2. Load the user's session; enforce lifecycle/ownership and claim a unique turn.
3. Classify the current intent; extract explicit scalar/item/table facts locally.
4. Validate values, required/conditional fields, proposed edits, and any ambiguous choices. Commit evidence-backed facts with a new revision.
5. If semantic work remains, reserve quota, build bounded context, call the configured Groq candidate, and execute permitted MCP tools. Both providers/tools and transport failures remain explicit failures.
6. Reconcile committed state and assistant text; persist checkpoints/outcomes, then emit the authoritative completion snapshot. Retrying the same turn reconciles prior work instead of blindly duplicating it.
7. Browser stores apply snapshots, update semantic fields/canvas, and retain the server's readiness/finalization state.
8. Export re-reads state and confirms its fingerprint/revision. Client capture and queued server generation are different output paths.

## Verified behavior and limits

The shared and Vitest suites exercise required/optional collection, multiple supplied fields, uncertain answers, scoped corrections, add/remove/price/quantity changes, stale revisions, missing facts, provider explanations, truthful acknowledgements, duplicate operations, stream corruption/interruption, cancellation, assets, history ownership, and export race guards. These are isolated contracts and mocked provider executions, not a live model-quality evaluation.

JavaScript/Python calculation tests verify amounts and rounding across the contract. The real sidecar probe rendered all 17 server templates for five types and extracted names/totals from the actual PDFs. It also used a local trap server and script-bearing HTML to verify blocked internal fetches and page-script execution. There is no claim of a complete SSRF/security proof or all browser layouts/font combinations.

Generation validates the authorized chat state rather than accepting client-injected fields/assets. Stable generation operation IDs and persisted queue-pending state permit reconciliation. Quota-service outages now prevent new provider/generation work with a retryable error instead of unmetered access. Job polling first checks durable ownership and preserves failed status even when queue data is gone.

The PDF worker now emits the consumer's actual `document_ready` event and `documentUrl`/recipient fields. A notification queue failure cannot mark an already persisted successful PDF failed or refund it. Pro and Max avoid the free-tier worker watermark; broad admin-managed feature-flag enforcement is still incomplete.

Local downloads use an HMAC-protected 24-hour URL; tampering, expiry, and directory traversal have regression tests. Guests do not receive download URLs from document detail/history or create share links to bypass their download restriction. Server storage uploads/deletes and public share behavior against actual Supabase were BLOCKED.

## Remaining lifecycle concerns

- The same quota counter is charged for provider-reaching chat turns and server document generation. UI descriptions call it documents/day. Defining distinct AI/document budgets or documenting the combined unit requires a product decision.
- Worker refund does not carry an idempotent reservation/refund operation ID. Retry/crash reconciliation and terminal retry accounting are not established for the whole distributed pipeline.
- Payment and PDF effects lack a durable transactional outbox/reconciliation guarantee across SQL, Redis, external providers and notifications.
- Browser-only layout changes and custom canvas elements are not necessarily the server template's layout. The legacy document API export/layout/content wrappers also reference endpoints that are absent; primary browser export avoids some of those paths.
- Guest-to-account migration is absent; an identity change resets chat/document state. No preservation guarantee is made.
- Live provider fallback/tool quality, long-document paging, all asset placements, every template in the interactive editor, browser reload/export against PostgreSQL, and multi-worker failure recovery remain NOT TESTED or BLOCKED.

## Real PDF artifacts

""" + table(["Type", "Template", "Result", "Pages", "Evidence"], [(x["document_type"], x["template"], x["status"], x["pages"], f"[PDF](evidence/{x['artifact']})") for x in load("pdf-scenarios") if "template" in x])

integration = "# API, database and integrations\n\n" + """## Gateway path contracts

""" + table(["Public prefix", "Actual upstream prefix", "Notes"], [
    ("/v1/auth, /v1/users", "/v1/auth", "User auth aliases; internal admin APIs require a service secret"),
    ("/v1/chat/api, /v1/ai/api", "/api", "Chat session/SSE/MCP routes"),
    ("/v1/chat/session(s)", "/api/chat/session(s)", "Legacy session/history shorthand"),
    ("/v1/document(s)", "/v1/document", "Singular document API mount"),
    ("/v1/templates", "/v1/document/templates", "Template-list/detail alias"),
    ("/v1/payment, /v1/billing", "/v1/payment", "Raw provider webhook bodies preserved"),
    ("/v1/notification(s)", "/notification", "Actual notification mount; callback raw bytes preserved"),
    ("/v1/support", "/api/v1/support", "Public support submission mount on Admin API"),
    ("/v1/admin", "/api/v1/admin", "Browser normally uses direct Admin API with its own admin bearer"),
    ("/v1/admin/users", "/api/v1/users", "Users router is mounted separately from /admin"),
    ("/v1/analytics", "/v1/analytics", "Reporting requires further direct-service boundary review"),
]) + """
The translation function preserves query bytes and uses segment boundaries. REST and SSE relays use the same path translation. The JSON ingress accepts bounded document-asset requests; payment and Resend callbacks retain original bytes. These checks do not prove every alias/verb combination against a running full stack.

## Background queues, events and caches

""" + table(["Channel/key", "Producer", "Consumer", "Contract / remaining limitation"], [
    ("document", "Document generate API", "Embedded Python PDF worker", "Durable document snapshot and stable job ID; terminal retry/refund reconciliation incomplete"),
    ("email_queue", "Auth, document, notification HTTP dispatch", "Node notification worker", "Event name must map to a Handlebars template; userId/email/documentUrl preserved"),
    ("Payment webhook queue", "Verified Paddle/PayHere handler", "Payment BullMQ worker", "Three attempts/backoff configured; ack only after enqueue; cross-effect atomicity unproven"),
    ("analytics", "Analytics event API", "Python PostHog worker", "Event payload, anonymization flag, retry options; live ingestion untested"),
    ("doccraft:events", "Quota/payment events and admin emit", "Admin event subscriber/automation engine", "Pub/sub is not a durable event log; worker/action delivery needs recovery tests"),
    ("config_invalidation", "Admin ConfigEngine", "Node config subscribers", "Invalidate cached domain data; one live quota consumer verified"),
    ("config:domain:*", "Admin versioned config engine", "Gateway/payment/quota and other feed clients", "JSON configuration snapshot; internal HTTP fallback requires secret"),
    ("quota:plan:*, quota:limit:*, quota:user:*", "Admin config/override and quota service", "Quota Lua/status logic", "Plan daily allowance, per-user override and counters; historical monthly_quota naming"),
    ("Conversation leases/checkpoints", "Chat repository", "Chat turn execution/retry", "Persisted revision/turn ownership; separate Redis concurrency/rate gates also exist"),
]) + """
## Database definitions

The table below lists source definitions rather than a live schema dump. Repeated physical table names across owners are intentional audit evidence of ownership/schema ambiguity, not proof that both declarations are compatible.

""" + table(["Definition", "Kind", "Source", "Validation"], [(e["name"], e["kind"], source(e["source"], e["name"]), "INFERRED source; PostgreSQL migration compatibility BLOCKED") for e in entries if e["kind"] in {"database-model", "database-table"}])
integration += "\n## Mounted Admin API\n\nThe actual FastAPI OpenAPI application exposed the following method/path declarations. The separate authorization probe covers protected endpoints without credentials; it does not prove every successful CRUD operation.\n\n" + table(["Method", "Mounted path", "Operation"], [(e["method"], e["route"], e["operation_id"]) for e in load("mounted-admin-api")])
integration += "\n## All discovered backend route declarations\n\nIncludes router mount points, repeated registrations and direct-service aliases. These source declarations are not a count of unique live endpoints.\n\n" + table(["ID", "Declaration", "Source", "Handler / registration"], [(e["id"],e["name"],source(e["source"],e["name"].split(' ',1)[-1]),e.get("handler","—")) for e in entries if e["kind"]=="api-declaration"])
integration += "\n## Discovered HTTP client targets\n\nThese are source expressions; dynamic values are not resolved or assumed working. User clients append paths to a base URL that already includes `/v1`; admin clients use a base already ending `/api/v1`.\n\n" + table(["Source", "Call", "Target expression", "Verification"], [(source(e["source"]),e["call"],e["target"],"INFERRED; see workflow-specific evidence") for e in inventory["calls"]])
integration += """
## External services and configuration

Firebase, Groq/Anthropic, Paddle, PayHere, Resend, Supabase storage and PostHog have implementation/configuration references. Their existence is not evidence of valid credentials, provider availability, account entitlement, successful sandbox transactions or data correctness. No live validity checks were made with existing secrets.

The sanitized environment inventory records variable names, port values, remote-database classification and equality comparisons without secret values: [environment-summary.json](evidence/environment-summary.json). Most service user JWT secrets match Auth's configured secret; the root shared file's user signing secret differs. Notification preferences verify with Auth, avoiding reliance on that root signing value. Resolve configuration drift before deployment. Admin JWT configuration is separate and currently lacks an explicit stable key in its service environment file.

Admin notification settings and configuration feeds contain operational data and require appropriate permissions/internal authentication. Resend callback verification follows the provider's requirement to verify the original payload, supported by [Resend's documentation](https://resend.com/changelog/managing-webhooks-via-api) and the [Svix verification guide](https://www.svix.com/guides/receiving/receive-webhooks-with-javascript-express/). The local regression uses signed synthetic bytes and freshness checks; provider callback registration and actual delivery were NOT TESTED.
"""

# Each group is a separately described defect/root-cause family, not a count of changed lines.
fixed = [
    ("B01","High","Gateway aliases preserved incorrect upstream paths; support registry entry missing","services/gateway/src/services/upstreamPath.ts","Canonical path translation for REST/SSE and registered support destination","gateway-notification-tests"),
    ("B02","High","Gateway parsed/re-serialized signed provider payloads","services/gateway/src/middleware/bodyParser.middleware.ts","Preserve raw payment/Resend callback bytes","gateway-notification-tests"),
    ("B03","Medium","100 KB ingress conflicted with bounded image asset payloads","services/gateway/src/middleware/bodyParser.middleware.ts","Bound normal JSON ingress at 2 MB; callbacks retain 100 KB limit","Build/static; complete upload journey BLOCKED"),
    ("B04","Critical","Auth service accepted user headers and exposed internal user mutations without authentication","services/auth/src/middleware/auth.middleware.ts","Require typed access tokens/current accounts and internal shared-secret hook","final-auth-tests"),
    ("B05","High","Quota internal reset/refund accepted ordinary gateway identity headers","services/quota/src/middleware/authenticate.ts","Require service secret for internal mutations and verify user bearer for reads","final-quota-tests"),
    ("B06","Critical","Payment admin namespace lacked a shared authentication gate","services/payment/src/routes/payment.routes.ts","Require internal secret for the entire /admin namespace","final-payment-tests"),
    ("B07","Critical","Admin login/reset responses disclosed codes; code purposes overlapped; TOTP could skip password challenge","services/admin-api/app/api/v1/auth.py","No code hints; separate code namespaces; require live login challenge","final-admin-python"),
    ("B08","High","Admin token role/status claims outlived account changes","services/admin-api/app/security/dependencies.py","Re-read account and current persisted role/permissions","final-admin-python"),
    ("B09","High","Untrusted forwarded IP headers controlled allowlist checks; IPv6 addresses were truncated","services/admin-api/app/security/middleware.py","Explicit trusted-proxy peers and correct address parsing","final-admin-python"),
    ("B10","Critical","Source supplied hosted DB/provider credentials and predictable signing/internal/bootstrap fallbacks","services/admin-api/app/core/config.py","Remove credential-like defaults; local DB fallback/random process keys; explicit bootstrap password","final-admin-python; external rotation UNRESOLVED U-R10"),
    ("B11","High","Notification APIs permitted arbitrary dispatch or caller-chosen user data","services/notification/src/security.ts","Internal send/log gates and Auth-verified preference/log ownership","gateway-notification-tests; focused ownership units"),
    ("B12","High","Unsigned Resend delivery events could trigger configured relays","services/notification/src/security.ts","Raw-body signature and freshness verification; unavailable config fails closed","gateway-notification-tests"),
    ("B13","High","Document identities trusted headers; job status was not owner-scoped","services/document/app/services/authentication.py","Verify bearer/current Auth profile, scope status lookup, retain durable failure state","final-document-python"),
    ("B14","High","Document and chat quota dependency failures granted unmetered work","services/chat/src/services/quotaClient.service.ts","Retryable quota-unavailable error before provider/generation work","final-chat-tests; final-document-python"),
    ("B15","High","Local URLs had no expiry/signature; guests could obtain URLs or shares","services/document/app/services/storage.py","HMAC capability URLs, safe local paths, guest download/share gates","final-document-python"),
    ("B16","High","Worker notification name/payload mismatched consumer; notification failure invalidated completed PDF","services/document/app/workers/pdf_worker.py","document_ready/documentUrl/recipient contract; preserve persisted PDF success","final-document-python"),
    ("B17","High","Pricing simulated payment and changed browser plan; API failures fabricated success","user-frontend/src/pages/PricingPage.tsx","Hosted checkout response controls navigation; propagate real errors","final-chat-tests; browser-error-states"),
    ("B18","High","Payment client duplicated /v1, double-serialized bodies, and used absent legacy billing routes","user-frontend/src/api/payment.ts","Canonical payment endpoints/object bodies, normalize subscription/portal results","final-chat-tests"),
    ("B19","High","Callbacks acknowledged before durable enqueue; account plan was not synchronized; renewal used fabricated quota","services/payment/src/services/subscription.service.ts","Ack after queue acceptance; Auth/quota entitlement sync and retryable errors; configured renewal allowance","final-payment-tests"),
    ("B20","Medium","Timezone profile field was accepted by schema but discarded/not serialized","services/auth/src/controllers/auth.controller.ts","Validate, persist and serialize timezone-only edits","final-auth-tests"),
    ("B21","Critical","Database failures substituted temporary auth users; any six-character verification code could create a verified account","services/auth/src/controllers/auth.controller.ts","Persistent-only account operations; existing matching unexpired verification required; failed writes do not report verification success","final-auth-tests"),
    ("B22","Medium","Admin build failed on unused declarations; lint script lacked configuration","admin/eslint.config.js","Remove unused declarations; provide actual lint config without disabling rules","final-admin-build; lint debt remains U-R09"),
    ("B23","Medium","Admin refresh only emitted success; audit filters/pagination/error state were disconnected","admin/src/pages/DashboardPage.tsx","Remount/refetch instead of fake toast; reset boundary; wire audit filter/error/pagination UI","final-admin-build; rendering only, successful audit filter data NOT TESTED"),
    ("B24","High","Analytics/notification/infrastructure used generic admin authentication without domain permissions; required scopes absent in catalogue","services/admin-api/app/repositories/permission_repository.py","Apply existing domain permissions and expose already-enforced scope keys","final-admin-python"),
    ("B25","Medium","Refresh session expiry multiplied access-token lifetime into an incorrect retention period","services/auth/src/controllers/auth.controller.ts","Persist 30-day refresh session expiry consistently","INFERRED source correction; build/auth regression suite"),
    ("B26","High","Max tier was collapsed to free in boundaries and received a free worker watermark","services/document/app/workers/pdf_worker.py","Preserve current tier; treat Pro/Max as paid worker exports","final-payment-tests; final-quota-tests; final-document-python"),
    ("B27","High","Long-lived user tokens retained suspended status or old plan at protected service boundaries","services/gateway/src/security/jwtVerifier.ts","Current Auth status/plan checks at gateway/chat/quota/payment/document; retryable dependency failures","final-chat-tests; final-payment-tests; final-document-python"),
    ("B28","Medium","Read-only admin MCP adapter returned a fabricated found resource on HTTP failure","services/admin-api/app/integrations/mcp/chat_client.py","Raise an explicit 503 resource-unavailable error instead of mock success","final-admin-python; actual transport remains U-R15"),
]
unresolved = [
    ("U-R01","High","UNRESOLVED / BLOCKED","Different services declare incompatible physical plans/coupons/audit_logs schemas; PostgreSQL compatibility unknown","services/admin-api/app/db/admin_db.py","Review actual schema read-only, select ownership/namespaces, prepare/back up/test migration before approval"),
    ("U-R02","High","UNRESOLVED","Hardcoded pricing/limits disagree with admin config; USD admin fields merge into values used as LKR checkout amounts","services/payment/src/services/plan.service.ts","Agree currency/effective-date/provider-price contract; wire all pricing/plan views to that contract; sandbox test"),
    ("U-R03","High","UNRESOLVED","Claude ceiling helpers have no active caller; production chat defaults to Groq","services/chat/src/services/planConfigClient.service.ts","Define per-plan Groq model policy and integrate it into active provider routing"),
    ("U-R04","High","UNRESOLVED","Plan feature flags, logos/templates/priority/retention and Max UI behavior are not consistently consumed","user-frontend/src/store/documentStore.ts","Inventory each gate and use a shared authoritative entitlement response; test toggles end to end"),
    ("U-R05","High","NOT IMPLEMENTED","Payment methods are process-memory metadata with no durable provider tokenization","services/payment/src/services/paymentMethod.service.ts","Use provider-hosted method management or implement verified tokenized persistence; decide removal of metadata-only flow"),
    ("U-R06","High","NOT IMPLEMENTED","Admin template publishing modules are placeholders; announcements have no user consumer","services/admin-api/app/api/v1/templates.py","Specify publication/audience semantics; implement router/storage consumers and user display before calling these workflows complete"),
    ("U-R07","High","UNRESOLVED / NOT TESTED","Webhook idempotency is check-then-write across non-atomic effects; ordering and crash reconciliation unproven","services/payment/src/services/subscription.service.ts","Transactional event claim/outbox and reconciliation; concurrent duplicate/out-of-order sandbox tests"),
    ("U-R08","High","UNRESOLVED","Quota counts provider chat turns and server generations; refunds lack idempotent reservation IDs; retry/crash accounting incomplete","services/quota/src/services/quota.service.ts","Agree metering unit; track reservation/refund lifecycle; test SQL/Redis/worker crashes and concurrent retries"),
    ("U-R09","Medium","UNRESOLVED","Both frontend lint checks fail on substantive existing violations","admin/eslint.config.js","Resolve type/unused/React hook/state issues in focused batches without relaxing rules"),
    ("U-R10","High","BLOCKED","Removed credential-like source defaults may remain in history/deployments; live validity/revocation not verified","services/admin-api/app/core/config.py","Owner must rotate any active exposed credentials and supply stable private signing/internal keys; audit deployment configuration"),
    ("U-R11","Medium","NOT IMPLEMENTED / NOT TESTED","Guest identity change resets builder state; layout/export/history paths have different persistence semantics and absent legacy endpoints","user-frontend/src/App.tsx","Agree guest migration and editable-document persistence contract, implement missing paths, verify save/reload/export"),
    ("U-R12","High","UNRESOLVED / NOT TESTED","Direct analytics reporting lacks equivalent independent authorization; public submission abuse and OTP attempt limits need work","services/analytics/app/routers/analytics.py","Restrict direct service exposure or add independently enforced authorization/rate controls and adversarial tests"),
    ("U-R13","Medium","UNRESOLVED / NOT TESTED","Health can be green despite dependency failure; per-request Auth lookups and Chromium launches need capacity/recovery measurements","services/document/puppeteer/server.ts","Readiness probes, bounded pools/timeouts, load tests, multi-worker restart and queue-drain checks"),
    ("U-R14","Medium","UNRESOLVED","Root and service configuration drift, partial migrations and an unsafe stale live document test script","RUNNING_THE_PROJECT.md","Consolidate documented environment contract; add reproducible isolated PostgreSQL setup/migrations; replace stale live test entry point"),
    ("U-R15","Medium","UNRESOLVED / NOT TESTED","Read-only admin MCP adapter posts JSON-RPC with an admin bearer to a user-session-authenticated SSE endpoint; no successful resource-read wiring verified","services/admin-api/app/integrations/mcp/chat_client.py","Define the read-only control-plane authorization/transport contract and use the supported MCP connection lifecycle; SQL-backed infrastructure session lists are a separate path"),
]
bugs_report = "# Bugs and fixes\n\nThe counts below are defect/root-cause groups. Some combine related manifestations across services. FIXED describes the source correction; the regression column states its actual verification scope. This does not mean every deployment or provider workflow is verified.\n\n" + table(["Bug ID","Severity","Root cause","Affected files / primary source","Fix","Regression status"],[(a,b,c,source(d),e,"FIXED — "+f) for a,b,c,d,e,f in fixed])
bugs_report += "\n## Remaining findings\n\n" + table(["Issue","Severity","Status","Evidence-backed limitation","Source","Next step"],[(a,b,c,d,source(e),f) for a,b,c,d,e,f in unresolved])

final_ids = ["final-backend-build","final-user-build","final-admin-build","final-user-lint","final-admin-lint","final-chat-tests","final-auth-tests","final-payment-tests","final-quota-tests","final-document-python","final-admin-python","gateway-notification-tests","mounted-api-authorization","browser-error-states","chromium-pdf-templates","live-admin-quota-sync","artifact-validation"]
test_rows = []
for name in final_ids:
    data=checks[name]
    log=(EVIDENCE/f"{name}.log").read_text()
    counts=[]
    if name=="final-chat-tests":
        match=re.search(r"ℹ pass (\d+)",log)
        if match: counts.append(match[1]+" shared Node cases")
    for match in re.finditer(r"Tests\s+(\d+) passed|\b(\d+) passed(?:, \d+ warnings? in| in)",log):
        counts.append((match[1] or match[2])+" cases")
    if 'lint' in name:
        match=re.search(r"(\d+) problems \((\d+) errors?, (\d+) warnings?\)",log)
        if match:counts.append(f"{match[2]} errors, {match[3]} warnings")
    scenario_files={"mounted-api-authorization":"api-authorization-scenarios","browser-error-states":"browser-scenarios","chromium-pdf-templates":"pdf-scenarios","live-admin-quota-sync":"synchronization-scenarios"}
    if name in scenario_files:
        rows=load(scenario_files[name]); counts.append(f"{sum(x['status']=='PASS' for x in rows)}/{len(rows)} scenarios")
    test_rows.append((name,data['cwd'],' '.join(data['command']),data['result'],', '.join(counts) or 'Command completion',f"[log]({data['log']})"))
blocked_rows=[
    ("EXT01","Full PostgreSQL-backed user/admin CRUD and browser persistence","Working isolated PostgreSQL and migrated compatible schema","Shared/remote configuration not mutated; no approved isolated instance available","BLOCKED","U-R01"),
    ("EXT02","Live Groq/Claude provider intelligence/fallback/entitlements","Controlled provider test resources","Only isolated/mocked provider adapters exercised","BLOCKED","U-R03"),
    ("EXT03","Interactive Firebase/Google account login","Test browser account and provider configuration","JWT/Firebase controller cases mocked; no external interactive sign-in","BLOCKED","final-auth-tests.log"),
    ("EXT04","Real Paddle/PayHere checkout, refunds, upgrades/downgrades","Confirmed sandbox account and products/webhook setup","Signed fixture/unit tests only; no real charges or refunds","BLOCKED","U-R02,U-R07"),
    ("EXT05","Resend email delivery and registered callback","Controlled recipient, sandbox/approved transport, callback registration","No real communications sent","BLOCKED","gateway-notification-tests.log"),
    ("EXT06","Supabase upload/delete/share and cross-instance storage","Isolated bucket/test project","Renderer and mock storage tests do not prove remote object lifecycle","BLOCKED","final-document-python.log"),
    ("EXT07","Docker build/start and deployment readiness","Docker runtime","Tool unavailable; Compose parsed statically only","NOT TESTED","01-SYSTEM_ARCHITECTURE.md"),
    ("EXT08","Load/performance/recovery, all visual and mobile/a11y cases","Defined load targets/test stack and browser matrix","No benchmark or complete accessibility/responsive evaluation","NOT TESTED","U-R13"),
    ("EXT09","Legacy live document script","Isolated configured stack and corrected routes","Script mutates data and uses stale paths; deliberately not executed","NOT TESTED","services/document/test_document.py"),
]
tests_report = "# Test results\n\n## Final check commands\n\n"+table(["Check","Working directory","Command","Result","Evidence scope/count","Output"],test_rows)+"""
Counts belong to the named check. Gateway SSE/auth tests run both in the root chat suite and in the focused gateway run; do not sum those rows as unique test cases without deduplication. Repeated final commands replace the corresponding final evidence file. Baseline/intermediate evidence is retained separately where named.

The backend build succeeds independently of frontend builds. The admin build initially failed with 31 unused-declaration errors. The original admin lint invocation had no configuration. Adding the configuration exposes genuine violations; the audit did not disable lint rules to manufacture a pass. User lint already failed at baseline. Baseline admin Python execution produced 74 passes and three failures: two stale hardcoded-invitation-password test fixtures and an unsupported PostHog “connected” expectation. Fixture tests now seed/use actual state and test the reported partial configuration honestly.

Admin pytest fixtures now always allocate disposable SQLite state and test transport settings instead of trusting the developer's configured database. Python runs also used an external-network guard. TestClient exercises real FastAPI HTTP routing in process without entering service lifespan, so production workers/bootstrap were not started. The Redis synchronization probe starts/stops its own Redis process and writes only its temporary SQLite database. Browser probes intercept API traffic and use synthetic identities; error-state rendering is the verified property.

## Blocked or unexecuted categories

"""+table(["ID","Workflow","Expected prerequisite","Actual limitation","Status","Evidence/issue"],blocked_rows)
tests_report += "\n## Browser workflow probes\n\n"+table(["Test ID","Workflow","Expected","Actual","Status","Evidence"],[(f"BR{i:03}",f"{x['actor']} {x['route']}",x['expectation'],f"{x['controls']} controls; page errors={len(x['pageErrors'])}; boundary={x['boundary']}",x['status'],"[scenario data](evidence/browser-scenarios.json)") for i,x in enumerate(browser,1)])
tests_report += "\n## Mounted API authentication probes\n\n"+table(["Test ID","Workflow","Expected","Actual","Status","Evidence"],[(x['test_id'],x['method']+' '+x['route'],x['expected'],x['actual'],x['status'],"[scenario data](evidence/api-authorization-scenarios.json)") for x in load('api-authorization-scenarios')])
tests_report += "\n## Renderer and synchronization probes\n\n"+table(["Test ID","Workflow","Expected","Actual","Status","Evidence"],[(f"PDF{i:02}",x.get('document_type','Security')+' '+x.get('template',x.get('scenario','')), 'PDF text/bytes or blocked active content', x.get('text_found',{'trap_requests':x.get('trap_requests')}),x['status'],"[scenario data](evidence/pdf-scenarios.json)") for i,x in enumerate(load('pdf-scenarios'),1)]+[(f"SYNC{i:02}",x['scenario'],'Persisted admin change consumed correctly',x.get('updated_limit','Fresh API read matched'),x['status'],"[scenario data](evidence/synchronization-scenarios.json)") for i,x in enumerate(load('synchronization-scenarios'),1)])

security = "# Security, performance and reliability\n\n"+"""## Security conclusions

Critical/High findings fixed in source include unauthenticated internal account/payment/notification operations, identity-header trust, token-type confusion, exposed admin verification codes, non-persistent verified account creation, forwarded-IP spoofing, stale account-role/plan authorization, quota fail-open behavior, unsigned local file capabilities, guest bypasses, unauthenticated configuration reads and signed webhook body corruption. Focused tests substantiate the corrected boundaries; this is not a comprehensive penetration test.

Credential-like defaults were removed from current admin source. No attempt was made to authenticate with them, rotate external credentials, rewrite Git history, or change deployed secrets. Active credentials must be handled by the owner using the appropriate provider/deployment controls. User access-token secrets across services were compared without recording their values; root/shared configuration drift remains documented.

Resend callbacks now check raw-body signatures and timestamp freshness. The sidecar binds to loopback, disables page scripts and blocks external/file resource requests. Synthetic callback and actual Chromium/trap-server checks passed. Signed callbacks inside the freshness window still need any required event-ID deduplication/reconciliation policy; these controls are not an all-purpose delivery guarantee.

Admin read/write permission checks have been tightened and current roles/status reloaded. OTP attempt budgets, TOTP replay handling, all session-revocation semantics, credential storage/history, public support submission abuse, direct analytics authorization and every file/SSRF input variation were not exhaustively tested. See the unresolved finding table.

## Reliability conclusions

Quota and account-verification failures now stop protected work with retryable dependency errors, and payment acknowledgements require accepted queue writes. Auth's process-local fallback users were removed. Completed PDF state survives a notification failure. These improve failure truthfulness but do not provide an atomic distributed transaction.

Outstanding concerns include schema ownership conflicts, webhook check-then-write races, out-of-order provider events, non-idempotent quota refunds, queue/SQL crash windows, best-effort notification loss, Pub/Sub message loss and pending-state recovery. Database create/alter-on-start behavior and absent service migrations need isolated deployment validation. Readiness must check dependencies, not merely HTTP liveness.

## Performance conclusions

No throughput, concurrency, latency percentile or resource budget was measured. Current-account authorization adds network/database work to protected requests; repeated lookups can amplify Auth load. The Puppeteer sidecar launches Chromium per render; the 17-template probe establishes functionality, not capacity. Review browser pooling/concurrency limits, SQL/connection pools, Redis command/timeout behavior, analytics SQL/aggregation costs, memory caches and queue backpressure with explicit load targets.

Native builds warn about large frontend bundles; no bundle-size budget or user performance requirement was supplied. Broad lint/React hook issues can affect maintainability and state correctness and remain unresolved rather than suppressed.

## Severity register

"""+table(["Finding","Severity","Status","Practical impact"],[(a,b,"FIXED",c) for a,b,c,*_ in fixed]+[(a,b,c,d) for a,b,c,d,*_ in unresolved])

roadmap = "# Improvement roadmap\n\n"+table(["Priority","Work","Required decision/resource","Acceptance evidence"],[
    ("P0","Resolve schema/table ownership and migrations","Read-only actual-schema inspection; explicit migration/backup approval before modifying a shared database","Fresh isolated PostgreSQL can migrate/start every service without incompatible columns/tables"),
    ("P0","Establish safe environment and credentials","Provider/deployment owner rotation/configuration; stable admin secret and consistent service URLs","No source defaults; secret equality/availability and authenticated sandbox health checks without printing values"),
    ("P1","Define authoritative pricing/currency/entitlements","Agree USD/LKR conversion and provider prices, effective dates, quota units, plan/feature semantics","Admin edit → checkout + user pricing/feature behavior verified after reload"),
    ("P1","Complete distributed billing/quota recovery","Choose event claim/outbox/reconciliation and reservation/refund ownership","Concurrent duplicate/out-of-order/crash/retry tests do not lose entitlements or over/under-charge usage"),
    ("P1","Apply model policies to the active provider","Choose supported Groq per-plan model ceilings/fallback rules","Changing admin model access affects actual provider candidate selection"),
    ("P1","Complete missing publication/delivery paths","Agree admin template publishing and announcement audiences; guest migration/persistence policy","Real CRUD/publish/feed/display and guest save/reopen journeys pass"),
    ("P1","Replace metadata-only payment methods","Decide provider portal/tokenization/persistence behavior","No fabricated methods; durable provider-backed lifecycle validated with sandbox"),
    ("P2","Repair lint and UI state issues in focused batches","No broad rule suppression; preserve business behavior","Both frontend lint commands and focused interaction regressions pass"),
    ("P2","Harden remaining boundaries and operations","Analytics access, abuse/OTP budgets, session revocation, readiness and monitoring requirements","Authorization/abuse/revocation tests and dependency-failure alerts succeed"),
    ("P2","Benchmark and expand workflow matrix","Isolated complete stack, load targets, desktop/mobile/a11y requirements","Measured capacity plus browser save/reload/export, worker restart and sandbox integration coverage"),
])+"""
Major migration, currency/entitlement policy, provider-routing policy, and new publication/migration workflows are concrete remaining decisions, not silently introduced product requirements. The audit has not applied a destructive migration or speculative rewrite. Review these proposals and authorize the chosen design before implementation against shared resources.
"""

before = {x['path']:x['sha256'] for x in baseline['files']}
changed=[]
tracked=set(subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines())
for item in inventory['files']:
    p=item['source']
    if p in before and before[p] != item['sha256'] or p not in before and p not in tracked:
        if not p.startswith('docs/system-audit/') and p != 'DOC_CRAFT_FULL_PROJECT_REPORT.md': changed.append(p)
if 'package-lock.json' not in changed and 'package-lock.json' in subprocess.check_output(['git','diff','--name-only'],cwd=ROOT,text=True).splitlines():changed.append('package-lock.json')
changes_report = "# Change log\n\nBaseline revision: `"+baseline['revision']+"`. The working tree already contained extensive tracked/untracked changes. This list compares source hashes captured before this audit to the final inventory; it does not attribute the entire Git diff to the audit. The prompt file and existing reports were preserved. Build outputs and temporary test databases are not source changes.\n\n"+table(["Audit-touched source/configuration","Purpose / scope"],[(source(p),"Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff") for p in sorted(set(changed))])+"""
## Artifacts

The master report and twelve numbered reports were generated, alongside a complete source/control/route inventory, sanitized baseline/configuration evidence, command logs, browser scenario data/screenshots, 17 synthetic PDFs, renderer security checks, mounted API authorization results and real Redis synchronization evidence.

Temporary databases and Redis data live only in audit-created system temporary directories. The live synchronization probe owns and stops its Redis/Node processes. Audit-owned browser and sidecar dev processes were stopped at completion; see [cleanup.json](evidence/cleanup.json). Pre-existing processes/data were preserved.

## Material risks of the corrections

- Internal HTTP clients/deployments must supply the matching service secret; unauthenticated shortcuts now fail.
- Admin credentials/signing configuration must be explicitly supplied; old unsigned download links and leaked code-hint response contracts no longer work.
- Account/quota outages now block work instead of granting unmetered access; operational readiness must account for this availability dependency.
- Provider checkout replaces the simulated pricing modal. Payment-method metadata is still not durable/provider-tokenized.
- The sidecar blocks remote fonts/resources and page scripts; templates need self-contained assets/local fonts. Visual/font parity with all previous exports was not established.
- Shared/live PostgreSQL migrations and provider behavior remain unverified; these changes are not a production-ready declaration.
"""

coverage_rows=[]
for item in entries:
    actor='Admin' if item['source'].startswith('admin/') or item['kind']=='admin-section' else 'User' if item['source'].startswith('user-frontend/') else 'Service'
    verification='NOT TESTED — individual behavior; source inspected'
    status='INFERRED'
    issue='—'
    if item['kind']=='admin-section':verification='VERIFIED Chromium error-state render only; CRUD NOT TESTED'
    if item['kind']=='ui-route':verification='See browser scenario paths; route definition alone INFERRED'
    if item['kind']=='template' and item['source'].endswith('.html'):verification='VERIFIED real server PDF fixture; interactive layout combinations NOT TESTED'
    if item['kind'] in {'database-model','database-table'}:verification='BLOCKED live PostgreSQL compatibility';issue='U-R01'
    if item['source']=='user-frontend/src/pages/PricingPage.tsx':issue='B17; U-R02'
    if 'paymentMethod.service' in item['source']:issue='U-R05'
    events=item.get('events',[])
    description=item['name']
    if events:description+='; '+', '.join(e['event']+'='+e['handler'] for e in events)
    coverage_rows.append((item['id'],actor,description,source(item['source'],item['line']),item.get('endpoint','Trace source handler/client; see integration inventory'),status,verification,issue))
coverage_report = "# Functionality coverage\n\n"+f"Static discovery read {len(inventory['files'])} repository text files and found {len(entries)} inventory entries: "+', '.join(f"{n} {kind}" for kind,n in sorted(kinds.items()))+". These entries are source definitions (including repeated router mounts and shared controls), **not a claim of that many distinct finished product features**. Every entry is represented below.\n\nThe 32 user workflow groups and 81 admin navigation entries provide the business-level map. Individual source controls were not all clicked or assigned a proven backend path; unresolved mappings remain explicit. Existence, event binding, successful build and an error-state render do not prove persistence or downstream effects.\n\n"+table(["Feature ID","Actor","Feature / handler","Source","API / trace","Status","Verification","Issue"],coverage_rows)
coverage_report += "\n## Source discovery manifest\n\nAll listed text files were read by the inventory scanner. This establishes discovery coverage, not a manual line-by-line correctness certification. Generated dependencies, virtual environments, build output, binary assets, secrets and bundled Redis source were excluded. Environment variable names/port relationships were inspected separately without copying credentials.\n\n"+table(["Source","Lines","SHA-256"],[(source(x['source']),x['lines'],x['sha256']) for x in inventory['files']])

reports={
    '01-SYSTEM_ARCHITECTURE.md':architecture,
    '02-USER_WORKFLOWS.md':user_report,
    '03-ADMIN_WORKFLOWS.md':admin_report,
    '04-CHAT_AND_DOCUMENT_LIFECYCLE.md':chat_report,
    '05-API_DATABASE_INTEGRATIONS.md':integration,
    '06-FUNCTIONALITY_COVERAGE.md':coverage_report,
    '07-TEST_RESULTS.md':tests_report,
    '08-BUGS_AND_FIXES.md':bugs_report,
    '09-SECURITY_PERFORMANCE.md':security,
    '10-IMPROVEMENT_ROADMAP.md':roadmap,
    '11-CHANGE_LOG.md':changes_report,
}
final_pass=sum(checks[n]['result']=='PASS' for n in final_ids)
final_fail=sum(checks[n]['result']=='FAIL' for n in final_ids)
summary=f"""# Overall system report

DocCraft's backend and both browser applications build successfully. Focused automated regressions, 96 browser error-state/rendering probes, 121 mounted admin API authentication probes, 17 real server-template PDFs plus a renderer security probe, and two real Redis/configuration persistence probes passed. Both frontend lint commands still fail. **Release readiness is not established.**

The final check register contains {final_pass} passing commands and {final_fail} failing commands; the failures are lint. Provider and remote-database workflows remain blocked, and additional categories were deliberately not run. Results are scoped in the test report and must not be interpreted as complete production workflow success.

## Discovery and coverage

- {len(inventory['files'])} repository text files scanned; {len(entries)} inventory entries.
- {kinds['ui-control']} UI control definitions, {kinds['ui-route']} JSX route declarations, {kinds['admin-section']} admin navigation entries, {kinds['api-declaration']} backend route/mount declarations.
- {kinds['database-model']} Prisma model definitions, {kinds['database-table']} physical-table declarations, {kinds['worker-module']} worker modules, {kinds['template']} server/email template definitions.
- {len(inventory['calls'])} HTTP client target expressions, plus {len(load('mounted-admin-api'))} actual mounted admin method/path operations.
- {len(fixed)} corrected defect groups and {len(unresolved)} unresolved/incomplete finding groups. Some fixes have focused runtime regressions; others have static/build verification only.

Source/control discovery is complete for the scanner's documented scope. Individual UI actions, all business workflows and external integrations are **not** fully verified. The coverage report retains NOT TESTED/BLOCKED entries instead of overstating completion.

## Actual architecture

Two React/Vite applications call a mixed Node/Python service system. The user app calls an Express gateway; the admin app directly calls a separate FastAPI control plane. The nine backend services are gateway, Auth, Chat, Document, Payment, Quota, Notification, Analytics and Admin API. Document adds a Fastify/Puppeteer sidecar. Prisma/SQLAlchemy/custom SQL describe database access; Redis supplies quotas, caches, queues and configuration invalidation. Groq is the active default chat provider; Claude helpers also exist. Payment integrates Paddle/PayHere; notifications use Resend; analytics uses PostHog. Storage supports Supabase or a local fallback.

Configured ports are gateway 3001, Auth 3011, Notification 3012, Document 3013, Payment 3014, Quota 3015, Chat 3016, Analytics 3017, Admin API 3018, sidecar 3023, user 5173 and admin 5174. Existing documentation had Chat/Notification reversed. The root Compose file has no PostgreSQL service; configured remote database resources were not exercised.

## Highest-impact corrections

Internal account/payment/notification boundaries and typed user authentication now enforce verification rather than trusting supplied headers. Current accounts/roles/plans are re-read; admin codes are not exposed and have separate purposes. Credential-like defaults and predictable bootstrap fallback were removed. Gateway route translation/raw callbacks, quota outage behavior, local download/guest protection, job ownership, PDF notification semantics, real provider checkout and account entitlement synchronization were corrected. Admin builds/refresh/audit controls and profile timezone persistence were also repaired.

## Admin-to-user results

The real configuration probe changed an isolated plan allowance from 7 to 12. The stored plan row and Redis key matched; an already-cached Node quota consumer observed the new value after actual Pub/Sub invalidation, and a fresh API read retained it. The measured delay is in the evidence. User status/plan and payment entitlement propagation have focused mocked boundary/HTTP-contract regressions. No full provider → PostgreSQL → browser synchronization journey was claimed.

Pricing/currency, active-provider model ceilings, broad feature gates, admin template publication, user announcement delivery, guest migration and distributed retry/refund guarantees still have gaps. These are detailed findings, not passed scenarios.

## Release blockers and decisions

1. Resolve conflicting physical database schemas and establish an isolated, migrated PostgreSQL stack.
2. Agree a single price/currency/entitlement/quota contract and connect all user gates/screens.
3. Complete or explicitly remove publication/delivery and metadata-only payment-method flows.
4. Validate sandbox checkout/webhooks, real identity/email/storage integrations and browser save/reload/export.
5. Complete duplicate/out-of-order/crash accounting, remaining authorization/abuse controls, lint cleanup and operational benchmarks.
6. Rotate any active formerly embedded credentials and supply consistent deployment secrets/configuration.

The source corrections are reviewable and tested to the stated limits. The application should not be described as 100% functional or production-ready on this evidence.

## Detailed reports

"""+"\n".join(f"- [{name}]({name})" for name in reports)+"\n"
reports={'00-OVERALL_SYSTEM_REPORT.md':summary,**reports}
for name,content in reports.items():
    (DOC/name).write_text(content.split('\n',1)[0]+'\n\n'+legend+'\n'+content.split('\n',1)[1].lstrip())

# Comprehensive master: assessment + full architecture/workflows/findings/results, not an index.
master=summary.replace('](0','](docs/system-audit/0').replace('](1','](docs/system-audit/1')
master += '\n- [00-OVERALL_SYSTEM_REPORT.md](docs/system-audit/00-OVERALL_SYSTEM_REPORT.md)\n'
for heading,content in [('Architecture',architecture),('User workflows',user_report),('Admin workflows and synchronization',admin_report),('Chat and document lifecycle',chat_report),('Verification',tests_report.split('\n## Browser workflow probes')[0]),('Bugs, fixes and remaining findings',bugs_report),('Security and reliability',security),('Prioritized roadmap',roadmap),('Audit change log',changes_report)]:
    body=content.split('\n',1)[1].lstrip().replace('](../../','](').replace('](evidence/','](docs/system-audit/evidence/')
    master+='\n\n## '+heading+'\n\n'+body
(ROOT/'DOC_CRAFT_FULL_PROJECT_REPORT.md').write_text('# DocCraft — Full Project Report\n\n'+legend+'\n'+master.split('\n',1)[1].lstrip())
(EVIDENCE/'report-summary.json').write_text(json.dumps({'scanned_files':len(inventory['files']),'inventory_entries':len(entries),'kinds':dict(kinds),'fixed_groups':len(fixed),'unresolved_groups':len(unresolved),'final_commands_pass':final_pass,'final_commands_fail':final_fail,'blocked_categories':sum(x[4]=='BLOCKED' for x in blocked_rows),'not_run_categories':sum(x[4]=='NOT TESTED' for x in blocked_rows),'audit_touched_source_files':sorted(set(changed))},indent=2))
print(json.dumps({'reports':len(reports)+1,'inventory_entries':len(entries),'fixed_groups':len(fixed),'unresolved_groups':len(unresolved),'final_checks_pass':final_pass,'final_checks_fail':final_fail}))
