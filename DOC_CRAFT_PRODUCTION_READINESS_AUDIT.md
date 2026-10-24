# DocCraft AI production readiness audit

> **Remediation update:** The original audit below describes its frozen baseline. Current fixes, executed/blocked verification and remaining **NO-GO** decision are recorded in [the remediation plan](docs/production-remediation/00-REMEDIATION-PLAN.md), [current findings](docs/production-audit/15-FINDINGS-REGISTER.md) and [verification results](docs/production-remediation/05-VERIFICATION-RESULTS.md).

**Decision: NO-GO — 2026-10-21.** The audit inspected the current working tree and exercised a fresh isolated native stack, real browser/API/database flows and regression tests. Application and deployment source remained unchanged from the audit snapshot. Only audit tools, reports and owned synthetic fixtures were created. No production deployment, infrastructure change, real payment, credential rotation or history rewrite occurred.

## Executive summary and coverage

The current production Compose contains 21 entries: 12 application containers (10 backend runtimes and two frontends), PostgreSQL/Redis/Caddy, optional Ollama and five one-shot jobs. The [architecture report](docs/production-audit/01-SYSTEM-ARCHITECTURE.md) includes the diagram and per-service source, startup/build commands, ports, configuration/secrets, health, authentication, dependencies, storage and resource caps. Counts were recomputed from current files.

AST and mount discovery found **351 explicit method/route pairs**, 12 FastAPI framework routes, 15 gateway wildcard proxy groups and separately identified plugin surfaces. This is not 351 proven business workflows. All 351 explicit paths received actual unauthenticated probes. Auth metrics/OAuth initiation and Swagger-generated surfaces are identified separately; implicit HEAD/OPTIONS and arbitrary static-asset filenames are not counted as independent business APIs. The [API inventory](docs/production-audit/02-COMPLETE-API-INVENTORY.md) links handlers, sources, authentication/authorization, validation, dependencies and exact verification limits.

Frontend discovery recorded **228 transport/wrapper callsites**: 216 declaration matches, eight dynamic transports and four unused legacy paths without matching endpoints. The inventory contains 812 interaction attributes grouped into 74 interactive components and 91 current admin navigation entries. These are distinct counting units. The [mapping report](docs/production-audit/03-FRONTEND-API-INTEGRATION.md) does not equate a declaration match with functional integration. Every uncovered action variant remains UNTESTED.

Fresh regression passed **1,073 unique cases**: 1,084 executions minus 11 overlapping gateway cases. These retain their original mock/fixture scope. Actual integrated HTTP checks yielded 24 passes and two OAuth routing failures out of 26. The main Chromium suite yielded 98 navigation/basic-flow passes and one MFA display failure out of 99 checks. Supplemental real browser probes reproduced custom-template reload loss, fabricated paid receipts and incorrect cold billing state. [Report 14](docs/production-audit/14-END-TO-END-TEST-RESULTS.md) distinguishes navigation, mutation/persistence, mocked unit tests, negative checks, blocked tests and unexecuted variants.

## Confirmed production blockers

- **Alternate OAuth authentication policy:** the callback signs sessions without the main MFA/account-state checks. The actual handler reproduced four states using explicitly stubbed Google/database transport. Correct the policy before exposing the currently mismatched gateway callback paths. SEC-001, API-001 and FE-002 are one dependent remediation sequence.
- **Password-reset race:** two simultaneous requests using the same reset token both returned success and changed the password through the actual gateway, Auth Service and PostgreSQL. See SEC-002 and [runtime evidence](docs/production-audit/evidence/runtime/password-reset-race.json).
- **Concurrent staff overwrite:** two actual repository creates selected one staff ID and retained one account in a fresh SQLite fixture. The PostgreSQL upsert path also requires acceptance testing. See DB-001 and [race evidence](docs/production-audit/evidence/admin-create-race.json).
- **Document and security UI integrity:** a saved literal canvas appeared after Apply and disappeared after same-session reload; profile normalization hid an enabled MFA state. See FE-004/FE-003 and their real browser evidence.
- **Financial correctness:** a synthetic pro account with zero billing invoices displayed a fixed paid receipt after in-app navigation; its cold billing view initially showed FREE. The receipt Download only invokes an alert. Subscription rows also hardcode USD/monthly amounts rather than actual currency/cadence. See FE-001/FE-005/API-004.
- **AI accuracy:** retained actual model responses independently regraded against current unchanged tool schemas passed only 23/112 cases for 1.7B and 6/16 for the bounded 4B sample. Fresh inference was blocked by conservative shared-host memory headroom and missing approved cloud credentials. Historical real inference is not presented as new inference.
- **Deployment and recovery:** upstream image advisories, unbuilt final images, unverified secure PDF/Docker/TLS/resource/rollback behavior, and missing scheduled encrypted off-server backups/full-host recovery remain launch blockers.

