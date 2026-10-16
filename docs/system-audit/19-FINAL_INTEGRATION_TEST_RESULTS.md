# Phase 4 final verification results

**Production: NOT READY. Staging: artifacts prepared; deployment not verified.** Results below were observed on 2026-10-16. No production database/resource was modified, no real credential was rotated, and no paid AI request, email or payment was sent. Previous phase results are historical and are not counted as current provider/browser evidence.

## Full regression

The final complete run started at **2026-10-16 07:33:59 UTC** after the durable downstream intake and timezone corrections. [Machine-readable commands, timestamps, exit codes and durations](evidence/phase4/regression/summary.json) record **20 checks: 17 PASS, 1 BLOCKED, 2 OPEN_FINDINGS**. BLOCKED and OPEN_FINDINGS retain their actual nonzero command exits; the runner's orchestration exit code is not an all-tests-pass claim.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Backend build | PASS, exit 0; all workspace build scripts | [log](evidence/phase4/regression/backend-build.log) |
| User build | PASS, exit 0 | [log](evidence/phase4/regression/user-build.log) |
| Admin build | PASS, exit 0 | [log](evidence/phase4/regression/admin-build.log) |
| User / Admin ESLint | Both PASS, exit 0 | [user](evidence/phase4/regression/user-lint.log), [admin](evidence/phase4/regression/admin-lint.log) |
| Auth | 38 passed | [log](evidence/phase4/regression/auth-tests.log) |
| Payment | 78 passed | [log](evidence/phase4/regression/payment-tests.log) |
| Quota | 25 passed | [log](evidence/phase4/regression/quota-tests.log) |
| Shared Node + Chat/user/gateway | Node **265 passed**; Vitest **224 passed, 1 failed** because sandboxed Chromium cannot start; overall command exit 1, BLOCKED | [log](evidence/phase4/regression/chat-shared-user-tests.log) |
| Gateway / Notification | 48 passed, including durable receipt/worker retry, provider-policy/log privacy/throttle tests | [log](evidence/phase4/regression/gateway-notification-tests.log) |
| Admin Python | 145 passed | [log](evidence/phase4/regression/admin-tests.log) |
| Document Python | 77 passed | [log](evidence/phase4/regression/document-tests.log) |
| Analytics Python | 3 passed | [log](evidence/phase4/regression/analytics-tests.log) |
| Shared Python | 10 passed | [log](evidence/phase4/regression/shared-python-tests.log) |
| Backend full npm audit | 0 advisories, exit 0 | [log](evidence/phase4/regression/backend-dependencies.log) |
| User / Admin runtime npm audit | Both 0 advisories with `--omit=dev`, exit 0 | [user](evidence/phase4/regression/user-runtime-dependencies.log), [admin](evidence/phase4/regression/admin-runtime-dependencies.log) |
| User / Admin full npm audit | Each reports **5 high**, exit 1; one vulnerable `braces` chain through chokidar/fast-glob/micromatch/Tailwind, not ten distinct root vulnerabilities | [user](evidence/phase4/regression/user-dependencies.log), [admin](evidence/phase4/regression/admin-dependencies.log) |
| Installed Python pip-audit | No known vulnerabilities in scanned installed environment, exit 0 | [log](evidence/phase4/regression/python-dependencies.log) |

Counts are per command and may overlap; no unique test total or functionality percentage is inferred. The first regression attempt had an Analytics import-path collection failure; the runner was corrected to use its service directory plus explicit repository/service Python paths, and the final three Analytics tests pass. Warnings include deprecated Starlette/TestClient interfaces, npm environment settings and large frontend chunks. They do not turn the browser failure into a pass. Frontend bundle sizes and load budgets still need measurement on staging.

