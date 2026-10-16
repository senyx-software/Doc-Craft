# Phase 5 — release blockers and required evidence

Date: 2026-10-16. **Release decision: NOT READY.** Staging artifacts and native verification exist; a deployed staging environment has not been verified.

Local corrections and exact files/tests are in the [verification report](PHASE5_STAGING_VERIFICATION_REPORT.md). Current machine-readable evidence is [here](docs/system-audit/evidence/phase5/verification-summary.json). Historical U-R findings retain their Phase 4 acceptance criteria; a narrowly passing correction does not close an entire group.

## P5-B01 — actual Docker staging deployment

**Status: BLOCKED. Owner: staging infrastructure/DevOps. Related: U-R13.**

Prerequisite: an isolated nonproduction Docker host accessible from the execution environment. The host binary is present here, but the inspected daemon sockets are absent, the Flatpak host portal is unavailable and namespace creation is denied. Rootless Docker also requires usable user namespaces; it cannot resolve this restriction from inside this session.

Next action: provide a dedicated staging VM/runner or execute outside Flatpak on that dedicated host. For an already installed rootless setup, the host operator can use:

```sh
# Dedicated staging host terminal, outside this restricted IDE environment.
unshare -Ur true
dockerd-rootless-setuptool.sh install
systemctl --user enable --now docker
docker --context rootless info
docker compose version
```

