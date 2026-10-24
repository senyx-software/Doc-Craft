# Docker validation

**Static Compose/Caddy checks executed; image builds and container acceptance are blocked locally.** Docker CLI29.6.1 and Compose5.3.0 exist, but there is no Docker daemon socket. No production deployment was started or modified.

## Executed checks

The existing root Compose plus hybrid overlay parsed/merged after removing duplicate egress entries. Their development loopback exposure and missing resource limits remain development behavior; they are not the production deployment. The hybrid overlay keeps inference private, persists /root/.ollama, disables Ollama cloud and has an ollama-list health check without performing inference.

The new production Compose parsed with both interpolation disabled and full resolution against newly generated synthetic private service env/secret files. It uses existing service DNS/ports and authentication. Caddy2.11.7 validated the actual production configuration with a disposable CA; no listener was started. Unit tests verify digest-only images, only edge-published ports, private DB/inference networks, per-service identity mounts, admin-only AI keyring, limits and bounded logs. See [Compose structure](../devops/evidence/compose-structure.json) and [29 policy tests](../../deploy/tests/test_deployment.py).

Only edge publishes80/443. All12 applications use immutable GHCR references. PostgreSQL/Redis/model/document/admin-asset/ACME volumes persist. Startup gates depend on healthy DB/Redis and integrated verification; liveness alone cannot pass a release. Redis is TLS/AOF/noeviction with separate ACLs; DB uses TLS and scoped roles. Local inference uses a private network and separate controlled model-download egress, no host port, one loaded model, one parallel inference and configurable RAM/CPU. AI_CREDENTIAL_KEYRING_FILE is preserved outside images/config releases and mounted only into admin-api.

The pinned Caddy image was additionally scanned directly from its registry using Trivy without Docker. It reports four HIGH, fourteen MEDIUM, one LOW and one UNKNOWN finding. Python dependency advisories were fixed and re-audited clean. See [dependency-security.json](../devops/evidence/dependency-security.json) for exact advisory IDs and other remote-image scan results. These findings are not bypassed; configured CI scans block vulnerable images.

## Blocked acceptance

No application Docker image was built here. Container user/sandbox behavior, DNS, real network isolation, memory/CPU enforcement, startup/restart/volume survival, image layers, GHCR authorization, actual health-triggered rollback and full PostgreSQL17 backup/restore are not executed results. Native process/service tests do not substitute for these. Remote upstream image scanning is distinct from scanning final built images.

## Exact commands on isolated Docker-capable staging

Use test configuration, private test credentials and disposable storage only. From the repository root:

```sh
docker info
docker compose version
docker compose -f docker-compose.yml -f deploy/hybrid-ai/compose.local.yml config --no-interpolate --no-env-resolution --quiet
docker compose -f deploy/docker/compose.production.yml config --no-interpolate --no-env-resolution --quiet
docker build -f deploy/docker/Backend.Dockerfile --target runtime -t doccraft-test-node .
docker build -f deploy/docker/Backend.Dockerfile --target migration -t doccraft-test-migration .
docker build -f deploy/docker/Backend.Dockerfile --target pdf -t doccraft-test-pdf .
docker build -f deploy/docker/Python.Dockerfile --target runtime -t doccraft-test-python .
docker build -f deploy/docker/Frontend.Dockerfile --build-arg APP=admin -t doccraft-test-admin .
docker build -f deploy/docker/Frontend.Dockerfile --build-arg APP=user-frontend -t doccraft-test-user .
python3 deploy/scripts/install-ci-tools.py trivy
.local/ci-tools/trivy image --exit-code 1 --severity HIGH,CRITICAL doccraft-test-node
python3 -m unittest discover -s deploy/tests -v
```

Repeat image scans for all six targets and pinned infrastructure. Follow [the setup guide](../devops/10-PRODUCTION-SETUP-GUIDE.md) to install the root-owned controller on a disposable staging VPS and generate runtime files. Build/publish an approved test digest manifest; use the restricted channel to deploy that manifest only after staging authorization. Run `sudo /opt/doccraft/control/deploy/scripts/health-check.sh`, `docker stats --no-stream`, kill/restart one test backend, verify persistent data, then intentionally fail a same-schema/same-configuration release and run/verify application rollback. Restore a backup into an empty disposable database and compare integrity. Do not print fully resolved real secret configuration or mount master credentials into every service. Production remains disabled.
