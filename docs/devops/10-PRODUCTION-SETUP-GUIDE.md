# Production setup guide — operator actions, not executed here

Do not enable deployment until Docker staging, restore and rollback drills, AI quality, service authentication and capacity tests pass. No production infrastructure has been provisioned or modified by this implementation.

## Infrastructure and GitHub prerequisites

Choose the VPS provider/region and implement/review its Terraform adapter. Configure encrypted locked remote state and review a real plan before an authorized apply. Provision supported Linux amd64, Docker Engine and a current Compose plugin (v5.3.0 was validated here; env_file raw needs v2.30+), OpenSSL, host Python 3.12+/venv (application containers use Python 3.13), trusted CA roots, adequate disk and measured CPU/RAM. The fresh-file initializer additionally needs the pinned cryptography dependency through a setup venv; the installed deployment controller uses only Python's standard library. Do not choose an 8 GB local-inference VPS based on file size alone.

Point authorized user/admin DNS records to the VPS, allow application TCP 80/443, and restrict SSH to approved management/deployment egress CIDRs. Keep DB/Redis/Ollama private. Prefer a dedicated trusted deployment runner with static egress (set PRODUCTION_RUNNER), a static hosted runner, or an operator-approved authenticated private channel. Default GitHub-hosted runners have changing source ranges: reconcile firewall allowlists explicitly; do not silently open SSH to the world. The admin hostname additionally requires operator/VPN CIDRs in ADMIN_ALLOWED_CIDRS. Use DNS-only routing until any additional proxy's trust model is reviewed.

Protect master with review and required `CI / validate` and Docker matrix and infrastructure-image checks, no bypass/force push, and review ownership for .github/workflows, deploy, migrations and terraform. Enable Actions failure notifications for responsible operators. Create release-tag rules for v* limited to maintainers. Create a production environment limited to master/authorized v* releases; keep reviewer approval required during commissioning, then choose the approved automatic deployment policy. Default workflow token access should be read-only and Actions must not create/approve PRs. The GHCR packages must grant the repository write permission; configure private package read access for the VPS.

Environment secrets: PRODUCTION_SSH_KEY (dedicated deployment private key), PRODUCTION_KNOWN_HOSTS (verified out of band, including [host]:port for custom ports). Repository/environment variables: PRODUCTION_HOST, PRODUCTION_PORT (default 22), PRODUCTION_USER (default doccraft-deploy), optional PRODUCTION_RUNNER. Repository variable PRODUCTION_DEPLOY_ENABLED remains false/unset until acceptance. GITHUB_TOKEN supplies short-lived package publishing; do not add application/AI/DB secrets to GitHub. Login the root controller's `/etc/doccraft/registry` Docker config once with an operator-owned GHCR read:packages credential; prefer a short-lived broker where available.

## Prepare a new empty installation

Install the reviewed control tree at /opt/doccraft/control owned root:root and unwritable by the deployment account. Prepare a mode-0600 non-secret config from the production example. Fill the nine required settings, keep unused optional settings commented, and set a unique config version. Use real authorized domains/CIDRs, not documentation fixture addresses. Set REGISTRY_PREFIX=ghcr.io/<lowercase-repository-owner>/doccraft.

For a NEW EMPTY database only, run the initializer using the setup venv:

```sh
sudo /opt/doccraft/setup-venv/bin/python /opt/doccraft/control/deploy/scripts/initialize-host.py --new-empty-installation --config /root/reviewed-production.env --home /etc/doccraft
```

It only creates fresh files; it never starts Docker or enables production. Existing installations must import existing credentials, database/storage and the original AI keyring under an operator-reviewed migration; never run the initializer over existing data. Supply initial SUPER_ADMIN_EMAIL/NAME/PASSWORD in admin-api.env and only the required integration secrets in their owning files. Before configuration generation, supply a verified RESEND_FROM_EMAIL and an approved RESEND_API_KEY in notification.env; actual email/2FA delivery is mandatory acceptance. Add payment/OAuth/Supabase settings only for approved integrations. Review existing storage keys and LEGACY_STORAGE_PROVIDER. Generate runtime files:

