# Isolated staging deployment guide

Phase 5 follow-up: [current verification](../../PHASE5_STAGING_VERIFICATION_REPORT.md) and [exact remaining host/provider prerequisites](../../PHASE5_RELEASE_BLOCKERS.md). The Node/Python staging entrypoints now combine distribution public CA roots with the private service CA; do not replace that combined trust with the private CA alone. Actual container execution remains unverified.

**Prepared, not deployed.** Offline Compose, certificate and isolation checks pass. A Docker daemon, sandbox-capable host, approved sandbox resources and a sanitized legacy snapshot are still required. The commands below are the reproducible deployment procedure, not a record that containers ran. See [actual results](19-FINAL_INTEGRATION_TEST_RESULTS.md).

## Boundaries and prerequisites

Use a dedicated staging host/project, never an existing production Compose project, database, Redis, bucket or provider account. Install Docker Engine and a current Compose supporting optional `env_file.required`; the offline check used Compose v5.6.0. Supply an operator-managed Python environment with `cryptography`, OpenSSL and enough resources for PostgreSQL, Redis, nine backend services, the PDF sidecar and both static frontends. The renderer host must support Chromium's sandbox while running as a non-root user with no added capabilities. Do not add `--no-sandbox`, privileged mode, host networking or a TLS-verification exception.

The supplied generator uses PostgreSQL 17, Redis TLS/AOF and private TLS for all application HTTP listeners. Only the edge binds the host, at loopback port 8443. PostgreSQL, Redis and PDF have no external network; PDF receives no provider credentials. Application services have individual service identities and Redis ACL accounts. Scoped database roles are installed after schema-owner migrations. Frontends are static Nginx builds, not Vite development servers.

Image tags remain mutable pending the first actual build. Capture resolved base digests, lockfile digests, image IDs, SBOMs and image scans before promoting a staging candidate. Native application success does not validate these image recipes or container sandbox behavior.

## Generate and validate an isolated project

From the repository root, using the project Python environment:

```sh
.venv-local/bin/python scripts/prepare_staging.py --output .local/staging-review
.venv-local/bin/python scripts/verify_staging.py .local/staging-review
docker compose -f .local/staging-review/compose.yaml config --quiet
```

The generator refuses an existing output directory, creates fresh keys and a unique database/project, and never reads or copies developer provider environment files. Keep `.local/` private and ignored. Its manifest contains identifiers, not credentials. Do not print `compose config` without `--quiet`: expanded environment output can contain secrets. Do not regenerate over a running deployment; retain its keys and encrypted backup in the approved secret store.

The final local artifact check used `.local/staging-final-verified`, with results in [staging-artifact-validation-final.json](evidence/phase4/staging-artifact-validation-final.json). Earlier local outputs are preserved; none is deployed. Generated secrets are ephemeral local artifacts and must be regenerated if unavailable on another host.

## Build, migrate and provision roles

These commands require the missing Docker daemon. Preserve exact output and exit codes in a private deployment evidence directory; redact secrets before attaching logs.

```sh
docker compose -f .local/staging-review/compose.yaml build
docker compose -f .local/staging-review/compose.yaml up -d postgres redis
docker compose -f .local/staging-review/compose.yaml --profile tools run --rm migrate-node
docker compose -f .local/staging-review/compose.yaml --profile tools run --rm migrate-python
docker compose -f .local/staging-review/compose.yaml --profile tools run --rm provision-roles
```

Run these in order and stop on any failure. Four checked-in Prisma schemas plus Notification, Admin and Document initialization run under the staging schema owner. `provision-roles` only accepts `doccraft_staging_` or `doccraft_phase4_` databases, creates new per-service roles, and writes private runtime connection files. Runtime services do not receive migration-owner credentials and do not run DDL. The provisioner refuses to overwrite role connection files; reuse an existing valid deployment rather than rerunning it blindly.

For a **sanitized legacy copy**, first create a separate generated project and restore an owner-approved sanitized PostgreSQL backup into that project's database while services are stopped. Record source version, sanitization approval, backup checksum, restore checks and table/constraint counts without personal data. Run the migration jobs, TOTP migration procedure below, and roles against that copy. Retest older subscriptions, document/storage keys, template IDs, sessions and all quotas. A fresh fixture database does not clear this gate.

**Legacy quota cutover remains a blocker.** There is no verified import from deployed Redis receipt/counter state into the new rolling ledger. Freeze metered traffic, capture owner-approved account counters and reservation/refund IDs, decide how the previous reset boundary maps into the approved 20-hour policy, and review a validated import before enabling traffic. Do not zero existing usage or invent reservation identity. Plan upgrades/downgrades keep already consumed usage; administrative reset is an explicit audited action.

Payment outbox timestamps now use `TIMESTAMPTZ`. The conversion explicitly interprets prior ORM-written naive values as UTC. If upgrading any already-running Phase 4 installation that inserted non-UTC SQL defaults, first reconcile those ambiguous pending rows under owner approval. The local regression deliberately used a non-UTC session and verified immediate actual dispatch after the correction.