The setup tool checks subordinate UID/GID and helper prerequisites. If the chosen dedicated host instead uses a system-managed daemon, its operator starts that daemon and grants the staging account appropriate access. These are alternatives, not commands to modify a shared production daemon. See [official rootless prerequisites](https://docs.docker.com/engine/security/rootless/).

Then generate a NEW directory; retain the resulting project/secrets rather than regenerating over it:

```sh
.venv-local/bin/python scripts/prepare_staging.py --output .local/staging-phase5-host
.venv-local/bin/python scripts/verify_staging.py .local/staging-phase5-host
docker compose -f .local/staging-phase5-host/compose.yaml config --quiet
docker compose -f .local/staging-phase5-host/compose.yaml build
docker compose -f .local/staging-phase5-host/compose.yaml up -d postgres redis
docker compose -f .local/staging-phase5-host/compose.yaml --profile tools run --rm migrate-node
docker compose -f .local/staging-phase5-host/compose.yaml --profile tools run --rm migrate-python
docker compose -f .local/staging-phase5-host/compose.yaml --profile tools run --rm provision-roles
# Complete private provider/admin configuration described in guide 17 first.
docker compose -f .local/staging-phase5-host/compose.yaml up -d
docker compose -f .local/staging-phase5-host/compose.yaml ps
```

Required evidence: source/lockfile hashes, exact build logs and exits, resolved base/image digests, all nine backends/PDF/two frontends healthy, actual scoped runtime credentials, migrations, authenticated Redis TLS/AOF restart, only intended edge exposure, direct-service denial/replay checks, private network egress tests and graceful recovery. Current [78 offline checks](docs/system-audit/evidence/phase5/staging-offline-checks.json) are preparation evidence only. Do not print expanded Compose environment values or point these commands at production resources.

## P5-B02 — sandboxed browser and actual PDF acceptance

**Status: BLOCKED. Owner: runner/OS owner and QA. Related: U-R04/U-R06/U-R08/U-R11/U-R13.**

Prerequisite: a current Chromium installation on a runner permitting its normal non-root sandbox. Here the real binary aborts `No usable sandbox!`, and `unshare -Ur true` fails. Do not disable sandboxing, add container privileges or turn off security policy to force a pass.

Next action: validate `unshare -Ur true` and a sandboxed Chromium headless `about:blank` launch on the dedicated runner, then the actual PDF service under the generated container restrictions. Use a current approved browser, not the old cached Chrome 131 as a release browser. Run the existing real-browser suite with private synthetic fixture input and a trusted staging CA; it reads JSON from stdin:

```sh
node scripts/system_audit_phase3_browser.cjs < /private/staging-browser-fixtures.json
```

Input contains staging URLs, fixture sessions/tokens and a fixture DB URL; retain it privately and never log it. The JSON shape is constructed in `system_audit_phase4_stack.py` as `browser_input`. Tests must use isolated identities and no production database.

Required evidence: fresh user/admin login/logout/session tests, chat reload and required/optional collection, universal edits/corrections, line items/taxes/discounts/notes/dates, canvas/preview/PDF alignment, actual free/paid watermarks, uploaded template/PDF compatibility/rollback, signed file downloads, keyboard/focus/labels/contrast and narrow/mobile/desktop screenshots. Neither HTTP frontend startup nor historical Phase 3 screenshots closes this gate.

## P5-B03 — live AI workflow acceptance

**Status: FAIL for the bounded live contract probe; further execution BLOCKED by owner instruction. Owner: AI/full-stack lead and product owner.**

Prerequisite: a new explicit request/spend budget if the owner later permits more calls; appropriate provider project rate limits; an authorized Claude staging project/key before testing Claude. The owner exhausted the original eight attempts and then explicitly disabled further paid calls.

Observed: Groq catalog succeeds and verified TLS now reaches actual completions. Two returned tool calls were rejected by the existing evidence/schema contract; two requests failed `tool_use_failed`, and one hit rate limiting. The probe used a compact synthetic prompt and only the cheaper `openai/gpt-oss-20b`, not the production HTTP route/context/default model chain. These failures do not prove a defect in production-context extraction, but they also do not establish successful integration.

Next action when newly authorized: run synthetic conversations through the actual Chat HTTP route and production `buildContext`/configured primary/fallback models; preserve per-attempt costs, quota reservations, provider request IDs and valid MCP operations. Diagnose tool-proposal failures using synthetic artifacts; never execute raw rejected provider generations or weaken evidence checks. No additional paid call is presently authorized.

Required evidence: successful field extraction/persistence, item add/update/remove without duplicates, pending confirmation and yes/no persistence, discount/tax arithmetic, notes/date validation, long-session retrieval/reload, bounded retries and rate-limit/outage recovery, exact provider-attempt quota accounting, and admin Groq→Claude→Groq behavior. Admin selection propagation passed natively; Claude completion and the full user AI workflow remain unverified.

## P5-B04 — real transactional email and payment receipts

**Status: BLOCKED; current Resend catalog authentication FAIL (401). Owner: messaging/account owner and QA. Related: U-R07/U-R13.**

Prerequisite: a dedicated approved staging Resend project/key, verified sender domain/address, designated test recipient and explicit approval to send to it. The owner's instruction to email payment proof established the feature requirement, not an approved external test inbox/account.

Next action: owner privately provisions those resources and approves bounded staging sends. Keep provider disablement enforced until configured. Test security messages and a receipt from a genuinely verified sandbox payment, including retry/idempotency and signed status-webhook handling.

Required evidence: provider authentication, real accepted email ID, intended inbox receipt, exact currency/amount/reference, duplicate callback and lost-acknowledgement behavior, webhook signature/age rejection, disabled-provider block, and handling of uncertain outcomes beyond provider deduplication retention. Native receipt and test-transport successes are not external delivery evidence.

## P5-B05 — actual merchant lifecycle integration

**Status: BLOCKED. Owner: payments merchant owner and billing QA. Related: U-R02/U-R07.**

Prerequisite: approved PayHere/Paddle sandbox merchant credentials, product/price identifiers, callback/webhook secrets, sandbox-origin verification, accessible HTTPS callbacks, trusted PayHere recurring retrieval permissions and its documented timestamp offset where the provider omits a zone.

Next action: execute bounded sandbox checkout, renewal, cancellation, refund, failed charge and plan-change scenarios; preserve sanitized provider references/statements and ordered event evidence. No live payment or production merchant action is authorized.

Required evidence: one authoritative subscription state after out-of-order/duplicate/replayed events, genuine trusted recurring identity matching, atomic claim/outbox crash recovery, refunds and invoice receipt convergence, and currency-separated gross/refund/net totals matching sandbox statements. Native signed fixtures only verify application handling.

## P5-B06 — Firebase and storage activation

**Status: BLOCKED for external activation/acceptance. Owner: identity/storage project owners.**

Prerequisite: approved staging Firebase project/web client/test identities and Supabase project/service key/private bucket/access policies. No usable approved resources were supplied. Initial deployment preference is Groq then Resend, with additional providers later; inactive integrations must stay disabled through administrator policy.

Next action: privately configure approved resources only when enabled in the release scope. For storage, test object isolation, expiry/revocation of signed downloads, deletion/retention and genuine unavailable-provider recovery. For Firebase, test issuer/project/audience, expired/revoked/foreign-project token rejection and admin disablement.

Required evidence: actual provider-backed identity/storage operations using synthetic accounts/objects and the appropriate enabled/disabled UI/API behavior. Native local-storage/SDK tests do not establish Supabase or Firebase readiness. The owner must record which optional integrations are excluded from the initial staging release.

## P5-B07 — unpatched build dependency advisory

**Status: FAIL. Owner: frontend/dependency maintainers and security release owner. Related: U-R13.**

Prerequisite: a supported patched dependency chain or a reviewed dependency replacement that passes browser regression. Both frontend full audits have five high findings from the `braces`/micromatch/fast-glob/chokidar/Tailwind chain. The [primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no patched version; registry latest remains 3.0.3.

Next action: monitor the upstream fix or prepare an incremental supported toolchain migration on a sandbox-capable runner. Keep untrusted patterns/source out of build inputs while assessing exposure; this mitigation is not an audit pass. Do not suppress findings or invent a version override.

Required evidence: complete npm audits, lockfile/source SBOM, actual clean builds and browser/visual regression. Runtime frontend audits and backend/Python audits report zero advisories; image package findings remain unknown.

## P5-B08 — credential revocation, rotation and source provenance

**Status: BLOCKED. Owner: credential issuers/security owner and repository owner. Related: U-R10/U-R12/U-R13.**

Prerequisite: owner approval for the [existing rotation procedure](docs/system-audit/17-STAGING_DEPLOYMENT_GUIDE.md#owner-approval-and-credential-rotation-procedure), issuer access and a deployment rollback plan. The prior embedded Git-remote credential must be revoked even though the current remote is clean. The local Git repository has no historical commits to inspect or authenticate.

Next action: revoke the exposed credential at its issuer, review access, recover authoritative repository history through the repository owner without overwriting this working tree, and establish a reviewable source revision. Rehearse keyring/token/TOTP/DB/Redis/provider/TLS rotation in staging; never rotate production automatically.

Required evidence: issuer revocation/audit record, old-secret rejection, new-secret acceptance and rollback behavior, TOTP account-bound migration/replay checks, session/token invalidation, verified source revision/review and signed owner approval. No secret values belong in these artifacts.

## P5-B09 — sanitized legacy migration and quota cutover

**Status: BLOCKED. Owner: data/DB owner, billing/quota owner and product owner. Related: U-R04/U-R07/U-R08/U-R12.**

Prerequisite: approved sanitized legacy snapshot, inventory of old schema/timezone/data, old Redis counters and reservation/refund receipts, encrypted TOTP keyrings and a signed cutover decision. Fresh synthetic migrations passed, but no genuine sanitized legacy copy was supplied.

Next action: restore into a NEW isolated project; dry-run checked-in migrations and TOTP re-encryption. Freeze metered traffic for an approved import mapping old counters/receipts to the agreed rolling 20-hour ledger. Reconcile ambiguous legacy outbox timestamps where non-UTC SQL defaults may have been used. Do not reset historical usage or invent receipt identities.

Required evidence: sanitization/backup checksums, before/after counts and constraints, preserved subscription/document/template/storage/session data, no plaintext TOTP, quota usage/refunds/window preservation, failed-migration rollback and application acceptance on that copy.

## P5-B10 — backup/restore and operational capacity acceptance

**Status: BLOCKED / NOT RUN. Owner: SRE/DB owner and product owner. Related: U-R13.**

Prerequisite: PostgreSQL 17+ client tools, a dedicated staging backup target with approved encryption/access/retention, RPO/RTO and workload/SLO targets. Current native bundle has only server/init tools; official client-source acquisition timed out. No successful dump/restore is claimed.

Next action: install matching clients on the dedicated staging host or use the actual PostgreSQL container once available. The owned-fixture drill accepts `PG_CLIENT_BIN_DIR`; production DR requires a separate approved procedure and sanitized snapshot. Exercise full backup/restore and rollback with checksums/constraints, then in-flight queue drain, worker crash and service recovery under bounded representative load. Verify observability/alerts.

Required evidence: real dump and independent restore, permissions/encryption and restored data checks, measured approved RPO/RTO, no lost/duplicated metered work or notifications, restart/drain metrics and SLO results. The passing 72-request native read workload and idle graceful shutdown are limited evidence, not capacity or disaster recovery sign-off.

## P5-B11 — product retention and release-scope decisions

**Status: BLOCKED for final production policy. Owner: product/data owner. Related: U-R04/U-R08.**

Prerequisite: explicit Free/Pro/Max retention periods and treatment of existing documents; initial release integration scope; legacy quota and ambiguous timestamp decisions above. The earlier owner answer supplied quota limits, not retention days.

Agreed quota is unchanged: one shared account allowance, Free 3 / Pro 10 / Max 25, admin configurable, each actual AI provider request plus each server PDF generation, 20 hours from the account's first metered request for all plans. Browser exports remain unmetered. No billing-policy change is proposed or inferred.

Next action: owner signs retention values/legacy treatment and the integrations enabled for this release. Required evidence: current admin/user effective policy, actual retention deletion/restore acceptance with approved values, and disabled dormant provider behavior. No unknown retention default is invented.

## P5-B12 — immutable container/security release evidence

**Status: BLOCKED. Owner: DevOps/security release owner. Related: U-R13.**

Prerequisite: successful actual image builds and a verified source revision. Current base image references are mutable and their resolved contents were not scanned.

Next action: on the dedicated host capture each Compose project's image ID/digest, source/lockfile metadata, image SBOM and vulnerability scans with a current approved scanner. Pin reviewed base digests and rebuild/retest. Validate the new trust entrypoint inside the actual non-root/read-only filesystem, certificate expiry/hostname rejection and private network/DB roles.

Required evidence: backend/PDF/Python/user/admin image artifacts, resolved digests, SBOMs, scanner versions/databases/results, disposition of every blocking advisory, reproducible rebuild and staging acceptance against those exact images. Current [source SBOMs](docs/system-audit/evidence/phase5/artifact-checks.json) cannot substitute for container scans.

## Original finding dispositions

| Finding | Final Phase 5 disposition |
| --- | --- |
| U-R02 | PARTIAL: native currency/refund reporting passes; sandbox/provider statement reconciliation blocked. |
| U-R04 | PARTIAL: shared policy regression passes; retention decision and deployed browser/PDF acceptance blocked. |
| U-R06 | PARTIAL: secure uploaded workflow native checks pass; sandboxed PDF/rendering/browser acceptance blocked. |
| U-R07 | PARTIAL: durable processing and new receipt recovery pass natively; merchant/email lifecycles blocked. |
| U-R08 | PARTIAL: agreed quota/recovery checks pass; legacy cutover and actual PDF/storage failure acceptance blocked. |
| U-R10 | BLOCKED: owner revocation/rotation evidence absent. |
| U-R11 | Historical tested changes preserved; current browser export acceptance blocked. |
| U-R12 | PARTIAL: native auth/TOTP/session controls pass; legacy migration and deployed verification blocked. |
| U-R13 | PARTIAL: local/offline checks pass; actual deployment, image scans, remaining advisories and operations acceptance incomplete. |
