# Phase 3 local verification and deployment handoff

<!-- PHASE4_STATUS -->
## Phase 4 — Current status (2026-10-16)

**Production: NOT READY. Staging: prepared, deployment verification blocked.** Actual final native integration: **214 VERIFIED, 2 BLOCKED, 0 UNRESOLVED**. Full regression orchestration: **17 PASS, 1 BLOCKED, 2 OPEN_FINDINGS** across 20 checks. Browser/PDF rendering is blocked by the host sandbox; frontend build dependency advisories remain open. No external provider workflow or Docker deployment is claimed successful.

Current policy is **Free 3 / Pro 10 / Max 25 shared metered units per account**, each outbound AI request plus each server PDF, **20 hours from first accepted use**, admin configurable. Browser exports remain unmetered. Retention defaults and legacy cutover still need owner decisions.

Authoritative entitlements, durable payment reducer/outbox and billing downstream SQL receipts, PostgreSQL quota/window recovery, secure owner/public uploaded-template versions, encrypted single-use TOTP, durable session revocation, scoped DB roles/TLS/replay-loss controls and staging tooling have implementation/regression evidence. The original release groups remain partial or externally blocked because their full acceptance criteria have not passed.



Current sources: [16 release blockers](16-PHASE4_RELEASE_BLOCKERS.md), [17 staging guide](17-STAGING_DEPLOYMENT_GUIDE.md), [18 production checklist](18-PRODUCTION_READINESS_CHECKLIST.md), [19 final results](19-FINAL_INTEGRATION_TEST_RESULTS.md), [full technical workflow](../../DOCCRAFT_FULL_TECHNICAL_WORKFLOW.md).

**Everything below this Phase 4 preface is preserved historical evidence unless explicitly updated.** Earlier midnight quota semantics, unlimited Pro descriptions, absent upload pipeline and unresolved TOTP replay statements are superseded by the current reports; historical browser success is not Phase 4 browser evidence.
<!-- END_PHASE4_STATUS -->

Read reports 12–15 before deployment. Production readiness remains **NOT READY**; successful local tests are not evidence of production TLS, provider reconciliation, secret rotation, database privileges or disaster recovery.

Use Node 24 and the Python service requirements. Run `npm ci` at the root and separately in `user-frontend` and `admin`. The renderer uses Puppeteer 25; install its supported Chrome with `npx puppeteer browsers install chrome`. A deliberately selected local browser can be supplied through `PUPPETEER_EXECUTABLE_PATH`; record its actual version in evidence. Do not disable certificate validation.

Generate fresh local identities with `python3 scripts/create_service_credentials.py /private/path`, then Redis credentials with `python3 scripts/create_redis_credentials.py /private/path`. The generators refuse overwrites. Supply `DOCCRAFT_SECRETS_DIR` to the native launchers or the root Compose secret mounts. Keep credential files outside source control with restricted file permissions. Inspect CLI help for Redis hostname/port options. Existing deployment credentials require a staged rotation; generating files does not revoke previously exposed credentials.

User JWT signing is restricted to Auth. Deploy receiving public-key rings and service verification keys before switching active signing keys; retain old keys only for the bounded overlap needed for existing tokens/jobs. Generate the new event-signing and document-download keys as well. PDF gets only its own identity and Redis replay account, never Document database or provider credentials. Set a separate strong `ADMIN_JWT_SECRET`.

Review and apply all checked-in migrations using a migration account before application rollout. The Auth refresh-token migration deliberately invalidates legacy plaintext refresh sessions; users must sign in again. Chat guest claims and Payment callback inbox/billing snapshots also require migrations. Back up and test an upgrade against a representative isolated copy before production. The local fresh-schema run does not verify a legacy upgrade or least-privilege runtime database roles.

Use the root `docker-compose.yml`; legacy service manifests include that topology. Backend, Redis and PDF ports are private, and edge/frontend ports bind to loopback for an operator-managed TLS ingress. Configure explicit public origins, trusted proxy addresses and host firewall rules. Redis ACLs and signed messages enforce authorization but do not encrypt transport. Supply verified database/Redis TLS or a separately demonstrated protected deployment network. `NOTIFICATION_WEBHOOK_ALLOWED_HOSTS` is an operator-maintained list of approved HTTPS status-relay destinations.

The integration harness only accepts a loopback `PG_AUDIT_URL`, creates a unique database, generates isolated Redis ACLs and uses synthetic provider credentials. It does not reset shared databases. With a disposable PostgreSQL instance and installed dependencies:

```sh
python3 scripts/system_audit_check.py phase3-backend-build . npm run build
python3 scripts/system_audit_check.py phase3-chat-tests . npm run test:chat
AUDIT_CHECK_TIMEOUT=420 python3 scripts/system_audit_check.py phase3-stack . .venv-local/bin/python scripts/system_audit_phase3_stack.py
AUDIT_CHECK_TIMEOUT=360 python3 scripts/system_audit_check.py phase3-renderer-browser-probes . .venv-local/bin/python scripts/system_audit_phase3_probes.py
python3 scripts/system_audit_phase3_inventory.py
python3 scripts/system_audit_phase3_dependency_audit.py
python3 scripts/system_audit_phase3_reports.py
```

Run each Python service suite separately to avoid conflicting packages named `app`, and each Node workspace with its configured test environment. Exact final commands and exit codes are linked in report 14. Registry collection returning successfully does not mean its advisory counts are zero. Preserve failed attempts as history and regenerate conclusions only from the latest reviewed results.

Browser PDF exports remain local artifacts: they do not create server PDF history or consume server generation reservations. Bundled template publication is implemented; arbitrary HTML authoring and approval are still absent. PayHere installment reconciliation must use authenticated provider retrieval rather than unsigned callback identifiers. See report 15 for the complete release requirements.