The [27-finding register](docs/production-audit/15-FINDINGS-REGISTER.md) distinguishes 17 confirmed defects, four potential risks and six blocked verification areas. Each entry has severity, root cause, evidence, reproduction, impact, recommended fix, estimated effort and verification status. Scanner CRITICAL ratings are not represented as proof of a compromise. The register includes untested failure branches rather than labeling them functional.

## Verified positive controls

An actual admin quota update propagated from three to two through database/cache/Quota Service. Exactly two of eight concurrent signed reservations succeeded; six were denied. Selected other-user conversation/template reads returned 403/404; a stale editor revision returned 409. A real signed internal call succeeded, replay returned 409 and body tampering returned 401. Redis pause produced 503 followed by 200 after recovery. A PostgreSQL pause held the request until recovery rather than returning data during the pause. See [control and failure evidence](docs/production-audit/evidence/runtime).

The eight-user deterministic edit burst completed 96/96 updates with correct totals/customer preservation and zero inference calls. Nearest-rank p50/p95/p99 were **343/580/661 ms**. This short native burst is not sustainable mixed VPS throughput. Sixteen diagnostic signed PDFs passed only with an explicit test-only unsandboxed launcher; normal signed readiness/rendering failed in this environment. Production sandbox acceptance remains required.

A real snapshot dump restored 73 tables, 162 rows and 568 constraint definitions with matching content/schema hashes. Dump took 101 ms and restore 333 ms for this small synthetic dataset. The restored database was dropped after verification. This is native PostgreSQL 18.4 over loopback, not production PostgreSQL 17/TLS, off-server/PITR, legacy-data or complete VPS recovery. All five checked logical-owner joins had zero orphans; this does not establish integrity of unsupplied production data.

Both frontends lint/build and all backend builds passed. Actionlint, Terraform formatting/validation, Compose syntax and 29 deployment-policy tests passed. Source/compiled-secret checks and current production npm/Python audits passed. Default available Git-history scanning produced 273 classified hash/prose/synthetic/public-client matches; no committed backend credential was confirmed. External credential validity was not checked. Final application container layers remain unbuilt/unscanned. [Validation summary](docs/production-audit/evidence/validation-summary.json) records scope and execution-log hashes.

## Explicit readiness answers

| Question | Evidence-based answer |
|---|---|
| Are all frontend API calls connected? | No blanket pass: 216 source matches, eight dynamic transports and four unused undeclared wrappers; payload/state/OAuth defects remain. |
| Which endpoints are missing, broken, insecure or unused? | OAuth public routing and alternate callback/reset policy are defective; four legacy wrappers have no declared endpoint; payment-method mutations intentionally return 501; analytics error and financial-response contracts need repair. Report 02 retains verification status for every declared path. |
| Are user/admin features complete? | No. Actual canvas, MFA and billing defects exist, alongside the staff race and unexecuted action/provider variants. |
| Are hardcoded values, credentials or mocks present? | Fixed paid receipts and client demo branches are production code. The redacted configuration inventory distinguishes constants/defaults/test data; 1,572 candidates are not 1,572 vulnerabilities. No committed backend credential was confirmed in the available history. |
| Can users access another user's data? | Tested conversation/template cases were denied. All object/mutation paths were not exhausted; no observed leak is not a universal isolation guarantee. No separate organization-tenant model was identified; tested ownership is user-based. |
| Can regular users access admin functionality? | Tested regular JWTs were rejected and live RBAC/source controls were reviewed; every permission combination remains untested. |
| Are subscription quotas and billing secure against bypass? | Actual quota concurrency/propagation held. Real provider checkout/webhook/refund/reconciliation is blocked and financial display defects remain. |
| Can the chatbot reliably create/edit documents? | No. Candidate real-model proposal accuracy fails. Deterministic edits work but do not establish the full conversational capability. |
| Can microservices communicate securely? | Selected actual signing/replay/ACL chains work. All private TLS, network, queue and provider failure paths are not verified. |
| Can one VPS handle concurrent users? | The short native eight-client burst works. Full mixed sustained VPS/cgroup capacity was not measured; no 8 GB certification or lowest-cost plan is proven. |
| Are Docker, Terraform and Actions ready? | Source safeguards/syntax pass. Actual builds/runtime, provider/state, GHCR/SSH/protected settings and rollback remain essential unverified gates. |
| Are backups, monitoring and recovery sufficient? | No. A native DB restore passes, but scheduled encrypted off-server/key/asset recovery, external failure alerts and full-host restoration remain missing/unverified. |
| What must be fixed before launch? | Authentication/races; customer document/security/financial correctness; fixed images and secure deployment/rollback/recovery; capable AI; full action/provider coverage and measured operating SLOs. |

