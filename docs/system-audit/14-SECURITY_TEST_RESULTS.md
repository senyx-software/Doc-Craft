# Phase 3 — Security test results

<!-- PHASE4_STATUS -->
## Phase 4 — Current status (2026-10-16)

**Production: NOT READY. Staging: prepared, deployment verification blocked.** Actual final native integration: **214 VERIFIED, 2 BLOCKED, 0 UNRESOLVED**. Full regression orchestration: **17 PASS, 1 BLOCKED, 2 OPEN_FINDINGS** across 20 checks. Browser/PDF rendering is blocked by the host sandbox; frontend build dependency advisories remain open. No external provider workflow or Docker deployment is claimed successful.

Current policy is **Free 3 / Pro 10 / Max 25 shared metered units per account**, each outbound AI request plus each server PDF, **20 hours from first accepted use**, admin configurable. Browser exports remain unmetered. Retention defaults and legacy cutover still need owner decisions.

Authoritative entitlements, durable payment reducer/outbox and billing downstream SQL receipts, PostgreSQL quota/window recovery, secure owner/public uploaded-template versions, encrypted single-use TOTP, durable session revocation, scoped DB roles/TLS/replay-loss controls and staging tooling have implementation/regression evidence. The original release groups remain partial or externally blocked because their full acceptance criteria have not passed.

### Current verification boundary

Final results/commands are in report 19 and `evidence/phase4/regression/summary.json`; every native assertion is in `evidence/phase4/stack-integration.json`. Native transport/security/role/Redis-loss evidence is real local process integration. Signed provider fixtures, intercepted email challenges, test email transport and SDK stubs are explicitly not external sandbox evidence. Four real PostgreSQL notification receipt checks are recorded separately. Offline staging has 78 passing checks; no image build/container startup occurred.

Current sources: [16 release blockers](16-PHASE4_RELEASE_BLOCKERS.md), [17 staging guide](17-STAGING_DEPLOYMENT_GUIDE.md), [18 production checklist](18-PRODUCTION_READINESS_CHECKLIST.md), [19 final results](19-FINAL_INTEGRATION_TEST_RESULTS.md), [full technical workflow](../../DOCCRAFT_FULL_TECHNICAL_WORKFLOW.md).

**Everything below this Phase 4 preface is preserved historical evidence unless explicitly updated.** Earlier midnight quota semantics, unlimited Pro descriptions, absent upload pipeline and unresolved TOTP replay statements are superseded by the current reports; historical browser success is not Phase 4 browser evidence.
<!-- END_PHASE4_STATUS -->

Generated UTC: 2026-10-15T18:07:42.770447+00:00. **Production readiness: NOT READY.**

Latest actual isolated stack: **160/160 assertions verified**. Security-category assertions: **64/64**. Actual browser assertions: **11 verified**. These overlap: the stack includes browser-harness completion. Unit tests are not independent provider verification and are not added to a claimed feature-completion percentage.

## Automated commands

| Check | Result | Observed test count / scope | Evidence | Seconds |
| --- | --- | --- | --- | --- |
| backend-build | PASS | See exact command log | [log](evidence/phase3-backend-build.log) | 11.93 |
| user-build | PASS | See exact command log | [log](evidence/phase3-user-build.log) | 14.71 |
| admin-build | PASS | See exact command log | [log](evidence/phase3-admin-build.log) | 10.03 |
| user-lint | PASS | See exact command log | [log](evidence/phase3-user-lint.log) | 7.67 |
| admin-lint | PASS | See exact command log | [log](evidence/phase3-admin-lint.log) | 9.48 |
| chat-tests | PASS | Node: 262 passed; Vitest: 223 passed | [log](evidence/phase3-chat-tests.log) | 5.19 |
| auth-tests | PASS | Vitest: 35 passed | [log](evidence/phase3-auth-tests.log) | 1.47 |
| payment-tests | PASS | Vitest: 67 passed | [log](evidence/phase3-payment-tests.log) | 2.21 |
| quota-tests | PASS | Vitest: 25 passed | [log](evidence/phase3-quota-tests.log) | 1.46 |
| gateway-notification-tests | PASS | Vitest: 38 passed | [log](evidence/phase3-gateway-notification-tests.log) | 0.94 |
| admin-tests | PASS | pytest: 107 passed | [log](evidence/phase3-admin-tests.log) | 25.35 |
| document-tests | PASS | pytest: 70 passed | [log](evidence/phase3-document-tests.log) | 3.45 |
| analytics-tests | PASS | pytest: 3 passed | [log](evidence/phase3-analytics-tests.log) | 2.62 |
| shared-python-tests | PASS | pytest: 2 passed | [log](evidence/phase3-shared-python-tests.log) | 0.59 |
| configuration | PASS | See exact command log | [log](evidence/phase3-configuration.log) | 0.37 |
| api-denials | PASS | See exact command log | [log](evidence/phase3-api-denials.log) | 2.59 |
| renderer-browser-probes | PASS | See exact command log | [log](evidence/phase3-renderer-browser-probes.log) | 208.74 |
| stack | PASS | See exact command log | [log](evidence/phase3-stack.log) | 98.99 |
| dependency-audit | PASS | See exact command log | [log](evidence/phase3-dependency-audit.log) | 6.57 |
| python-dependency-audit | PASS | See exact command log | [log](evidence/phase3-python-dependency-audit.log) | 1.63 |
| diff-check | PASS | See exact command log | [log](evidence/phase3-diff-check.log) | 0.08 |

