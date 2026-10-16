# Overall system report

<!-- PHASE4_STATUS -->
## Phase 4 — Current status (2026-10-16)

**Production: NOT READY. Staging: prepared, deployment verification blocked.** Actual final native integration: **214 VERIFIED, 2 BLOCKED, 0 UNRESOLVED**. Full regression orchestration: **17 PASS, 1 BLOCKED, 2 OPEN_FINDINGS** across 20 checks. Browser/PDF rendering is blocked by the host sandbox; frontend build dependency advisories remain open. No external provider workflow or Docker deployment is claimed successful.

Current policy is **Free 3 / Pro 10 / Max 25 shared metered units per account**, each outbound AI request plus each server PDF, **20 hours from first accepted use**, admin configurable. Browser exports remain unmetered. Retention defaults and legacy cutover still need owner decisions.

Authoritative entitlements, durable payment reducer/outbox and billing downstream SQL receipts, PostgreSQL quota/window recovery, secure owner/public uploaded-template versions, encrypted single-use TOTP, durable session revocation, scoped DB roles/TLS/replay-loss controls and staging tooling have implementation/regression evidence. The original release groups remain partial or externally blocked because their full acceptance criteria have not passed.



Current sources: [16 release blockers](16-PHASE4_RELEASE_BLOCKERS.md), [17 staging guide](17-STAGING_DEPLOYMENT_GUIDE.md), [18 production checklist](18-PRODUCTION_READINESS_CHECKLIST.md), [19 final results](19-FINAL_INTEGRATION_TEST_RESULTS.md), [full technical workflow](../../DOCCRAFT_FULL_TECHNICAL_WORKFLOW.md).

**Everything below this Phase 4 preface is preserved historical evidence unless explicitly updated.** Earlier midnight quota semantics, unlimited Pro descriptions, absent upload pipeline and unresolved TOTP replay statements are superseded by the current reports; historical browser success is not Phase 4 browser evidence.
<!-- END_PHASE4_STATUS -->

## Phase 3 — Historical status (2026-10-15)

**Production readiness: NOT READY.** Latest actual isolated stack: **160/160 assertions verified**; Security-category assertions: **64/64**; actual browser assertions: **11 verified** (overlap with the stack, not additive). Pairwise service identities, receiving-service authorization/replay checks, signed jobs/events, Redis ACLs, current-account/session revocation, renderer isolation and request limits have implementation and regression evidence. Guest transfer, session canvas persistence/browser export, bundled template availability and currency-separated reporting were implemented and tested to the scope in the Phase 3 report.

The nine carried original findings are assessed individually in [15-PHASE3_REMEDIATION_REPORT.md](15-PHASE3_REMEDIATION_REPORT.md). U-R11 is fixed for tested draft/layout/export paths; the others remain partial, unresolved or externally blocked. Unified entitlements, ordered billing and quota crash repair, uploaded template authoring, deployment TLS/database privilege/rotation proof, residual build-tool advisories and actual provider sandboxes remain release requirements. Phase 2 numbers and architecture statements below are historical and superseded where Phase 3 changes them.

Current evidence: [security audit](12-MICROSERVICES_SECURITY_AUDIT.md), [communication matrix / trust diagrams](13-INTER_SERVICE_COMMUNICATION.md), [security tests](14-SECURITY_TEST_RESULTS.md), [remediation](15-PHASE3_REMEDIATION_REPORT.md).

## Historical Phase 2 / Phase 1 evidence

> Current status: Phase 2 evidence below supersedes historical Phase 1 dispositions. Release decision: **NOT READY**.

## Phase 2 — Remediation and Production Readiness Verification

**Current decision: NOT READY.** Phase 2 resolved **6 of the original 15 source finding groups**; **9 remain partially corrected, unresolved or blocked**. The work corrected **13 additional defect groups**. Original findings are not all code bugs: product gaps, provider access and credential/deployment evidence remain separate.

