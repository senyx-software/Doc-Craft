# Improvement roadmap

## Phase 3 — Current status (2026-10-15)

**Production readiness: NOT READY.** Latest actual isolated stack: **160/160 assertions verified**; Security-category assertions: **64/64**; actual browser assertions: **11 verified** (overlap with the stack, not additive). Pairwise service identities, receiving-service authorization/replay checks, signed jobs/events, Redis ACLs, current-account/session revocation, renderer isolation and request limits have implementation and regression evidence. Guest transfer, session canvas persistence/browser export, bundled template availability and currency-separated reporting were implemented and tested to the scope in the Phase 3 report.

The nine carried original findings are assessed individually in [15-PHASE3_REMEDIATION_REPORT.md](15-PHASE3_REMEDIATION_REPORT.md). U-R11 is fixed for tested draft/layout/export paths; the others remain partial, unresolved or externally blocked. Unified entitlements, ordered billing and quota crash repair, uploaded template authoring, deployment TLS/database privilege/rotation proof, residual build-tool advisories and actual provider sandboxes remain release requirements. Phase 2 numbers and architecture statements below are historical and superseded where Phase 3 changes them.

Current evidence: [security audit](12-MICROSERVICES_SECURITY_AUDIT.md), [communication matrix / trust diagrams](13-INTER_SERVICE_COMMUNICATION.md), [security tests](14-SECURITY_TEST_RESULTS.md), [remediation](15-PHASE3_REMEDIATION_REPORT.md).

## Historical Phase 2 / Phase 1 evidence

> Current status: Phase 2 evidence below supersedes historical Phase 1 dispositions. Release decision: **NOT READY**.

## Phase 2 — Remediation and Production Readiness Verification

### Current release decision

**NOT READY**. Both lint failures and the isolated database blocker were materially resolved; provider, product completeness and recovery gates remain.

- Implement and test ordered transactional payment event claims/outbox/reconciliation, quota crash/day-boundary accounting and durable override expiry/recovery; include out-of-order and restart fault injection.
- Finish one authoritative entitlement contract for every feature consumer; complete template publication and the guest/canvas/browser-export persistence contract. Verify successful user/admin CRUD for the remaining inventory entries.
- Repair currency-aware financial aggregation; LKR and USD must not be summed or labeled as USD without an explicit approved conversion policy. Verify real sandbox upgrade/downgrade/cancel/refund/trial/coupon rules and advertised benefits.
- Provide controlled sandbox resources for Groq/Claude, Firebase, Paddle/PayHere, Resend and Supabase, then run their actual workflows. Provider mocks and signed local callbacks cannot clear those gates.
- Obtain credential-rotation proof and a read-only deployed-schema/configuration review; rehearse baseline migrations and rollback. Run container builds, service-wide dependency-readiness checks, load/accessibility/responsive and disaster-recovery tests in a capable environment.

### Deployment and rollback prerequisites

1. Back up and inspect the actual deployment schema read-only. **Do not run the new Payment/Quota initial migrations blindly against populated databases**: establish a reviewed Prisma baseline. Validate legacy plan/coupon/audit-table ownership and compatible copy predicates. Retain old audit history; moving historical quota events to `quota_audit_logs` needs an explicit reviewed copy, not a reset.
2. Preflight Chat status/role values before enum conversion; unexpected legacy text must fail the migration. Rehearse locks, startup order and data preservation on an isolated copy. Auth verification fields and Chat persistence tables must exist before new code starts. Admin namespace copies preserve old tables and do not overwrite current namespaced rows.
3. Deploy the CheckoutIntent schema before enabling new checkouts. Reconcile in-flight legacy PayHere orders without intents from trusted provider/account records; the new worker rejects unbound callbacks. Configure explicit USD/LKR amounts and real sandbox product/price identifiers first. No currency conversion or price-identifier fabrication is provided.
4. Supply rotated stable signing/internal/bootstrap secrets and correct service URLs privately. Keep the read-only MCP endpoint on the private service network; admin RBAC/auditing is enforced at its consuming endpoint. Back up configuration versions and verify Redis invalidation/override recovery.
5. Preserve database backups and queue/event evidence. Roll back compatible application/configuration versions only after checking namespace/ledger compatibility; do not drop the new tables or undo enum conversion against live writers. A blind return to old admin table names can read incompatible/stale rows. Prefer a reviewed forward correction; rehearse recovery before release.
6. Release remains blocked until the original high-risk gaps and mandatory provider/CRUD/operational gates pass or a narrower release scope is explicitly approved. No such narrower approval was supplied in this task.

### Reviewable proposals for the remaining architectural work

These proposals are not implemented and require architecture/product authorization before changing the release contract:

- Persist a unique gateway/event ledger and version/order checks per subscription. Commit invoice/subscription changes and an outbox together; idempotent consumers apply Auth, Quota and Notification effects. Reconcile incomplete delivery after process restart. Decide provider-specific effective dates and grandfathered prices before mapping superseded price IDs.
- Give quota reservations a durable lifecycle tied to a user, operation and UTC accounting day. Reconcile reserved/committed/refunded state across SQL, Redis and workers, including midnight, crash and retry exhaustion. Select one durable authority for staff overrides and expiry, then test cache-loss restoration and billing precedence.
- Publish one versioned entitlement response for logo/template access, priority, retention and every supported tier. Map every existing feature gate to that response and verify each admin toggle reaches a real user control after reload.
- Specify a versioned template publication artifact consumed by both selection and rendering, and an explicit guest-to-account ownership transfer for saved fields/assets/layout. Agree confirmation, conflict and retention rules before implementing either workflow.