PostCSS selector parser was updated to a patched release and both builds/lint rerun. The remaining [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched version in the checked range. Tailwind migration or an explicit reviewed build-environment risk decision is outstanding; no security check was disabled and no forced unverified major upgrade was used to hide it. Static frontend runtime images exclude the Node build environment, but actual image/SBOM scans remain unperformed. The additional resolved-requirements Python scan is retained in [python-security-audit.json](evidence/phase4/python-security-audit.json); it does not establish built-image contents.

## Actual microservices integration

The final native run took **99.21 seconds**, used fresh isolated database `doccraft_phase4_21ba6522b10c`, and recorded **214 VERIFIED, 2 BLOCKED, 0 UNRESOLVED**. The [JSON evidence](evidence/phase4/stack-integration.json) lists every assertion; [run log](evidence/phase4/stack-tls-run.log) preserves execution output. Earlier failed attempts remain separately preserved.

The environment used real local PostgreSQL 17.10, a task-owned Redis TLS/AOF instance, actual gateway/Auth/Chat/Document/Payment/Quota/Notification/Analytics/Admin processes and the actual PDF sidecar listener. Four Prisma migration sets ran against the fresh unique database. All nine backend readiness endpoints passed; the sidecar listener passed health/service-auth checks, while its Chromium renderer readiness remained blocked. User/admin Vite HTTP startup passed; these were not the unbuilt staging Nginx images.

| Area | Actual evidence and limits |
| --- | --- |
| Authentication / boundaries | Registration/account fixtures, refresh digests, guest ownership transfer, forged headers/service scopes, receiving-service replay denials, direct-service logout rejection, suspension/reactivation, Auth outage/restart. Email challenges were inspected in the owned fixture database, so this is not live email delivery. |
| Admin/user synchronization | Real plan/quota/status changes and current billing/admin/quota entitlement responses; global flags/catalog changes reach downstream APIs. Free/Pro/Max allowance and model policy, paid expiration/downgrade and expiring overrides additionally have regression coverage. |
| Chat and document lifecycle | Five document types use actual session/field/SSE/save/reload/delete paths. Provider keys are deliberately absent; no AI completion or model latency is claimed. Server PDF/browser-rendered output is blocked. |
| Uploaded templates | User private upload → Admin review/approval/publication → owner/other-user catalog and preview, visibility version change/rollback and withdrawal; private catalog descriptor leakage and owner IDOR denied. Hostile HTML/CSS/assets are regression-tested; actual PDF compatibility remains open. |
| Payment atomicity | Real child process exits 73 within a PostgreSQL transaction, leaves no partial invoice/claim/outbox, then twelve concurrent deliveries commit once. Signed local PayHere annual callbacks and duplicate/unsigned-field attacks use explicit synthetic fixtures, never a live merchant transaction. Startup reconstructs a lost queue delivery from the durable inbox. |
| Durable downstream billing | Actual Payment outbox dispatch receives a committed Admin event receipt; pending automation and HTTP notification receipts survive complete Redis loss. Real workers reconstruct/complete the synthetic transport outcome, suppress replay and reject changed-payload key reuse. This additional probe exposed and verified the correction of timezone-dependent outbox scheduling. |
| Currency reporting | Actual synthetic LKR annual invoice remains separate from USD and produces the expected annual-normalized run rate; refund/net-by-currency regressions pass. Provider statement matching remains open. |
| Quota | 24 concurrent duplicate reservation requests and 16 refund requests, persisted usage across downgrade, forged Max rejection, 20-hour first-use/reset behavior, expired-window refund and override restoration checks. Browser exports stay unmetered by approved policy. |
| Recovery | Empty task-owned Redis restart preserves PostgreSQL usage/reset; captured pre-loss service requests fail in both Node and Python; fresh requests/refunds recover. Document pending intent/refund/storage/queue partial failures have unit regression evidence, not a live sandboxed renderer drill. |
| Database least privilege | Eight database-using services restart with dedicated roles. Actual DDL/foreign Auth write/credential read denial checks pass; scoped-role administrator soft-purge retries use Auth/Document-owned endpoints. Soft-purge retains content/financial records and is not full content erasure. |
| TLS/network controls | Application HTTPS with CA verification, PostgreSQL validated TLS, wrong CA/plaintext rejection; authenticated Redis TLS, default account disabled and ACL command/key/channel denials. These are process-level controls, not Docker network isolation proof. |
| Shutdown | Final dependency-ordered idle shutdown required **no forced kill**. This does not prove active-job queue drain, at-least-once final notification delivery or production shutdown SLOs. |

Selected categories include 56 Security, 4 Transport security, 32 Database privileges, 8 Payment recovery and 4 Disaster recovery assertions; these are parts of the 214, not additional tests. Shared replay generation protection has a short fail-closed Redis startup interval. Live flushing a running replay store is forbidden; approved restart/quiesce is part of recovery.

A separate [real PostgreSQL notification receipt probe](evidence/phase4/notification-receipt-probe.json) verifies four additional receipt behaviors: duplicate identity, conflicting identity rejection, first attempt allowance and durable review hold after an uncertain attempt ages beyond its safe window. It makes zero external requests. Notification worker tests simulate a database failure after provider acknowledgement and verify stable provider key reuse; actual Resend delivery still requires the missing valid staging account. Resend documents a [24-hour idempotency lifetime](https://resend.com/docs/dashboard/emails/idempotency-keys); uncertain durable attempts are held after 23 hours for reconciliation rather than blindly resent later.

## Docker, browser and external sandbox evidence

- **Offline staging: 78/78 checks pass**, including certificate chain/hostname/wrong-host checks, secret mounting boundaries, TLS/Redis configuration, isolated PDF/backend topology and Compose validation. [Evidence](evidence/phase4/staging-artifact-validation-final.json). A new private project was generated after earlier ephemeral staging files disappeared.
- **Docker: BLOCKED.** The installed Docker client cannot reach `unix:///var/run/docker.sock` because no daemon socket is available. [Actual error](evidence/phase4/docker-daemon-final.log). No image build, container start, container network test or deployed frontend claim is made.
- **Browser/PDF: BLOCKED.** Real installed Chromium with its sandbox enabled reports no usable sandbox under this host's user-namespace/ptrace restrictions. The full browser regression exits nonzero and both native rendering/browser checks remain BLOCKED. No `--no-sandbox`, privileged container or ignored certificate validation was introduced. Current accessibility, responsive layout, actual PDF download/metering and visual watermark/priority acceptance remain unverified.
- **Groq: read-only authentication only.** At 2026-10-16 05:38:11 UTC, GET catalog returned HTTP 200 with 11 records. Project staging ownership, real completion and billing/quota workflow were not tested. [Evidence](evidence/phase4/provider-connections.json).
- **Resend: rejected.** The read-only domain/authentication request returned HTTP 401. No email was sent, no verified staging sender/recipient was established and no delivery/status success is claimed. Same [evidence](evidence/phase4/provider-connections.json).
- **Paddle/PayHere/Firebase/Claude/Supabase: NOT TESTED live.** Missing/placeholding credentials and resource identity prevent provider verification. The [prerequisite inventory](evidence/phase4/provider-prerequisites.json) records configuration state without values; [deployment guide](17-STAGING_DEPLOYMENT_GUIDE.md) lists exact keys, account/sandbox/callback and sender/bucket prerequisites. Signing local webhook fixtures and stubbing SDKs are not external sandbox evidence.
- **Legacy data, load and disaster recovery: OPEN.** Fresh database migrations and targeted concurrency are real; no sanitized deployed legacy copy, target-load capacity/SLO, database failover/backup restore or real bucket retention drill was supplied.

## Preservation, changes and disposition

Source/evidence survived an unexplained loss of local Git metadata, virtual-environment launchers and generated private setup files during final continuation. Launchers and credential-excluding ignore rules were restored, a new private staging package was generated and the full regression/native integration rerun. All 901 saved baseline source paths remain present. Git is initialized on `feature/rbac` with credential-free origin `https://github.com/senyx-software/Doc-Craft.git`; no commit/push or restored remote history is claimed. [Change manifest](evidence/phase4/change-manifest.json) compares source hashes against the saved Phase 4 baseline, preserving earlier dirty work rather than attributing it to this phase.

The requested [complete technical workflow](../../DOCCRAFT_FULL_TECHNICAL_WORKFLOW.md) documents business logic, actors, request/transaction/recovery flows and current limitations. Its reproducible source appendices enumerate 28 canonical fields, 298 HTTP declarations, all four Prisma model sets and 81 administrator navigation entries. These counts describe declarations, not independently verified business capabilities.

[Documentation validation](evidence/phase4/documentation-validation.json) checks local links and repeatable appendix generation. The content baseline shows **155 modified and 83 added reviewable files**, with all 901 baseline paths present; earlier dirty work is not attributed to Phase 4. [Final source validation](evidence/phase4/final-source-validation.json) verifies manifest hashes, new-file whitespace, credential-format detection without values, and ignored private paths. Git history/index was unavailable on final continuation, so an empty tracked diff is not claimed as a successful change review. The two task-owned loopback PostgreSQL clusters were [stopped after verification](evidence/phase4/cleanup.json); native service/Redis children were already stopped by the harness. No production resource was stopped or modified.

The owner must revoke the credential removed from the previous Git remote, approve actual key rotation/TOTP migration, supply sandbox and sanitized legacy resources, choose retention/cutover policies and complete deployed/browser/capacity acceptance. No original carried release group is newly marked FIXED without those acceptance criteria. See [all finding dispositions](16-PHASE4_RELEASE_BLOCKERS.md) and the [release checklist](18-PRODUCTION_READINESS_CHECKLIST.md). **Production remains NOT READY.**
