# Database and security gates

Current target status: the original E5 is TERMINATED, its 47 GB boot disk is retained, and no A1 exists because OCI rejected the launch for host capacity. Transfer/rollout identity checks still point to the old instance and must remain closed until a real replacement is explicitly identified and pinned. No secrets, database changes or service deployments were authorized or executed by the VM replacement request. [Execution evidence](evidence/a1-replacement-execution.json).

**No target database was accessed, backed up, migrated or seeded.** Production remains NO-GO. Local development DBs and encrypted AI data were not modified.

The repository contains four Prisma migration histories (`auth`, `chat`, `payment`, `quota`), Python schema initialization for document/admin, notification schema work in the Node migration runner, and additive admin SQL migrations. Use the existing [`staging_migrate_node.mjs`](../../scripts/staging_migrate_node.mjs), [`staging_migrate_python.py`](../../scripts/staging_migrate_python.py), [`staging_database_roles.py`](../../scripts/staging_database_roles.py) and hardened Compose tools. Runtime credentials must not receive DDL/schema-owner privileges.

## Required migration review and approval

1. Connect through approved private TLS with the designated migration identity. Confirm `current_database()`, `current_user`, server identity/version, expected staging schema, database ownership and existing persistent volume. A name containing `staging` is an additional guard, not independent proof of identity.
2. Inspect every Prisma migration history and the admin SQL ledger; compare pending migrations against the exact reviewed commit and existing schema. Local `check-migrations.py` passes immutability/destructive-SQL policy, but has no access to remote applied state. Do not use `prisma migrate dev`, `db push`, reset or implicit schema creation against the VPS.
3. Back up PostgreSQL plus application storage and the original encryption/signing configuration consistently. Test an actual restore into an isolated staging database and verify schema, data, ownership and encrypted credential recovery. `pg_restore --list` alone proves neither restorability nor full-host recovery. An empty installation still needs an explicit approved initialization and recovery plan.
4. Inspect normalized admin-email conflicts before the additive identity migration. The review query below returns counts only; investigate conflicting identities privately. Never merge or delete staff records automatically.
5. Present exact pending migrations, backup identity/restore evidence, scoped schema-owner job, data impact and rollback limits. Obtain explicit migration approval before running the one-shot tools. Refresh scoped runtime grants using existing passwords after schema creation, then verify DDL denial for runtime users.

```sql
SELECT COUNT(*) AS normalized_email_conflict_groups
FROM (
  SELECT LOWER(TRIM(email))
  FROM admin_users
  GROUP BY LOWER(TRIM(email))
  HAVING COUNT(*) > 1
) AS conflicts;
```

This query requires the table to exist; inspect schema first on a fresh database. [`202610210001_admin_identity.sql`](../../services/admin-api/migrations/202610210001_admin_identity.sql) intentionally fails on conflicts instead of merging identities. No query was executed remotely.

Keep `ADMIN_RUN_MIGRATIONS=false`, `DOCUMENT_RUN_MIGRATIONS=false` and `NOTIFICATION_RUN_MIGRATIONS=false` in runtime services. Only approved one-shot tools receive schema-owner credentials and migration flags. Preserve `doccraft-staging` volumes; do not use `docker compose down -v`, volume prune, schema drops or automatic DB restore. PostgreSQL must use verified TLS; Node/Prisma and Python clients have different supported CA settings, enforced by the preparation validator.

## AI and service identities

Reuse the existing AI encryption keyring for any existing encrypted provider credentials. `AI_CREDENTIAL_KEYRING_FILE=/run/secrets/ai_credential_keyring` is mounted as a file-backed read-only Compose secret to **admin-api only at runtime**. Approved migration/verification tools also need deliberately scoped access. The transfer helper refuses to replace an existing keyring with different bytes. No replacement key, rotation, generated model credential or recovery-key disclosure occurred.

Preserve per-service signing identities, TLS CA/certificates and Redis replay nonce enforcement. Do not share an aggregate secret file with all services or disable authentication/replay protection to make readiness pass. Restrict plaintext secret files and Docker access; verify actual mount readability after resolving container UID ownership. Keep inference on its private network.

Managed AI enablement is stored in the administrator-owned database configuration, not inferred from an environment toggle. Before startup inspect the existing config through the signed/admin path and confirm managed routing is disabled; do not import a production-enabled config silently. Staging verification fails if it is enabled. Provider inference or future enablement requires approved staging credentials/budgets and real-model acceptance. Ollama stays disabled.

## Deployment evidence gate

After actual migration/restore/config checks and approval, the operator may create private `/opt/doccraft/.database-staging-approved.json` with these fields:

```json
{
  "database": "doccraft_staging",
  "schema_epoch": 1,
  "reviewed_commit": "REPLACE_WITH_REVIEWED_40_CHARACTER_COMMIT",
  "restore_verified": false,
  "managed_ai_disabled": false,
  "approval_reference": ""
}
```

This deliberately failing example is not evidence. Set the verification flags only after performing the checks, and approve the exact release's schema compatibility. The application rollout requires this gate, separate deployment approval, a matching code checkout and unchanged private configuration for compatible rollback. No approval marker was created in this run.

Secure browser sessions require approved staging HTTPS hostnames, exact CORS origins and correct reverse-proxy behavior. Existing auth code selects Secure cookies in production security mode. Verify registration, login, refresh rotation, cross-origin rejection, logout/revocation and admin permissions on the actual staging site; source inspection alone cannot certify them. Both billing providers must stay in sandbox mode with approved test credentials.
