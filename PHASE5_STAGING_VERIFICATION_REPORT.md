# Phase 5 — staging verification report

Date: 2026-10-16. **Production readiness: NOT READY. Staging configuration is prepared; no container staging deployment was verified.**

Phase 4 implementations were preserved and exercised through regression, rather than audited again. The starting references were reports [16](docs/system-audit/16-PHASE4_RELEASE_BLOCKERS.md), [17](docs/system-audit/17-STAGING_DEPLOYMENT_GUIDE.md), [18](docs/system-audit/18-PRODUCTION_READINESS_CHECKLIST.md), [19](docs/system-audit/19-FINAL_INTEGRATION_TEST_RESULTS.md), the [technical workflow](DOCCRAFT_FULL_TECHNICAL_WORKFLOW.md) and their recorded regression/integration evidence.

All current results are in [verification-summary.json](docs/system-audit/evidence/phase5/verification-summary.json). Its check records overlap; their totals are not a count of distinct end-to-end workflows. Remaining prerequisites, owners and acceptance evidence are in [release blockers](PHASE5_RELEASE_BLOCKERS.md). Promotion gates are in the [production checklist](PHASE5_PRODUCTION_READINESS_CHECKLIST.md).

## Repository integrity

The repository has an unborn `feature/rbac` branch, no HEAD commit and no tracked source tree. Existing source is untracked. The current origin is the requested `https://github.com/senyx-software/Doc-Craft.git`, without embedded credentials. No reset, history reconstruction, commit, push or production modification was performed.

A baseline captured 878 existing reviewable source files before Phase 5 changes. The [change manifest](docs/system-audit/evidence/phase5/change-manifest.json) compares against those hashes because a historical Git diff is unavailable. All **177 pre-existing Phase 4 evidence files remain byte-for-byte unchanged**; see [preservation check](docs/system-audit/evidence/phase5/phase4-preservation.json).

