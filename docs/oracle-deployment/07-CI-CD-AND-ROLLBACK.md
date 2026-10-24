# Staging CI/CD and rollback

Current target status: the original E5 is TERMINATED, its 47 GB boot disk is retained, and no A1 exists because OCI rejected the launch for host capacity. Transfer/rollout identity checks still point to the old instance and must remain closed until a real replacement is explicitly identified and pinned. No secrets, database changes or service deployments were authorized or executed by the VM replacement request. [Execution evidence](evidence/a1-replacement-execution.json).

Prepared [`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml), a manual workflow gated by `vars.STAGING_DEPLOY_ENABLED == 'true'` and the GitHub `staging` environment. No workflow was dispatched, registry publication performed, repository setting changed or production deployment enabled. Existing production gates were not changed. Full CI can now be invoked as a reusable workflow; dispatching staging does not satisfy its push-only publish/production conditions.

## Flow and prerequisites

1. Reuse existing CI checks: application builds/lints, Node/Python/security/deployment tests, isolated PostgreSQL/Redis migrations, PDF harness, browser fixtures and image/infrastructure scans. These retain their declared fixture/integration scope; they are not VPS acceptance.
2. After the staging environment approval, build 13 image targets (12 application/frontends plus migration) on a native runner matching selected `amd64` or `arm64`. The current verified E5 AMD VM requires **amd64**; arm64 applies only to a separately approved A1 migration. Both runner labels exist, but account availability/cost still need approval. [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
3. Publish only into approved `STAGING_REGISTRY_PREFIX` (a lowercase `ghcr.io/<owner>/doccraft` prefix). Tags contain the source commit and architecture. The release manifest stores immutable `@sha256` digests, not tag references. Scan published digests; HIGH/CRITICAL findings block rollout. Existing findings may keep this workflow blocked until patched/rebuilt.
4. Download fragments into a manifest with exact service set, schema epoch and architecture. Upload that non-secret artifact for review/recovery. The reviewed `/opt/doccraft/control` Git checkout must be clean and match the commit; this workflow deliberately does not replace remote control scripts from arbitrary uploaded code.
5. Send only the release manifest over strict SSH to the prepared staging controller. Environment files/keyrings are provisioned through the separately approved transfer process. The controller verifies IMDS identity, staging markers, scoped runtime config, capacity, architecture, database compatibility/restore approval and matching code. It pulls/runs applications under project `doccraft-staging`, performs real readiness/PDF/security probes, and records protected state. It does not run migrations or provision the database/cache.

Before enabling, approve CI/registry costs and namespace; commit/review the desired source; configure protected staging environment reviewers/branches; prepare verified SSH/private access, host Docker and registry read credentials; complete scoped secret transfer, volume/UID permissions, DB migrations/restorable backups, managed-AI disablement and DNS/HTTPS or approved private ingress. No prerequisites were fabricated.

Configure only the **staging** environment:

| Name | Kind | Purpose |
| --- | --- | --- |
| `STAGING_DEPLOY_ENABLED` | Variable, default absent/false | Enable only after preparation and operator approval |
| `STAGING_REGISTRY_PREFIX` | Variable | Approved lowercase GHCR namespace prefix |
| `STAGING_RUNNER` | Variable, optional | Approved runner label with actual Bastion/private route access |
| `STAGING_SSH_KEY` | Environment secret | Deployment identity; never part of repository or artifact |
| `STAGING_KNOWN_HOSTS` | Environment secret | Independently pinned VM and applicable hop public keys |
| `STAGING_SSH_CONFIG` | Environment secret | Reviewed `Host doccraft-staging` endpoint/user plus optional strict Bastion proxy |

The SSH configuration is trusted executable operator configuration because a ProxyCommand can execute commands. Review it before storing. Pin every hop independently; outer SSH options do not configure a nested proxy's verification. ProxyCommand can reference `DOCCRAFT_STAGING_SSH_DIRECTORY` for the runner's temporary key/known-hosts paths. Key files live only in a private runner temp directory and are removed on exit. Do not print SSH configuration or key material. A time-limited Bastion session must already exist after approval; the workflow does not create or renew cloud sessions automatically. A hosted runner with changing public IP cannot be assumed to fit a static Bastion `/32` allowlist. Prefer an approved runner with stable egress/private reachability.

Setting an approval ID input records authorization; it does not replace the operator's actual approval or GitHub environment protection. Do not grant this workflow production secrets. CI minutes and private registry storage may be chargeable; no build was launched by this run.

## Compatible application rollback

The controller stores private `.staging-releases/current.json`, `previous.json`, protected logs and configuration digests. On rollout failure it stops and retains diagnostics/data; it does not silently rewind schema or copy stale credentials back into place. Operator-controlled rollback is supported by `oracle_staging.py rollback` using the prior manifest's immutable images, after approval.

Before rollback verify the prior release has the **same schema epoch**, that current configuration/keyring has not changed, that old images remain available/approved, and that the DB gate explicitly approves that commit. Review/check out the matching clean control commit. The controller requires the same configuration digest and re-runs health verification. Reverting to an old vulnerable image or incompatible schema is not an acceptable recovery shortcut.

No command automatically restores a DB or removes persistent volumes. A database recovery requires a separate approved isolated restore and data-loss/RPO review. Keep `/opt/doccraft` configuration, keyrings and persistent storage through application changes. Credential rollback needs its own security review; never undo a rotation automatically.

Static workflow lint passed. Native ARM app builds, hosted CI runs, GHCR authentication/publication, Bastion runner access, real rollout, health and rollback remain **unexecuted**.
