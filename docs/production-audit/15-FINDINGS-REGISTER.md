# Central findings register

Severity describes impact; classification distinguishes confirmed defects,potential risks and blocked verification. Scanner CRITICAL ratings are retained in raw scan metadata,not represented as proven compromise. No confirmed external compromise is claimed. No application remediation was performed during this audit.

| ID | Severity | Component | Classification | Description | Verification |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | HIGH | Auth alternate Google OAuth callback | Confirmed defect | Alternate callback issues access/refresh sessions without main-login MFA and account-state checks. | Actual handler test reproduced all4states using explicit external/DB stubs; no real Google credentials or compromise tested |
| SEC-002 | HIGH | Auth password reset | Confirmed defect | Two concurrent requests with the same reset token both successfully change the password. | Actual gateway/Auth/PostgreSQL reproduced HTTP200 twice; no production account used |
| DB-001 | HIGH | Admin staff creation | Confirmed defect | Concurrent staff creates choose one ID and overwrite an account. | Real repository/fresh SQLite:two adm_001 IDs,one stored row; PostgreSQL upsert path requires follow-up concurrent acceptance |
| API-001 | HIGH | Gateway OAuth routing | Confirmed defect | Real Google initiation/callback paths are rejected by gateway public-route policy. | Both real gateway requests returned401 (INT-007/008) |
| FE-001 | HIGH | User billing receipt view | Confirmed defect | Paid-plan view fabricates a fixed paid invoice and receipt download is an alert. | Actual browser/API/DB reproduced date/amount/paid display with zero persisted invoices |
| FE-002 | HIGH | OAuth frontend callback | Confirmed defect | Frontend does not consume the callback URL/fragment emitted by Auth. | Source contract mismatch verified; external Google flow blocked |
| FE-003 | HIGH | User profile MFA display | Confirmed defect | Opening profile shows MFA as disabled although backend MFA is enabled. | BROWSER-008 failed:backend true,disable control absent |
| FE-004 | HIGH | Saved custom canvas template persistence | Confirmed defect | Applied saved literal canvas disappears after reloading the same session. | Actual browser/API/database reproduction:literal element present after Apply,absent after same-session reload |
| FE-005 | MEDIUM | Billing deep-link state | Confirmed defect | Fresh billing page can label a pro override account FREE until another page initializes quota state. | Actual cold billing showed FREE; after profile initialized entitlements paid branch rendered |
| FE-006 | MEDIUM | Frontend session refresh | Confirmed defect | Frontend discards/does not use the available refresh-token flow and clears authentication on expiry/401. | Source trace; backend refresh/old-token rejection verified INT-006; long-expiry browser recovery not certified |
| API-002 | MEDIUM | Legacy frontend API wrappers | Confirmed defect | Four exported wrappers refer to undeclared backend paths. | Static resolution; all4appear unused after direct-import review; no active outage claimed |
| API-003 | MEDIUM | Analytics error responses | Confirmed defect | Some analytics handlers return HTTP200 error objects containing exception text. | Confirmed source error contract; failure branch runtime untested |
| API-004 | HIGH | Admin subscription finance mapping | Confirmed defect | Subscription rows always report USD and monthly plan price regardless of currency/cadence. | Source-confirmed mapping; LKR/yearly runtime fixture not executed |
| DATA-001 | HIGH | Account privacy purge/export | Potential risk | Purge marks complete while chat content and document slots/PDF data can retain personal/business data. | Source data-flow; destructive purge workflow not executed even against test data |
| SEC-003 | MEDIUM | Browser bearer storage | Potential risk | Access token is stored in JavaScript-readable localStorage and a cookie without Secure. | Static storage review; no XSS exploit or cross-site request exploit demonstrated |
| CFG-001 | MEDIUM | Production frontend demo branches | Confirmed defect | Production bundle includes client-only demo identity/token/quota paths. | Source confirmed; no visible production UI invocation found; server bypass not demonstrated |
| OPS-001 | HIGH | Backup and disaster recovery | Confirmed defect | Deploy-time same-host dumps are the only automated backup path; no implemented encrypted off-server schedule or key/asset recovery. | Source gap confirmed; native snapshot dump/restore73tables/162rows/568constraints passed; full-host DR blocked |
| OPS-002 | MEDIUM | Monitoring/alerting | Confirmed defect | Minute snapshots do not notify an operator of VPS/disk/API failure; tracing/SLO ownership is absent. | Current timer/log source verified; live alert delivery blocked |
| INF-001 | HIGH | Pinned upstream images | Potential risk | Pinned Node/Python/PostgreSQL and other upstream images have HIGH/CRITICAL scanner advisories. | Prior same-day raw remote scan outputs independently tied to unchanged digests; no final application image built; exploitability not established |
| INF-002 | HIGH | Docker production acceptance | Blocked verification | No Docker daemon is available for final builds/private networking/limits/sandbox/restart/real rollback acceptance. | Static Compose/actionlint/controller tests pass; actual Docker runtime blocked |
| INF-003 | HIGH | Terraform and infrastructure controls | Blocked verification | Terraform is a provider-neutral contract; actual VPS/firewall/DNS/state/SSH controls are not provisioned or verified. | fmt/validate pass; no real provider plan/apply/state verification |
| INF-004 | HIGH | CI/CD external acceptance | Blocked verification | Hosted GitHub Actions, GHCR credentials, protected settings, SSH host keys and actual automatic rollback have not executed on operator staging. | Workflow syntax and29policy tests pass; operator infrastructure blocked |
| AI-001 | HIGH | Local model document intelligence | Confirmed defect | Available candidate models do not reliably produce valid document/editor proposals. | Current schemas all7 match; stored real outputs revalidated23/112 and6/16; no fresh provider dispatch this audit |
| AI-002 | HIGH | Fresh live providers and mixed inference capacity | Blocked verification | Fresh local/cloud inference and full mixed PDF+LLM production load were not executed. | Fresh model blocked deliberately to avoid resource exhaustion; earlier actual evidence is separately labeled |
| DEV-001 | HIGH | Production PDF sandbox | Blocked verification | Normal signed PDF readiness fails503 and rendering500 in this development environment. | Normal failure reproduced;16/16diagnostic signed PDFs pass with test-only exception |
| PERF-001 | HIGH | Single-VPS sustainable capacity | Blocked verification | Short native tests do not establish sustainable throughput, mixed workload latency or an8GB minimum. | 96/96 edits at concurrency8 pass; nearest-rank343/580/661ms; sustained VPS test blocked |
| PERF-002 | MEDIUM | Synchronous policy/queue contention | Potential risk | Live-policy fan-out and a global AI budget advisory lock may become contention points. | Source potential; no measured lock bottleneck claimed |

## SEC-001 — Alternate callback issues access/refresh sessions without main-login MFA and account-state checks.

**HIGH / Confirmed defect** — Auth alternate Google OAuth callback

Root cause: googleCallback performs token exchange/email lookup then signs and stores session directly.

Evidence: [services/auth/src/controllers/auth.controller.ts:465](../../services/auth/src/controllers/auth.controller.ts), [runtime/../oauth-callback-handler.json](evidence/runtime/../oauth-callback-handler.json)

Reproduction: Run scripts/audit_security/oauth-callback.test.ts → Four fixture states: MFA enabled,suspended,deleted,locked

Business impact: MFA-capable accounts can take a weaker alternate authentication path once OAuth routing is made reachable.

Security impact: MFA bypass for active accounts; downstream account checks mitigate suspended/deleted use but do not restore missing MFA.

Recommended fix: Unify callback with the same account-status/MFA/session policy as password/Firebase login before repairing public routing.

Estimated effort: 1–2 days (engineering estimate; excludes operator/provider lead time).

Verification status: Actual handler test reproduced all4states using explicit external/DB stubs; no real Google credentials or compromise tested

## SEC-002 — Two concurrent requests with the same reset token both successfully change the password.

**HIGH / Confirmed defect** — Auth password reset

Root cause: used check precedes bcrypt work and transaction; later token update has no conditional unused predicate.

Evidence: [services/auth/src/controllers/auth.controller.ts:404](../../services/auth/src/controllers/auth.controller.ts), [runtime/password-reset-race.json](evidence/runtime/password-reset-race.json)

Reproduction: Create owned fixture reset request → Submit same token concurrently with different strong passwords

Business impact: One-use recovery token semantics fail; final password depends on request order.

Security impact: Valid reset-token reuse permits competing password mutations.

Recommended fix: Consume hashed reset token conditionally inside a transaction and mutate password only for the winning request; preserve session revocation.

Estimated effort: 1 day (engineering estimate; excludes operator/provider lead time).

Verification status: Actual gateway/Auth/PostgreSQL reproduced HTTP200 twice; no production account used

## DB-001 — Concurrent staff creates choose one ID and overwrite an account.

**HIGH / Confirmed defect** — Admin staff creation