The [bounded credential check](docs/system-audit/evidence/phase5/credential-hygiene.json) found no matching private credentials in the inspected working-source patterns/current remote; private environment files are ignored. This does not establish that earlier copies, history or external access are safe. The credential previously exposed in the old Git remote still needs owner-side issuer revocation, access review and proof that it is rejected. No secret values are included in this report, and no real credentials were rotated. The existing [owner approval/rotation procedure](docs/system-audit/17-STAGING_DEPLOYMENT_GUIDE.md#owner-approval-and-credential-rotation-procedure) remains applicable.

## Corrections implemented

### P5-F01 — compiled notification templates omitted

Root cause: Notification's build ran only TypeScript compilation, while runtime template lookup reads `dist/templates`. The source templates were absent at that runtime path, allowing generic fallback messages instead of the intended verification/reset/billing body.

Implementation: the workspace build copies the template directory using a script resolved relative to its own file. A packaged-artifact check renders the compiled receipt with a three-decimal currency and hostile reference text, and verifies verification/reset/welcome templates exist.

Files: [Notification package](services/notification/package.json), [copy script](services/notification/scripts/copy-templates.mjs), [artifact verification](scripts/verify_notification_build.mjs).

Regression: backend and Notification builds PASS; compiled-asset verification PASS. Security impact: preserves intended transactional/security message contents and escaped rendering. **Status: FIXED for the compiled-artifact acceptance criteria. Container delivery remains blocked by P5-B01/B04.**

### P5-F02 — payment success lacked an actual receipt message

Root cause: verified successful payments scheduled welcome/renewal notifications without a recorded paid amount, currency or payment reference. The owner requested proof of successful payment by email.

Implementation:

- A paid invoice writes `receipt:<invoiceId>` into the durable Payment outbox inside the verified reducer transaction. Paid writes outside that transaction fail before persistence. Open/failed/refunded invoice writes do not schedule success receipts.
- Multiple verified events for one invoice preserve one immutable receipt effect and never reopen its completed acknowledgement.
- Recipient lookup uses authenticated Auth. The recipient is committed before the first delivery attempt so a profile change cannot alter retry identity.
- Payment acknowledges completion only after Notification returns its durable delivery ID and accepted/completed status. Lost acknowledgements retry the same downstream identity.
- The escaped transactional email includes recorded amount/currency, invoice/provider reference and paid timestamp when available. Currency precision follows the currency code, including JPY and KWD.
- Marketing disablement does not suppress receipts. Administrator provider disablement still blocks every actual send. Admin template selection and log filtering include `payment_receipt`.

Files: [invoice/receipt service](services/payment/src/services/subscription.service.ts), [outbox](services/payment/src/services/payment-outbox.service.ts), [payment regression](services/payment/src/__tests__/payment-receipt.test.ts), [Notification authorization](services/notification/src/security.ts), [email policy/rendering](services/notification/src/services/email.service.ts), [email regression](services/notification/src/provider-policy.test.ts), [receipt template](services/notification/src/templates/payment_receipt.hbs), [admin UI](admin/src/pages/subviews/NotificationsView.tsx), [admin notification labels](services/admin-api/app/api/v1/notifications.py), [real handoff probe](scripts/phase5_payment_receipt.mts).

Regression: Payment **88 tests PASS**; Gateway/Notification **49 tests PASS**. Actual PostgreSQL/Notification integration verifies 12 verified events produce one receipt, durable recipient selection, lost downstream acknowledgement recovery, one Notification delivery and replay preservation. See [receipt integration](docs/system-audit/evidence/phase5/payment-receipt-integration.log). These use synthetic merchant events and the local test email transport; **zero external emails/payments were executed**.

Security impact: only authorized payment intake schedules the success path; no browser redirect or unsigned checkout custom fields establish payment. Receipt data is escaped and carries no card/API secrets. This is a payment record, not a claim of a legally compliant tax invoice or an attached PDF. **Status: native implementation PASS; external merchant/email acceptance BLOCKED. U-R07 remains partial.**

### P5-F03 — private CA configuration removed public provider trust

Root cause: `SSL_CERT_FILE` pointed only to the private service CA. A real Node Groq connection failed certificate-chain validation; reproducing a public catalog connection with that trust file confirmed the failure. Private service TLS passing did not prove external TLS readiness.

Implementation: a non-root staging entrypoint combines the distribution's public trust roots and mounted private service CA, exports that bundle for Node/Python clients, then starts the service. The native harness similarly combines public/private roots. Certificate and hostname verification remain enabled.

Files: [entrypoint](deploy/staging/service-entrypoint.sh), [Node image](deploy/staging/Backend.Dockerfile), [Python image](deploy/staging/Python.Dockerfile), [native harness](scripts/system_audit_phase4_stack.py), [trust regression](shared/tests/test_staging_trust.py).

Regression: both trust tests PASS, including rejection of an unrelated CA and missing public roots. Subsequent actual Groq requests reached HTTP 200/400/429 with TLS verification enabled. Security impact: restores required verified public connections without weakening private trust or accepting arbitrary certificates. **Status: native trust correction PASS; actual container entrypoint acceptance BLOCKED.**

### P5-F04 — backend source SBOM generation failed

Root cause: the email renderer's React/React DOM peers were absent from the installed backend tree. After resolving them, npm additionally rejected the private root package because it lacked a semantic version for its package URL.

Implementation: explicitly supply compatible peers in Notification; add development metadata version `0.0.0` to the private workspace root and regenerate the lockfile. This is not a release tag or restored Git history.

Files: [root package](package.json), [lockfile](package-lock.json), [Notification package](services/notification/package.json), [artifact runner](scripts/phase5_artifacts.py).

Regression: backend, user and admin CycloneDX **source** SBOMs PASS; backend npm audit reports zero advisories; backend build PASS. No container SBOM or image vulnerability scan was performed. **Status: FIXED for source SBOM generation; image gates remain blocked.**

These are the new confirmed defects corrected. No broader security finding is marked FIXED merely because its local code or tests pass.

## Docker and Chromium environmental results

See [exact commands/exit statuses](docs/system-audit/evidence/phase5/environment.json).

| Check | Result | Actual evidence |
| --- | --- | --- |
| Docker daemon | BLOCKED | Host Docker binary exists, but the explicit local socket connection fails: `/var/run/docker.sock` does not exist. Other inspected root/user/host sockets are absent. |
| Host portal | BLOCKED | `flatpak-spawn --host /bin/true` fails with `org.freedesktop.DBus.Error.ServiceUnknown`. |
| User namespace | BLOCKED | `unshare -Ur true`: `Operation not permitted`; process has `NoNewPrivs=1`, seccomp filtering and no effective capabilities. |
| Real Chromium sandbox | BLOCKED | Installed Chromium aborts with `No usable sandbox!` (exit -6). No sandbox-disabling flag was used. |
| Image builds | NOT RUN | No reachable Docker daemon. |
| Container startup/migrations/network isolation | BLOCKED | Cannot execute the generated deployment. |
| Image SBOM/scans | BLOCKED | No actual built images to inventory/scan. |

The generator produced a new private, isolated project with fresh local keys and TLS, authenticated Redis persistence, per-service credentials, isolated database/Redis/PDF networks and non-root service images. **78 offline artifact/Compose/certificate checks PASS**. Its private output path is recorded in [artifact checks](docs/system-audit/evidence/phase5/artifact-checks.json). This does not establish that any container started.

## Native integration and workflows

Latest complete run: **216 PASS, 2 BLOCKED, 0 FAIL**, 106.24 seconds, using an isolated `doccraft_phase4_…` fixture database. The naming prefix is retained for existing safety checks; the evidence belongs to Phase 5. See [all assertions](docs/system-audit/evidence/phase5/stack-integration.json). External Groq evidence was collected separately and is not converted into a native pass.

| Area | Result | Scope and limits |
| --- | --- | --- |
| Nine backend services and PDF sidecar | PASS | Actual local process startup; dependency readiness for application services. PDF HTTP listener starts, but sandboxed rendering is BLOCKED. |
| PostgreSQL migrations | PASS | Four checked-in Prisma migrations and service-owned schema initialization on fresh synthetic data; no sanitized legacy copy. |
| PostgreSQL/HTTP/Redis TLS and service identity | PASS | Validated native TLS, wrong CA/plaintext rejection, signed receiving-service authorization, replay controls, Redis ACL isolation/AOF. Container network behavior remains untested. |
| Authentication/admin sessions | PASS | Actual API login/challenge, logout, refresh revocation, suspended/reactivated accounts, abuse concurrency, scoped administrator actions. Challenges are read only from the owned fixture DB. |
| Entitlements/quota | PASS | Free/paid/expired/suspended/upgraded/downgraded/overridden policy paths; shared quota, 20-hour first-use windows, concurrent reservations/refunds, downgrade preservation, Redis loss and boundary checks. |
| Chat/document state | PASS | Five document types; authorized persisted edits, turn replay, calculation/validation regression and administrator MCP inspection. The API edit fixtures use deterministic parsing and are not live AI acceptance. |
| Uploaded templates | PASS | Review, owner/public visibility, publishing/withdrawal, version rollback, escaped HTML preview and forbidden remote content; actual PDF output is BLOCKED. |
| Billing | PASS | Synthetic verified callback reducer/outbox/currency/refund/replay/recovery paths and new receipt handoff; actual provider workflows are BLOCKED. |
| User/admin frontends | PASS | Production builds, lint and actual native HTTP serving; browser interaction, accessibility and responsive acceptance are BLOCKED. |
| Shutdown/recovery | PASS | Dependency-ordered idle shutdown, process restarts with restricted DB roles, Redis-loss replay/notification/automation recovery. Full in-flight load drain and deployed failover are NOT RUN. |

Bounded load: **72/72 HTTP 200**, concurrency 12, 19.83 requests/second, p95 830 ms against the authenticated native quota read endpoint. See [measurements](docs/system-audit/evidence/phase5/bounded-load.json). These are local observations with no owner-approved SLO or claim of production capacity; they do not exercise AI/PDF provider load.

The separate [durable notification probe](docs/system-audit/evidence/phase5/notification-receipt-probe.json) verifies duplicate identity, conflicting payload rejection, first attempt and expired uncertain-attempt hold against real PostgreSQL. Backup/restore is **BLOCKED**: bundled PostgreSQL lacks `pg_dump`/`pg_restore`; the attempted official source archive download timed out. [Backup evidence](docs/system-audit/evidence/phase5/backup-restore.json) records that no dump/restore completed. A configurable [drill script](scripts/phase5_backup_restore.py) is supplied; it never substitutes cloning for a backup.

## Actual external provider evidence

The owner approved the existing Groq project for **8 synthetic completion attempts and US$0.10 maximum**. A persistent ledger enforced the combined authorization across retries; it was never reset. Later the owner explicitly selected **“Keep further paid calls disabled.”** No additional paid calls ran.

| Provider | Result | Actual scope |
| --- | --- | --- |
| Groq read-only catalog | PASS | HTTP 200; approved test model available. |
| Groq completion transport | PASS after trust correction | Eight bounded attempts in total: three pre-response TLS failures, two HTTP 400 `tool_use_failed`, two HTTP 200 tool-call responses, one HTTP 429. |
| Groq successful MCP persistence | FAIL | Returned tool proposals did not pass server evidence/schema validation; no successful field persistence was established by this live probe. |
| Full production Chat AI workflow | BLOCKED | Probe used the actual provider router, MCP SDK and PostgreSQL with a compact synthetic system prompt and only `openai/gpt-oss-20b`, rather than the production HTTP route/context/default model chain. It cannot establish production-context extraction/editing quality. Further paid testing is disabled. |
| Claude | BLOCKED | No authorized staging project/key; provider-selection propagation alone passed. |
| Resend authentication | FAIL | Read-only `/domains` returns 401. Sender, designated test recipient and outbound staging-send approval remain absent; zero emails sent. |
| PayHere/Paddle | BLOCKED | No approved sandbox merchants/products/webhook configuration; zero provider payment actions. |
| Firebase | BLOCKED | Approved project/web client/test identities unavailable. |
| Supabase/storage | BLOCKED | Approved staging project, bucket/policies and credentials unavailable; native local storage paths do not prove Supabase integration. |

The [provider inventory](docs/system-audit/evidence/phase5/provider-inventory.json), [authorization record](docs/system-audit/evidence/phase5/provider-authorization.json), [live probe](docs/system-audit/evidence/phase5/groq-live.json) and its preserved attempt report/ledger contain timestamps, provider request IDs, usage, validation outcomes and scope limits. Returned usage estimates total **US$0.00027645**; conservative reservation for all eight attempts is **US$0.0409152**. The estimate is not a reconciled provider billing statement; requests without returned usage are not asserted free.

The probe entrypoints now check the recorded owner denial before running further paid work, even if the original approval flag remains set. A separate [regression PASS](docs/system-audit/evidence/phase5/paid-call-denial-test.json) verifies that denial occurs before credential reads or subprocess execution. This test sends no requests.

No raw failed provider generation was executed, and validation was not disabled to turn live failures into successes. Live extraction, item edits, pending confirmation, discounts, notes/dates, long-session continuity and recovery remain unaccepted until the full production workflow can be tested under a new explicit budget.

## Builds, lint, tests and dependencies

Full recorded regression: **17 PASS, 2 FAIL, 1 BLOCKED** across 20 commands. See [commands, times and logs](docs/system-audit/evidence/phase5/regression/summary.json).

| Check | Result |
| --- | --- |
| Backend, user and admin builds | PASS |
| User/admin lint | PASS |
| Auth / Payment / Quota tests | PASS: 38 / 88 / 25 |
| Gateway/Notification tests | PASS: 49 |
| Shared Node tests | PASS: 265 |
| Chat/user Vitest group | 224 PASS; one actual browser rasterization test BLOCKED by sandbox startup |
| Admin / Document / Analytics / shared Python tests | PASS: 145 / 77 / 3 / 12 |
| Backend npm audit | PASS: zero reported advisories |
| User/admin runtime dependency audits | PASS: zero reported advisories |
| Installed Python dependency audit | PASS: zero reported advisories |
| User/admin full dependency audits | FAIL: five high findings in each Tailwind build-tool dependency chain |
| Source CycloneDX SBOMs | PASS: backend, user, admin |
| Container builds, SBOMs and scans | BLOCKED |

The remaining `braces` stack-exhaustion advisory affects versions through 3.0.3; the [primary advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version, and the registry still returns 3.0.3. No invented version override or audit suppression was applied. A major Tailwind migration without actual browser regression is not treated as a verified fix.

## Reproducible next execution

Use the exact dedicated-host commands and evidence gates in [P5-B01/B02](PHASE5_RELEASE_BLOCKERS.md), followed by the existing [staging guide](docs/system-audit/17-STAGING_DEPLOYMENT_GUIDE.md). The current native harness can be rerun with `DOCCRAFT_AUDIT_EVIDENCE_DIR` pointing to a new evidence directory and real task-owned PostgreSQL/Redis prerequisites. Do not set the live-provider approval flag: further paid calls are disabled.

Production promotion requires successful actual images/containers, sandboxed browser/PDF acceptance, provider workflows within the approved release scope, legacy migration/cutover, credential revocation, image/dependency disposition and owner operational sign-off. None is inferred from the native results.