Logs retain exact commands, exit codes and UTC start times through `scripts/system_audit_check.py`. Root chat tests include shared Node contracts plus Vitest Chat/frontend/gateway contracts; the separate gateway suite overlaps. Python services are tested separately to avoid collisions among packages named `app`.

Frontend lint and build/type checks passed. Backend TypeScript builds passed; the backend workspaces do not define a separate lint command, so no independent backend lint result is claimed. Build logs retain existing bundle-size/deprecation/tool-configuration warnings. The dependency collection command succeeding means advisory JSON was collected; consult the counts below rather than interpreting collection PASS as zero advisories.

## Actual isolated resources

The harness requires loopback `PG_AUDIT_URL`, creates a uniquely named database and never resets/migrates an existing shared database. PostgreSQL was compiled from the official 18.4 source into an audit-owned temporary location. Auth, Chat, Payment and Quota ran checked-in migrations. Admin/Document/Analytics/Notification used real PostgreSQL clients and actual schema initialization. Redis runs on a random loopback port with generated per-service ACLs. All nine services plus the PDF renderer run as actual processes; the PDF worker, both Vite frontends and Chromium run as actual dependencies. Every provider credential is empty/synthetic; PostHog uses a closed loopback destination; Resend is a dummy local transport. No hosted data, real charges, real emails or production penetration testing were performed.

The checked-in runner stops its child process groups, retains evidence and reports failures instead of manufacturing success. Previous stack attempts remain under `stack-attempt-*.json`; the latest `stack-integration.json` is authoritative. Fresh-schema success does not prove a deployed legacy upgrade. No Docker/Podman executable was available, so container startup/network/TLS checks are configuration-only. Actual runtime/browser versions are recorded in [environment-phase3.json](evidence/phase3/environment-phase3.json); no production current-browser patch attestation is implied by a local render. Native tests use an explicitly selected browser and `--no-sandbox` in this container; production Chromium sandboxing/OS hardening is unverified.

## Required negative scenarios and evidence scope

