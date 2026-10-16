# Phase 5 — production readiness checklist

Date: 2026-10-16. **Decision: NOT READY. No production deployment authorized or performed.**

`PASS` means the stated scope passed. `FAIL` records an executed failing check. `BLOCKED` records a concrete missing prerequisite. `NOT RUN` means no execution evidence. Native/unit/offline success is not container, browser or external-provider success.

| Gate | Status | Evidence / owner action |
| --- | --- | --- |
| Preserve starting source and Phase 4 evidence | PASS | 878-source-file baseline; 177 Phase 4 evidence files unchanged; change manifest. |
| Authoritative source history/reviewed release revision | BLOCKED | Local Git has no HEAD/tracked tree; repository owner supplies provenance/review without overwriting work. |
| No production resources mutated | PASS | Only private generated configuration and uniquely named native fixture resources used. |
| Current remote/private environment hygiene | PASS | No embedded credential in current remote; environment files ignored; source-pattern check. Historical leakage is not disproved. |
| Revoke previously exposed credential | BLOCKED | Issuer owner must revoke and prove old-credential rejection/access review. |
| Owner-approved real secret rotation | BLOCKED | Existing procedure prepared; no owner execution/evidence. |
| Backend/user/admin builds and user/admin lint | PASS | Full Phase 5 regression logs. |
| Auth, payment, quota, notification and Python regression | PASS | Recorded per-suite results in verification report. |
| Chat/shared/data-calculation regression | PASS | 265 Shared Node and 224 Chat/user Vitest tests; browser test blocked separately. |
| Packaged email HTML templates | PASS | Compiled receipt/security-message artifact check. |
| Paid invoice receipt handoff/replay/crash recovery | PASS | 12-event/lost-acknowledgement real PostgreSQL/Notification probe. |
| Actual verified payment receipt in intended inbox | BLOCKED | Sandbox merchant, valid Resend project/sender/recipient and explicit send approval required. |
| Public/private CA coexistence and wrong-CA rejection | PASS | Trust regression; actual Groq TLS responses. |
| New trust entrypoint in actual images | BLOCKED | Docker host required; no image runtime claim. |
| Docker daemon available | BLOCKED | No socket; host portal/user namespace unavailable. |
| Actual backend/Python/PDF/frontend image builds | NOT RUN | No reachable daemon. |
| Container startup, readiness and network isolation | BLOCKED | Run generated Compose project on a dedicated host. |
| Redis TLS/authentication/AOF/recovery | PASS | Actual ACL/auth/Redis-loss checks; container persistence gate remains. |
| All nine backends and PDF sidecar listener | PASS | Native health/readiness evidence. Actual PDF renderer readiness blocked. |
| Scoped DB privileges and receiving-service authorization | PASS | Role-restarted services, direct-service denial, request binding/replay/TLS checks. |
| Fresh synthetic PostgreSQL migrations | PASS | Checked-in Prisma and service-owned schema initialization. |
| Sanitized legacy copy migration/rollback | BLOCKED | Approved snapshot, sanitization evidence and old-data inventory absent. |
| Legacy quota ledger import/cutover | BLOCKED | Owner mapping/receipt inventory/freeze/rollback approval required. |
| Legacy TOTP encryption/key migration | BLOCKED | Approved legacy copy/keyrings and owner migration evidence required. |
| User/admin current browser authentication/session workflow | BLOCKED | Chromium cannot start sandbox here. |
| Real browser required/optional fields, edits and calculations | BLOCKED | Browser host required; native/unit paths pass only their own scope. |
| Preview/PDF/raster alignment and actual watermarks | BLOCKED | Sandboxed browser/renderer unavailable. |
| Responsive/accessibility/manual keyboard acceptance | BLOCKED | No current real-browser evidence. |
| Uploaded owner/public template review/version/rollback | PASS | Real API catalog/visibility/HTML security tests. |
| Uploaded template actual PDF compatibility | BLOCKED | Sandboxed renderer required. |
| Shared server entitlements, overrides and status enforcement | PASS | Free/paid/expired/suspended/upgrade/downgrade/override tests. |
| Owner-approved retention defaults and deletion acceptance | BLOCKED | Quota answer did not provide retention days. |
| Agreed billing/quota policy preserved | PASS | Free 3 / Pro 10 / Max 25; shared account; first-use 20-hour window; each AI attempt + server PDF; browser exports unmetered; admin configurable. |
| Groq catalog and actual completion transport | PASS | Approved project catalog 200; two actual completion responses. |
| Live Groq successful validated MCP field persistence | FAIL | Bounded restricted-model/compact-prompt contract probe rejected tool proposals. |
| Full production-context AI workflows | BLOCKED | Not established by the contract probe; original eight-attempt allowance exhausted and further paid calls explicitly disabled. |
| Admin Groq/Claude routing selection | PASS | Current entitlement follows both administrator selections. |
| Actual Claude completions | BLOCKED | No authorized staging key/project. |
| Resend read-only authentication | FAIL | HTTP 401; provider owner must supply a valid dedicated key. |
| External emails, merchant payments, account mutations | NOT RUN | No approved staging resources/actions; none executed. |
| Actual PayHere/Paddle lifecycles/currency reconciliation | BLOCKED | Approved sandbox merchant/product/webhook/trusted recurring data absent. |
| Actual Firebase/Supabase/storage/signed provider downloads | BLOCKED | Approved resources unavailable; initial release scope must record disabled optional providers. |
| Backend/runtime frontend/Python dependency audits | PASS | Zero reported advisories in recorded audited scopes. |
| Full user/admin dependency audits | FAIL | Five high build-chain findings each; no patched braces release currently listed. |
| Backend/user/admin source SBOMs | PASS | CycloneDX artifacts generated from dependency trees. |
| Image SBOMs/scans, immutable base/image digests | BLOCKED | Actual images and verified source revision required. |
| Bounded native concurrency | PASS | 72/72 authenticated requests; concurrency 12; p95 830 ms; no production SLO claim. |
| Approved capacity/SLO/PDF/AI load test | BLOCKED | Targets and supported staging runtime required. |
| Idle graceful shutdown and recovery | PASS | Actual ordered process shutdown/restarts, Redis loss and durable reconstruction. |
| In-flight queue drain/deployed failover/alerts | NOT RUN | Representative workload and container runner required. |
| Actual backup and independent restore | BLOCKED | pg_dump/pg_restore absent; acquisition timed out; no completed drill. |
| Approved backup retention/encryption/RPO/RTO/DR | BLOCKED | SRE/DB owner target, resources and successful drill required. |
| Owner production promotion/change approval | NOT RUN | All blocking acceptance evidence must be reviewed first. |

Before promotion, the release owner must review [each blocker and its evidence requirements](PHASE5_RELEASE_BLOCKERS.md), the [verification report](PHASE5_STAGING_VERIFICATION_REPORT.md), exact image/source artifacts and the approved environment/provider scope. Optional providers may be excluded only with explicit scope and enforced administrator disablement. No production credential or resource action is implied by this checklist.
