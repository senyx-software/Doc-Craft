# Infrastructure audit — before production implementation

Audited the current working tree on 2026-10-21. Existing hybrid AI work is uncommitted and is preserved. No existing GitHub Actions workflows, Terraform provider, VPS account, DNS ownership, or approved registry were found. Git remote is GitHub `senyx-software/Doc-Craft`; current branch is `eranda-dev`. Deployment triggers requested by the operator target `master`.

The root Compose file is a development topology. `scripts/prepare_staging.py` already creates an isolated TLS topology, pairwise service identities, Redis ACLs, scoped PostgreSQL roles, a Caddy reverse proxy, and owner-only migration jobs. Production work will reuse these mechanisms. `deploy/hybrid-ai/compose.local.yml` adds optional private Ollama inference and the separate AI credential keyring. No production resources have been contacted.

| Service | Source | Runtime / build | Startup / internal port | Exposure | Dependencies / persistence |
|---|---|---|---|---|---|
| gateway | services/gateway | Node 24, `npm run build -w doccraft-gateway` | `node dist/index.js`, 3001 | HTTPS proxy `/v1/*` | signed backends, Redis nonce/rate limits; no DB |
| auth | services/auth | Node/Prisma, workspace build | `node dist/server.js`, 3011 | gateway only | PostgreSQL users/sessions; Redis replay/TOTP/revocation; notification, analytics |
| notification | services/notification | Node, workspace build | `node dist/server.js`, 3012 | private | PostgreSQL notification tables, Redis queue/nonce, Resend |
| document | services/document/app | Python 3.13, pip requirements + constraints | uvicorn app.main:app, 3013 | gateway only | PostgreSQL, Redis, PDF, quota, admin storage policy; persistent files or existing Supabase integration |
| payment | services/payment | Node/Prisma, workspace build | `node dist/server.js`, 3014 | gateway webhooks/checkout | PostgreSQL billing/outbox, Redis, quota/auth/admin; Paddle and PayHere |
| quota | services/quota | Node/Prisma, workspace build | `node dist/server.js`, 3015 | gateway only | PostgreSQL durable atomic reservations/windows, Redis, admin policies |
| chat | services/chat | Node/Prisma, workspace build | `node dist/server.js`, 3016 | gateway SSE | PostgreSQL conversation/history, Redis admission/replay, auth/quota/admin; scoped MCP tools |
| analytics | services/analytics | Python 3.13 | uvicorn app.main:app, 3017 | private | PostgreSQL read grants, Redis, PostHog, payment |
| admin-api | services/admin-api | Python 3.13 | uvicorn app.main:app, 3018 | authenticated HTTPS `/api/v1/*` | PostgreSQL settings/RBAC/AI ledger, Redis, signed services; JWT, TOTP and AI encryption keyrings |
| pdf | services/document/puppeteer | Node/Puppeteer + Chromium | `node dist/puppeteer/server.js`, 3023 | private signed document caller | Redis nonce, browser sandbox, fonts; transient render files |
| user-ui | user-frontend | React/Vite, `npm ci && npm run build` | nginx, 8080 | HTTPS user host | relative public `/v1`; no runtime secrets |
| admin-ui | admin | React/Vite, `npm ci && npm run build` | nginx, 8080 | HTTPS admin host | relative `/api/v1`; backend RBAC/2FA |
| postgres | existing staging service | PostgreSQL 17 | postgres, 5432 | private TLS | durable PGDATA; schema-owner migration identity separate from DML runtime roles |
| redis | existing staging service | Redis 7 | redis-server TLS, 6379 | private TLS | per-service ACL, AOF required for replay integrity |
| ollama | optional hybrid overlay | Ollama | ollama serve, 11434 | private inference network | persistent model volume, bounded single loaded model and inference |
| edge | existing staging Caddy | Caddy 2 | caddy, 80/443 in production | only public application listener | ACME persistent state; internal CA verification |

All backend services have `/health`; Node dependency readiness uses `/ready` where implemented. PDF `/ready` requires signed service authentication and launches the browser. A 200 liveness response alone is insufficient. Production health verification must check database/Redis, service signatures, frontends, and a real PDF render.

Configuration names, owners and source locations are in [configuration-inventory.json](configuration-inventory.json). Required runtime secrets include per-service identities, Redis ACL credentials, scoped DB connection strings, private TLS keys, stable dedicated auth/admin signing material; provider/payment/email/storage credentials are needed only by their owning integrations. AI_CREDENTIAL_KEYRING_FILE belongs only to admin-api and must survive application rollback.

Prisma migrations exist for auth/chat/payment/quota; notification uses its existing SQL initializer; admin/document use existing Python schema initialization including additive AI migration. Automatic schema reversal is unsafe. Startup migration flags already permit separating DDL from runtime.

CPU/RAM requirements are not universal source-code facts. The isolated complete service stack was measured natively (see hybrid report14); existing PDF cap is 768 MiB/1 CPU, inference overlay example is 4 GiB/2 CPU. Neither proves VPS adequacy. Live 1.7B with 32768 context reports approximately 5.30 GB runtime allocation and causes memory pressure alongside host applications. Full Docker cgroup measurement remains blocked: Docker CLI/Compose are available, but no daemon socket exists. No 8 GB production claim is justified.

Existing Docker risks: staging Node image copies development dependencies and all workspace code; Python combines service dependencies; base tags are mutable; root Compose exposes development loopback ports and lacks complete resource limits. Production needs digest-only releases, bounded resources/logs, port isolation, persistent secrets, restricted deployment identity, backups, readiness gates and compatible application rollback. Supabase storage already exists and must remain configurable; local storage must not silently reinterpret existing object keys.

The complete field-by-field [service-inventory.json](service-inventory.json) includes all15 requested inventory fields for application/infrastructure services and one-shot jobs. Build/startup commands, ports, scoped configuration/secrets, health checks, CPU/RAM caps, volumes and startup dependencies are derived from actual package/Compose/config-loader definitions. Resource caps are labeled as proposals, not measured minimum requirements.
