# Production readiness checklist

Phase 5 current checklist and acceptance evidence: [production readiness](../../PHASE5_PRODUCTION_READINESS_CHECKLIST.md), [verification report](../../PHASE5_STAGING_VERIFICATION_REPORT.md). Historical Phase 4 checkboxes below are preserved.

**Decision: NOT READY.** Checked items describe observed local evidence, not a deployed certification. The full finding dispositions and acceptance limitations are in [16 — release blockers](16-PHASE4_RELEASE_BLOCKERS.md); exact verification is in [19 — results](19-FINAL_INTEGRATION_TEST_RESULTS.md).

## Product policy and enforcement

- [x] One current server entitlement contract includes account/subscription state, flags, models including Max, logo/branding, premium templates, watermark, priority, retention and expiring overrides.
- [x] Free 3 / Pro 10 / Max 25 shared account allowance; each AI provider request plus each server PDF; 20 hours from first accepted request; admin configuration; browser exports unmetered.
- [x] Free/paid/expired/suspended/upgrade/downgrade/override tests and direct-service forged-plan denial; billing/admin/quota policy consistency checked through real native services.
- [ ] Owner signs Free/Pro/Max retention defaults, legacy retention treatment and legacy quota cutover/import.
- [ ] Deployed browser entitlement and actual PDF watermark/priority/retention acceptance.
- [ ] Owner defines multi-account company membership if owner-only templates are insufficient.

## Billing, quotas and documents

- [x] Atomic payment event claim/state/outbox with PostgreSQL process-crash and concurrent duplicate evidence.
- [x] Ordered state/replay logic, refunds/net reporting by currency, trusted PayHere reconciliation and provider-acknowledged cancellation have local regression coverage.
- [x] Durable quota windows/receipts, duplicate reserve/refund races, boundary/override tests and real empty-Redis allowance recovery.
- [x] Document intent before reserve, repairable queues/refunds, restricted uploaded HTML/assets, owner/public versions/review/publication/withdrawal/rollback and private catalog IDOR correction.
- [ ] Real Paddle/PayHere sandbox renewal, plan change, cancellation, refund, replay/reordering and statement reconciliation.
- [ ] Resolve equal-time ambiguous Paddle subscription events using trusted provider snapshots or a verified operator process.
- [x] Billing Notification/Admin HTTP intake acknowledges durable SQL receipts; actual total Redis-loss reconstruction and billing action outcome tests pass.
- [ ] Real provider email receipt reconciliation, reviewed automation outcomes/external receiver idempotency, and remaining legacy Redis-only producer recovery acceptance. A downstream durable receipt is not final external delivery.
- [ ] Sandboxed PDF worker in-flight crash/restart, actual rendered template compatibility and storage-failure drill.
- [ ] Sanitized legacy migrations/counter cutover and verified rollback/restore.

## Security

- [x] Encrypted account-bound TOTP keyrings, atomic single-use steps, durable token revocation/admin sessions and concurrent login lock regression tests.
- [x] Scoped service request/queue/event identities, Redis ACLs and loss-generation replay guard exercised in a real local TLS stack.
- [x] Runtime PostgreSQL roles deny DDL, foreign Auth mutations and Auth credential reads; services restart and account anonymization retries pass using scoped roles.
- [x] TLS verification and wrong-CA/plaintext negative tests; sensitive request/provider error log corrections and dependency scans recorded.
- [ ] Owner-approved legacy TOTP migration, secret-store rollout, credential revocation/rotation and old-key rejection evidence, including the credential removed from the previous Git remote.
- [ ] Resolve or explicitly accept the unpatched high-severity `braces` build dependency chain in both frontends; scan built images/SBOMs and pin release digests. Runtime npm and installed Python scans are clean for checked manifests, not a substitute for image scanning.
- [ ] Deployed network/Redis isolation, sandbox enforcement, certificate lifecycle and external callback trust verification.
- [ ] Deployed abuse/load/failover tests and security owner sign-off.

## Build, deployment and operations

- [x] Backend/user/admin local builds and both frontend lint checks.
- [x] Full local regression attempted with explicit browser block and dependency findings; no security flags disabled.
- [x] Reproducible isolated staging generator, private CA/identity/ACL configuration, Dockerfile recipes, migration/role jobs and offline Compose/certificate checks.
- [x] Nine actual backend processes plus sidecar listener/readiness/auth checks, TLS PostgreSQL/Redis and both frontend HTTP startup checks. Renderer/browser readiness remains blocked.
- [ ] Actual Docker image builds, all container startup, deployed user/admin static assets and gateway/edge routing verification.
- [ ] Real user/admin browser workflows, accessibility and responsive acceptance; historical Phase 3 browser success is not Phase 4 evidence.
- [ ] Owner-approved capacity/SLO targets, concurrency/load results, in-flight queue drain, observability/alerting, backups, disaster recovery and rollback rehearsal.
- [ ] Revoke staging bootstrap password after enrollment; verify admin second factor, trusted edge/VPN and actual source-IP restrictions.

## External resources and release sign-off

- [ ] Groq staging project ownership/budget and real approved AI request; read-only catalog authentication is insufficient.
- [ ] Valid Resend staging key, verified sender/domain, approved test inbox and real delivery/callback; current inspected key returned 401.
- [ ] Later-stage Claude, Firebase, Paddle, PayHere and Supabase sandbox resources, callbacks, provider account ownership and actual workflow evidence.
- [ ] Product owner approves remaining policy choices; security/operations/billing owners accept resolved evidence and any explicit residual risk.
- [ ] Release owner records commit/image digests, sanitized-data migration results, all acceptance evidence and a final READY decision. No production deployment is authorized by this checklist.

No unchecked item is waived by a passing build or mocked test. U-R04/U-R06/U-R07/U-R08/U-R12/U-R13 remain partial, U-R10 remains externally blocked, and production remains **NOT READY**.