## Inject approved staging providers and administrator identity

Edit only the relevant private `providers/<service>.env` through the approved secret manager. Do not copy `doccraft.env` or service developer environments into staging. Configuration selectors in the admin UI choose configured integrations; they do not create keys or establish provider sandbox ownership.

| Initial / later phase | Required configuration and verification |
| --- | --- |
| Initial: Groq | Chat `GROQ_API_KEY`; owner identifies the staging project, allowed models, budget and test prompts. Existing key passed a read-only models request only. Perform one approved completion and observe exactly one ledger unit per actual attempt. |
| Initial: Resend | Notification `RESEND_API_KEY`, approved `RESEND_FROM_EMAIL`, webhook verification secret if delivery callbacks are tested; verified staging domain/sender and designated test inbox. Existing key returned 401. Registration/admin email challenge and delivery/status workflows cannot pass until this is corrected. |
| Later: Claude | Chat `ANTHROPIC_API_KEY`, approved staging account/models and budget. Switch provider/model routing in Admin, verify plan ceilings, fallback attempts, errors and quota charges. |
| Later: Paddle | Payment `PADDLE_SANDBOX=true`, sandbox API and webhook secrets and real monthly/yearly Pro/Max price IDs for supported currency. Supply matching provider prices, callback endpoint and sandbox customer/payment method. Test renewal, upgrade/downgrade, cancellation, failure, duplicates, reordering and approved refunds. |
| Later: PayHere | Payment `PAYHERE_SANDBOX=true`, merchant ID/secret, OAuth `PAYHERE_APP_ID` and `PAYHERE_APP_SECRET`, enabled Subscription Manager/Retrieval permissions, registered callback URL and test payer. Verify `PAYHERE_PROVIDER_UTC_OFFSET` with the provider if timestamps lack an offset. Test identity reconciliation through trusted retrieval, recurring installments and provider-acknowledged cancellation. |
| Later: Firebase | Auth staging `FIREBASE_PROJECT_ID` and approved web application credentials in the user build. Supply service-account fields only where the selected SDK actually requires them. Test verified Firebase tokens from this project, revoked/expired/foreign-project tokens and admin disablement. |
| Later: Supabase | Document `SUPABASE_URL`, service-role key, private `documents` bucket and owner-approved retention/RLS policy. Test upload, private read rejection, signed download expiry, deletion and backend switching. Never inject the service-role key into either frontend. |

For initial service startup set administrator-owned `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME` and a strong staging-only `SUPER_ADMIN_PASSWORD` in the private Admin API environment. Startup provisions the account without logging its returned TOTP enrollment secret. Complete email verification/login and authenticator enrollment through the real UI; do not use the fixture database challenge extraction from the native test harness. Remove the bootstrap password after successful provisioning and recreate that service. Sensitive actions still require their normal second factor.

In Admin, retain Groq routing, select Resend and local storage. Disable Paddle, PayHere and Firebase until their approved resources are configured. Keep optional providers fail closed; an unconfigured selected provider must report unavailable. Retention defaults are still awaiting the product owner's values; do not invent deletion periods. Owner-only uploaded templates are scoped to one account; multi-account company sharing has no current membership contract.

