# Deployment and rollback

Only a reviewed root-owned controller at /opt/doccraft/control executes deployment operations. SSH uses a dedicated non-root account with no Docker group and no application-secret access. Its authorized key forces `sudo -n /usr/local/sbin/doccraft-receive`; the sudo rule permits that no-argument command only. The wrapper clears inherited environment and accepts bounded JSON on stdin, never shell commands, file paths or uploaded scripts. Host verification is mandatory in Actions. Initial controller installation/update is an operator task separate from routine image rollout.

The controller validates the exact image set, approved GHCR namespace, commit hash and sha256 digests. It acquires the host deployment flock, verifies immutable configuration and scoped credentials, pulls the release, starts healthy DB/Redis, streams a private pg_dump archive, verifies it with pg_restore --list, then runs the existing Node and Python migration jobs and refreshes scoped grants. Only the grant job uses the DB administrative connection. The migrator is a dedicated non-superuser schema owner. Runtime roles have no DDL. Prisma's own migration locking remains in place.

A failed backup or migration prevents rollout. The controller records the durable database schema epoch before migrations and refuses older-epoch releases, including old tags after a failed newer rollout. Migration failure creates migration-blocked.json and records failure.json and retains diagnostics/backups; it never restores a database or reverses migrations. An operator must reconcile the schema and explicitly clear the migration-blocked marker before retrying. The root controller ignores SSH disconnect/termination signals during critical execution and retains its lock until work finishes. A cancelled/expired Actions job can therefore report failure while the remote controller safely completes; operators must inspect remote state before retrying. Routine deployment concurrency never cancels an active migration.

After application recreation, release gates check verified internal TLS, all service dependency readiness, both frontend HTML responses, admin authentication denial, signed service calls, real PDF bytes, AI configuration and public HTTPS. Admin public 403 is accepted when the VPS is outside configured operator CIDRs; internal admin frontend/readiness remain mandatory. AI health checks do not dispatch paid inference simply because a release is deploying.

A failed application readiness gate preserves private diagnostics and restores previous image digests only when schema_epoch matches and the recorded configuration is identical. Previous runtime directories and secrets must remain available. Changes to configuration/credential versions require explicit operator recovery so rollback cannot resurrect a revoked credential or restore an old endpoint allowlist. It runs readiness again and marks the deployment failed even if rollback succeeds. A new schema epoch requires operator recovery when health fails. Schema compatibility is a reviewed contract, not something a SQL regex can prove. Use expand/contract migrations, immutable migration files and review all Python schema-initializer changes as well as SQL.

Manual application rollback:

```sh
sudo /opt/doccraft/control/deploy/scripts/rollback.sh
sudo /opt/doccraft/control/deploy/scripts/health-check.sh
```

Inspect /var/lib/doccraft/current.json, previous.json, attempted.json and failure.json first. Never manually edit a digest to latest. No automatic DB restore exists. Backups are mode 0600 and local only; operators must implement encrypted off-host copies, retention and isolated restore drills. Archive listing is not a full recovery test. The controller's unit tests exercise rollback policy with fake execution; actual Docker rollback remains a staging requirement.