## Remediation order, capacity and operations

The [prioritized remediation plan](docs/production-audit/15-FINDINGS-REGISTER.md) starts with authentication/account integrity. Do not repair the public OAuth route in isolation before the callback's weaker policy is fixed. Then address document persistence and financial/security state, close Docker/image/recovery gates, approve capable AI and complete action-level/provider verification. Each fix needs its failing reproducer, regression and actual owning-service/browser acceptance.

Keep both production enable gates disabled. Proposed RPO at most one hour and RTO at most four hours are not achieved commitments; operator acceptance and complete recovery drills are required. A four-vCPU/16-GiB amd64 machine is only a staging benchmark candidate. Shared-host measurements do not establish a production minimum, provider price, zero-downtime deployment or high availability.

## Detailed reports

- [01-SYSTEM-ARCHITECTURE.md](docs/production-audit/01-SYSTEM-ARCHITECTURE.md)
- [02-COMPLETE-API-INVENTORY.md](docs/production-audit/02-COMPLETE-API-INVENTORY.md)
- [03-FRONTEND-API-INTEGRATION.md](docs/production-audit/03-FRONTEND-API-INTEGRATION.md)
- [04-USER-FUNCTIONALITY.md](docs/production-audit/04-USER-FUNCTIONALITY.md)
- [05-ADMIN-FUNCTIONALITY.md](docs/production-audit/05-ADMIN-FUNCTIONALITY.md)
- [06-HARDCODED-DATA-AND-CONFIG.md](docs/production-audit/06-HARDCODED-DATA-AND-CONFIG.md)
- [07-SECURITY-AUDIT.md](docs/production-audit/07-SECURITY-AUDIT.md)
- [08-DATABASE-INTEGRITY.md](docs/production-audit/08-DATABASE-INTEGRITY.md)
- [09-MICROSERVICES-COMMUNICATION.md](docs/production-audit/09-MICROSERVICES-COMMUNICATION.md)
- [10-AI-AND-DOCUMENT-WORKFLOWS.md](docs/production-audit/10-AI-AND-DOCUMENT-WORKFLOWS.md)
- [11-PERFORMANCE-AND-SCALABILITY.md](docs/production-audit/11-PERFORMANCE-AND-SCALABILITY.md)
- [12-DEVOPS-AND-DEPLOYMENT.md](docs/production-audit/12-DEVOPS-AND-DEPLOYMENT.md)
- [13-OPERATIONS-AND-RECOVERY.md](docs/production-audit/13-OPERATIONS-AND-RECOVERY.md)
- [14-END-TO-END-TEST-RESULTS.md](docs/production-audit/14-END-TO-END-TEST-RESULTS.md)
- [15-FINDINGS-REGISTER.md](docs/production-audit/15-FINDINGS-REGISTER.md)
- [16-PRODUCTION-READINESS-SCORECARD.md](docs/production-audit/16-PRODUCTION-READINESS-SCORECARD.md)

Provenance and coverage: [source snapshot](docs/production-audit/evidence/source-snapshot.json), [API records](docs/production-audit/evidence/api-inventory.json), [frontend mapping](docs/production-audit/evidence/frontend-api-map.json), [feature matrix](docs/production-audit/evidence/end-to-end-matrix.json), [scorecard](docs/production-audit/16-PRODUCTION-READINESS-SCORECARD.md). AST/pattern enumeration is not line-by-line semantic or runtime proof. Unexecuted tests remain UNTESTED; only genuine missing prerequisites are BLOCKED. The overall production recommendation is NO-GO.