Root cause: MAX numeric suffix+1 outside transaction plus INSERT OR REPLACE/upsert.

Evidence: [services/admin-api/app/repositories/admin_user_repository.py:48](../../services/admin-api/app/repositories/admin_user_repository.py), [services/admin-api/app/repositories/admin_user_repository.py:71](../../services/admin-api/app/repositories/admin_user_repository.py), [admin-create-race.json](evidence/admin-create-race.json)

Reproduction: Run scripts/audit_security/admin_create_race.py → Barrier after two real list_all snapshots

Business impact: Staff account/role identity loss or overwrite; privileged operation requires existing authorization.

Security impact: Account integrity/possible role identity corruption; no anonymous exploit claimed.

Recommended fix: Use DB-generated UUID/sequence plus insert-only create; retain explicit update path and unique-email constraints.

Estimated effort: 1 day (engineering estimate; excludes operator/provider lead time).

Verification status: Real repository/fresh SQLite:two adm_001 IDs,one stored row; PostgreSQL upsert path requires follow-up concurrent acceptance

## API-001 — Real Google initiation/callback paths are rejected by gateway public-route policy.

**HIGH / Confirmed defect** — Gateway OAuth routing

Root cause: Stale allowlist /oauth/google and /oauth/callback differs from registered /login/google and /oauth/google/callback.

Evidence: [services/gateway/src/middleware/auth.middleware.ts:21](../../services/gateway/src/middleware/auth.middleware.ts), [services/auth/src/routes/auth.routes.ts:407](../../services/auth/src/routes/auth.routes.ts), [runtime/integrated-tests.json](evidence/runtime/integrated-tests.json)

Reproduction: Unauthenticated GET /v1/auth/login/google → Unauthenticated GET /v1/auth/oauth/google/callback

Business impact: Alternate Google sign-in cannot complete through the public gateway.

Security impact: Repairing routing alone would expose SEC-001.

Recommended fix: After SEC-001 is fixed, align method/path allowlist and integration tests with actual auth registration.

Estimated effort: 0.5–1 day (engineering estimate; excludes operator/provider lead time).

Verification status: Both real gateway requests returned401 (INT-007/008)

## FE-001 — Paid-plan view fabricates a fixed paid invoice and receipt download is an alert.

**HIGH / Confirmed defect** — User billing receipt view

Root cause: Static date/price/status row gated by cached entitlements instead of billing invoice query.

Evidence: [user-frontend/src/pages/dashboard/DashboardBillingPage.tsx:170](../../user-frontend/src/pages/dashboard/DashboardBillingPage.tsx), [runtime/billing-receipt.json](evidence/runtime/billing-receipt.json)

Reproduction: Give synthetic account approved pro override without payment → Visit profile then navigate within app to billing → Observe fixed2026-08-15/LKR990 row despite zero billing_invoice rows

Business impact: Users see invented financial records and receive no receipt download.

Security impact: Financial integrity/trust defect; no real charge or invoice created.

Recommended fix: Render actual authorized invoices or an honest empty state; implement verified receipt download.

Estimated effort: 1–2 days (engineering estimate; excludes operator/provider lead time).

Verification status: Actual browser/API/DB reproduced date/amount/paid display with zero persisted invoices

## FE-002 — Frontend does not consume the callback URL/fragment emitted by Auth.

**HIGH / Confirmed defect** — OAuth frontend callback

Root cause: Auth redirects /oauth-callback#accessToken=...; App only reads query access_token and declares no callback route.

Evidence: [services/auth/src/controllers/auth.controller.ts:508](../../services/auth/src/controllers/auth.controller.ts), [user-frontend/src/App.tsx:47](../../user-frontend/src/App.tsx)

Reproduction: Compare callback response location and frontend router/parser → Full real Google flow requires approved test OAuth config

Business impact: Even after gateway repair, alternate OAuth session is not restored into UI.

Security impact: Token handling must avoid logs/history leaks.

Recommended fix: Implement one consistent callback route/encoding with token-safe handling and an actual OAuth integration test.

Estimated effort: 1 day (engineering estimate; excludes operator/provider lead time).

Verification status: Source contract mismatch verified; external Google flow blocked

## FE-003 — Opening profile shows MFA as disabled although backend MFA is enabled.

**HIGH / Confirmed defect** — User profile MFA display

Root cause: users.getProfile/updateProfile omit twoFactorEnabled; ProfileIdentityCard replaces auth user; security card coerces omitted field false.

Evidence: [user-frontend/src/api/users.ts:15](../../user-frontend/src/api/users.ts), [user-frontend/src/components/dashboard/ProfileIdentityCard.tsx:41](../../user-frontend/src/components/dashboard/ProfileIdentityCard.tsx), [user-frontend/src/components/dashboard/ProfileSecurityCard.tsx:36](../../user-frontend/src/components/dashboard/ProfileSecurityCard.tsx), [runtime/browser-tests.json](evidence/runtime/browser-tests.json)

Reproduction: Actual TOTP enable+verify → Open/reload profile → Compare backend enabled flag to disable action

Business impact: Misleading security state; correct MFA-management actions disappear.

Security impact: UI defect; primary backend MFA enforcement is not bypassed by this display bug.

Recommended fix: Preserve the server MFA field in normalization and merge verified profile updates; cover reload.

Estimated effort: 0.5 day (engineering estimate; excludes operator/provider lead time).

Verification status: BROWSER-008 failed:backend true,disable control absent

## FE-004 — Applied saved literal canvas disappears after reloading the same session.

**HIGH / Confirmed defect** — Saved custom canvas template persistence

Root cause: Apply replaces canvasElements, clears customElements/overrides, leaves builtin selectedTemplate; autosave payload omits canvasElements and local persistence strips them.

Evidence: [user-frontend/src/store/documentStore.ts:411](../../user-frontend/src/store/documentStore.ts), [user-frontend/src/store/documentStore.ts:61](../../user-frontend/src/store/documentStore.ts), [user-frontend/src/store/documentStore.ts:1125](../../user-frontend/src/store/documentStore.ts), [runtime/custom-template-reload.json](evidence/runtime/custom-template-reload.json)

Reproduction: Save literal custom template → Apply in active session → Reload same session and compare exact canvas elements

Business impact: Potential silent loss of a user-selected custom design.

Security impact: Document integrity risk; do not claim runtime reproduction if probe blocked.

Recommended fix: Represent applied literal template in typed durable state or persist its validated elements/definition identity; test reload and next chat.

Estimated effort: 1–2 days (engineering estimate; excludes operator/provider lead time).

Verification status: Actual browser/API/database reproduction:literal element present after Apply,absent after same-session reload

## FE-005 — Fresh billing page can label a pro override account FREE until another page initializes quota state.

**MEDIUM / Confirmed defect** — Billing deep-link state

Root cause: Billing reads quota/entitlements but does not fetch them on mount.

Evidence: [user-frontend/src/pages/dashboard/DashboardBillingPage.tsx:12](../../user-frontend/src/pages/dashboard/DashboardBillingPage.tsx), [runtime/billing-receipt.json](evidence/runtime/billing-receipt.json)

Reproduction: Open billing directly in a new authenticated browser context → Visit profile then use in-app billing navigation

Business impact: Incorrect subscription display depends on navigation history.

Security impact: No server entitlement bypass observed.

Recommended fix: Fetch authoritative policy on mount with loading/error states and test direct URLs.

Estimated effort: 0.5 day (engineering estimate; excludes operator/provider lead time).

Verification status: Actual cold billing showed FREE; after profile initialized entitlements paid branch rendered

## FE-006 — Frontend discards/does not use the available refresh-token flow and clears authentication on expiry/401.

**MEDIUM / Confirmed defect** — Frontend session refresh

Root cause: API wrappers consume access token; frontend has no refresh call; backend refresh exists.

Evidence: [user-frontend/src/api/client.ts:59](../../user-frontend/src/api/client.ts), [user-frontend/src/store/authStore.ts:318](../../user-frontend/src/store/authStore.ts), [services/auth/src/controllers/auth.controller.ts:333](../../services/auth/src/controllers/auth.controller.ts)

Reproduction: Let access token expire while editing → Observe frontend clear/re-auth instead of backend token rotation

Business impact: Avoidable interruptions and risk of unsaved editing state.

Security impact: Browser token storage design needs security review.

Recommended fix: Design secure refresh storage/rotation and bounded single-flight refresh before retry; retain logout revocation.

Estimated effort: 1–2 days (engineering estimate; excludes operator/provider lead time).

Verification status: Source trace; backend refresh/old-token rejection verified INT-006; long-expiry browser recovery not certified

## API-002 — Four exported wrappers refer to undeclared backend paths.

**MEDIUM / Confirmed defect** — Legacy frontend API wrappers

Root cause: Legacy admin payment/templates create and document layout/content wrappers remain after integration changes.