Both frontend lint checks and all three build commands pass. The latest real local stack run has **89/89 verified assertions**, with **6/6 actual browser assertions**. These overlap by design: the stack includes a browser-harness completion assertion. Mocked tests are not counted as live provider verification.

Current discovery: **694 scanned text files, 1368 source inventory entries, 81 admin navigation IDs**. Phase 1's 666/1369 counts are historical; source deletions/additions change the inventory. Entries are definitions, not independent completed business features. All current entries are listed in the updated coverage appendix; no overall functionality percentage is justified.

Phase 2 changed **171 source/configuration/documentation-tooling files relative to the saved Phase 2 baseline**, plus all 13 requested reports and generated evidence. This is not the count of the entire dirty Git tree; pre-existing Phase 1/unrelated changes were preserved. See [phase2-changed-files.json](evidence/phase2/phase2-changed-files.json) and [phase2-summary.json](evidence/phase2/phase2-summary.json).

### Product decisions

The user decided that administrators select billing currency and explicit prices. Implemented supported choices are **USD and LKR**, with separate monthly/yearly amounts; there is no guessed exchange-rate conversion. Checkout validates the selected currency against the chosen provider. This does not add arbitrary-currency support.

The user also chose **AI chat requests plus generated documents** as the daily quota unit. The UI now says “AI chat requests + server PDF generations per day.” Provider-requiring AI turns and server generations reserve units; deterministic field edits do not call a provider. Browser-side canvas export remains a separate path and does not currently enforce the same server generation meter; that gap remains U-R08/U-R11. The legacy `monthly_quota` field name stores the daily allowance for wire compatibility.

### Local environment and evidence boundaries

Execution used an owned PostgreSQL 18.4 instance on loopback, independent uniquely named databases per run, an isolated Redis process and synthetic credentials. Four services ran their actual checked-in Prisma migrations; SQLAlchemy/custom SQL components initialized against that isolated database. Node services, two FastAPI apps, the PDF worker, Chromium and both Vite frontends ran as real local processes. The Analytics service's standalone authorization suite used disposable SQLite; it was not part of the live nine-process harness. No configured hosted database, real charge, real email, Firebase account or Supabase bucket was mutated.

The binaries and temporary cluster were outside Git. The database harness accepts only a loopback `PG_AUDIT_URL`, creates a unique database and never resets an existing database. Its local migration/browser/PDF artifacts are reviewable. Fresh-schema success does not validate an upgrade against a deployed legacy database.

### Original findings tracker