| Scenario | Evidence / outcome | Limit |
| --- | --- | --- |
| Unauthenticated internal / forged identity headers | Live Auth, Quota, Payment, Chat MCP, Notification, Analytics, Admin config and PDF reject retired secret/forged headers | Health, explicit provider callbacks and expiring capability endpoints are intentionally public |
| Invalid/expired JWT, wrong issuer/audience/type/algorithm | Shared Node security regressions; direct backend authentication tests | Not every claim permutation is repeated over every live route |
| Unauthorized service identities | Actual Chat→Quota override, Payment→Auth status/stats, Gateway→full config, Notification→plans and Chat→Analytics reports denied | Method/path policy plus independent pairwise keys |
| Replay/body tampering | Real Redis replay rejection at Node and Python receivers; PDF body-binding mismatch denied | Redis pause/resume tested; full Redis data loss/failover not tested |
| Unauthorized admin / stale session / privilege escalation | Mounted-route denial inventory; restricted-role tests; persisted session revocation; wrong user signing secret rejected; role-name alone gives no rights | Authenticator step replay and encrypted TOTP storage remain open |
| Cross-user documents / sessions / canvas | Actual stack denies other user at session/document/canvas boundary; stale layout revision rejected | One representative fixture per document type |
| Unauthorized MCP / malicious tool output | Private transport denies unknown caller; in-memory MCP/repository tests reject cross-session/reserved/malformed proposals | Actual external model prompt-injection evaluation NOT TESTED |
| Webhook replay / altered unsigned IDs | Concurrent signed local duplicates yield one invoice; altered payment_id/subscription_id cannot create another charge record | Real provider sandbox and installment Retrieval verification NOT TESTED |
| Duplicate/poison queue messages | Actual Redis unsigned document/payment jobs fail before effects; signed-envelope wrong-ID/name/queue tests; persisted PDF replay and owner mismatch tests | Email/automation send/ack crash windows remain open |
| Invalid / oversized payloads | Zod/Pydantic/schema regressions; live gateway 400/413; ASGI chunked raw-body limit tests | Fleet load/slow-client resource exhaustion not benchmarked |
| Service outage / timeout / restart | Actual Auth stop/restart; Redis SIGSTOP/SIGCONT; renderer child kill/relaunch; Payment inbox reconstruction after process restart | No production DB failover, cluster outage or chaos test |
| Unauthorized configuration update / TOTP abuse | RBAC and negative service config grants; shared concurrent budget; protected authenticator setup | Real admin roles/toggle matrix not universally exercised through browser |
| Expired share capability | Actual owned document share URL expires in isolated PostgreSQL and becomes 404; storage signature tamper/expiry regressions | Supabase signed URLs NOT TESTED |
| Database / Redis security | Real migrations, CRUD, unique claims/inbox, Redis ACL/key/channel denials and Lua concurrency | Runtime database roles, TLS, at-rest encryption and backup recovery NOT TESTED |

## Actual stack assertions