Evidence: [frontend-api-map.json](evidence/frontend-api-map.json), [user-frontend/src/api/documents.ts:29](../../user-frontend/src/api/documents.ts), [admin/src/api/adminApiClient.ts:321](../../admin/src/api/adminApiClient.ts)

Reproduction: Review FE-API-077,112,192,193 → Search exact imported wrapper calls rather than same-named store methods

Business impact: Dead/unsafe integration surface may be reused and then404/405; not evidence current canvas path is broken.

Security impact: Backend authorization still required on any future implementation.

Recommended fix: Remove/deprecate unused wrappers or implement approved APIs; add method/path contract checks.

Estimated effort: 0.5 day (engineering estimate; excludes operator/provider lead time).

Verification status: Static resolution; all4appear unused after direct-import review; no active outage claimed

## API-003 — Some analytics handlers return HTTP200 error objects containing exception text.

**MEDIUM / Confirmed defect** — Analytics error responses

Root cause: except Exception returns {error:str(e)} instead of typed non-success response.

Evidence: [services/analytics/app/routers/analytics.py:66](../../services/analytics/app/routers/analytics.py), [services/analytics/app/routers/analytics.py:105](../../services/analytics/app/routers/analytics.py)

Reproduction: Force isolated database query failure for overview/generations/users → Check status/error body; failure branch not executed in this audit

Business impact: Admin can show empty/successful reporting during dependency failures.

Security impact: Potential internal diagnostic leakage; no actual credential leak demonstrated.

Recommended fix: Return bounded sanitized503 errors and render unavailable states; test transport and error shapes.

Estimated effort: 0.5–1 day (engineering estimate; excludes operator/provider lead time).

Verification status: Confirmed source error contract; failure branch runtime untested

## API-004 — Subscription rows always report USD and monthly plan price regardless of currency/cadence.

**HIGH / Confirmed defect** — Admin subscription finance mapping

Root cause: adminListSubscriptions hardcodes currency USD and amount plan.priceMonthly.

Evidence: [services/payment/src/controllers/payment.controller.ts:323](../../services/payment/src/controllers/payment.controller.ts)

Reproduction: Create isolated LKR or yearly subscription fixture → Read admin subscription list and compare actual persisted billing facts

Business impact: Wrong financial figures can drive support/refund/revenue decisions.

Security impact: Financial integrity defect, not proof of payment authorization bypass.

Recommended fix: Use the actual billed currency/amount/interval and reconcile with invoice provider records.

Estimated effort: 1 day (engineering estimate; excludes operator/provider lead time).

Verification status: Source-confirmed mapping; LKR/yearly runtime fixture not executed

## DATA-001 — Purge marks complete while chat content and document slots/PDF data can retain personal/business data.

**HIGH / Potential risk** — Account privacy purge/export

Root cause: Purge anonymizes Auth and document.userEmail only; no chat/content/PDF purge in current route.

Evidence: [services/admin-api/app/api/v1/gdpr.py:154](../../services/admin-api/app/api/v1/gdpr.py), [services/document/app/routers/document.py:701](../../services/document/app/routers/document.py)

Reproduction: Populate synthetic chat/document PII → Invoke authorized purge → Inspect preserved conversation/slots/assets and export completeness

Business impact: Product de-identification claims may exceed actual retention behavior.

Security impact: Privacy/retention risk; no legal compliance determination is made.

Recommended fix: Define lawful/product retention explicitly, enumerate all data stores, implement resumable deletion/redaction/export and verify.

Estimated effort: 2–5 days (engineering estimate; excludes operator/provider lead time).

Verification status: Source data-flow; destructive purge workflow not executed even against test data

## SEC-003 — Access token is stored in JavaScript-readable localStorage and a cookie without Secure.

**MEDIUM / Potential risk** — Browser bearer storage

Root cause: client setCookieToken uses SameSite=Lax only and mirrors token to localStorage.

Evidence: [user-frontend/src/api/client.ts:14](../../user-frontend/src/api/client.ts)

Reproduction: Inspect cookie/storage attributes over HTTPS → Review XSS/refresh/CSRF trust model before redesign

Business impact: A successful XSS could read bearer credentials; HTTPS cookie policy is incomplete.

Security impact: Potential confidentiality risk; APIs generally require Authorization bearer, so cookie presence alone is not a CSRF finding.

Recommended fix: Define HttpOnly/Secure session or other justified token architecture; apply CSP/XSS/CSRF defenses appropriately.

Estimated effort: 1–3 days (engineering estimate; excludes operator/provider lead time).

Verification status: Static storage review; no XSS exploit or cross-site request exploit demonstrated

## CFG-001 — Production bundle includes client-only demo identity/token/quota paths.

**MEDIUM / Confirmed defect** — Production frontend demo branches

Root cause: Demo branches are ordinary application code rather than explicitly gated build targets.

Evidence: [user-frontend/src/store/authStore.ts:261](../../user-frontend/src/store/authStore.ts), [user-frontend/src/store/chatStore.ts:68](../../user-frontend/src/store/chatStore.ts), [user-frontend/src/store/quotaStore.ts:21](../../user-frontend/src/store/quotaStore.ts)

Reproduction: Set only the client demo sentinel in an isolated browser → Observe simulated state; backend should still reject unsigned token

Business impact: Confusing fake account/plan behavior in production client; support and testing ambiguity.

Security impact: Do not treat this as backend privilege escalation.

Recommended fix: Gate demo mode to explicit development/demo build and assert production bundle excludes it.

Estimated effort: 0.5–1 day (engineering estimate; excludes operator/provider lead time).

Verification status: Source confirmed; no visible production UI invocation found; server bypass not demonstrated

## OPS-001 — Deploy-time same-host dumps are the only automated backup path; no implemented encrypted off-server schedule or key/asset recovery.

**HIGH / Confirmed defect** — Backup and disaster recovery

Root cause: Controller backup occurs before rollout; timer only monitors; off-host retention is an operator instruction.

Evidence: [deploy/scripts/controller.py:90](../../deploy/scripts/controller.py), [deploy/doccraft-monitor.timer](../../deploy/doccraft-monitor.timer), [runtime/backup-restore.json](evidence/runtime/backup-restore.json)

Reproduction: Review deployment backup path and all timers → Recover after simulated complete host loss using only documented artifacts

Business impact: VPS/disk loss can lose database/files/keys since last recoverable off-host copy.

Security impact: Backups contain sensitive data; encryption and least-privilege restoration are required operational controls.

Recommended fix: Implement scheduled encrypted off-host database/assets/config/key backups, retention and isolated full-host restore drills.

Estimated effort: 2–4 days (engineering estimate; excludes operator/provider lead time).

Verification status: Source gap confirmed; native snapshot dump/restore73tables/162rows/568constraints passed; full-host DR blocked

## OPS-002 — Minute snapshots do not notify an operator of VPS/disk/API failure; tracing/SLO ownership is absent.

**MEDIUM / Confirmed defect** — Monitoring/alerting

Root cause: Local JSON timer and private metrics have no external heartbeat/page integration.

Evidence: [deploy/scripts/controller.py:144](../../deploy/scripts/controller.py), [deploy/doccraft-monitor.timer](../../deploy/doccraft-monitor.timer), [services/gateway/src/middleware/requestLogger.middleware.ts:8](../../services/gateway/src/middleware/requestLogger.middleware.ts)

Reproduction: Simulate host/down/disk threshold on disposable staging → Verify external alert receipt and correlation trail

Business impact: Failures may remain unnoticed until customers report them.

Security impact: Security/deployment audit logs exist; this is operational detection coverage.

Recommended fix: Add low-cost external uptime/heartbeat and actionable alerts; define correlation/retention/redaction ownership.

Estimated effort: 1–2 days (engineering estimate; excludes operator/provider lead time).

Verification status: Current timer/log source verified; live alert delivery blocked

## INF-001 — Pinned Node/Python/PostgreSQL and other upstream images have HIGH/CRITICAL scanner advisories.

**HIGH / Potential risk** — Pinned upstream images

Root cause: Digest pins preserve old package versions; CI blocks but does not remediate vulnerable bases.

Evidence: [deploy/config/base-images.json](../../deploy/config/base-images.json), [../devops/evidence/base-image-scans.json](../devops/evidence/base-image-scans.json), [../devops/evidence/dependency-security.json](../devops/evidence/dependency-security.json)

Reproduction: Scan exact pinned digest with a current Trivy database → Triage package/advisory/fixed-version and final-image reachability

Business impact: Release cannot safely pass configured vulnerability gates until triaged/fixed.

Security impact: Scanner CRITICAL severity is not itself proof of active compromise.

Recommended fix: Select reviewed fixed immutable bases, rebuild all targets, scan final images and repeat functional checks.

Estimated effort: 1–3 days (engineering estimate; excludes operator/provider lead time).

Verification status: Prior same-day raw remote scan outputs independently tied to unchanged digests; no final application image built; exploitability not established

