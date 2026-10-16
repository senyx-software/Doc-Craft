# DocCraft Project Execution Guide

## Phase 3 identity setup (required by the current code)

The former universal internal secret and HS256 user tokens are no longer accepted.
Each process requires its own private identity file. Auth alone receives the user
signing private key; other services receive verification public keys. Admin uses a
separate stable `ADMIN_JWT_SECRET` (at least 32 characters).

Create a new private directory, never reuse a deployment's keys for test fixtures:

```sh
.venv-local/bin/python scripts/create_service_credentials.py .local/secrets
.venv-local/bin/python scripts/create_redis_credentials.py .local/secrets --redis-host redis --redis-port 6379
```

These commands create files with owner-only permissions and refuse overwrites.
Use the actual `REDIS_PORT` value instead of 6379 if it differs. Compose mounts only
the appropriate identity per service, uses Redis ACL users, and no longer publishes
backend/Redis/PDF host ports. Gateway, admin API and frontend ports bind loopback.
Compose now runs a separate PDF container with only its own identity and Redis
account; no document database or provider environment is injected. Native development
uses a filtered child launcher and `PDF_SERVICE_AUTH_CONFIG_FILE`/`PDF_REDIS_URL`.
Do not give PDF the document identity.

For **native** development, use a separate credentials directory and generate its
Redis environments with `--redis-host 127.0.0.1`. Set `DOCCRAFT_SECRETS_DIR` to that
directory before `npm run dev:services`; the launcher passes one identity and one
Redis account to each service. Start your owned Redis with the generated ACL file,
AOF enabled and the correct local port. The old `npm run redis` does not configure
ACLs and is insufficient for this setup. Do not run these setup commands against
shared infrastructure or reset any existing database.

Production additionally requires public HTTPS, authenticated encrypted private
transport (TLS/mTLS or a verified encrypted private network), verified database CA
configuration, separate database runtime/migration roles, rotated provider/bootstrap
credentials, backup/recovery rehearsal, and approved sandbox workflow verification.
The checked-in Compose file runs Vite development servers; it is not a production
hosting topology. Setting up local ACLs does not prove deployment TLS/isolation.

Deploy all peers' receiver keys before switching senders. Keyrings accept multiple
`kid` values; remove retired keys only after the 60-second request lifetime and
in-flight work drain. Queued jobs use independent keys and a seven-day expiry: drain
or explicitly re-sign trusted retained jobs before retiring queue keys. Old unsigned
jobs fail closed; do not requeue unreviewed payloads. Switching to EdDSA and persisted
admin sessions requires sign-in again. Roll back only to a compatible secure build;
restoring universal secrets/unsigned jobs reopens the corrected vulnerabilities.
The additive `admin_login_sessions` table must be created by the deployment migration
role before serving traffic when runtime roles cannot create tables.



## Phase 2 isolated verification