| ID | Category | Workflow | Status |
| --- | --- | --- | --- |
| P3-I001 | Database | auth checked-in PostgreSQL migrations applied | VERIFIED |
| P3-I002 | Database | chat checked-in PostgreSQL migrations applied | VERIFIED |
| P3-I003 | Database | payment checked-in PostgreSQL migrations applied | VERIFIED |
| P3-I004 | Database | quota checked-in PostgreSQL migrations applied | VERIFIED |
| P3-I005 | Infrastructure | auth local startup | VERIFIED |
| P3-I006 | Infrastructure | chat local startup | VERIFIED |
| P3-I007 | Infrastructure | quota local startup | VERIFIED |
| P3-I008 | Infrastructure | payment local startup | VERIFIED |
| P3-I009 | Infrastructure | document local startup | VERIFIED |
| P3-I010 | Infrastructure | admin local startup | VERIFIED |
| P3-I011 | Infrastructure | sidecar local startup | VERIFIED |
| P3-I012 | Infrastructure | gateway local startup | VERIFIED |
| P3-I013 | Infrastructure | notification local startup | VERIFIED |
| P3-I014 | Infrastructure | analytics local startup | VERIFIED |
| P3-I015 | Security | Redis default user is disabled | VERIFIED |
| P3-I016 | Security | Redis Chat identity denied foreign-key | VERIFIED |
| P3-I017 | Security | Redis Chat identity denied payment-queue | VERIFIED |
| P3-I018 | Security | Redis Chat identity denied config-update | VERIFIED |
| P3-I019 | Security | Redis Chat identity denied privileged-command | VERIFIED |
| P3-I020 | Security | Redis Chat identity denied automation-channel | VERIFIED |
| P3-I021 | Security | Redis payment config cache is read-only | VERIFIED |
| P3-I022 | Security | Redis payment cannot publish privileged config invalidations | VERIFIED |
| P3-I023 | Security | Redis quota config cache is read-only | VERIFIED |
| P3-I024 | Security | Redis quota cannot publish privileged config invalidations | VERIFIED |
| P3-I025 | Security | Redis gateway config cache is read-only | VERIFIED |
| P3-I026 | Security | Redis gateway cannot publish privileged config invalidations | VERIFIED |
| P3-I027 | Security | Document cannot read Auth verification or reset email jobs | VERIFIED |
| P3-I028 | Security | Internal auth rejects old secret and forged identity headers | VERIFIED |
| P3-I029 | Security | Internal quota rejects old secret and forged identity headers | VERIFIED |
| P3-I030 | Security | Internal payment rejects old secret and forged identity headers | VERIFIED |
| P3-I031 | Security | Internal chat rejects old secret and forged identity headers | VERIFIED |
| P3-I032 | Security | Internal notification rejects old secret and forged identity headers | VERIFIED |
| P3-I033 | Security | Internal analytics rejects old secret and forged identity headers | VERIFIED |
| P3-I034 | Security | Internal admin rejects old secret and forged identity headers | VERIFIED |
| P3-I035 | Security | Internal sidecar rejects old secret and forged identity headers | VERIFIED |
| P3-I036 | Security | Service authorization chat → quota POST /v1/quota/override expects 403 | VERIFIED |
| P3-I037 | Security | Service authorization payment → auth PATCH /internal/users/fixture/status expects 403 | VERIFIED |
| P3-I038 | Security | Service authorization payment → auth GET /internal/users/stats-by-plan expects 403 | VERIFIED |
| P3-I039 | Security | Service authorization chat → analytics GET /v1/analytics/overview expects 403 | VERIFIED |
| P3-I040 | Security | Service authorization gateway → admin-api GET /api/v1/internal/config expects 403 | VERIFIED |
| P3-I041 | Security | Service authorization notification → admin-api GET /api/v1/internal/config/plans expects 403 | VERIFIED |
| P3-I042 | Security | Service authorization admin-api → analytics GET /v1/analytics/overview expects 200 | VERIFIED |
| P3-I043 | Security | Service authorization notification → admin-api GET /api/v1/admin/notifications/config/public expects 200 | VERIFIED |
| P3-I044 | Security | Service authorization document → pdf GET /ready expects 200 | VERIFIED |
| P3-I045 | Security | Service authorization admin-api → chat GET /api/internal/status/keys expects 200 | VERIFIED |
| P3-I046 | Security | Service authorization chat → admin-api GET /api/v1/internal/config/ai_model_routing expects 200 | VERIFIED |
| P3-I047 | Security | Python receiver rejects exact replay using real Redis | VERIFIED |
| P3-I048 | Security | Service authorization admin-api → auth GET /internal/users expects 200 | VERIFIED |
| P3-I049 | Security | Node receiver rejects exact replay using real Redis | VERIFIED |
| P3-I050 | Security | Service authorization document → pdf POST /generate expects 401 | VERIFIED |
| P3-I051 | Security | Unsigned document queue job rejected before processing | VERIFIED |
| P3-I052 | Security | Unsigned payment-webhook queue job rejected before processing | VERIFIED |
| P3-I053 | Authentication | Registration, stored verification challenge, verification and login through gateway | VERIFIED |
| P3-I054 | Security | Refresh credentials are stored only as digests | VERIFIED |
| P3-I055 | Functionality | Canvas layout persists without changing canonical business values | VERIFIED |
| P3-I056 | Security | Canvas ownership and stale writes are rejected | VERIFIED |
| P3-I057 | Functionality | Guest draft and canvas migrate atomically to the authenticated account | VERIFIED |
| P3-I058 | Security | Guest transfer is idempotent and cannot be stolen by another account | VERIFIED |
| P3-I059 | API | Profile update survives authenticated reload | VERIFIED |
| P3-I060 | Authentication | Persisted administrator password + one-time code sign-in | VERIFIED |
| P3-I061 | Admin synchronization | Isolated test rate policy persists through admin configuration | VERIFIED |
| P3-I062 | Admin synchronization | Admin daily allowance reaches authenticated user quota | VERIFIED |
| P3-I063 | Admin synchronization | Unified admin override persists plan and quota into user APIs | VERIFIED |
| P3-I064 | Admin synchronization | Override removal survives subsequent billing plan synchronization | VERIFIED |
| P3-I065 | Admin synchronization | Admin announcement reaches the authenticated user feed | VERIFIED |
| P3-I066 | Admin synchronization | Disabled announcement disappears from fresh user feed | VERIFIED |
| P3-I067 | Admin synchronization | Admin template withdrawal reaches Document catalog and rejects Chat alias selection | VERIFIED |
| P3-I068 | Admin synchronization | Admin template publication restores actual downstream availability | VERIFIED |
| P3-I069 | Chat | invoice multi-turn committed SSE update | VERIFIED |
| P3-I070 | Chat | invoice duplicate turn replay | VERIFIED |
| P3-I071 | Chat | invoice multi-turn committed SSE update | VERIFIED |
| P3-I072 | Chat | invoice duplicate turn replay | VERIFIED |
| P3-I073 | Admin synchronization | invoice admin MCP resource read | VERIFIED |
| P3-I074 | Chat | invoice chat fields persist after reload | VERIFIED |
| P3-I075 | PDF | invoice real Redis queue → worker → Chromium → persisted PDF | VERIFIED |
| P3-I076 | PDF | invoice exported PDF contains persisted chat edits | VERIFIED |
| P3-I077 | PDF | invoice PDF preserves calculated tax-inclusive total | VERIFIED |
| P3-I078 | Security | Fresh share capability resolves without exposing private document metadata | VERIFIED |
| P3-I079 | Security | Expired share capability is rejected | VERIFIED |
| P3-I080 | Security | Malformed and oversized gateway chat requests are rejected | VERIFIED |
| P3-I081 | Security | invoice cross-user document access denied | VERIFIED |
| P3-I082 | API | invoice document and session deletion persist | VERIFIED |
| P3-I083 | Chat | quotation multi-turn committed SSE update | VERIFIED |
| P3-I084 | Chat | quotation duplicate turn replay | VERIFIED |
| P3-I085 | Chat | quotation multi-turn committed SSE update | VERIFIED |
| P3-I086 | Chat | quotation duplicate turn replay | VERIFIED |
| P3-I087 | Admin synchronization | quotation admin MCP resource read | VERIFIED |
| P3-I088 | Chat | quotation chat fields persist after reload | VERIFIED |
| P3-I089 | PDF | quotation real Redis queue → worker → Chromium → persisted PDF | VERIFIED |
| P3-I090 | PDF | quotation exported PDF contains persisted chat edits | VERIFIED |
| P3-I091 | PDF | quotation PDF preserves calculated tax-inclusive total | VERIFIED |
| P3-I092 | Security | quotation cross-user document access denied | VERIFIED |
| P3-I093 | API | quotation document and session deletion persist | VERIFIED |
| P3-I094 | Chat | proposal multi-turn committed SSE update | VERIFIED |
| P3-I095 | Chat | proposal duplicate turn replay | VERIFIED |
| P3-I096 | Chat | proposal multi-turn committed SSE update | VERIFIED |
| P3-I097 | Chat | proposal duplicate turn replay | VERIFIED |
| P3-I098 | Admin synchronization | proposal admin MCP resource read | VERIFIED |
| P3-I099 | Chat | proposal chat fields persist after reload | VERIFIED |
| P3-I100 | PDF | proposal real Redis queue → worker → Chromium → persisted PDF | VERIFIED |
| P3-I101 | PDF | proposal exported PDF contains persisted chat edits | VERIFIED |
| P3-I102 | Security | proposal cross-user document access denied | VERIFIED |
| P3-I103 | API | proposal document and session deletion persist | VERIFIED |
| P3-I104 | Chat | receipt multi-turn committed SSE update | VERIFIED |
| P3-I105 | Chat | receipt duplicate turn replay | VERIFIED |
| P3-I106 | Chat | receipt multi-turn committed SSE update | VERIFIED |
| P3-I107 | Chat | receipt duplicate turn replay | VERIFIED |
| P3-I108 | Admin synchronization | receipt admin MCP resource read | VERIFIED |
| P3-I109 | Chat | receipt chat fields persist after reload | VERIFIED |
| P3-I110 | PDF | receipt real Redis queue → worker → Chromium → persisted PDF | VERIFIED |
| P3-I111 | PDF | receipt exported PDF contains persisted chat edits | VERIFIED |
| P3-I112 | PDF | receipt PDF preserves calculated tax-inclusive total | VERIFIED |
| P3-I113 | Security | receipt cross-user document access denied | VERIFIED |
| P3-I114 | API | receipt document and session deletion persist | VERIFIED |
| P3-I115 | Chat | purchase_order multi-turn committed SSE update | VERIFIED |
| P3-I116 | Chat | purchase_order duplicate turn replay | VERIFIED |
| P3-I117 | Chat | purchase_order multi-turn committed SSE update | VERIFIED |
| P3-I118 | Chat | purchase_order duplicate turn replay | VERIFIED |
| P3-I119 | Admin synchronization | purchase_order admin MCP resource read | VERIFIED |
| P3-I120 | Chat | purchase_order chat fields persist after reload | VERIFIED |
| P3-I121 | PDF | purchase_order real Redis queue → worker → Chromium → persisted PDF | VERIFIED |
| P3-I122 | PDF | purchase_order exported PDF contains persisted chat edits | VERIFIED |
| P3-I123 | PDF | purchase_order PDF preserves calculated tax-inclusive total | VERIFIED |
| P3-I124 | Security | purchase_order cross-user document access denied | VERIFIED |
| P3-I125 | API | purchase_order document and session deletion persist | VERIFIED |
| P3-I126 | Quota | Real Redis duplicate reservations consume one unit | VERIFIED |
| P3-I127 | Quota | Real Redis concurrent duplicate refunds preserve other reservation | VERIFIED |
| P3-I128 | Security | Chat cannot refund a Document-owned quota reservation | VERIFIED |
| P3-I129 | Quota | Delayed daily reset preserves current-day reservations in real Redis | VERIFIED |
| P3-I130 | Admin synchronization | Admin currency and prices reach public pricing | VERIFIED |
| P3-I131 | Billing | Annual hosted checkout uses configured LKR price and annual cadence | VERIFIED |
| P3-I132 | Billing | Signed PayHere fixture is durably accepted by real Redis queue | VERIFIED |
| P3-I133 | Billing | Signed callback activates server-bound owner and annual subscription | VERIFIED |
| P3-I134 | Security | Tampered PayHere custom fields cannot grant another user paid access | VERIFIED |
| P3-I135 | Billing | Concurrent duplicate signed callbacks are acknowledged | VERIFIED |
| P3-I136 | Billing | Duplicate signed callback deliveries produce one persisted invoice | VERIFIED |
| P3-I137 | Security | Changing unsigned PayHere IDs cannot create another invoice | VERIFIED |
| P3-I138 | Billing | Analytics reads currency-safe revenue through its scoped Payment identity | VERIFIED |
| P3-I139 | Billing | Financial reporting separates LKR from USD and normalizes annual revenue | VERIFIED |
| P3-I140 | Recovery | Payment restart reconstructs a lost Redis delivery from the durable inbox | VERIFIED |
| P3-I141 | Admin synchronization | Admin plan change reaches an already-active paid subscriber | VERIFIED |
| P3-I142 | Admin synchronization | Admin suspension invalidates an existing user access token | VERIFIED |
| P3-I143 | Admin synchronization | Admin reactivation restores permitted access | VERIFIED |
| P3-I144 | Browser | Live user/admin browser integration | VERIFIED |
| P3-I145 | Security | Logout invalidates refresh sessions when the browser omits the refresh credential | VERIFIED |
| P3-I146 | Security | Logged-out token denied at auth boundary | VERIFIED |
| P3-I147 | Security | Logged-out token denied at gateway boundary | VERIFIED |
| P3-I148 | Security | Logged-out token denied at chat boundary | VERIFIED |
| P3-I149 | Security | Logged-out token denied at quota boundary | VERIFIED |
| P3-I150 | Security | Logged-out token denied at payment boundary | VERIFIED |
| P3-I151 | Security | Logged-out token denied at document boundary | VERIFIED |
| P3-I152 | Security | Logged-out token denied at notification boundary | VERIFIED |
| P3-I153 | Security | Admin JWT rejects a token signed with the old user secret | VERIFIED |
| P3-I154 | Security | Admin session inventory contains the actual signed session | VERIFIED |
| P3-I155 | Security | Admin logout revokes the persisted JWT session | VERIFIED |
| P3-I156 | Recovery | Auth outage fails closed at gateway without losing persisted documents | VERIFIED |
| P3-I157 | Recovery | Auth restart restores permitted access using stored identity | VERIFIED |
| P3-I158 | Recovery | Replay store outage rejects protected gateway requests | VERIFIED |
| P3-I159 | Recovery | Redis resumes without losing revocation and quota state | VERIFIED |
| P3-I160 | Security | Stored notification metadata redacts account verification tokens | VERIFIED |