Billing HTTP notifications and automation have PostgreSQL intake receipts and queue-independent recovery. Monitor pending/review rows in `NotificationDelivery` and `automation_event_inbox` using a privileged operational connection; runtime roles remain service-scoped. Never mark these complete just to clear a queue. Uncertain email attempts older than 23 hours require matching provider receipts before any owner-authorized retry, because [Resend keys last 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Failed automation actions enter review to prevent blindly replaying successful irreversible actions. Configure `AUTOMATION_WEBHOOK_ALLOWED_HOSTS` only for approved public HTTPS receivers, enforce network egress controls, and verify receiver idempotency. There is no configured automatic network IP-block integration; that action requires manual review. Exact unchanged legacy cancellation seeds are corrected to notify only; customized rules are preserved and require owner review against the current entitlement policy.

## Start and verify the complete staging deployment

```sh
docker compose -f .local/staging-review/compose.yaml up -d
docker compose -f .local/staging-review/compose.yaml ps
```

Map `user.doccraft.test` and `admin.doccraft.test` to loopback for the operator browser, or use an approved SSH tunnel. Trust only the generated staging public CA certificate in the test browser. Never copy its CA private key into a container or disable browser/curl certificate validation. Example edge → gateway → Payment public-plan check:

```sh
curl --fail-with-body --cacert .local/staging-review/tls/ca.crt --resolve user.doccraft.test:8443:127.0.0.1 https://user.doccraft.test:8443/v1/payment/plans
```

Backend `/ready` is the canonical readiness route; the edge forwards `/v1/*` to the gateway and `/api/v1/*` to Admin, so a frontend HTML response is not backend readiness evidence. Check each backend's `/ready` from an authorized private diagnostic container with the mounted CA, plus a correctly signed PDF readiness request. Record all nine backend health/readiness responses, PDF browser launch, certificate hostname validation, and direct-service rejection of missing/wrong/replayed identities. Verify PostgreSQL and Redis reject plaintext, wrong CA and unauthenticated access, and cannot be reached from an untrusted network.

Exercise real UI registration/verification/login, guest transfer, all document types, Chat streaming and reload, template upload/review/private/public/publish/withdraw/rollback, server PDF generation/storage/download/deletion, browser PDF export, billing views and admin status/plan/quota/expiry changes. Free/Pro/Max must use 3/10/25 units in a shared 20-hour window. Each AI attempt and server PDF consumes one; browser export consumes none. Test expired/suspended/overridden accounts and direct service requests. Capture accessibility keyboard/focus/labels/contrast and narrow/mobile layout evidence; HTTP startup and unit tests do not establish these.

Run concurrent requests at the owner-approved target load; record error rate, p95/p99 latency, queue age/depth, memory/CPU, DB lock waits and recovery time. Repeat process termination with in-flight PDF/payment/email jobs and partial storage/provider failure. Stop producers/edge first, drain consumers while PostgreSQL/Redis/policy services remain available, then stop dependencies. Payment outbox commit does not prove final email or automation delivery after Redis loss; that acceptance item remains open. Do not promote until it is resolved or explicitly accepted by the accountable owner.

## Owner approval and credential rotation procedure

**Proposed procedure awaiting owner approval. No production rotation was performed.** The previous local Git remote contained an embedded credential and was exposed during inspection. It was removed when setting the requested GitHub origin. The owner must revoke that credential at its issuer, inspect access/audit history and verify rejection; deleting a local URL does not revoke it.

1. Inventory every credential by owner, environment, service/consumer, secret-store reference, key ID, expiry and rollback window. Include Git/provider API keys, webhook secrets, DB roles, Redis ACL passwords, TLS certificates, Auth user/refresh signing material, admin JWT/session keys, Document download key, pairwise service, queue/event keys and TOTP encryption keys. Store no secret values in the approval or evidence.
2. Obtain a signed change record with approver, exact target environment/database, maintenance window, backup/restore verification, rollback owner and external-provider revocation steps. Rehearse on the sanitized staging copy. Pause mutation/queue producers where key overlap or provider semantics cannot preserve in-flight work.
3. For pairwise/queue/event keys, add the new `kid` to each receiving keyring first, deploy and verify old/new signatures as appropriate, then switch the sender. Keep old verification keys until the maximum token lifetime, accepted clock skew and oldest queued job/retry age have elapsed or the old backlog has been safely reconciled. Finally remove the old key and prove old signatures fail. Never replace every identity with a new unrelated generator output in place.
4. Auth alone holds the user JWT private key. Add the new public verification key to consumers, then switch Auth's signing `kid`; prove new tokens work and retired tokens fail after the selected invalidation window. Refresh/admin JWT secrets and download HMAC keys do not provide the same overlapping keyring: schedule and test expected re-login/link invalidation. Use supported logout/session revocation rather than deleting a volatile cache.
5. For TOTP, keep old decryption keys, add a new random 32-byte encryption key and select its `active_kid`. Run `scripts/reencrypt_totp.py` separately for Auth and Admin against the exact approved database. Dry-run first; apply requires an approval JSON with non-empty `database`, `approved_by`, `approved_at`, `change_id` matching that database. Inject `MIGRATION_DATABASE_URL` privately and provide the correct service identity JSON through `--keyring`. The tool verifies account-bound decrypt/encrypt round trips and commits a transaction only on apply; it never prints secrets. Do not bypass the runtime plaintext rejection for legacy data.
6. Record rows/fields verified, no remaining plaintext/retired `kid`, successful login/TOTP, atomic replay rejection and wrong-account decrypt rejection. Remove an old TOTP key only after the verified count reaches zero and the encrypted-backup restore strategy is approved. Preserve TOTP high-water steps and session revocations.
7. For DB/Redis/provider secrets, use the provider's supported staged replacement, redeploy consumers, test least privilege and actual provider authentication, revoke the old credentials, then prove rejection. Never live-`FLUSHDB` a replay store: quiesce callers and restart the owned Redis during approved recovery so the generation guard rejects previously issued credentials. Verify persistence/restore, counters and pending durable work afterwards.
8. Replace TLS leaves/CA using a verified trust overlap, test correct hostname and wrong CA, remove old trust, and record certificate fingerprints/expiry rather than keys. Capture issuer revocation/audit records and rollback outcome. Retain all evidence under the change ID before the owner signs the rotation complete.

Commands are intentionally environment-specific only at execution time; this guide grants no production approval. The release checklist remains [NOT READY](18-PRODUCTION_READINESS_CHECKLIST.md).