The current release assessment is **NOT READY**; see
[Phase 2 results](DOC_CRAFT_FULL_PROJECT_REPORT.md#phase-2--remediation-and-production-readiness-verification).
Both frontends pass lint/type/build checks. Real local integration tests verify
selected CRUD, administrator propagation, signed fixture billing, and five server
PDF workflows. Live AI, identity, payment, email and hosted storage providers still
require controlled sandbox verification.

To reproduce the local integration harness, install the existing Node/Python
project dependencies and provide a dedicated PostgreSQL instance on loopback,
with a role allowed to create isolated databases. Set `PG_AUDIT_URL` privately to
that local control database; the harness rejects non-loopback hosts, creates a
unique database per run and retains it for review. It does not reset existing
application databases. Redis and application processes are owned temporary
fixtures. Never point it at a production or shared local database server.

```bash
# Run from the repository root, after configuring the dedicated local PG_AUDIT_URL.
npm run build
python scripts/system_audit_check.py phase2-local-stack . .venv-local/bin/python scripts/system_audit_phase2_stack.py
AUDIT_CHECK_TIMEOUT=600 python scripts/system_audit_check.py phase2-local-probes . .venv-local/bin/python scripts/system_audit_phase2_probes.py
```

The second harness needs free local ports 3029, 5183 and 5184 and an installed
Puppeteer Chromium. It sends eight concurrent renderer requests, restarts only
its own browser child, renders all server templates and checks browser error
states with intercepted unavailable APIs. Those browser checks are distinct
from the first harness's actual API/database/browser assertions. External
provider credentials are overridden with synthetic/empty values; no real charge
or user email is sent. Evidence is under `docs/system-audit/evidence/phase2/`.

The legacy document test entry point is now safe: from `services/document`,
`../../.venv-local/bin/python test_document.py` runs the isolated pytest suite.
Before deployment, review the new migration baselines, legacy table namespace
copies, Chat enum preflight, CheckoutIntent requirements for legacy pending
payments, and rollback notes in
[the integration report](docs/system-audit/05-API_DATABASE_INTEGRATIONS.md).
Do not apply initial migrations blindly to an already-populated database.

## Audit-verified setup notes (2026-10-15)

See [the complete system audit](DOC_CRAFT_FULL_PROJECT_REPORT.md) for evidence,
known gaps, and release blockers. A successful build does not establish that the
configured remote databases or external providers work.

- Checked-in runtime configuration uses chat port **3016** and notification port
  **3012**. Older descriptions reversed those values. Explicit environment values
  are authoritative.
- The document service consists of a FastAPI API on 3013 and a Puppeteer sidecar
  on 3023 by default. The sidecar now binds to loopback and blocks network/file
  resources and page scripts; templates must use self-contained assets and
  available local fonts. `SIDECAR_HOST` can explicitly change the bind address.
- Inspect the actual Compose configuration before assuming a local PostgreSQL
  instance exists. This repository's root Compose file defines Redis and
  application containers; existing database environment files target a remote
  database. Do not run migrations or destructive test scripts against it.
- Root `npm run build` builds backend workspaces. Build and install dependencies
  for `admin/` and `user-frontend/` separately. Their lint commands are real
  checks; both pass after Phase 2 remediation (see the recorded evidence).
- Each Python service needs its own installed requirements. The audit used the
  available `.venv-local/bin/python` (Python 3.13); the service virtual environments
  did not contain pytest. The document requirements now explicitly include PyJWT.
- Configure matching user `JWT_SECRET`, `INTERNAL_SERVICE_SECRET`, and correct
  `AUTH_SERVICE_URL` for the gateway, chat, document, payment, and quota services.
  User account status/plan verification now fails closed if Auth cannot be reached.
  Notification sending/admin logs require `INTERNAL_SERVICE_SECRET`; notification
  preferences verify a user bearer with Auth through `AUTH_SERVICE_URL`. Compose loads shared configuration
  before the notification-specific environment file.
- Configure a stable, private admin `JWT_SECRET` explicitly for persistent admin
  sessions. Without one, the admin API generates a random process-local signing
  key; restarting invalidates those tokens. No hosted database, provider key, or
  bootstrap password is supplied by an admin source-code fallback.
- Set `SUPER_ADMIN_PASSWORD` before initial provisioning or a forced reset.
  Verification codes are delivered through the configured email transport and
  are no longer returned in login/reset responses or printed by the notification
  service. The admin frontend recognizes `verification_code_required` explicitly.
- Admin clients support `VITE_ADMIN_API_BASE_URL`; the local default is
  `http://localhost:3018/api/v1`. User clients use `VITE_API_BASE_URL`, whose default
  already includes `/v1`; client endpoint arguments must not repeat it.
- Forwarded IP headers are trusted by the admin API only when the socket peer is
  explicitly listed in `TRUSTED_PROXY_IPS`. Supply it as a JSON list if a trusted
  reverse proxy is used. Public ingress must not pass arbitrary proxy assertions.
- Configure `RESEND_WEBHOOK_SECRET` for delivery-status callbacks. Unconfigured
  callbacks return 503; invalid/stale signatures are rejected. Provider webhooks
  retain their raw bytes through the gateway.
- Local PDF download links now include an expiring signature. Previously issued
  unsigned local links are invalid. Regenerate links through the authorized
  document API or a valid share route. Guests cannot obtain download URLs or
  create shares to bypass the registration requirement.
- The pricing checkout uses the actual provider response and no longer changes
  a browser's plan after a simulated payment. Payment-method metadata remains
  memory-only and is not a provider-tokenized card vault.

Safe, reproducible audit tools are in `scripts/system_audit_*`. The synchronization
probe creates its own SQLite database and Redis process. Admin pytest fixtures
always create disposable SQLite state. The legacy
`services/document/test_document.py` is a live mutation script with stale paths;
review and configure it before execution.

This document provides instructions on how to run the entire **DocCraft** project, including backend microservices, API documentation, database migrations, and frontends.

---

## 1. Prerequisites & Environment Setup

Before starting the application, ensure the environment configuration files are present with the correct names:

| File | Purpose |
| :--- | :--- |
| `doccraft.env` | Root / shared config |
| `admin/admin.env` | Admin frontend |
| `user-frontend/user-frontend.env` | User frontend |
| `services/gateway/gateway.env` | API Gateway |
| `services/auth/auth.env` | Auth Service |
| `services/chat/chat.env` | AI / Chat Service |
| `services/document/document.env` | Document Service |
| `services/admin-api/admin-api.env` | Admin API |
| `services/analytics/analytics.env` | Analytics Service |
| `services/notification/notification.env` | Notification Service |
| `services/payment/payment.env` | Payment Service |
| `services/quota/quota.env` | Quota Service |

---

## 2. Service Architecture & Port Overview

| Component | Technology / Framework | Port | Local Endpoint |
| :--- | :--- | :---: | :--- |
| **User Frontend** | React + Vite + TypeScript | `5173` | [http://localhost:5173](http://localhost:5173) |
| **Admin Frontend** | React + Vite + TypeScript | `5174` | [http://localhost:5174](http://localhost:5174) |
| **API Gateway** | Node.js / Express | `3001` | [http://localhost:3001/v1](http://localhost:3001/v1) |
| **Auth Service** | Node.js + Prisma | `3011` | [http://localhost:3011](http://localhost:3011) |
| **AI / Chat Service** | Node.js / MCP | `3016` | [http://localhost:3016](http://localhost:3016) |
| **Document Service** | FastAPI + Puppeteer sidecar | `3013` | [http://localhost:3013](http://localhost:3013) |
| **Payment / Billing** | Node.js + Paddle/PayHere | `3014` | [http://localhost:3014](http://localhost:3014) |
| **Quota Service** | Node.js + Prisma | `3015` | [http://localhost:3015](http://localhost:3015) |
| **Notification Service** | Node.js + Resend | `3012` | [http://localhost:3012](http://localhost:3012) |
| **Analytics Service** | Python + FastAPI | `3017` | [http://localhost:3017](http://localhost:3017) |
| **Admin API Service** | Python + FastAPI | `3018` | [http://localhost:3018](http://localhost:3018) |
| **PostgreSQL** | Postgres 16 | `5432` | `localhost:5432` |
| **Redis** | Redis 7 | `6379` | `localhost:6379` |

---

## 3. Running the Project

### Option A: Docker Compose (Full Stack - Recommended)

To start the databases, gateway, all microservices, and frontends together using Docker:

```bash
# Start all containers in detached mode
docker-compose up -d

# View logs for all services
docker-compose logs -f

# View logs for a specific service (e.g., admin-api or gateway)
docker-compose logs -f admin-api
```

To stop all services:
```bash
docker-compose down
```

---

### Option B: Local Development Mode (npm Scripts)

Install dependencies at the root first:
```bash
npm install
```

Use the npm scripts defined in `package.json`:

- **Run Everything (All Services + Both Frontends):**
  ```bash
  npm run dev:all
  ```

- **Run All Backend Services Only:**
  ```bash
  npm run dev:services
  ```

- **Run Frontends Only:**
  ```bash
  # User Frontend (Port 5173)
  npm run dev:user

  # Admin Frontend (Port 5174)
  npm run dev:admin
  ```

---

### Option C: Running Services Individually

If you need to run specific microservices during development:

- **API Gateway**: `npm run dev:gateway`
- **Auth Service**: `npm run dev:auth`
- **AI / Chat Service**: `npm run dev:ai`
- **Document Service**: `npm run dev:document`
- **Quota Service**: `npm run dev:quota`
- **Payment Service**: `npm run dev:payment`
- **Notification Service**: `npm run dev:notification`
- **Analytics API**: `npm run dev:analytics`
- **Admin API**: `npm run dev:admin-api`

---

## 4. API Documentation (Backend Docs)

FastAPI services auto-generate interactive OpenAPI / Swagger UI documentation:

### Admin API Documentation
- **Swagger UI**: [http://localhost:3018/docs](http://localhost:3018/docs)
- **ReDoc**: [http://localhost:3018/redoc](http://localhost:3018/redoc)
- **OpenAPI Schema (JSON)**: [http://localhost:3018/openapi.json](http://localhost:3018/openapi.json)

### Analytics API Documentation
- **Swagger UI**: [http://localhost:3017/docs](http://localhost:3017/docs)
- **ReDoc**: [http://localhost:3017/redoc](http://localhost:3017/redoc)
- **OpenAPI Schema (JSON)**: [http://localhost:3017/openapi.json](http://localhost:3017/openapi.json)

---

## 5. Database Migrations

### Google sign-in (Firebase)

The user login and registration Google buttons use Firebase project `doc-craft-57643`.
In the Firebase console, enable **Authentication → Sign-in method → Google** and select a support email.
Under **Authentication → Settings → Authorized domains**, add `localhost` for local development and your deployed frontend hostname for production.
Open the frontend using `http://localhost:5173` locally.

The frontend sends a Firebase ID token to `POST /v1/auth/login/google`. The auth service verifies its signature, project, expiration, Google provider, and verified email before issuing DocCraft session tokens. Existing verified accounts retain their plan and two-factor authentication; unverified accounts must complete email verification first. No service-account private key is needed. The auth service can override the project with `FIREBASE_PROJECT_ID` when paired with a matching frontend configuration.

To generate or run database migrations for Prisma/PostgreSQL services:

```bash
# Generate Prisma client SDKs
npm run db:generate

# Execute database migrations
npm run db:migrate
```