## INF-002 — No Docker daemon is available for final builds/private networking/limits/sandbox/restart/real rollback acceptance.

**HIGH / Blocked verification** — Docker production acceptance

Root cause: Development environment has CLI/Compose only.

Evidence: [deploy/docker/compose.production.yml](../../deploy/docker/compose.production.yml), [runtime/normal-pdf-readiness.json](evidence/runtime/normal-pdf-readiness.json), [validation-summary.json](evidence/validation-summary.json)

Reproduction: Run the supplied production targets on disposable Docker staging → Exercise dependency failures, restart persistence, resource limits and compatible rollback

Business impact: Essential deployment enforcement remains unverified.

Security impact: No production deployment attempted.

Recommended fix: Complete isolated container acceptance before enabling both deployment gates.

Estimated effort: 1–3 days (engineering estimate; excludes operator/provider lead time).

Verification status: Static Compose/actionlint/controller tests pass; actual Docker runtime blocked

## INF-003 — Terraform is a provider-neutral contract; actual VPS/firewall/DNS/state/SSH controls are not provisioned or verified.

**HIGH / Blocked verification** — Terraform and infrastructure controls

Root cause: No chosen provider or authorized infrastructure credentials.

Evidence: [terraform/main.tf:32](../../terraform/main.tf), [terraform/backend.tf.example](../../terraform/backend.tf.example)

Reproduction: Choose provider/remote state → Review real provider plan under separate approval

Business impact: No infrastructure readiness evidence or measured final capacity.

Security impact: Application deploy does not run Terraform.

Recommended fix: Implement provider adapter, encrypted locked state, restricted management ingress and approved plan/apply process.

Estimated effort: 1–3 days (engineering estimate; excludes operator/provider lead time).

Verification status: fmt/validate pass; no real provider plan/apply/state verification

## INF-004 — Hosted GitHub Actions, GHCR credentials, protected settings, SSH host keys and actual automatic rollback have not executed on operator staging.

**HIGH / Blocked verification** — CI/CD external acceptance

Root cause: Operator repository/VPS bootstrap is not configured in this environment.

Evidence: [.github/workflows/ci.yml](../../.github/workflows/ci.yml), [.github/workflows/deploy-production.yml](../../.github/workflows/deploy-production.yml), [deploy/scripts/doccraft-receive](../../deploy/scripts/doccraft-receive)

Reproduction: Configure protected test environment/GHCR/forced SSH identity → Run a release and deliberate compatible readiness failure

Business impact: Static safe intent does not prove delivery or recovery.

Security impact: Keep production enable gates disabled.

Recommended fix: Run complete staged pipeline; verify branch/tag ancestry, digest/provenance, migrations and rollback before activation.

Estimated effort: 1–2 days (engineering estimate; excludes operator/provider lead time).

Verification status: Workflow syntax and29policy tests pass; operator infrastructure blocked

## AI-001 — Available candidate models do not reliably produce valid document/editor proposals.

**HIGH / Confirmed defect** — Local model document intelligence

Root cause: Nested tool schema/evidence/field mapping failures and timeouts.

Evidence: [current-tool-schema-comparison.json](evidence/current-tool-schema-comparison.json), [prior-1.7b-revalidated.json](evidence/prior-1.7b-revalidated.json), [prior-4b-revalidated.json](evidence/prior-4b-revalidated.json)

Reproduction: Regrade retained actual inference outputs against current unchanged schemas → After safe hardware provisioning rerun unchanged corpus and applied browser edits

Business impact: Assistant cannot fulfill natural document creation/editing reliably.

Security impact: Safe rejection prevents some corruption but is not functional success.

Recommended fix: Evaluate capable models/constrained generation without relaxing integrity checks; repeat real applied end-to-end conversations.

Estimated effort: 3–10 days (engineering estimate; excludes operator/provider lead time).

Verification status: Current schemas all7 match; stored real outputs revalidated23/112 and6/16; no fresh provider dispatch this audit

## AI-002 — Fresh local/cloud inference and full mixed PDF+LLM production load were not executed.

**HIGH / Blocked verification** — Fresh live providers and mixed inference capacity

Root cause: Shared host memory/swap pressure; no approved cloud test credentials or Docker/VPS.

Evidence: [runtime/resource-samples.jsonl](evidence/runtime/resource-samples.jsonl), [validation-summary.json](evidence/validation-summary.json)

Reproduction: Provision isolated measured staging capacity and approved provider test credentials → Run real fallback/budget/isolation and sustained mixed concurrency

Business impact: No supported current-model accuracy/latency/cloud-cost or VPS-minimum certification.

Security impact: Do not infer 8GB adequacy from quantized file size.

Recommended fix: Benchmark complete container deployment with one loaded model and agreed quality/latency targets.

Estimated effort: 2–4 days (engineering estimate; excludes operator/provider lead time).

Verification status: Fresh model blocked deliberately to avoid resource exhaustion; earlier actual evidence is separately labeled

## DEV-001 — Normal signed PDF readiness fails503 and rendering500 in this development environment.

**HIGH / Blocked verification** — Production PDF sandbox

Root cause: Chromium sandbox/host compatibility requires actual production container/kernel acceptance.

Evidence: [services/document/puppeteer/server.ts](../../services/document/puppeteer/server.ts), [runtime/normal-pdf-readiness.json](evidence/runtime/normal-pdf-readiness.json), [runtime/pdf-check.json](evidence/runtime/pdf-check.json)

Reproduction: Run signed /ready then valid /generate using normal renderer → Compare diagnostic test-only unsandboxed rendering

Business impact: PDF generation cannot be certified on intended production host.

Security impact: Do not disable sandbox globally to obtain a pass.

Recommended fix: Validate secure browser sandbox under actual Docker host; preserve sandbox enforcement.

Estimated effort: 1–2 days (engineering estimate; excludes operator/provider lead time).

Verification status: Normal failure reproduced;16/16diagnostic signed PDFs pass with test-only exception

## PERF-001 — Short native tests do not establish sustainable throughput, mixed workload latency or an8GB minimum.

**HIGH / Blocked verification** — Single-VPS sustainable capacity

Root cause: No target VPS/cgroup runtime, long run, storage/network benchmark or agreed SLO.

Evidence: [runtime/http-workload.json](evidence/runtime/http-workload.json), [runtime/resource-samples.jsonl](evidence/runtime/resource-samples.jsonl)

Reproduction: Run mixed logins/edit/generate/inference/admin workloads at target container caps → Measure steady-state p99/queue/RAM/swap/IO/errors and recovery

Business impact: Capacity and operating-cost promises would be unsupported.

Security impact: No hardware purchase/minimum claim is made.

Recommended fix: Agree SLOs, benchmark4vCPU/16GiB staging candidate, compare lower-cost alternatives using measured results.

Estimated effort: 2–3 days (engineering estimate; excludes operator/provider lead time).

Verification status: 96/96 edits at concurrency8 pass; nearest-rank343/580/661ms; sustained VPS test blocked

## PERF-002 — Live-policy fan-out and a global AI budget advisory lock may become contention points.

**MEDIUM / Potential risk** — Synchronous policy/queue contention

Root cause: Authoritative calls and100ms queue polling serialize budget/admission transactions.

Evidence: [services/admin-api/app/services/ai_budget.py:15](../../services/admin-api/app/services/ai_budget.py), [services/admin-api/app/services/ai_budget.py:131](../../services/admin-api/app/services/ai_budget.py), [services/quota/src/middleware/authenticate.ts:34](../../services/quota/src/middleware/authenticate.ts)

Reproduction: Benchmark high concurrent queued inference and policy updates → Measure transaction waits/call amplification rather than remove validation

Business impact: Potential long-tail latency/cascading failures under load.

Security impact: Security validation must not be disabled for throughput.

Recommended fix: Measure first; bound retrieval/queue polling and optimize transactions while keeping authoritative security decisions.

Estimated effort: 1–3 days (engineering estimate; excludes operator/provider lead time).

Verification status: Source potential; no measured lock bottleneck claimed

## Prioritized remediation plan

1. **Authentication and account integrity:** fix SEC-001 and SEC-002; replace DB-001 ID allocation/upsert creation. Do not expose the corrected OAuth paths until the shared MFA/account checks pass. Then repair API-001 and FE-002 as one end-to-end OAuth change.
2. **Customer data and financial correctness:** persist literal custom canvases; preserve profile MFA state; replace fabricated receipts with authoritative billing data; fetch billing policy on entry; correct subscription currency/cadence and implement secure refresh recovery.
3. **Deployment and recovery gates:** triage/fix base images, build and scan final targets, verify secure PDF/TLS/network/resource enforcement, run real migrations and rollback, and implement encrypted off-server backups with a full-host restore drill.
4. **AI capability:** approve a capable model, rerun the unchanged real corpus and applied browser conversations, and verify permitted cloud fallback and budgets using approved test credentials.
5. **Remaining coverage and operations:** execute all feature mutation/negative/permission variants, resolve privacy retention/export requirements, verify external alerts and perform full mixed VPS benchmarks plus provider-specific infrastructure and CI/CD acceptance.