| ID | Severity | Component | Root cause | Fix plan / implemented correction | Verification / remaining dependency | Status |
| --- | --- | --- | --- | --- | --- | --- |
| U-R01 | High | Admin / Payment / Quota databases | Incompatible physical plans, coupons and audit_logs ownership | Namespaced admin tables and quota audit table; additive legacy-copy compatibility; reconciled checked-in migrations | Fresh PostgreSQL migrate deploy for four Prisma services; 97 admin tests include legacy-copy cases | FIXED |
| U-R02 | High | Pricing / checkout / billing | Static prices and USD values treated as LKR; benefits and actual limits diverged | Admin chooses USD/LKR and explicit amounts; canonical catalog and currency-compatible provider; annual checkout intent and live quota updates | Real admin price UI → PostgreSQL → user pricing reload; signed local annual PayHere lifecycle. Provider sandbox and mixed-currency financial reporting remain open | UNRESOLVED — partial correction |
| U-R03 | High | Active Groq model routing | Unused Claude ceiling did not constrain active Groq fallback | Intersect deployment Groq models with per-plan administrator allowlist; fail closed on policy outage; five-second refresh | Three policy units, provider-loop regressions and builds; actual external model behavior remains BLOCKED | FIXED |
| U-R04 | High | Entitlements / user gates | Plan features and separate feature_flags domain do not consistently control logo, templates, priority, retention or Max behavior | Canonical displayed benefits improved; implement an authoritative entitlement response and connect each remaining consumer | Source traces only for unresolved gates; complete toggle matrix NOT TESTED | UNRESOLVED |
| U-R05 | High | Payment method management | Process-memory metadata imitated payment method persistence | Remove raw card CRUD UI/store; provider-hosted billing portal; unsupported raw-card mutations return 501 | Payment unit regressions, frontend contracts/build; provider-hosted portal remains externally BLOCKED | FIXED — unsafe local flow removed |
| U-R06 | High | Templates / announcements | Placeholder publication modules; no user announcement consumer | Authenticated announcements now reach user banner; empty/error states replace fake template publishing success. Publication pipeline still absent | Actual create/read/disable/delete announcement APIs and user feed verified; template publication NOT IMPLEMENTED | UNRESOLVED — partial correction |
| U-R07 | High | Payment webhook worker | Check/effect/mark spans services; no atomic claim/outbox or ordered reconciliation | Fix callback ownership, recurring IDs, BullMQ IDs and invoice retry behavior; design transactional outbox/order reconciliation separately | Eight concurrent signed local duplicates yield one invoice; worker crash windows, reordered callbacks and real sandbox remain unverified | UNRESOLVED — partial correction |
| U-R08 | High | Quota / document worker | Mixed metering wording, unowned/non-idempotent refunds and incomplete crash recovery | User chose AI requests plus server generations; explicit wording; owned reservation/refund receipts; preserve successful PDF jobs and refund terminal failure once | Real Redis 12-way duplicate reserve/refund tests; quota units; five actual worker exports. Cross-store crash/day-reset reconciliation and browser export metering remain open | UNRESOLVED — partial correction |
| U-R09 | Medium | Both frontends | Unsafe any contracts, invalid effects/ref reads, unused code and purity violations | Explicit API/domain types; committed event callbacks, effect dependencies, ref/state ownership and keyed forms; no rule suppression or exclusion changes | Both npm run lint commands and both frontend builds PASS | FIXED |
| U-R10 | High | Deployment credentials | Formerly embedded defaults may remain active in history/deployments | Owner must revoke/rotate any affected database/provider/signing/internal/bootstrap credentials and verify consistent secret delivery | No production credential validity or revocation attempted; proof is unavailable locally | BLOCKED |
| U-R11 | Medium | Guest / canvas / history | Guest identity transition resets builder; server state, canvas layout and browser PDF/history have distinct persistence contracts | Wire actual chat-session history open/delete and display accurate state/currency; persistent canvas layout and guest migration still require implementation | Actual authenticated session save/reload/delete and server PDF verified; guest-to-account transfer and browser layout/export reload NOT TESTED / NOT IMPLEMENTED | UNRESOLVED — partial correction |
| U-R12 | High | Analytics / admin authentication / abuse | Direct analytics authorization gaps; OTP attempts and submission abuse insufficiently controlled | Protect direct reporting/events with internal secret or Auth verification; atomically limit/consume admin email challenges; secure private notification config feed | Analytics authorization units, admin challenge/concurrency tests and 123 API denial probes. Public support abuse, action-TOTP budgets and full session revocation remain open | UNRESOLVED — partial correction |
| U-R13 | Medium | Readiness / capacity / recovery | Liveness-only checks; repeated Chromium startup and unknown dependency capacity | Shared bounded Chromium process, page/launch timeouts, readiness and explicit overload response; measure narrow local burst/restart behavior | Five queued PDFs plus renderer capacity/recovery probe when recorded; service-wide dependency readiness, capacity and queue-drain benchmarks NOT TESTED | UNRESOLVED — partial correction |
| U-R14 | Medium | Configuration / migrations / test tooling | Chat port drift, missing Prisma migrations and unsafe stale document test entry point | Correct chat fallback port; add schema-compatible checked-in migrations; isolated local harness; legacy document entry point now launches isolated pytest | Four actual Prisma migrate deploy runs, all local services start, document legacy entry point 69 tests PASS. Existing deployment baselines still require review | FIXED — local tooling/schema scope |
| U-R15 | Medium | Admin MCP inspection | Wrong auth/transport lifecycle and no live resource inspection consumer | Private credential-gated read-only Streamable HTTP MCP, initialize/initialized/resources-read lifecycle, audited support RBAC endpoint and actual admin inspection UI | Five real resource reads, two private transport authorization units and live browser session inspection | FIXED |

