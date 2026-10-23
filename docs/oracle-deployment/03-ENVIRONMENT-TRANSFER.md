# Protected staging environment transfer

Current target status: the original E5 is TERMINATED, its 47 GB boot disk is retained, and no A1 exists because OCI rejected the launch for host capacity. Transfer/rollout identity checks still point to the old instance and must remain closed until a real replacement is explicitly identified and pinned. No secrets, database changes or service deployments were authorized or executed by the VM replacement request. [Execution evidence](evidence/a1-replacement-execution.json).

**Prepared and locally tested; no credentials transferred.** Original local environment files were preserved. OCI identity is now verified and pinned to the actual instance OCID. Credential provenance, approved staging values and verified SSH remain missing.

The entry point is [`scripts/deploy-oracle-env.sh`](../../scripts/deploy-oracle-env.sh), backed by the existing Python preparation, deployment and remote-install modules. It uses file transfer through an authenticated encrypted SSH channel; it does not source dotenv files or place secret values in command arguments. A sealed allowlist records file paths and SHA256 digests privately. Digests and payloads are not printed in reports.

## Preparation

Create a private plan from [`environment-plan.example.json`](../../deploy/oracle/environment-plan.example.json). It is an intentionally incomplete template with approval flags false. Do not run it unchanged. For every file, identify its approved source, selected variable names, staging-specific overrides, destination, kind and reuse approval. Neither local development fixtures nor production secrets are approved by this template. Existing encrypted data requires its original keyring; never initialize a replacement.

The preparation command reads existing files without changing them and creates a fresh, mode-0700 staging bundle under ignored `.local/`. Outputs are mode 0600. The staging database name must include `staging`. Runtime validation requires scoped PostgreSQL/Redis credentials, verified private TLS paths, production security modes, migration flags false and sandbox billing. A root Compose file cannot contain credentials. Frontend values are compiled into browser bundles and require a separate public-value review.

```sh
python3 scripts/oracle_env_prepare.py \
  --plan .local/oracle-staging/approved-plan.json \
  --output .local/oracle-staging/bundle
sh scripts/deploy-oracle-env.sh --check-local \
  --manifest .local/oracle-staging/bundle/transfer-manifest.json
```

These are future commands, not executed staging preparation. Configuration overrides must be supplied in private files, never shell history or repository templates. The parser deliberately rejects shell expansion, duplicate keys and unsupported multiline dotenv syntax. Review unsupported source syntax instead of silently dropping variables.

## Target and approval

After authenticated discovery and network approval, verify SSH host fingerprints independently and run `--discover`. All remote operations check intended OCI identity. Transfer additionally requires a non-root account and a private `/opt/doccraft/.doccraft-staging` marker containing exactly:

```json
{"region":"ap-mumbai-1","instance":"instance-20261021-1441","private_ip":"10.0.0.88","instance_ocid":"ocid1.instance.oc1.ap-mumbai-1.anrg6ljr4wujdnqcezvcrlwboiuw3efznrg5ztawy7tes74vcz63m3yn46ra","environment":"staging"}
```

Creating the deployment directory/account/marker is a separate approved host change. No marker has been created. `/opt/doccraft`, `config`, `secrets` and transfer-history directories must belong to the deployment account and have mode 0700; destination files must be private regular files, mode 0600, with a single hard link. Production-enabled markers cause refusal. Confirm container UID access to mounted files separately; see [Docker preparation](04-DOCKER-DEPLOYMENT.md).

Prepare a concrete manifest and report file destinations, staging credential provenance and target before requesting **secret-transfer approval**. An `--approval-id` records the approval; supplying an arbitrary string is not operator authorization.

Illustrative Bastion tunnel invocation, after replacing paths/login and creating the verified tunnel:

```sh
sh scripts/deploy-oracle-env.sh --discover \
  --host 127.0.0.1 --port 22022 --approved-private-route \
  --user ubuntu --key /absolute/path/operator-key \
  --known-hosts /absolute/path/verified-known-hosts \
  --fingerprint 'SHA256:REPLACE_WITH_CONSOLE_VERIFIED_FINGERPRINT'
```

After approval, use the same arguments with `--transfer --manifest ... --approval-id ...`. For direct SSH, use the verified public endpoint without `--approved-private-route`. A reviewed private `--ssh-config` supports Bastion proxying. The script refuses private-address connections unless that route has explicitly been approved, and forces strict host-key checks, public-key authentication, no agent forwarding and no connection multiplexing.

## Integrity and recovery

All approved files are revalidated before SSH; changed files require review and resealing. A bounded SSH payload carries file bytes without printing them. The remote side locks the installation, receives every payload into a private transaction directory, verifies all checksums and rejects symlinks, hard links, traversal and SSH-private-key payloads. Existing keyrings may only be transferred byte-identically.

Prior files are copied to protected `.env-transfers/<transaction>/backups/`. Each destination uses atomic replacement on the same filesystem, mode 0600, with filesystem synchronization. A caught batch error restores prior files; checksums are rechecked after installation. **Atomicity is per file, not a filesystem-wide transaction:** power loss or SIGKILL can leave a partial multi-file batch. Retain the private receipt/backups, freeze deployment and have the operator reconcile the approved batch before any service restart. No script claims power-loss transactional guarantees.

The script never restarts containers, installs Docker, runs migrations, rotates credentials or prints backups. Existing running containers retain their environment until an approved rollout. Protect and retain backups according to the credential recovery policy; never commit them or copy them into application images.

The destination structure matches the hardened Compose paths: `/opt/doccraft/.env`, `/opt/doccraft/config/<service>.env`, `/opt/doccraft/secrets/<file>` and reviewed code under `/opt/doccraft/control`. Legacy development Compose paths were not rewritten. Local safety tests are evidence of helper behavior, not a successful SSH transfer.