Each remediation needs a reproducer that fails before and passes after, focused regression and actual owning-service/browser verification. Infrastructure and credential changes require operator authorization. Keep deployment disabled until the scorecard gates pass.

<!-- PRODUCTION-REMEDIATION -->

## Current remediation status

The descriptions above preserve the original audit. The records below describe the current implementation and evidence. **Decision remains NO-GO.** Full details: [remediation verification](../production-remediation/05-VERIFICATION-RESULTS.md).

| Finding | Severity | Status | Fix / scope |
|---|---|---|---|
| SEC-001 | HIGH | partially fixed | OAuth now verifies state, S256 PKCE, signed Google ID-token issuer/audience/expiry/nonce/verified email, and account/verification/MFA policy before issuing sessions. Credentials and redirect origins must be configured; provider errors are sanitized. |
| SEC-002 | HIGH | fixed | A conditional unused/unexpired token claim, password mutation, session deletion and durable access revocation commit together. Losing claims cannot mutate credentials. New recovery tokens are stored as digests; old unexpired hex links remain compatible. A stored digest is never accepted as a bearer. |
| DB-001 | HIGH | fixed | Staff creation uses UUIDs and insert-only SQL; save updates existing identities and preserves creation time. Normalized email uniqueness is enforced in SQLite/PostgreSQL; conflicts return409. Schema initialization rolls back on failure. |
| API-001 | HIGH | fixed | Gateway public methods/paths now match the actual Google initiation and callback. Unconfigured OAuth returns503 from Auth, rather than the stale gateway401. |
| FE-002 | HIGH | partially fixed | A dedicated callback page consumes the server fragment, removes credentials from history immediately, verifies the session and sends MFA challenges to the existing second-factor page. Query-token intake and unused redirect targets were removed. |
| FE-001 | HIGH | fixed | Billing fetches authoritative invoices with loading/error/retry/pagination and loads entitlements on entry. Fixed paid rows and fake download alerts were removed. Plan access never creates a receipt; paid provider invoices, pending payments and failures have distinct labels. |
| FE-005 | MEDIUM | fixed | Billing fetches authoritative invoices with loading/error/retry/pagination and loads entitlements on entry. Fixed paid rows and fake download alerts were removed. Plan access never creates a receipt; paid provider invoices, pending payments and failures have distinct labels. |
| FE-003 | HIGH | fixed | Profile read/save normalization retains backend MFA state. The identity card applies the complete authoritative saved profile. |
| FE-004 | HIGH | fixed | Validated session-scoped canvas mode distinguishes literal templates from generated bases. Literal elements/page settings persist through the existing backend canvas API, reload and hydration. Reset/undo/redo retain mode, undo flushes pending saves, and generation preserves literal presentation. |
| FE-006 | MEDIUM | fixed | Server-set refresh cookies are HttpOnly, same-site and Secure in production. Browser requests include credentials and coalesce one renewal; PostgreSQL rotates refresh sessions conditionally. Cookie refresh requires the configured Origin. Logout sends JSON, clears the cookie and cannot silently succeed on a failed server request. Guests clear earlier refresh cookies. |
| API-002 | MEDIUM | fixed | Removed four unused wrappers for nonexistent routes; active canvas/template APIs remain. |
| API-003 | MEDIUM | fixed | Reporting query failures return bounded503 messages, not HTTP200 exception payloads. Affected admin breakdown consumers propagate unavailable errors instead of empty success. |
| API-004 | HIGH | fixed | Subscription responses use persisted amount/currency/cadence, never current catalog monthly price or guessed USD. Unknown billing facts remain null. Admin tables display cadence and remove dollar/currency guesses from invoice views. |
| DATA-001 | HIGH | not fixed | No destructive purge or invented retention policy was introduced. The cross-store privacy/retention gap remains. |
| SEC-003 | MEDIUM | partially fixed | Refresh credentials are HttpOnly and the access cookie gains Secure on HTTPS. Callback credentials are removed from history and renewals use Origin validation. |
| CFG-001 | MEDIUM | fixed | Demo identity, token and quota branches are limited to development builds. Production asset scans reject their known sentinels. |
| OPS-001 | HIGH | partially fixed | Added an opt-in hourly encrypted off-host restic snapshot job with separate private repository/password/credential files, deployment lock, original key/config inclusion and bounded writer maintenance. It does not initialize repositories, rotate keys, prune or restore production data. |
| OPS-002 | MEDIUM | partially fixed | Added optional HTTPS heartbeat/alert integration, missing/stale backup detection, required-container health and additional filesystem thresholds. Payloads contain only time and bounded alert identifiers. |
| INF-001 | HIGH | not fixed | Existing immutable pins and vulnerability gates were preserved; no unbuilt base-image replacement was claimed safe. |
| INF-002 | HIGH | blocked | Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed. |
| INF-003 | HIGH | blocked | Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed. |
| INF-004 | HIGH | blocked | Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed. |
| DEV-001 | HIGH | blocked | Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed. |
| AI-001 | HIGH | not fixed | Re-evaluated actual candidates against unchanged production tool schemas and an explicit business-detail supplement. Integrity checks were not relaxed and neither candidate was approved. |
| AI-002 | HIGH | partially fixed | Fresh actual local inference, authenticated admin connectivity, full Chat->signed inference->Ollama->SSE, budget refusal and provider revocation were executed. Different free/pro model assignments propagated without redeployment. |
| PERF-001 | HIGH | partially fixed | Measured actual eight-client deterministic edits, concurrent local-model resource samples and a bounded480-edit native workload with think time. Restart and snapshot restore were measured. |
| PERF-002 | MEDIUM | not fixed | Preserved authoritative admission/budget locking and policy validation rather than removing security for throughput. |

### SEC-001 remediation

**HIGH — partially fixed**

Root cause: googleCallback performs token exchange/email lookup then signs and stores session directly.

Fix: OAuth now verifies state, S256 PKCE, signed Google ID-token issuer/audience/expiry/nonce/verified email, and account/verification/MFA policy before issuing sessions. Credentials and redirect origins must be configured; provider errors are sanitized.

Files: [services/auth/src/controllers/auth.controller.ts](../../services/auth/src/controllers/auth.controller.ts), [services/auth/src/services/google-oauth.service.ts](../../services/auth/src/services/google-oauth.service.ts), [services/auth/src/server.ts](../../services/auth/src/server.ts)

Regression commands:

- `node_modules/.bin/vitest run services/auth/src --maxWorkers=2`