### Verification results

| Check | Latest result | Scope / observed count | Evidence |
| --- | --- | --- | --- |
| Backend workspaces build | PASS | PASS | [phase2-build-after-quota-fix](evidence/phase2-build-after-quota-fix.json) |
| User frontend lint | PASS | PASS | [phase2-last-user-lint](evidence/phase2-last-user-lint.json) |
| Admin frontend lint | PASS | PASS | [phase2-last-admin-lint](evidence/phase2-last-admin-lint.json) |
| User frontend build | PASS | PASS | [phase2-last-user-build](evidence/phase2-last-user-build.json) |
| Admin frontend build | PASS | PASS | [phase2-last-admin-build](evidence/phase2-last-admin-build.json) |
| Shared + chat/frontend contract regressions | PASS | 223 Node tests + 216 Vitest tests passed | [phase2-final-valid-account-regression](evidence/phase2-final-valid-account-regression.json) |
| Auth units/contracts | PASS | 35 passed | [phase2-final-auth](evidence/phase2-final-auth.json) |
| Payment units/contracts | PASS | 62 passed | [phase2-final-payment](evidence/phase2-final-payment.json) |
| Quota units/contracts | PASS | 25 passed; later durable-removal route verified in actual stack | [phase2-final-quota-route-regression](evidence/phase2-final-quota-route-regression.json) |
| Gateway / notification security / real CORS | PASS | 37 passed; some root-suite overlap | [phase2-final-gateway-notification](evidence/phase2-final-gateway-notification.json) |
| Admin API units/in-process contracts | PASS | 97 passed | [phase2-final-admin-validation](evidence/phase2-final-admin-validation.json) |
| Analytics authorization | PASS | 3 passed | [phase2-final-analytics-tests](evidence/phase2-final-analytics-tests.json) |
| Legacy document entry point / isolated pytest | PASS | 69 passed | [phase2-final-document-tests](evidence/phase2-final-document-tests.json) |
| Mounted admin API denial probes | PASS | 123 denied as expected; 133 mounted method/path operations | [phase2-final-api-auth](evidence/phase2-final-api-auth.json) |
| Real migrated stack / admin / billing / chat / worker | PASS | 89/89 VERIFIED | [phase2-final-tax-crud-stack](evidence/phase2-final-tax-crud-stack.json) |
| Renderer PDF/security, capacity/recovery, browser error states | PASS | 18 PDF probes; 96 browser scenarios; see exact command result | [phase2-probes-recovery-retest](evidence/phase2-probes-recovery-retest.json) |

Environment prerequisites: [environment.json](evidence/phase2/environment.json). Exploratory quality diagnostics are retained under `evidence/phase2/manual-quality-diagnostics/`; final wrapped checks above are authoritative. The owned PostgreSQL fixture was stopped after verification; application processes were cleaned up and isolated data files retained.

### Report validation

All 13 requested Markdown reports retain Phase 1 evidence and current Phase 2 coverage. Link/fence/Python/Compose checks are retained as wrapped artifact-validation commands.

### Readiness

| Area | Evidence | Gate status |
| --- | --- | --- |
| Builds / types / lint | Backend and both frontends build; both configured lint commands pass | VERIFIED locally |
| Authentication / authorization | Real registration/verification/login/profile/status checks; role and ownership regressions; 123 denial probes | PARTIAL — interactive Google and complete session revocation not verified |
| Database | Checked-in fresh migrations + shared-service CRUD; legacy-copy unit cases | PARTIAL — deployed upgrade/baseline/rollback review required |
| AI chat | Deterministic multi-turn persisted edits; provider/tool mocks and active model policy tests | BLOCKED — live provider intelligence/fallback not tested |
| Documents | Five real worker exports; template PDF/security suite; authenticated persistence/deletion | PARTIAL — browser canvas layout/guest migration/sharing matrix |
| Billing / quotas | Signed local PayHere annual lifecycle, duplicate callbacks, actual entitlements, concurrent Lua receipts | PARTIAL — real provider lifecycle, event order/crash reconciliation and mixed-currency revenue |
| Admin | Real plan UI, MCP inspection, overrides, announcements, status/config propagation | PARTIAL — not every CRUD/control across all 81 sections |
| Infrastructure / recovery | Local startup; bounded renderer readiness/burst/restart where evidenced | PARTIAL — containers, full load, dependency readiness and recovery drills |
| Security / observability | Confirmed local boundary fixes and tests; durable audit/error evidence | BLOCKED — owner credential rotation evidence; abuse/session/outbox gaps |