## Actual browser assertions

| Workflow | Status | Evidence |
| --- | --- | --- |
| Admin UI currency/price edit, second factor, database persistence, reload | VERIFIED |  |
| Admin inspection UI reads a persisted session through read-only MCP | VERIFIED |  |
| Admin price edit reaches actual user pricing UI | VERIFIED |  |
| User pricing remains current after browser reload | VERIFIED |  |
| Canvas position edit persists through the actual user control | VERIFIED | Click element → ArrowRight → autosave HTTP PUT → PostgreSQL |
| Canvas presentation survives actual browser reload | VERIFIED | Fresh API state hydrates the saved position |
| Browser canvas PDF downloads after server confirmation | VERIFIED | DocCraft-invoice-1702.pdf |
| Guest account sign-in executes the authorized draft transfer | VERIFIED | Actual guest login form; browser credentials change after server ownership transfer |
| Guest browser draft retains its values under the real account owner | VERIFIED |  |
| Pricing page fits a mobile viewport | VERIFIED |  |
| Live integration browser pages have no uncaught script errors | VERIFIED | [] |

The browser drives actual price edit/second factor, MCP inspection, user pricing reload, canvas selection/ArrowRight autosave, page reload, Download PDF and guest login. It does not intercept API success responses. Browser-export PDFs are rasterized; PDF text extraction is not a valid semantic test for them. Server worker PDFs are text-extracted and checked for persisted edits and 43.89 totals where applicable. The separate renderer suite covers built-in rendering, remote-resource/script/file attacks, capacity and browser restart. See `pdf-scenarios.json`, `additional-probes.json`, and `browser-scenarios.json` for exact assertions rather than extrapolating universal visual parity.

