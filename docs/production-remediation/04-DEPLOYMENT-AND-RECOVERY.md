# Deployment, operations and recovery

**No production infrastructure, deployment, credentials or repository settings were changed.** Terraform formatting/validation and Actionlint pass. Deployment/migration/secret/network policies have33 local tests. These include simulated controller execution and transport stubs; they are not successful Docker/GHCR/SSH deployments. The development CPU is x86_64; the operator has not supplied and accepted a final VPS/CPU target.

Docker daemon/final application image builds, architecture/runtime networking/cgroups/TLS/restarts, secure PDF sandbox and actual migration/rollback are blocked. Provider-specific Terraform/remote state, reviewed plans and GitHub environment/registry/forced-SSH acceptance also remain blocked. Existing vulnerable-base advisories remain unresolved; no digest was replaced without rebuild acceptance. Keep both production enable gates disabled.

Available commands, after operator bootstrap on disposable staging:

```sh
sh deploy/scripts/validate-config.sh --help
python3 deploy/scripts/check-migrations.py
python3 -m unittest discover -s deploy/tests
terraform fmt -check -recursive terraform
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
actionlint
docker compose --env-file <private-nonsecret-release-env> -f deploy/docker/compose.production.yml config --quiet
```

`validate-config.sh` is a shell wrapper: invoke `sh deploy/scripts/validate-config.sh` with the configuration arguments from `deploy/scripts/configure.py --help`. Never print rendered secret-bearing Compose configuration. Build all `Backend.Dockerfile`, `Python.Dockerfile` and `Frontend.Dockerfile` targets for the approved CPU using the existing image workflow, scan final layers, then run actual private-service/health/failure/migration/compatible-rollback acceptance. The actual release manifest and private setup are prerequisites, not values fabricated by this audit. Application rollback must preserve schema/keyrings and must never automatically restore a database or reopen vulnerabilities from an old image.

## Optional encrypted off-host backup

New `backup_remote.py`, service and hourly timer are deliberately uninstalled. Install a reviewed restic binary separately. Prepare `/etc/doccraft/backup.json` from the example, root-owned0600 repository/password/credential files, an independently initialized encrypted remote repository and least-privilege credentials. Set `maintenance_approved` only after accepting the outage window. The job shares the deployment lock, checks writers are running, stops Document/Admin writers briefly, validates a consistent database dump and uploads DB, both application volumes, configuration/runtime and original secret/key material. It restarts writers in finally and records success only after upload/check. It never initializes/rekeys, prunes or restores a database. The raw local dump stays in a restricted temporary directory and is removed afterward.

This source implementation has not executed against restic/off-host storage. Hourly scheduling plus upload time is not a proven one-hour RPO. Backup maintenance can interrupt writes; this is not zero downtime. Repository encryption/password recovery, immutable retention, least privilege, storage failure and full-host restore remain mandatory acceptance work. Password/recovery material needs a separately protected off-server escrow; an encrypted snapshot whose only password was lost with the VPS is not recovery.

A real native PostgreSQL18.4 snapshot restored73 tables and499 rows with matching content and568 constraint definitions. Dump242ms, restore685ms for the sampled synthetic dataset. A distinct test database was dropped after verification. It is not production PostgreSQL17/TLS/PITR, encrypted restic restore, legacy-data or full-host recovery. No automatic production data restoration occurred.

## Optional monitoring delivery

Prepare root-owned0600 `/etc/doccraft/monitoring.json` from the example. Configure an external heartbeat timeout and alert destination with a named operator. Monitoring now detects stale backups, missing/unhealthy required containers and additional filesystem pressure, and sends only bounded alert identifiers/time. The tests use explicit send stubs. Actual endpoint receipt, whole-host loss and disk-failure alerts are unverified. Monitoring and backup configuration are host-only private policies, not frontend or master container secrets.

Measured native workloads:96/96 edits at concurrency8 in9.070 seconds (nearest-rank p50/p95/p99=727/963/999ms) and480/480 at concurrency8 with one-second think time in111.637 seconds (801/1316/1826ms); zero model dispatch for those edits. Task-owned peak simultaneous PSS including Ollama was4786.35MiB on a15346.05MiB,8-logical-CPU x86_64 shared host; minimum observed host availability1437.18MiB. These peaks exclude browser/test/build/unrelated desktop processes. The8321-sample resource window includes idle periods, separate model corpora and a native restart; it is not a continuous mixed-user load test. Raw non-atomic CPU counter artifacts are retained; filtered stable-interval estimates peak near796% where one core=100%. Use cgroup accounting on target hardware rather than this estimate for capacity claims. Resource samples include the local model, but exclude unrelated desktop/browser/build processes and lack cgroup enforcement. They do not establish an8GB production minimum or sustainable mixed throughput. See resource evidence for actual peaks; do not purchase hardware from unit tests.

Restore acceptance order: approved host/network/runtime; recover original keys/config; restore to an isolated database and volumes from one consistent snapshot; verify schema epoch, hashes and ownership; deploy only compatible patched digests; run user/admin/AI/PDF/billing checks; then obtain operator authorization for traffic. Repeat a complete off-host drill and accept RPO/RTO before launch.

Evidence: [verification](evidence/verification.json), [restore](evidence/runtime/backup-restore.json), [native restart](evidence/runtime/native-restart.json), [resources](evidence/resource-summary.json), [PDF](evidence/runtime/pdf-readiness.json).