### Blocked / unrun reconciliation

| Gate | Previous category | Workflow | Current status | Evidence / exact prerequisite |
| --- | --- | --- | --- | --- |
| EXT01 | Original blocked 1/6 | PostgreSQL-backed CRUD / browser persistence | VERIFIED in tested scope; incomplete overall | Owned local PostgreSQL + checked-in migrations, real Redis and nine running application endpoints; recorded stack checks and six browser checks. Remaining controls in 81 admin sections are NOT TESTED. |
| EXT02 | Original blocked 2/6 | Live Groq/Claude intelligence, provider fallback and cost/quota | BLOCKED | Supply an approved provider sandbox/project and bounded test budget. Local deterministic multi-turn tests and mocked provider-loop units are separate evidence. |
| EXT03 | Original blocked 3/6 | Google/Firebase interactive authentication | BLOCKED | A controlled Firebase project and test identity/browser flow are required; no production identity was used. |
| EXT04 | Original blocked 4/6 | Real Paddle/PayHere sandbox lifecycle | BLOCKED | Register sandbox products/prices and callback endpoints; exercise checkout, renewals, upgrades/downgrades, cancellation, refunds and out-of-order deliveries. Signed local PayHere callbacks are VERIFIED fixtures, not provider delivery. |
| EXT05 | Original blocked 5/6 | Resend delivery and provider callbacks | BLOCKED | Approved sandbox sender/recipient and registered callback are required; local worker uses dummy transport and sends no real communication. |
| EXT06 | Original blocked 6/6 | Supabase bucket lifecycle / signed links | BLOCKED | Approved isolated test bucket and credentials are required. Local-disk signed downloads and PDFs are verified separately. |
| EXT07 | Original not-run 1/3 | Docker image build/deploy/runtime | BLOCKED / NOT TESTED | Docker/Podman unavailable in the accessible environment; Compose parsing and local process startup are not container/deployment evidence. |
| EXT08 | Original not-run 2/3 | Broad load / responsive / accessibility / disaster recovery | PARTIALLY VERIFIED; remainder NOT TESTED | One 390px pricing viewport plus a narrow renderer burst/owned-browser restart probe are recorded when successful; no full accessibility audit, load SLO or disaster recovery rehearsal. |
| EXT09 | Original not-run 3/3 | Unsafe legacy live document test | FIXED / VERIFIED | Replaced with an isolated pytest entry point and executed it: 69 tests passed, no shared data mutation. |

## Phase 1 — Historical audit evidence (preserved)

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

| Priority | Work | Required decision/resource | Acceptance evidence |
| --- | --- | --- | --- |
| P0 | Resolve schema/table ownership and migrations | Read-only actual-schema inspection; explicit migration/backup approval before modifying a shared database | Fresh isolated PostgreSQL can migrate/start every service without incompatible columns/tables |
| P0 | Establish safe environment and credentials | Provider/deployment owner rotation/configuration; stable admin secret and consistent service URLs | No source defaults; secret equality/availability and authenticated sandbox health checks without printing values |
| P1 | Define authoritative pricing/currency/entitlements | Agree USD/LKR conversion and provider prices, effective dates, quota units, plan/feature semantics | Admin edit → checkout + user pricing/feature behavior verified after reload |
| P1 | Complete distributed billing/quota recovery | Choose event claim/outbox/reconciliation and reservation/refund ownership | Concurrent duplicate/out-of-order/crash/retry tests do not lose entitlements or over/under-charge usage |
| P1 | Apply model policies to the active provider | Choose supported Groq per-plan model ceilings/fallback rules | Changing admin model access affects actual provider candidate selection |
| P1 | Complete missing publication/delivery paths | Agree admin template publishing and announcement audiences; guest migration/persistence policy | Real CRUD/publish/feed/display and guest save/reopen journeys pass |
| P1 | Replace metadata-only payment methods | Decide provider portal/tokenization/persistence behavior | No fabricated methods; durable provider-backed lifecycle validated with sandbox |
| P2 | Repair lint and UI state issues in focused batches | No broad rule suppression; preserve business behavior | Both frontend lint commands and focused interaction regressions pass |
| P2 | Harden remaining boundaries and operations | Analytics access, abuse/OTP budgets, session revocation, readiness and monitoring requirements | Authorization/abuse/revocation tests and dependency-failure alerts succeed |
| P2 | Benchmark and expand workflow matrix | Isolated complete stack, load targets, desktop/mobile/a11y requirements | Measured capacity plus browser save/reload/export, worker restart and sandbox integration coverage |

Major migration, currency/entitlement policy, provider-routing policy, and new publication/migration workflows are concrete remaining decisions, not silently introduced product requirements. The audit has not applied a destructive migration or speculative rewrite. Review these proposals and authorize the chosen design before implementation against shared resources.
