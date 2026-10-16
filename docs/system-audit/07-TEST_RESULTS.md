# Test results

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

Execution used an owned PostgreSQL 18.4 instance on loopback, independent uniquely named databases per run, an isolated Redis process and synthetic credentials. Four services ran their actual checked-in Prisma migrations; SQLAlchemy/custom SQL components initialized against that isolated database. Node services, two FastAPI apps, the PDF worker, Chromium and both Vite frontends ran as real local processes. The Analytics service's standalone authorization suite used disposable SQLite; it was not part of the live nine-process harness. No configured hosted database, real charge, real email, Firebase account or Supabase bucket was mutated.

The binaries and temporary cluster were outside Git. The database harness accepts only a loopback `PG_AUDIT_URL`, creates a unique database and never resets an existing database. Its local migration/browser/PDF artifacts are reviewable. Fresh-schema success does not validate an upgrade against a deployed legacy database.

### Latest authoritative checks

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

Suite counts overlap where root test:chat includes gateway/frontend files also run in focused commands; do not add them as unique tests. An earlier PASS is not used to hide a later failure. Intermediate failures and fixture corrections remain in the command history.

### Real workflow assertions

| Test ID | Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| P2-I001 | auth checked-in PostgreSQL migrations applied | Specified assertion in isolated fixture | Fresh uniquely named database; real prisma migrate deploy | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I002 | chat checked-in PostgreSQL migrations applied | Specified assertion in isolated fixture | Fresh uniquely named database; real prisma migrate deploy | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I003 | payment checked-in PostgreSQL migrations applied | Specified assertion in isolated fixture | Fresh uniquely named database; real prisma migrate deploy | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I004 | quota checked-in PostgreSQL migrations applied | Specified assertion in isolated fixture | Fresh uniquely named database; real prisma migrate deploy | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I005 | auth local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I006 | chat local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I007 | quota local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I008 | payment local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I009 | document local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I010 | admin local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I011 | sidecar local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I012 | gateway local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I013 | notification local startup | Specified assertion in isolated fixture | HTTP health endpoint | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I014 | Registration, stored verification challenge, verification and login through gateway | Specified assertion in isolated fixture | Two isolated users; email transport is local fixture | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I015 | Profile update survives authenticated reload | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I016 | Persisted administrator password + one-time code sign-in | Specified assertion in isolated fixture | Real HTTP + PostgreSQL | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I017 | Isolated test rate policy persists through admin configuration | Specified assertion in isolated fixture | 500 authenticated requests/minute for accelerated fixture workflows | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I018 | Admin daily allowance reaches authenticated user quota | Specified assertion in isolated fixture | {"limit": 20} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I019 | Unified admin override persists plan and quota into user APIs | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I020 | Override removal survives subsequent billing plan synchronization | Specified assertion in isolated fixture | {"limit": 500} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I021 | Admin announcement reaches the authenticated user feed | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I022 | Disabled announcement disappears from fresh user feed | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I023 | invoice multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "fa06cfe6-edcc-4159-9c48-eab3d786bdbd", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I024 | invoice duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I025 | invoice multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "f3c407ff-195b-4c6b-b754-397a162c60b0", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I026 | invoice duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I027 | invoice admin MCP resource read | Specified assertion in isolated fixture | MCP initialize → initialized notification → resources/read over actual private HTTP | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I028 | invoice chat fields persist after reload | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I029 | invoice real Redis queue → worker → Chromium → persisted PDF | Specified assertion in isolated fixture | {"status": "completed", "documentId": "e1ccdc82-b082-53e8-a07c-9ca196eb6129"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I030 | invoice exported PDF contains persisted chat edits | Specified assertion in isolated fixture | {"sha256": "3c57d06389786a1ab15efc53fe1f6f32295b0ff477111e727b0fa67a5038476c"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I031 | invoice PDF preserves calculated tax-inclusive total | Specified assertion in isolated fixture | {"expected_total": "43.89", "quantity": 2, "unit_price": "19.95", "tax_percent": 10} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I032 | invoice cross-user document access denied | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I033 | invoice document and session deletion persist | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I034 | quotation multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "33129061-2051-4c81-a94c-c0c4ce4fe6b5", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I035 | quotation duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I036 | quotation multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "206850ab-811f-4e8d-8aba-57baba92510e", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I037 | quotation duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I038 | quotation admin MCP resource read | Specified assertion in isolated fixture | MCP initialize → initialized notification → resources/read over actual private HTTP | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I039 | quotation chat fields persist after reload | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I040 | quotation real Redis queue → worker → Chromium → persisted PDF | Specified assertion in isolated fixture | {"status": "completed", "documentId": "96682628-8237-50c1-a2cd-ab40622c0bc1"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I041 | quotation exported PDF contains persisted chat edits | Specified assertion in isolated fixture | {"sha256": "e14a3b0466babdecf523cd92ab66b2052bf70644db0bddfcd43692f585b81954"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I042 | quotation PDF preserves calculated tax-inclusive total | Specified assertion in isolated fixture | {"expected_total": "43.89", "quantity": 2, "unit_price": "19.95", "tax_percent": 10} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I043 | quotation cross-user document access denied | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I044 | quotation document and session deletion persist | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I045 | proposal multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "9c888a43-9e15-4747-a3ea-52846b6608bc", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I046 | proposal duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I047 | proposal multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "1cddaeb2-ae69-4273-8e67-4cbe9c4fc44e", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I048 | proposal duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I049 | proposal admin MCP resource read | Specified assertion in isolated fixture | MCP initialize → initialized notification → resources/read over actual private HTTP | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I050 | proposal chat fields persist after reload | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I051 | proposal real Redis queue → worker → Chromium → persisted PDF | Specified assertion in isolated fixture | {"status": "completed", "documentId": "83cd76a4-1377-542e-b23c-6201d6ac8e7b"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I052 | proposal exported PDF contains persisted chat edits | Specified assertion in isolated fixture | {"sha256": "3e323991f7ba5689cf82bb06cbcc9c4422b7c64f039c6f3f73bc7dc8a9dae4fe"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I053 | proposal cross-user document access denied | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I054 | proposal document and session deletion persist | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I055 | receipt multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "809707c2-771e-4c9c-90fb-3d6cb5b5b8c0", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I056 | receipt duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I057 | receipt multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "c69c4f3a-98f1-46e4-bd6f-dd700f37d22b", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I058 | receipt duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I059 | receipt admin MCP resource read | Specified assertion in isolated fixture | MCP initialize → initialized notification → resources/read over actual private HTTP | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I060 | receipt chat fields persist after reload | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I061 | receipt real Redis queue → worker → Chromium → persisted PDF | Specified assertion in isolated fixture | {"status": "completed", "documentId": "ac21b225-103c-5ac0-9b13-6b3bd6073d45"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I062 | receipt exported PDF contains persisted chat edits | Specified assertion in isolated fixture | {"sha256": "9bc8a37ed875e9cbf2c8e2674f7dcacec7094e34ac1644b2f5252f7172b43667"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I063 | receipt PDF preserves calculated tax-inclusive total | Specified assertion in isolated fixture | {"expected_total": "43.89", "quantity": 2, "unit_price": "19.95", "tax_percent": 10} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I064 | receipt cross-user document access denied | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I065 | receipt document and session deletion persist | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I066 | purchase_order multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "f6df8b22-b951-4e4c-abb9-fbeea24044c7", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I067 | purchase_order duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I068 | purchase_order multi-turn committed SSE update | Specified assertion in isolated fixture | {"turnId": "72d23be0-77b0-4e2a-a95d-959092032b87", "provider": "deterministic parser; live AI not exercised"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I069 | purchase_order duplicate turn replay | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I070 | purchase_order admin MCP resource read | Specified assertion in isolated fixture | MCP initialize → initialized notification → resources/read over actual private HTTP | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I071 | purchase_order chat fields persist after reload | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I072 | purchase_order real Redis queue → worker → Chromium → persisted PDF | Specified assertion in isolated fixture | {"status": "completed", "documentId": "c749fd99-407a-594e-bce1-2b619c687857"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I073 | purchase_order exported PDF contains persisted chat edits | Specified assertion in isolated fixture | {"sha256": "2e049d1dce264786477b05c8bc5ecd1f19b85eeb49e216f773753a9b97527495"} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I074 | purchase_order PDF preserves calculated tax-inclusive total | Specified assertion in isolated fixture | {"expected_total": "43.89", "quantity": 2, "unit_price": "19.95", "tax_percent": 10} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I075 | purchase_order cross-user document access denied | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I076 | purchase_order document and session deletion persist | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I077 | Real Redis duplicate reservations consume one unit | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I078 | Real Redis concurrent duplicate refunds preserve other reservation | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I079 | Admin currency and prices reach public pricing | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I080 | Annual hosted checkout uses configured LKR price and annual cadence | Specified assertion in isolated fixture | Local sandbox form construction; no provider request/charge | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I081 | Signed PayHere fixture is durably accepted by real Redis queue | Specified assertion in isolated fixture | {"http_status": 200} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I082 | Signed callback activates server-bound owner and annual subscription | Specified assertion in isolated fixture | Unbound custom_1/custom_2 intentionally point to a different fixture user/plan | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I083 | Tampered PayHere custom fields cannot grant another user paid access | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I084 | Concurrent duplicate signed callbacks are acknowledged | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I085 | Duplicate signed callback deliveries produce one persisted invoice | Specified assertion in isolated fixture | {"invoices": 1} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I086 | Admin plan change reaches an already-active paid subscriber | Specified assertion in isolated fixture | {"limit": 44} | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I087 | Admin suspension invalidates an existing user access token | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I088 | Admin reactivation restores permitted access | Specified assertion in isolated fixture | VERIFIED | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-I089 | Live user/admin browser integration | Specified assertion in isolated fixture | See browser-integration.json | VERIFIED | [stack-integration.json](evidence/phase2/stack-integration.json) |
| P2-B001 | Admin UI currency/price edit, second factor, database persistence, reload | Browser shows persisted values / enforces boundary | VERIFIED | VERIFIED | [browser-integration.json](evidence/phase2/browser-integration.json) |
| P2-B002 | Admin inspection UI reads a persisted session through read-only MCP | Browser shows persisted values / enforces boundary | VERIFIED | VERIFIED | [browser-integration.json](evidence/phase2/browser-integration.json) |
| P2-B003 | Admin price edit reaches actual user pricing UI | Browser shows persisted values / enforces boundary | VERIFIED | VERIFIED | [browser-integration.json](evidence/phase2/browser-integration.json) |
| P2-B004 | User pricing remains current after browser reload | Browser shows persisted values / enforces boundary | VERIFIED | VERIFIED | [browser-integration.json](evidence/phase2/browser-integration.json) |
| P2-B005 | Pricing page fits a mobile viewport | Browser shows persisted values / enforces boundary | VERIFIED | VERIFIED | [browser-integration.json](evidence/phase2/browser-integration.json) |
| P2-B006 | Live integration browser pages have no uncaught script errors | Browser shows persisted values / enforces boundary | VERIFIED | VERIFIED | [browser-integration.json](evidence/phase2/browser-integration.json) |

### Six original blocked and three not-run categories

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

### All Phase 2 recorded commands / working directories

| ID | Working directory | Exact command argv | Outcome | Seconds | Evidence |
| --- | --- | --- | --- | --- | --- |
| phase2-admin-build-confirmed | admin | ["npm", "run", "build"] | PASS | 10.91 | [phase2-admin-build-confirmed.log](evidence/phase2-admin-build-confirmed.log) |
| phase2-admin-currency-regression | services/admin-api | ["/home/eranda/Projects/doc-craft/.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 23.92 | [phase2-admin-currency-regression.log](evidence/phase2-admin-currency-regression.log) |
| phase2-admin-lint-confirmed | admin | ["npm", "run", "lint"] | PASS | 6.6 | [phase2-admin-lint-confirmed.log](evidence/phase2-admin-lint-confirmed.log) |
| phase2-admin-mutation-regression | services/admin-api | ["../../.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 20.76 | [phase2-admin-mutation-regression.log](evidence/phase2-admin-mutation-regression.log) |
| phase2-admin-retest | services/admin-api | ["/home/eranda/Projects/doc-craft/.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 24.42 | [phase2-admin-retest.log](evidence/phase2-admin-retest.log) |
| phase2-admin-security | services/admin-api | ["/home/eranda/Projects/doc-craft/.venv-local/bin/python", "-m", "pytest", "tests/test_audit_regressions.py", "-q"] | PASS | 4.24 | [phase2-admin-security.log](evidence/phase2-admin-security.log) |
| phase2-admin-tests | services/admin-api | ["/home/eranda/Projects/doc-craft/.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 23.36 | [phase2-admin-tests.log](evidence/phase2-admin-tests.log) |
| phase2-all-chat-regression | . | ["npm", "run", "test:chat"] | PASS | 7.88 | [phase2-all-chat-regression.log](evidence/phase2-all-chat-regression.log) |
| phase2-analytics-retest | services/analytics | ["/home/eranda/Projects/doc-craft/.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 2.71 | [phase2-analytics-retest.log](evidence/phase2-analytics-retest.log) |
| phase2-analytics-tests | services/analytics | ["/home/eranda/Projects/doc-craft/.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | FAIL | 2.65 | [phase2-analytics-tests.log](evidence/phase2-analytics-tests.log) |
| phase2-backend-build | . | ["npm", "run", "build"] | PASS | 15.61 | [phase2-backend-build.log](evidence/phase2-backend-build.log) |
| phase2-build-after-quota-fix | . | ["npm", "run", "build"] | PASS | 16.75 | [phase2-build-after-quota-fix.log](evidence/phase2-build-after-quota-fix.log) |
| phase2-chat-regression | . | ["npm", "run", "test:chat"] | FAIL | 7.14 | [phase2-chat-regression.log](evidence/phase2-chat-regression.log) |
| phase2-document-regression | services/document | ["/home/eranda/Projects/doc-craft/.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 4.5 | [phase2-document-regression.log](evidence/phase2-document-regression.log) |
| phase2-final-admin-build | admin | ["npm", "run", "build"] | PASS | 10.78 | [phase2-final-admin-build.log](evidence/phase2-final-admin-build.log) |
| phase2-final-admin-lint | admin | ["npm", "run", "lint"] | FAIL | 8.96 | [phase2-final-admin-lint.log](evidence/phase2-final-admin-lint.log) |
| phase2-final-admin-tests | services/admin-api | ["../../.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 23.03 | [phase2-final-admin-tests.log](evidence/phase2-final-admin-tests.log) |
| phase2-final-admin-validation | services/admin-api | ["../../.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 20.34 | [phase2-final-admin-validation.log](evidence/phase2-final-admin-validation.log) |
| phase2-final-analytics-tests | services/analytics | ["../../.venv-local/bin/python", "-m", "pytest", "tests", "-q"] | PASS | 2.18 | [phase2-final-analytics-tests.log](evidence/phase2-final-analytics-tests.log) |
| phase2-final-api-auth | . | ["env", "AUDIT_EVIDENCE_DIR=/home/eranda/Projects/doc-craft/docs/system-audit/evidence/phase2", ".venv-local/bin/python", "scripts/system_audit_api.py"] | PASS | 3.05 | [phase2-final-api-auth.log](evidence/phase2-final-api-auth.log) |
| phase2-final-artifacts | . | [".venv-local/bin/python", "scripts/system_audit_validate.py"] | PASS | 1.26 | [phase2-final-artifacts.log](evidence/phase2-final-artifacts.log) |
| phase2-final-auth | . | ["npm", "run", "test", "-w", "doccraft-auth"] | PASS | 2.32 | [phase2-final-auth.log](evidence/phase2-final-auth.log) |
| phase2-final-backend-build | . | ["npm", "run", "build"] | PASS | 17.73 | [phase2-final-backend-build.log](evidence/phase2-final-backend-build.log) |
| phase2-final-billing-admin-stack | . | [".venv-local/bin/python", "scripts/system_audit_phase2_stack.py"] | PASS | 43.86 | [phase2-final-billing-admin-stack.log](evidence/phase2-final-billing-admin-stack.log) |
| phase2-final-chat | . | ["npm", "run", "test:chat"] | PASS | 6.32 | [phase2-final-chat.log](evidence/phase2-final-chat.log) |
| phase2-final-document-tests | services/document | ["../../.venv-local/bin/python", "test_document.py"] | PASS | 2.93 | [phase2-final-document-tests.log](evidence/phase2-final-document-tests.log) |
| phase2-final-full-stack | . | [".venv-local/bin/python", "scripts/system_audit_phase2_stack.py"] | PASS | 42.26 | [phase2-final-full-stack.log](evidence/phase2-final-full-stack.log) |
| phase2-final-gateway-notification | . | ["node_modules/.bin/vitest", "run", "services/gateway/src/services/__tests__", "services/gateway/src/middleware/__tests__", "services/notification/src/security.test.ts"] | PASS | 1.22 | [phase2-final-gateway-notification.log](evidence/phase2-final-gateway-notification.log) |
| phase2-final-payment | . | ["npm", "run", "test", "-w", "doccraft-payment"] | PASS | 3.41 | [phase2-final-payment.log](evidence/phase2-final-payment.log) |
| phase2-final-quota-route-regression | . | ["npm", "run", "test", "-w", "doccraft-quota"] | PASS | 1.18 | [phase2-final-quota-route-regression.log](evidence/phase2-final-quota-route-regression.log) |
| phase2-final-quota | . | ["npm", "run", "test", "-w", "doccraft-quota"] | PASS | 2.18 | [phase2-final-quota.log](evidence/phase2-final-quota.log) |
| phase2-final-tax-crud-stack | . | [".venv-local/bin/python", "scripts/system_audit_phase2_stack.py"] | PASS | 43.33 | [phase2-final-tax-crud-stack.log](evidence/phase2-final-tax-crud-stack.log) |
| phase2-final-user-build | user-frontend | ["npm", "run", "build"] | PASS | 18.74 | [phase2-final-user-build.log](evidence/phase2-final-user-build.log) |
| phase2-final-user-lint | user-frontend | ["npm", "run", "lint"] | PASS | 12.66 | [phase2-final-user-lint.log](evidence/phase2-final-user-lint.log) |
| phase2-final-valid-account-regression | . | ["npm", "run", "test:chat"] | PASS | 8.52 | [phase2-final-valid-account-regression.log](evidence/phase2-final-valid-account-regression.log) |
| phase2-integration-after-admin-cleanup | . | [".venv-local/bin/python", "scripts/system_audit_phase2_stack.py"] | PASS | 40.21 | [phase2-integration-after-admin-cleanup.log](evidence/phase2-integration-after-admin-cleanup.log) |
| phase2-last-admin-build | admin | ["npm", "run", "build"] | PASS | 11.5 | [phase2-last-admin-build.log](evidence/phase2-last-admin-build.log) |
| phase2-last-admin-lint | admin | ["npm", "run", "lint"] | PASS | 9.53 | [phase2-last-admin-lint.log](evidence/phase2-last-admin-lint.log) |
| phase2-last-user-build | user-frontend | ["npm", "run", "build"] | PASS | 19.84 | [phase2-last-user-build.log](evidence/phase2-last-user-build.log) |
| phase2-last-user-lint | user-frontend | ["npm", "run", "lint"] | PASS | 14.41 | [phase2-last-user-lint.log](evidence/phase2-last-user-lint.log) |
| phase2-latest-admin-build | admin | ["npm", "run", "build"] | PASS | 12.63 | [phase2-latest-admin-build.log](evidence/phase2-latest-admin-build.log) |
| phase2-latest-admin-lint | admin | ["npm", "run", "lint"] | PASS | 10.28 | [phase2-latest-admin-lint.log](evidence/phase2-latest-admin-lint.log) |
| phase2-latest-backend-build | . | ["npm", "run", "build"] | FAIL | 16.18 | [phase2-latest-backend-build.log](evidence/phase2-latest-backend-build.log) |
| phase2-local-postgres-stop | . | ["env", "LD_LIBRARY_PATH=/tmp/doccraft-phase2-pg/package/native/lib", "/tmp/doccraft-phase2-pg/package/native/bin/pg_ctl", "-D", "/tmp/doccraft-phase2-pg/data", "stop", "-m", "fast"] | PASS | 0.1 | [phase2-local-postgres-stop.log](evidence/phase2-local-postgres-stop.log) |
| phase2-new-policy-security | . | ["node_modules/.bin/vitest", "run", "services/chat/src/services/__tests__/plan-policy.test.ts", "services/chat/src/routes/__tests__/internal-resources.test.ts"] | PASS | 1.29 | [phase2-new-policy-security.log](evidence/phase2-new-policy-security.log) |
| phase2-payment-checkout-regression | . | ["npm", "run", "test", "-w", "doccraft-payment"] | PASS | 1.73 | [phase2-payment-checkout-regression.log](evidence/phase2-payment-checkout-regression.log) |
| phase2-payment-final | . | ["npm", "run", "test", "-w", "doccraft-payment"] | PASS | 2.78 | [phase2-payment-final.log](evidence/phase2-payment-final.log) |
| phase2-payment-retest | . | ["npm", "run", "test", "-w", "doccraft-payment"] | PASS | 1.72 | [phase2-payment-retest.log](evidence/phase2-payment-retest.log) |
| phase2-payment-tests | . | ["npm", "run", "test", "-w", "doccraft-payment"] | FAIL | 1.73 | [phase2-payment-tests.log](evidence/phase2-payment-tests.log) |
| phase2-probes-complete | . | [".venv-local/bin/python", "scripts/system_audit_phase2_probes.py"] | FAIL | 12.47 | [phase2-probes-complete.log](evidence/phase2-probes-complete.log) |
| phase2-probes-final | . | [".venv-local/bin/python", "scripts/system_audit_phase2_probes.py"] | FAIL | 42.81 | [phase2-probes-final.log](evidence/phase2-probes-final.log) |
| phase2-probes-isolated | . | [".venv-local/bin/python", "scripts/system_audit_phase2_probes.py"] | BLOCKED | 180.04 | [phase2-probes-isolated.log](evidence/phase2-probes-isolated.log) |
| phase2-probes-recovery-retest | . | [".venv-local/bin/python", "scripts/system_audit_phase2_probes.py"] | PASS | 231.21 | [phase2-probes-recovery-retest.log](evidence/phase2-probes-recovery-retest.log) |
| phase2-quota-tests | . | ["npm", "run", "test", "-w", "doccraft-quota"] | PASS | 1.33 | [phase2-quota-tests.log](evidence/phase2-quota-tests.log) |
| phase2-renderer-browser-regression | . | [".venv-local/bin/python", "scripts/system_audit_phase2_probes.py"] | FAIL | 43.41 | [phase2-renderer-browser-regression.log](evidence/phase2-renderer-browser-regression.log) |
| phase2-report-artifact-validation | . | [".venv-local/bin/python", "scripts/system_audit_validate.py"] | FAIL | 0.08 | [phase2-report-artifact-validation.log](evidence/phase2-report-artifact-validation.log) |
| phase2-report-validation-retest | . | [".venv-local/bin/python", "scripts/system_audit_validate.py"] | PASS | 1.05 | [phase2-report-validation-retest.log](evidence/phase2-report-validation-retest.log) |
| phase2-updated-chat | . | ["npm", "run", "test:chat"] | FAIL | 6.88 | [phase2-updated-chat.log](evidence/phase2-updated-chat.log) |

Earlier failed probes include outdated contract expectations, SQLite URL stripping, migration omissions, Vitest mock hoisting, upstream CORS, test-owned Chromium process lookup, overlapping fixture ports, premature renderer-slot observation and an outer probe timeout. They are retained; only rerun assertions are used for final verification.

## Phase 1 — Historical audit evidence (preserved)

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

## Final check commands

| Check | Working directory | Command | Result | Evidence scope/count | Output |
| --- | --- | --- | --- | --- | --- |
| final-backend-build | . | npm run build | PASS | Command completion | [log](evidence/final-backend-build.log) |
| final-user-build | . | npm run build --prefix user-frontend | PASS | Command completion | [log](evidence/final-user-build.log) |
| final-admin-build | . | npm run build --prefix admin | PASS | Command completion | [log](evidence/final-admin-build.log) |
| final-user-lint | . | npm run lint --prefix user-frontend | FAIL | 154 errors, 6 warnings | [log](evidence/final-user-lint.log) |
| final-admin-lint | . | npm run lint --prefix admin | FAIL | 349 errors, 6 warnings | [log](evidence/final-admin-lint.log) |
| final-chat-tests | . | npm run test:chat | PASS | 223 shared Node cases, 209 cases | [log](evidence/final-chat-tests.log) |
| final-auth-tests | . | npm run test -w doccraft-auth | PASS | 35 cases | [log](evidence/final-auth-tests.log) |
| final-payment-tests | . | npm run test -w doccraft-payment | PASS | 53 cases | [log](evidence/final-payment-tests.log) |
| final-quota-tests | . | npm run test -w doccraft-quota | PASS | 24 cases | [log](evidence/final-quota-tests.log) |
| final-document-python | services/document | /home/eranda/Projects/doc-craft/.venv-local/bin/python -m pytest tests -q | PASS | 69 cases | [log](evidence/final-document-python.log) |
| final-admin-python | services/admin-api | /home/eranda/Projects/doc-craft/.venv-local/bin/python -m pytest tests -q | PASS | 90 cases | [log](evidence/final-admin-python.log) |
| gateway-notification-tests | . | node_modules/.bin/vitest run services/gateway/src/services/__tests__ services/gateway/src/middleware/__tests__ services/notification/src/security.test.ts | PASS | 36 cases | [log](evidence/gateway-notification-tests.log) |
| mounted-api-authorization | . | .venv-local/bin/python scripts/system_audit_api.py | PASS | 121/121 scenarios | [log](evidence/mounted-api-authorization.log) |
| browser-error-states | . | node scripts/system_audit_browser.cjs | PASS | 96/96 scenarios | [log](evidence/browser-error-states.log) |
| chromium-pdf-templates | . | .venv-local/bin/python scripts/system_audit_pdf.py | PASS | 18/18 scenarios | [log](evidence/chromium-pdf-templates.log) |
| live-admin-quota-sync | . | .venv-local/bin/python scripts/system_audit_sync.py | PASS | 2/2 scenarios | [log](evidence/live-admin-quota-sync.log) |
| artifact-validation | . | .venv-local/bin/python scripts/system_audit_validate.py | PASS | Command completion | [log](evidence/artifact-validation.log) |

Counts belong to the named check. Gateway SSE/auth tests run both in the root chat suite and in the focused gateway run; do not sum those rows as unique test cases without deduplication. Repeated final commands replace the corresponding final evidence file. Baseline/intermediate evidence is retained separately where named.

The backend build succeeds independently of frontend builds. The admin build initially failed with 31 unused-declaration errors. The original admin lint invocation had no configuration. Adding the configuration exposes genuine violations; the audit did not disable lint rules to manufacture a pass. User lint already failed at baseline. Baseline admin Python execution produced 74 passes and three failures: two stale hardcoded-invitation-password test fixtures and an unsupported PostHog “connected” expectation. Fixture tests now seed/use actual state and test the reported partial configuration honestly.

Admin pytest fixtures now always allocate disposable SQLite state and test transport settings instead of trusting the developer's configured database. Python runs also used an external-network guard. TestClient exercises real FastAPI HTTP routing in process without entering service lifespan, so production workers/bootstrap were not started. The Redis synchronization probe starts/stops its own Redis process and writes only its temporary SQLite database. Browser probes intercept API traffic and use synthetic identities; error-state rendering is the verified property.

## Blocked or unexecuted categories

| ID | Workflow | Expected prerequisite | Actual limitation | Status | Evidence/issue |
| --- | --- | --- | --- | --- | --- |
| EXT01 | Full PostgreSQL-backed user/admin CRUD and browser persistence | Working isolated PostgreSQL and migrated compatible schema | Shared/remote configuration not mutated; no approved isolated instance available | BLOCKED | U-R01 |
| EXT02 | Live Groq/Claude provider intelligence/fallback/entitlements | Controlled provider test resources | Only isolated/mocked provider adapters exercised | BLOCKED | U-R03 |
| EXT03 | Interactive Firebase/Google account login | Test browser account and provider configuration | JWT/Firebase controller cases mocked; no external interactive sign-in | BLOCKED | final-auth-tests.log |
| EXT04 | Real Paddle/PayHere checkout, refunds, upgrades/downgrades | Confirmed sandbox account and products/webhook setup | Signed fixture/unit tests only; no real charges or refunds | BLOCKED | U-R02,U-R07 |
| EXT05 | Resend email delivery and registered callback | Controlled recipient, sandbox/approved transport, callback registration | No real communications sent | BLOCKED | gateway-notification-tests.log |
| EXT06 | Supabase upload/delete/share and cross-instance storage | Isolated bucket/test project | Renderer and mock storage tests do not prove remote object lifecycle | BLOCKED | final-document-python.log |
| EXT07 | Docker build/start and deployment readiness | Docker runtime | Tool unavailable; Compose parsed statically only | NOT TESTED | 01-SYSTEM_ARCHITECTURE.md |
| EXT08 | Load/performance/recovery, all visual and mobile/a11y cases | Defined load targets/test stack and browser matrix | No benchmark or complete accessibility/responsive evaluation | NOT TESTED | U-R13 |
| EXT09 | Legacy live document script | Isolated configured stack and corrected routes | Script mutates data and uses stale paths; deliberately not executed | NOT TESTED | services/document/test_document.py |

## Browser workflow probes

| Test ID | Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| BR001 | user / | Public page or protected-route redirect handles unavailable APIs without a render crash | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR002 | user /login | Public page or protected-route redirect handles unavailable APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR003 | user /register | Public page or protected-route redirect handles unavailable APIs without a render crash | 23 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR004 | user /verify-email | Public page or protected-route redirect handles unavailable APIs without a render crash | 19 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR005 | user /password-reset | Public page or protected-route redirect handles unavailable APIs without a render crash | 17 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR006 | user /pricing | Public page or protected-route redirect handles unavailable APIs without a render crash | 15 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR007 | user /builder | Public page or protected-route redirect handles unavailable APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR008 | user /dashboard | Public page or protected-route redirect handles unavailable APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR009 | user /dashboard | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR010 | user /dashboard/profile | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR011 | user /dashboard/document-history | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR012 | user /dashboard/billing | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR013 | user /dashboard/support | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR014 | user /builder?new=true | Authenticated screen handles unavailable downstream APIs without a render crash | 13 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR015 | admin /home_dashboard | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR016 | admin /users_all | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR017 | admin /users_active | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR018 | admin /users_suspended | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR019 | admin /users_guest | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR020 | admin /users_details | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR021 | admin /subs_all | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR022 | admin /subs_active | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR023 | admin /subs_cancelled | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR024 | admin /subs_failed | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR025 | admin /subs_refunds | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR026 | admin /subs_plan_overview | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR027 | admin /rev_mrr_arr | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR028 | admin /rev_by_plan | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR029 | admin /rev_cost_ledger | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR030 | admin /rev_churn | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR031 | admin /rev_ltv | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR032 | admin /rev_transactions | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR033 | admin /rev_payouts | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR034 | admin /promo_coupons | Admin section renders an error/empty state for backend 503 responses | 38 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR035 | admin /promo_active | Admin section renders an error/empty state for backend 503 responses | 38 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR036 | admin /promo_ab_tests | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR037 | admin /promo_referrals | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR038 | admin /promo_trials | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR039 | admin /pack_current | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR040 | admin /pack_create | Admin section renders an error/empty state for backend 503 responses | 39 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR041 | admin /pack_flags | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR042 | admin /pack_ai_models | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR043 | admin /pack_performance | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR044 | admin /gen_total | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR045 | admin /gen_by_type | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR046 | admin /gen_by_user | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR047 | admin /gen_failed | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR048 | admin /gen_free_tier | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR049 | admin /gen_pro_tier | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR050 | admin /gen_drop_offs | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR051 | admin /doc_all | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR052 | admin /doc_templates | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR053 | admin /doc_breakdown | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR054 | admin /doc_links | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR055 | admin /an_traffic | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR056 | admin /an_location | Admin section renders an error/empty state for backend 503 responses | 35 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR057 | admin /an_device | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR058 | admin /an_duration | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR059 | admin /an_clicks | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR060 | admin /an_funnel | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR061 | admin /an_conversion | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR062 | admin /an_journey | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR063 | admin /sec_ip_logs | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR064 | admin /sec_suspicious | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR065 | admin /sec_rate_limits | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR066 | admin /sec_bot_logs | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR067 | admin /sec_abuse_reports | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR068 | admin /sec_audit | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR069 | admin /sec_sessions | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR070 | admin /sup_reported | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR071 | admin /sup_refunds | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR072 | admin /sup_contact | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR073 | admin /sup_overrides | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR074 | admin /not_automation | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR075 | admin /not_execution_logs | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR076 | admin /not_emit_events | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR077 | admin /not_email_logs | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR078 | admin /not_system | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR079 | admin /not_templates | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR080 | admin /inf_uptime | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR081 | admin /inf_mcp_chat | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR082 | admin /inf_sentry | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR083 | admin /inf_api_usage | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR084 | admin /inf_db_health | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR085 | admin /inf_deployments | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR086 | admin /inf_staging_prod | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR087 | admin /set_dynamic_config | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR088 | admin /set_profile | Admin section renders an error/empty state for backend 503 responses | 35 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR089 | admin /set_admin_users | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR090 | admin /set_2fa | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR091 | admin /set_api_keys | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR092 | admin /set_billing | Admin section renders an error/empty state for backend 503 responses | 28 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR093 | admin /set_gdpr | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR094 | admin /set_export_csv | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR095 | admin /set_preferences | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR096 | admin / | Unauthenticated admin login screen renders | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |

## Mounted API authentication probes

| Test ID | Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| API-AUTH-001 | POST /api/v1/admin/auth/change-password | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-002 | POST /api/v1/admin/auth/totp/setup | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-003 | POST /api/v1/admin/auth/totp/verify | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-004 | POST /api/v1/admin/auth/totp/disable | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-005 | POST /api/v1/admin/auth/request-action-code | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-006 | GET /api/v1/admin/auth/me | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-007 | PATCH /api/v1/admin/auth/me | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-008 | GET /api/v1/admin/roles | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-009 | POST /api/v1/admin/roles | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-010 | PATCH /api/v1/admin/roles/{role_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-011 | DELETE /api/v1/admin/roles/{role_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-012 | GET /api/v1/admin/permissions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-013 | GET /api/v1/admin/staff | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-014 | POST /api/v1/admin/staff/invite | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-015 | PATCH /api/v1/admin/staff/{staff_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-016 | DELETE /api/v1/admin/staff/{staff_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-017 | GET /api/v1/admin/audit-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-018 | GET /api/v1/admin/audit-logs/all | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-019 | GET /api/v1/admin/audit-logs/{log_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-020 | GET /api/v1/admin/security/alerts | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-021 | PATCH /api/v1/admin/security/alerts/{alert_id}/resolve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-022 | GET /api/v1/admin/security/sessions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-023 | DELETE /api/v1/admin/security/sessions/{session_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-024 | GET /api/v1/admin/security/ip-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-025 | GET /api/v1/admin/security/rate-limits | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-026 | GET /api/v1/admin/security/bot-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-027 | GET /api/v1/admin/security/abuse-reports | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-028 | PATCH /api/v1/admin/security/abuse-reports/{report_id}/resolve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-029 | POST /api/v1/admin/security/bot-detection-event | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-030 | POST /api/v1/admin/security/rate-limit-violation | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-031 | POST /api/v1/admin/security/auto-suspend | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-032 | GET /api/v1/admin/security/api-keys | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-033 | GET /api/v1/admin/plans | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-034 | POST /api/v1/admin/plans | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-035 | GET /api/v1/admin/plans/performance | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-036 | PATCH /api/v1/admin/plans/{plan_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-037 | POST /api/v1/admin/plans/{plan_id}/archive | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-038 | POST /api/v1/admin/users/{user_id}/quota-override | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-039 | DELETE /api/v1/admin/users/{user_id}/quota-override | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-040 | GET /api/v1/admin/coupons | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-041 | POST /api/v1/admin/coupons | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-042 | POST /api/v1/admin/coupons/{coupon_id}/archive | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-043 | GET /api/v1/admin/trials | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-044 | POST /api/v1/admin/trials | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-045 | PATCH /api/v1/admin/trials/{trial_id}/extend | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-046 | POST /api/v1/admin/trials/{trial_id}/end | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-047 | GET /api/v1/admin/subscriptions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-048 | GET /api/v1/admin/subscriptions/stats | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-049 | GET /api/v1/admin/revenue | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-050 | GET /api/v1/admin/invoices | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-051 | GET /api/v1/admin/failed-payments | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-052 | GET /api/v1/admin/refunds | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-053 | GET /api/v1/admin/cost-ledger | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-054 | POST /api/v1/admin/cost-ledger | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-055 | DELETE /api/v1/admin/cost-ledger/{entry_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-056 | GET /api/v1/admin/cost-ledger/summary | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-057 | GET /api/v1/admin/promotions/ab-tests | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-058 | GET /api/v1/admin/promotions/referrals | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-059 | POST /api/v1/admin/promotions/referrals | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-060 | POST /api/v1/admin/promotions/referrals/{referral_id}/convert | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-061 | GET /api/v1/admin/automation/rules | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-062 | POST /api/v1/admin/automation/rules | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-063 | PATCH /api/v1/admin/automation/rules/{rule_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-064 | DELETE /api/v1/admin/automation/rules/{rule_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-065 | POST /api/v1/admin/automation/rules/{rule_id}/dry-run | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-066 | POST /api/v1/admin/automation/dry-run | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-067 | POST /api/v1/admin/automation/events/emit | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-068 | GET /api/v1/admin/automation/execution-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-069 | GET /api/v1/admin/analytics/overview | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-070 | GET /api/v1/admin/analytics/revenue | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-071 | GET /api/v1/admin/analytics/generations | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-072 | GET /api/v1/admin/analytics/generations/detailed | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-073 | GET /api/v1/admin/analytics/journey | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-074 | GET /api/v1/admin/analytics/users | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-075 | GET /api/v1/admin/analytics/traffic | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-076 | GET /api/v1/admin/analytics/posthog/config | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-077 | GET /api/v1/admin/analytics/button-clicks | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-078 | GET /api/v1/admin/analytics/page-duration | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-079 | POST /api/v1/admin/analytics/events | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-080 | GET /api/v1/admin/notifications/email-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-081 | GET /api/v1/admin/notifications/failed | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-082 | GET /api/v1/admin/notifications/history | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-083 | GET /api/v1/admin/notifications/status | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-084 | GET /api/v1/admin/notifications/announcements | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-085 | POST /api/v1/admin/notifications/announcements | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-086 | PATCH /api/v1/admin/notifications/announcements/{announcement_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-087 | DELETE /api/v1/admin/notifications/announcements/{announcement_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-088 | GET /api/v1/admin/notifications/templates | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-089 | POST /api/v1/admin/notifications/templates | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-090 | PUT /api/v1/admin/notifications/templates/{template_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-091 | DELETE /api/v1/admin/notifications/templates/{template_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-092 | GET /api/v1/admin/notifications/settings | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-093 | PUT /api/v1/admin/notifications/settings | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-094 | GET /api/v1/admin/support/tickets | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-095 | GET /api/v1/admin/support/tickets/{ticket_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-096 | PATCH /api/v1/admin/support/tickets/{ticket_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-097 | POST /api/v1/admin/support/tickets/{ticket_id}/resolve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-098 | GET /api/v1/admin/support/refunds | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-099 | PATCH /api/v1/admin/support/refunds/{refund_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-100 | GET /api/v1/admin/support/contact | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-101 | PATCH /api/v1/admin/support/contact/{contact_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-102 | GET /api/v1/admin/support/plan-overrides | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-103 | PATCH /api/v1/admin/support/plan-overrides/{override_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-104 | POST /api/v1/admin/support/plan-overrides/{override_id}/approve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-105 | GET /api/v1/admin/gdpr/export | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-106 | POST /api/v1/admin/gdpr/purge | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-107 | GET /api/v1/admin/reports/users-csv | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-108 | GET /api/v1/admin/infrastructure/mcp/sessions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-109 | GET /api/v1/admin/infrastructure/mcp/templates | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-110 | GET /api/v1/admin/infrastructure/health | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-111 | GET /api/v1/users/ | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-112 | GET /api/v1/users/{user_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-113 | PATCH /api/v1/users/{user_id}/status | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-114 | PATCH /api/v1/users/{user_id}/plan | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-115 | PATCH /api/v1/users/{user_id}/quota | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-116 | POST /api/v1/users/{user_id}/override | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-117 | GET /api/v1/internal/config/{domain} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-118 | GET /api/v1/internal/config | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-119 | GET /api/v1/admin/config/{domain} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-120 | PUT /api/v1/admin/config/{domain} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-121 | GET /api/v1/admin/config/{domain}/history | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |

## Renderer and synchronization probes

| Test ID | Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| PDF01 | invoice classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF02 | invoice grid-bordered | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF03 | invoice minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF04 | invoice modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF05 | invoice odoo-community | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF06 | proposal classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF07 | proposal minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF08 | proposal modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF09 | purchase_order classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF10 | purchase_order minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF11 | purchase_order modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF12 | quotation classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF13 | quotation minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF14 | quotation modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF15 | receipt classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF16 | receipt minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF17 | receipt modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF18 | Security Renderer blocks active scripts and internal network fetches | PDF text/bytes or blocked active content | {'trap_requests': 0} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| SYNC01 | Admin plan quota update reaches an already-cached Node consumer over real Redis pub/sub | Persisted admin change consumed correctly | 12 | PASS | [scenario data](evidence/synchronization-scenarios.json) |
| SYNC02 | Plan update survives a new admin API read | Persisted admin change consumed correctly | Fresh API read matched | PASS | [scenario data](evidence/synchronization-scenarios.json) |