Evidence: [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Actual RSA/JWT and handler regressions use local keys and explicit provider/database stubs. Real Google redirect, consent, account linking, provider replay and HTTPS cookie acceptance remain unexecuted; no production OAuth approval.

### SEC-002 remediation

**HIGH — fixed**

Root cause: used check precedes bcrypt work and transaction; later token update has no conditional unused predicate.

Fix: A conditional unused/unexpired token claim, password mutation, session deletion and durable access revocation commit together. Losing claims cannot mutate credentials. New recovery tokens are stored as digests; old unexpired hex links remain compatible. A stored digest is never accepted as a bearer.

Files: [services/auth/src/controllers/auth.controller.ts](../../services/auth/src/controllers/auth.controller.ts), [services/auth/src/services/access-revocation.service.ts](../../services/auth/src/services/access-revocation.service.ts), [services/auth/src/controllers/resetPassword.test.ts](../../services/auth/src/controllers/resetPassword.test.ts)

Regression commands:

- `node_modules/.bin/vitest run services/auth/src/controllers/resetPassword.test.ts`
- `.venv-local/bin/python scripts/production_remediation_security.py`

Evidence: [docs/production-remediation/evidence/runtime/security-acceptance.json](../../docs/production-remediation/evidence/runtime/security-acceptance.json)

Remaining scope: Actual gateway/Auth/PostgreSQL: one of eight succeeds, seven400; replay denied, old access/refresh denied, winning password works. Email challenge was seeded only in owned test DB; external mail delivery is not verified.

### DB-001 remediation

**HIGH — fixed**

Root cause: MAX numeric suffix+1 outside transaction plus INSERT OR REPLACE/upsert.

Fix: Staff creation uses UUIDs and insert-only SQL; save updates existing identities and preserves creation time. Normalized email uniqueness is enforced in SQLite/PostgreSQL; conflicts return409. Schema initialization rolls back on failure.

Files: [services/admin-api/app/repositories/admin_user_repository.py](../../services/admin-api/app/repositories/admin_user_repository.py), [services/admin-api/app/db/admin_db.py](../../services/admin-api/app/db/admin_db.py), [services/admin-api/migrations/202610210001_admin_identity.sql](../../services/admin-api/migrations/202610210001_admin_identity.sql), [services/admin-api/tests/test_staff_identity_remediation.py](../../services/admin-api/tests/test_staff_identity_remediation.py)

Regression commands:

- `.venv-local/bin/python -m pytest -q services/admin-api/tests`
- `.venv-local/bin/python scripts/production_remediation_security.py`

Evidence: [docs/production-remediation/evidence/runtime/security-acceptance.json](../../docs/production-remediation/evidence/runtime/security-acceptance.json)

Remaining scope: Real SQLite and real PostgreSQL concurrency preserve16distinct accounts; duplicate email409 preserves original role. Review legacy normalized-email duplicates before the additive index; no accounts are merged or deleted automatically.

### API-001 remediation

**HIGH — fixed**

Root cause: Stale allowlist /oauth/google and /oauth/callback differs from registered /login/google and /oauth/google/callback.

Fix: Gateway public methods/paths now match the actual Google initiation and callback. Unconfigured OAuth returns503 from Auth, rather than the stale gateway401.

Files: [services/gateway/src/middleware/auth.middleware.ts](../../services/gateway/src/middleware/auth.middleware.ts), [services/auth/src/server.ts](../../services/auth/src/server.ts)

Regression commands:

- `node_modules/.bin/vitest run services/auth/src services/gateway/src/middleware/__tests__ --maxWorkers=2`
- `.venv-local/bin/python scripts/production_remediation_security.py`

Evidence: [docs/production-remediation/evidence/runtime/security-acceptance.json](../../docs/production-remediation/evidence/runtime/security-acceptance.json), [docs/production-remediation/evidence/runtime/integrated-tests.json](../../docs/production-remediation/evidence/runtime/integrated-tests.json)

Remaining scope: Live Google acceptance remains part of SEC-001. No dummy client credentials or unvalidated redirects are used.

### FE-002 remediation

**HIGH — partially fixed**

Root cause: Auth redirects /oauth-callback#accessToken=...; App only reads query access_token and declares no callback route.

Fix: A dedicated callback page consumes the server fragment, removes credentials from history immediately, verifies the session and sends MFA challenges to the existing second-factor page. Query-token intake and unused redirect targets were removed.

Files: [user-frontend/src/App.tsx](../../user-frontend/src/App.tsx), [user-frontend/src/pages/OAuthCallbackPage.tsx](../../user-frontend/src/pages/OAuthCallbackPage.tsx), [user-frontend/src/api/auth.ts](../../user-frontend/src/api/auth.ts)

Regression commands:

- `npm run build --prefix user-frontend`
- `node_modules/.bin/vitest run services/auth/src/controllers/googleCallback.test.ts`

Evidence: [docs/production-remediation/evidence/runtime/browser-tests.json](../../docs/production-remediation/evidence/runtime/browser-tests.json)

Remaining scope: Live Google browser flow remains blocked by approved credentials/provider setup. Access tokens still enter browser memory; SEC-003 remains partial. Callback-specific external acceptance is not replaced by ordinary browser login.

### FE-001 remediation

**HIGH — fixed**

Root cause: Static date/price/status row gated by cached entitlements instead of billing invoice query.

Fix: Billing fetches authoritative invoices with loading/error/retry/pagination and loads entitlements on entry. Fixed paid rows and fake download alerts were removed. Plan access never creates a receipt; paid provider invoices, pending payments and failures have distinct labels.

Files: [user-frontend/src/pages/dashboard/DashboardBillingPage.tsx](../../user-frontend/src/pages/dashboard/DashboardBillingPage.tsx), [user-frontend/src/api/payment.ts](../../user-frontend/src/api/payment.ts), [user-frontend/src/api/__tests__/payment.test.ts](../../user-frontend/src/api/__tests__/payment.test.ts)

Regression commands:

- `node scripts/production_remediation_browser.mjs`

Evidence: [docs/production-remediation/evidence/runtime/billing-browser.json](../../docs/production-remediation/evidence/runtime/billing-browser.json)

Remaining scope: Actual pro override with zero invoice rows renders zero financial records and correct cold plan state. No synthetic paid invoice is used as provider acceptance. Real checkout/webhook/paid invoice download/refund requires approved test-provider credentials.

### FE-005 remediation

**MEDIUM — fixed**

Root cause: Billing reads quota/entitlements but does not fetch them on mount.

Fix: Billing fetches authoritative invoices with loading/error/retry/pagination and loads entitlements on entry. Fixed paid rows and fake download alerts were removed. Plan access never creates a receipt; paid provider invoices, pending payments and failures have distinct labels.

Files: [user-frontend/src/pages/dashboard/DashboardBillingPage.tsx](../../user-frontend/src/pages/dashboard/DashboardBillingPage.tsx), [user-frontend/src/api/payment.ts](../../user-frontend/src/api/payment.ts), [user-frontend/src/api/__tests__/payment.test.ts](../../user-frontend/src/api/__tests__/payment.test.ts)

Regression commands:

- `node scripts/production_remediation_browser.mjs`

Evidence: [docs/production-remediation/evidence/runtime/billing-browser.json](../../docs/production-remediation/evidence/runtime/billing-browser.json)

Remaining scope: Actual pro override with zero invoice rows renders zero financial records and correct cold plan state. No synthetic paid invoice is used as provider acceptance. Real checkout/webhook/paid invoice download/refund requires approved test-provider credentials.

### FE-003 remediation

**HIGH — fixed**

Root cause: users.getProfile/updateProfile omit twoFactorEnabled; ProfileIdentityCard replaces auth user; security card coerces omitted field false.

Fix: Profile read/save normalization retains backend MFA state. The identity card applies the complete authoritative saved profile.

Files: [user-frontend/src/api/users.ts](../../user-frontend/src/api/users.ts), [user-frontend/src/components/dashboard/ProfileIdentityCard.tsx](../../user-frontend/src/components/dashboard/ProfileIdentityCard.tsx), [user-frontend/src/api/__tests__/profile.test.ts](../../user-frontend/src/api/__tests__/profile.test.ts)

Regression commands:

- `node_modules/.bin/vitest run user-frontend/src/api/__tests__/profile.test.ts`
- `node scripts/production_remediation_browser_suite.mjs`

Evidence: [docs/production-remediation/evidence/runtime/browser-tests.json](../../docs/production-remediation/evidence/runtime/browser-tests.json)

Remaining scope: Actual TOTP enrollment followed by browser profile/reload shows the disable action. Production HTTPS and external OAuth MFA acceptance remain separate gates.

### FE-004 remediation

**HIGH — fixed**

Root cause: Apply replaces canvasElements, clears customElements/overrides, leaves builtin selectedTemplate; autosave payload omits canvasElements and local persistence strips them.

Fix: Validated session-scoped canvas mode distinguishes literal templates from generated bases. Literal elements/page settings persist through the existing backend canvas API, reload and hydration. Reset/undo/redo retain mode, undo flushes pending saves, and generation preserves literal presentation.

Files: [shared/canvas-layout.mjs](../../shared/canvas-layout.mjs), [shared/canvas-layout.d.mts](../../shared/canvas-layout.d.mts), [user-frontend/src/types/index.ts](../../user-frontend/src/types/index.ts), [user-frontend/src/store/documentStore.ts](../../user-frontend/src/store/documentStore.ts), [user-frontend/src/store/__tests__/documentHydration.test.ts](../../user-frontend/src/store/__tests__/documentHydration.test.ts), [shared/tests/canvas-layout.test.mjs](../../shared/tests/canvas-layout.test.mjs)

Regression commands:

- `node_modules/.bin/vitest run user-frontend/src/store/__tests__/documentHydration.test.ts user-frontend/src/store/__tests__/documentExport.test.ts --maxWorkers=2`
- `node scripts/production_remediation_custom_template.mjs`

Evidence: [docs/production-remediation/evidence/runtime/custom-template-reload.json](../../docs/production-remediation/evidence/runtime/custom-template-reload.json)

Remaining scope: Actual Apply -> backend save -> same-session reload passes. Legacy layouts default to template mode; original lost snapshots cannot be reconstructed. Literal templates stay literal; production PDF sandbox acceptance remains blocked.

### FE-006 remediation

**MEDIUM — fixed**

Root cause: API wrappers consume access token; frontend has no refresh call; backend refresh exists.

Fix: Server-set refresh cookies are HttpOnly, same-site and Secure in production. Browser requests include credentials and coalesce one renewal; PostgreSQL rotates refresh sessions conditionally. Cookie refresh requires the configured Origin. Logout sends JSON, clears the cookie and cannot silently succeed on a failed server request. Guests clear earlier refresh cookies.

Files: [services/auth/src/controllers/auth.controller.ts](../../services/auth/src/controllers/auth.controller.ts), [services/auth/src/routes/auth.routes.ts](../../services/auth/src/routes/auth.routes.ts), [user-frontend/src/api/client.ts](../../user-frontend/src/api/client.ts), [user-frontend/src/api/auth.ts](../../user-frontend/src/api/auth.ts), [user-frontend/src/store/authStore.ts](../../user-frontend/src/store/authStore.ts), [user-frontend/src/components/common/Navbar.tsx](../../user-frontend/src/components/common/Navbar.tsx), [user-frontend/src/components/common/LogoutConfirmModal.tsx](../../user-frontend/src/components/common/LogoutConfirmModal.tsx), [user-frontend/src/api/__tests__/refresh.test.ts](../../user-frontend/src/api/__tests__/refresh.test.ts), [user-frontend/src/api/__tests__/guest.test.ts](../../user-frontend/src/api/__tests__/guest.test.ts), [user-frontend/src/store/__tests__/guestAuth.test.ts](../../user-frontend/src/store/__tests__/guestAuth.test.ts)

Regression commands:

- `node_modules/.bin/vitest run services/auth/src user-frontend/src/store/__tests__ user-frontend/src/api/__tests__ --maxWorkers=2`
- `node scripts/production_remediation_browser.mjs`

Evidence: [docs/production-remediation/evidence/runtime/security-acceptance.json](../../docs/production-remediation/evidence/runtime/security-acceptance.json), [docs/production-remediation/evidence/runtime/billing-browser.json](../../docs/production-remediation/evidence/runtime/billing-browser.json)

Remaining scope: Actual origin rejection, cookie rotation, browser reload renewal and logout/no automatic reauthentication pass. Native tests use HTTP; target TLS/Secure attributes and multi-tab races still require staging acceptance. Legacy bearer clients remain compatible.

### API-002 remediation

**MEDIUM — fixed**

Root cause: Legacy admin payment/templates create and document layout/content wrappers remain after integration changes.

Fix: Removed four unused wrappers for nonexistent routes; active canvas/template APIs remain.

Files: [admin/src/api/adminApiClient.ts](../../admin/src/api/adminApiClient.ts), [user-frontend/src/api/documents.ts](../../user-frontend/src/api/documents.ts)

Regression commands:

- `npm run build --prefix admin`
- `npm run build --prefix user-frontend`

Evidence: [docs/production-remediation/evidence/runtime/browser-tests.json](../../docs/production-remediation/evidence/runtime/browser-tests.json)

Remaining scope: Static import review and builds; no assertion that every remaining API action is integrated.

### API-003 remediation

**MEDIUM — fixed**

Root cause: except Exception returns {error:str(e)} instead of typed non-success response.

Fix: Reporting query failures return bounded503 messages, not HTTP200 exception payloads. Affected admin breakdown consumers propagate unavailable errors instead of empty success.

Files: [services/analytics/app/routers/analytics.py](../../services/analytics/app/routers/analytics.py), [services/analytics/tests/test_authorization.py](../../services/analytics/tests/test_authorization.py), [services/admin-api/app/integrations/services/analytics_client.py](../../services/admin-api/app/integrations/services/analytics_client.py), [services/admin-api/tests/test_analytics_unavailable_remediation.py](../../services/admin-api/tests/test_analytics_unavailable_remediation.py), [services/admin-api/tests/test_analytics_and_posthog.py](../../services/admin-api/tests/test_analytics_and_posthog.py)

Regression commands:

- `env PYTHONPATH=services/analytics:. .venv-local/bin/python -m pytest -q services/analytics/tests`
- `.venv-local/bin/python -m pytest -q services/admin-api/tests`

Evidence: [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Query/transport failure tests are isolated with explicit fault injection. Existing unrelated dashboard fallback semantics are not universally certified.

### API-004 remediation

**HIGH — fixed**

Root cause: adminListSubscriptions hardcodes currency USD and amount plan.priceMonthly.

Fix: Subscription responses use persisted amount/currency/cadence, never current catalog monthly price or guessed USD. Unknown billing facts remain null. Admin tables display cadence and remove dollar/currency guesses from invoice views.

Files: [services/payment/src/controllers/payment.controller.ts](../../services/payment/src/controllers/payment.controller.ts), [services/payment/src/services/subscription-display.service.ts](../../services/payment/src/services/subscription-display.service.ts), [services/payment/src/__tests__/subscription-display.test.ts](../../services/payment/src/__tests__/subscription-display.test.ts), [admin/src/api/adminApiTypes.ts](../../admin/src/api/adminApiTypes.ts), [admin/src/pages/subviews/SubscriptionsView.tsx](../../admin/src/pages/subviews/SubscriptionsView.tsx)

Regression commands:

- `npm run test -w doccraft-payment`
- `npm run build --prefix admin`

Evidence: [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: USD/LKR minor-unit mapping is regression-tested with explicit synthetic inputs, not represented as paid-provider acceptance. Legacy unknown or unsupported currency facts are not guessed; reconciliation is required.

### DATA-001 remediation

**HIGH — not fixed**

Root cause: Purge anonymizes Auth and document.userEmail only; no chat/content/PDF purge in current route.

Fix: No destructive purge or invented retention policy was introduced. The cross-store privacy/retention gap remains.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- Not executed: required operator prerequisites or policy are unavailable.

Evidence: Original audit evidence; no positive remediation acceptance.

Remaining scope: Operator/product retention decisions and resumable complete export/deletion across chats, documents/assets and billing retention are required. Do not advertise complete erasure from the current partial purge.

### SEC-003 remediation

**MEDIUM — partially fixed**

Root cause: client setCookieToken uses SameSite=Lax only and mirrors token to localStorage.

Fix: Refresh credentials are HttpOnly and the access cookie gains Secure on HTTPS. Callback credentials are removed from history and renewals use Origin validation.

Files: [services/auth/src/controllers/auth.controller.ts](../../services/auth/src/controllers/auth.controller.ts), [user-frontend/src/api/client.ts](../../user-frontend/src/api/client.ts), [user-frontend/src/pages/OAuthCallbackPage.tsx](../../user-frontend/src/pages/OAuthCallbackPage.tsx)

Regression commands:

- `node scripts/production_remediation_browser.mjs`

Evidence: [docs/production-remediation/evidence/runtime/billing-browser.json](../../docs/production-remediation/evidence/runtime/billing-browser.json)

Remaining scope: Access tokens remain JavaScript-readable in localStorage/cookies. A complete HttpOnly session/BFF and XSS/CSRF architecture decision plus production TLS/browser verification remains; no XSS exploit or comprehensive security pass is claimed.

### CFG-001 remediation

**MEDIUM — fixed**

Root cause: Demo branches are ordinary application code rather than explicitly gated build targets.

Fix: Demo identity, token and quota branches are limited to development builds. Production asset scans reject their known sentinels.

Files: [user-frontend/src/store/authStore.ts](../../user-frontend/src/store/authStore.ts), [user-frontend/src/store/chatStore.ts](../../user-frontend/src/store/chatStore.ts), [user-frontend/src/store/quotaStore.ts](../../user-frontend/src/store/quotaStore.ts), [user-frontend/src/store/documentStore.ts](../../user-frontend/src/store/documentStore.ts), [user-frontend/src/api/client.ts](../../user-frontend/src/api/client.ts), [user-frontend/src/pages/BuilderPage.tsx](../../user-frontend/src/pages/BuilderPage.tsx)

Regression commands:

- `env NODE_ENV=production npm run build --prefix user-frontend`
- `python3 deploy/scripts/check-build-secrets.py admin/dist user-frontend/dist`

Evidence: [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Native fixtures now explicitly build frontends with NODE_ENV=production. Demo helpers remain available in development; this never constituted a backend JWT bypass.

### OPS-001 remediation

**HIGH — partially fixed**

Root cause: Controller backup occurs before rollout; timer only monitors; off-host retention is an operator instruction.

Fix: Added an opt-in hourly encrypted off-host restic snapshot job with separate private repository/password/credential files, deployment lock, original key/config inclusion and bounded writer maintenance. It does not initialize repositories, rotate keys, prune or restore production data.

Files: [deploy/scripts/backup_remote.py](../../deploy/scripts/backup_remote.py), [deploy/doccraft-backup.service](../../deploy/doccraft-backup.service), [deploy/doccraft-backup.timer](../../deploy/doccraft-backup.timer), [deploy/config/backup.policy.example.json](../../deploy/config/backup.policy.example.json), [deploy/tests/test_operations_remediation.py](../../deploy/tests/test_operations_remediation.py)

Regression commands:

- `python3 -m unittest discover -s deploy/tests`

Evidence: [docs/production-remediation/evidence/runtime/backup-restore.json](../../docs/production-remediation/evidence/runtime/backup-restore.json)

Remaining scope: Actual native73-table snapshot restore passes. Restic, private remote policy/credentials, retention/immutability, maintenance-window approval, encrypted upload and full-host/key/asset restore are not accepted. Timer was not installed. No RPO/RTO achievement is claimed.

### OPS-002 remediation

**MEDIUM — partially fixed**

Root cause: Local JSON timer and private metrics have no external heartbeat/page integration.

Fix: Added optional HTTPS heartbeat/alert integration, missing/stale backup detection, required-container health and additional filesystem thresholds. Payloads contain only time and bounded alert identifiers.

Files: [deploy/scripts/controller.py](../../deploy/scripts/controller.py), [deploy/scripts/operations_alerts.py](../../deploy/scripts/operations_alerts.py), [deploy/config/monitoring.policy.example.json](../../deploy/config/monitoring.policy.example.json), [deploy/tests/test_operations_remediation.py](../../deploy/tests/test_operations_remediation.py)

Regression commands:

- `python3 -m unittest discover -s deploy/tests`

Evidence: [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Delivery tests use explicit transport stubs. Operator endpoint/check timeout/notification ownership, disk-exhaustion/whole-host-loss alerts and actual alert receipt remain unconfigured/unexecuted.

### INF-001 remediation

**HIGH — not fixed**

Root cause: Digest pins preserve old package versions; CI blocks but does not remediate vulnerable bases.

Fix: Existing immutable pins and vulnerability gates were preserved; no unbuilt base-image replacement was claimed safe.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- Not executed: required operator prerequisites or policy are unavailable.

Evidence: [docs/devops/evidence/base-image-scans.json](../../docs/devops/evidence/base-image-scans.json)

Remaining scope: Triage/fix advisory findings, build and scan final application layers for the target architecture. Exploitability is not established solely by scanner severity.

### INF-002 remediation

**HIGH — blocked**

Root cause: Development environment has CLI/Compose only.

Fix: Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- `python3 -m unittest discover -s deploy/tests`
- `.local/hybrid-live/tools/actionlint/actionlint`
- `.local/ci-tools/terraform fmt -check -recursive terraform`
- `.local/ci-tools/terraform -chdir=terraform validate`

Evidence: [docs/production-remediation/evidence/runtime/pdf-readiness.json](../../docs/production-remediation/evidence/runtime/pdf-readiness.json), [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Docker daemon/target VPS, chosen provider/remote state, approved GHCR/SSH/GitHub environment and real migration/rollback/TLS/PDF-sandbox/container acceptance remain required. Normal signed PDF readiness503/render500 persists; sandbox was not weakened.

### INF-003 remediation

**HIGH — blocked**

Root cause: No chosen provider or authorized infrastructure credentials.

Fix: Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- `python3 -m unittest discover -s deploy/tests`
- `.local/hybrid-live/tools/actionlint/actionlint`
- `.local/ci-tools/terraform fmt -check -recursive terraform`
- `.local/ci-tools/terraform -chdir=terraform validate`

Evidence: [docs/production-remediation/evidence/runtime/pdf-readiness.json](../../docs/production-remediation/evidence/runtime/pdf-readiness.json), [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Docker daemon/target VPS, chosen provider/remote state, approved GHCR/SSH/GitHub environment and real migration/rollback/TLS/PDF-sandbox/container acceptance remain required. Normal signed PDF readiness503/render500 persists; sandbox was not weakened.

### INF-004 remediation

**HIGH — blocked**

Root cause: Operator repository/VPS bootstrap is not configured in this environment.

Fix: Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- `python3 -m unittest discover -s deploy/tests`
- `.local/hybrid-live/tools/actionlint/actionlint`
- `.local/ci-tools/terraform fmt -check -recursive terraform`
- `.local/ci-tools/terraform -chdir=terraform validate`

Evidence: [docs/production-remediation/evidence/runtime/pdf-readiness.json](../../docs/production-remediation/evidence/runtime/pdf-readiness.json), [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Docker daemon/target VPS, chosen provider/remote state, approved GHCR/SSH/GitHub environment and real migration/rollback/TLS/PDF-sandbox/container acceptance remain required. Normal signed PDF readiness503/render500 persists; sandbox was not weakened.

### DEV-001 remediation

**HIGH — blocked**

Root cause: Chromium sandbox/host compatibility requires actual production container/kernel acceptance.

Fix: Performed available static validation and native checks; no production provisioning, deployment or fake acceptance was performed.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- `python3 -m unittest discover -s deploy/tests`
- `.local/hybrid-live/tools/actionlint/actionlint`
- `.local/ci-tools/terraform fmt -check -recursive terraform`
- `.local/ci-tools/terraform -chdir=terraform validate`

Evidence: [docs/production-remediation/evidence/runtime/pdf-readiness.json](../../docs/production-remediation/evidence/runtime/pdf-readiness.json), [docs/production-remediation/evidence/verification.json](../../docs/production-remediation/evidence/verification.json)

Remaining scope: Docker daemon/target VPS, chosen provider/remote state, approved GHCR/SSH/GitHub environment and real migration/rollback/TLS/PDF-sandbox/container acceptance remain required. Normal signed PDF readiness503/render500 persists; sandbox was not weakened.

### AI-001 remediation

**HIGH — not fixed**

Root cause: Nested tool schema/evidence/field mapping failures and timeouts.

Fix: Re-evaluated actual candidates against unchanged production tool schemas and an explicit business-detail supplement. Integrity checks were not relaxed and neither candidate was approved.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- `.venv-local/bin/python scripts/production_remediation_ai.py --model qwen3:1.7b-q4_K_M --limit 112 --label remediation-1.7b`
- `.venv-local/bin/python scripts/production_remediation_ai.py --model qwen3:4b-q4_K_M --limit 16 --label remediation-4b --context 4096`
- `.venv-local/bin/python scripts/production_remediation_business_scenarios.py`

Evidence: [docs/production-remediation/evidence/ai/validated-1.7b.json](../../docs/production-remediation/evidence/ai/validated-1.7b.json), [docs/production-remediation/evidence/ai/validated-4b.json](../../docs/production-remediation/evidence/ai/validated-4b.json), [docs/production-remediation/evidence/ai/business-supplement/validated.json](../../docs/production-remediation/evidence/ai/business-supplement/validated.json)

Remaining scope: Fresh real proposals:23/112 small,4/16 larger bounded sample,0/8 extra business details. These are proposal accuracy, not committed document success; context/thread/workload differences prevent a controlled ranking. A capable approved model and applied conversation acceptance are still needed.

### AI-002 remediation

**HIGH — partially fixed**

Root cause: Shared host memory/swap pressure; no approved cloud test credentials or Docker/VPS.

Fix: Fresh actual local inference, authenticated admin connectivity, full Chat->signed inference->Ollama->SSE, budget refusal and provider revocation were executed. Different free/pro model assignments propagated without redeployment.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- `.venv-local/bin/python scripts/production_remediation_live_ai.py`

Evidence: [docs/production-remediation/evidence/runtime/live-ai-integration.json](../../docs/production-remediation/evidence/runtime/live-ai-integration.json), [docs/production-remediation/evidence/runtime/plan-models.json](../../docs/production-remediation/evidence/runtime/plan-models.json)

Remaining scope: Small candidate needed a16384 configured context for the integrated question;8192 conservative byte-budget attempt was refused before dispatch. Real cloud fallback/spend, target containers and full mixed production load remain blocked. Health probes do not certify model intelligence.

### PERF-001 remediation

**HIGH — partially fixed**

Root cause: No target VPS/cgroup runtime, long run, storage/network benchmark or agreed SLO.

Fix: Measured actual eight-client deterministic edits, concurrent local-model resource samples and a bounded480-edit native workload with think time. Restart and snapshot restore were measured.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- `.venv-local/bin/python scripts/production_remediation_workload.py`
- `.venv-local/bin/python .local/production-remediation/sustained_workload.py`

Evidence: [docs/production-remediation/evidence/runtime/http-workload.json](../../docs/production-remediation/evidence/runtime/http-workload.json), [docs/production-remediation/evidence/runtime/native-sustained-workload.json](../../docs/production-remediation/evidence/runtime/native-sustained-workload.json), [docs/production-remediation/evidence/resource-summary.json](../../docs/production-remediation/evidence/resource-summary.json)

Remaining scope: Short shared-desktop native runs do not establish sustainable production throughput, an8GB minimum, cgroup enforcement, disk/network capacity, PDF+AI SLOs or lowest-cost VPS pricing. Benchmark the actual approved target.

### PERF-002 remediation

**MEDIUM — not fixed**

Root cause: Authoritative calls and100ms queue polling serialize budget/admission transactions.

Fix: Preserved authoritative admission/budget locking and policy validation rather than removing security for throughput.

Files: No product change; prerequisite or policy remains unresolved.

Regression commands:

- Not executed: required operator prerequisites or policy are unavailable.

Evidence: Original audit evidence; no positive remediation acceptance.

Remaining scope: Potential lock/fan-out contention requires target queue/admission wait measurements under representative mixed load before optimizing transactions.