### Remaining work

- Implement and test ordered transactional payment event claims/outbox/reconciliation, quota crash/day-boundary accounting and durable override expiry/recovery; include out-of-order and restart fault injection.
- Finish one authoritative entitlement contract for every feature consumer; complete template publication and the guest/canvas/browser-export persistence contract. Verify successful user/admin CRUD for the remaining inventory entries.
- Repair currency-aware financial aggregation; LKR and USD must not be summed or labeled as USD without an explicit approved conversion policy. Verify real sandbox upgrade/downgrade/cancel/refund/trial/coupon rules and advertised benefits.
- Provide controlled sandbox resources for Groq/Claude, Firebase, Paddle/PayHere, Resend and Supabase, then run their actual workflows. Provider mocks and signed local callbacks cannot clear those gates.
- Obtain credential-rotation proof and a read-only deployed-schema/configuration review; rehearse baseline migrations and rollback. Run container builds, service-wide dependency-readiness checks, load/accessibility/responsive and disaster-recovery tests in a capable environment.

## Phase 1 — Historical audit evidence (preserved)

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

DocCraft's backend and both browser applications build successfully. Focused automated regressions, 96 browser error-state/rendering probes, 121 mounted admin API authentication probes, 17 real server-template PDFs plus a renderer security probe, and two real Redis/configuration persistence probes passed. Both frontend lint commands still fail. **Release readiness is not established.**

The final check register contains 15 passing commands and 2 failing commands; the failures are lint. Provider and remote-database workflows remain blocked, and additional categories were deliberately not run. Results are scoped in the test report and must not be interpreted as complete production workflow success.

## Discovery and coverage

- 666 repository text files scanned; 1369 inventory entries.
- 892 UI control definitions, 17 JSX route declarations, 81 admin navigation entries, 284 backend route/mount declarations.
- 20 Prisma model definitions, 42 physical-table declarations, 8 worker modules, 25 server/email template definitions.
- 311 HTTP client target expressions, plus 132 actual mounted admin method/path operations.
- 28 corrected defect groups and 15 unresolved/incomplete finding groups. Some fixes have focused runtime regressions; others have static/build verification only.

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

- [01-SYSTEM_ARCHITECTURE.md](01-SYSTEM_ARCHITECTURE.md)
- [02-USER_WORKFLOWS.md](02-USER_WORKFLOWS.md)
- [03-ADMIN_WORKFLOWS.md](03-ADMIN_WORKFLOWS.md)
- [04-CHAT_AND_DOCUMENT_LIFECYCLE.md](04-CHAT_AND_DOCUMENT_LIFECYCLE.md)
- [05-API_DATABASE_INTEGRATIONS.md](05-API_DATABASE_INTEGRATIONS.md)
- [06-FUNCTIONALITY_COVERAGE.md](06-FUNCTIONALITY_COVERAGE.md)
- [07-TEST_RESULTS.md](07-TEST_RESULTS.md)
- [08-BUGS_AND_FIXES.md](08-BUGS_AND_FIXES.md)
- [09-SECURITY_PERFORMANCE.md](09-SECURITY_PERFORMANCE.md)
- [10-IMPROVEMENT_ROADMAP.md](10-IMPROVEMENT_ROADMAP.md)
- [11-CHANGE_LOG.md](11-CHANGE_LOG.md)
