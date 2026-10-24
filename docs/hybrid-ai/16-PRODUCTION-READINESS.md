# Production readiness — NO-GO

The source implementation is ready for review and isolated Docker staging. **Do not enable production deployment.** Real inference revealed unacceptable document-tool accuracy, and container/sandbox/restore/deployment acceptance is incomplete. No production infrastructure, credentials, GitHub settings or deployed release was changed.

## Evidence and scope

| Area | Executed result | Remaining requirement |
|---|---|---|
| Real local inference | Both quantized Qwen candidates downloaded; actual admin/Chat Service/Ollama inference | Approve a model meeting document accuracy/latency targets |
| Model intelligence | 112 real1.7B cases:23pass/89fail;16 real4B cases:6pass/10fail | Repeat unchanged corpus plus applied UI/document tests after fixes/model change |
| Deterministic routing | Actual96/96 edits, eight users,0modelcalls,p95621ms | Sustained mixed production-container traffic |
| Free/paid runtime policy | Actual signed free/pro resolution to different configured models; versions change without redeploy | Full paid natural-turn and complex permitted cloud fallback with approved credentials |
| Budget/error/isolation | Actual zero-budget refusal, disabled-provider denial, queue timeout and cross-user403 | Approved external fallback failure/cost scenarios and cross-tenant production acceptance |
| Admin workflow | Actual API add local/cloud, encrypted synthetic credential add/rotate, plan updates/rollback; five real browser checks | Actual email delivery and external cloud credential connectivity |
| Durable context | Sessions readable after own PostgreSQL/service restart; existing UI fixture context tests pass | Long conversational applied document edits across reload with approved model |
| PDFs | Cleanup fix:16/16 diagnostic signed renders; CI PDF harness16/16 | Normal production Chromium sandbox; container limits and parallel inference |
| Regression | 863 automated tests across shared275, Vitest266, admin195, quota25, document73, deployment29; six fixture browser workflows plus five actual API browser checks | Hosted CI and Docker acceptance; fixtures are not live-model accuracy |
| Configuration/security | Scoped encrypted credentials, signed identities, runtime DDL rejection, no confirmed committed backend key, clean npm/Python production audits | Review vulnerable upstream images, test actual TLS/firewall/SSH/registry/secrets in staging |
| Docker | Parse/interpolation, Caddy validation, policy tests, remote upstream image scans | All application builds, sandbox, startup, restart, volumes, real rollback |
| Database | Non-superuser native migrations/grants pass, all four Prisma systems and Python/SQL initialization | PG17 container backup/archive/full restore drill and schema compatibility review |
| Infrastructure | Provider-neutral Terraform fmt/init/validate/public fixture plan | Choose provider, implement adapter, encrypted locked remote state and reviewed real plan |
| CI/CD | Four secure workflows, immutable manifests, manual activation gates and restricted controller implemented | Operator GitHub/GHCR/VPS setup; actual pipeline execution |

## Fixes made while preserving existing behavior

Added optional Ollama thinking and bounded thread controls with backward-compatible defaults/health fingerprints. Corrected host-versus-controller memory admission. Pure-side-question inference receives only read tools; edits retain complete validated tools. Fixed PDF cleanup-before-response, duplicate development network declarations and expired long-running test JWT fixtures without extending production sessions.

Implemented scoped production configuration, complete runtime URLs/CORS/callbacks, required email sender/credential validation, fresh-empty-installation preparation, private resource-limited Compose, SHA-pinned CI/GHCR/deploy workflows, safe locked migrations/backups and same-schema/same-config application rollback. A durable schema-epoch record prevents old-release downgrades after failed migrations; failed migrations block retries pending operator review. No automatic database restore, key rotation or provisioning is present. Python certifi/Pillow advisories were fixed and195 admin/73 document regressions passed. Existing encrypted AI keys remain decryptable using the preserved keyring.

## Release blockers and next gates

1. Approve a model that handles nested typed document/editor tools accurately. The measured1.7B/4B results cannot support the promised assistant. Keep safe validation; do not trade integrity for a higher pass count.
2. Resolve/review all blocking HIGH/CRITICAL upstream/final-image findings. The scanned pinned Caddy image currently has four HIGH findings; Node/Python/PostgreSQL base scans additionally report CRITICAL findings. Security scans intentionally prevent publication/deployment when unacceptable findings remain.
3. Execute Docker builds and full private-TLS stack on disposable staging, including production browser sandbox, restarts, scoped credentials, signed service calls, real PDF generation and resource-limit enforcement.
4. Perform a full isolated PostgreSQL17 backup restore and same-epoch/same-config failed-release rollback drill. Unit fake-executor rollback and archive listing alone do not prove recovery.
5. Complete real permitted cloud fallback and provider-error/cost tests using approved test credentials; actual email/2FA delivery, payment/OAuth/storage integrations must be checked for the selected production configuration.
6. Select provider and capacity using a sustained mixed benchmark and agreed SLOs.16GiB/4vCPU is a staging candidate;8GB is not certified and no lowest-cost plan is proven.
7. Configure protected master/tags/environment, GHCR read identity, verified SSH host keys, restricted deployment user, DNS/firewall, locked remote state, monitoring/backup operations and certificate renewal. Keep both deploy enable gates off until operator acceptance.

After these gates, collect real CI/deployment/restore evidence, update this recommendation and obtain operator authorization before production activation. [DevOps setup](../devops/10-PRODUCTION-SETUP-GUIDE.md) contains commands/settings; [deployment and rollback](../devops/08-DEPLOYMENT-AND-ROLLBACK.md) defines the compatible recovery path. GO is limited to review and isolated staging; production is NO-GO.