## Honest failure history

An exploratory root Vitest command skipped service-specific environment fixtures and failed import/setup; it was replaced with each workspace's configured `npm test`. Analytics initially ran without its service import path; it passes from its own directory. Browser fixture numeric input selection was corrected to explicit Select All/Backspace. Browser store inspection from Puppeteer's isolated polling realm was replaced with actual DOM controls. The real canvas regression found an incorrectly registered autosave listener and now tests an existing element without adding one. New dependency API/type differences were corrected and rerun. Earlier failures are not production passes; final command and stack records above are authoritative.

## Dependency advisory evidence

| Component | Scope | Registry counts | Exit code | Evidence |
| --- | --- | --- | --- | --- |
| backend | all | {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0} | 0 | [JSON](evidence/phase3/dependencies-backend-all.json) |
| backend | production | {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0} | 0 | [JSON](evidence/phase3/dependencies-backend-production.json) |
| user | all | {'info': 0, 'low': 0, 'moderate': 2, 'high': 5, 'critical': 0, 'total': 7} | 1 | [JSON](evidence/phase3/dependencies-user-all.json) |
| user | production | {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0} | 0 | [JSON](evidence/phase3/dependencies-user-production.json) |
| admin | all | {'info': 0, 'low': 0, 'moderate': 2, 'high': 5, 'critical': 0, 'total': 7} | 1 | [JSON](evidence/phase3/dependencies-admin-all.json) |
| admin | production | {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0} | 0 | [JSON](evidence/phase3/dependencies-admin-production.json) |

Registry advisories are dependency findings, not proof of an exploitable deployed endpoint. Build-time Tailwind 3 transitive advisories remain explicitly open; the upgrade needs a deliberate CSS/browser/PDF compatibility migration. Runtime and full-tree scans are reported separately. No force downgrade or global audit suppression was used.

## Python environment advisory evidence

The actual isolated Python environment scan reports **0 packages with advisories**. See [pip-audit JSON](evidence/phase3/python-dependencies.json) and its command log above. The first scan identified the local pip installer; pip was upgraded and the scan repeated, with [before-upgrade evidence](evidence/phase3/python-dependencies-before-pip-upgrade.json) retained. This checks installed versions, not reproducibility of the currently lower-bounded service requirements or the unexecuted production images. Lock production Python dependencies and scan each final image.