```sh
sudo python3 /opt/doccraft/control/deploy/scripts/configure.py --config /etc/doccraft/production.env --home /etc/doccraft --output /etc/doccraft/runtime/<config-version>
```

Create the dedicated locked-password SSH deployment user (not UID 1000, not root, no Docker group). Install root-owned authorized_keys with `restrict,command="sudo -n /usr/local/sbin/doccraft-receive"` and the deployment public key. Install deploy/scripts/doccraft-receive root:root 0755 at /usr/local/sbin/doccraft-receive. Validate a least-privilege sudoers file with visudo; allow only that exact no-argument wrapper, using env_reset. Never grant the account secret-directory access, arbitrary shell sudo or controller-tree write access.

Install the optional root-owned monitoring service/timer only after reviewing paths. Set certificate renewal before the 90-day internal service certificate lifetime expires. Keep the private CA key offline/restricted when not renewing. The AI credential keyring is not part of certificate renewal.

## Docker acceptance in disposable staging

On a Docker-capable isolated machine, install locked dependencies and run CI first. Build every distinct production target, using the pinned Dockerfiles, and scan the resulting images. Exercise the same build/publish pipeline against approved test GHCR packages. Use a fresh test config/home, test domains/CA, empty volumes and test provider credentials; never production secrets. Configure private runtime files and generate a manifest with real built/published digests. Root controller tests require a disposable host or explicit isolated paths and an operator-created enable marker for that fixture only.

```sh
docker build -f deploy/docker/Backend.Dockerfile --target runtime -t doccraft-test-node .
docker build -f deploy/docker/Backend.Dockerfile --target migration -t doccraft-test-migration .
docker build -f deploy/docker/Backend.Dockerfile --target pdf -t doccraft-test-pdf .
docker build -f deploy/docker/Python.Dockerfile --target runtime -t doccraft-test-python .
docker build -f deploy/docker/Frontend.Dockerfile --build-arg APP=admin -t doccraft-test-admin .
docker build -f deploy/docker/Frontend.Dockerfile --build-arg APP=user-frontend -t doccraft-test-user .
python3 -m unittest discover -s deploy/tests -v
```

Do not print fully resolved Compose configuration with real credentials. The controller sets DOCCRAFT_HOME, DOCCRAFT_RUNTIME, DOCCRAFT_CONTROL, all image digest variables and public config from its reviewed files. For syntax-only local validation:

```sh
docker compose -f deploy/docker/compose.production.yml config --no-interpolate --no-env-resolution --quiet
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
```

Run container restarts, Redis/PostgreSQL/PDF readiness failures, concurrency/queue pressure, credential isolation, real model routing and a failed-release rollback. Restore a backup into a disposable database and compare application integrity. See hybrid report 15 for private-inference assertions. Confirm VPS firewall/host-key/SSH and registry authorization independently. Unit fake-executor rollback is not this acceptance test.

## Enable and deploy only after approval

After acceptance and explicit operator authorization, create the root-owned `/etc/doccraft/production-enabled` marker and set repository PRODUCTION_DEPLOY_ENABLED=true. Merge into protected master or push an approved reachable vX.Y.Z tag. CI builds/scans/publishes and the environment-approved deploy job sends the manifest. A first failed deployment has no previous release to restore and requires operator recovery.

Manual approved deployment uses the same manifest-only channel:

```sh
ssh -T -o StrictHostKeyChecking=yes -o UserKnownHostsFile=<verified-known-hosts> -i <deployment-key> doccraft-deploy@<vps> < release.json
```

The forced command handles it; no scp/source upload is required. Inspect the workflow result and private remote current/failure state. Manual rollback uses report 08. Production activation is currently NO-GO until the documented blockers are cleared.
