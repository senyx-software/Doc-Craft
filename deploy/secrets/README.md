# Operator-managed private files

Production files belong under `/etc/doccraft`, outside this checkout. Keep its
configuration and secret directories mode 0700 and environment files mode 0600.
The restricted SSH identity must not own or traverse them and must not join the
Docker group. Only the root-owned deployment controller reads runtime env files.

Each application receives its own environment file, service identity and TLS
key. Mount individual files, never the containing directory or a master secret.
Compose bind-mounted secret files must be readable by the container UID: use
mode 0444 beneath the inaccessible root-only parent, or an appropriate numeric
service ownership. Compose file-backed secrets do not remap host file ownership.

`ai-credential-keyring.json` is mounted only into admin-api at
`/run/secrets/ai_credential_keyring`; AI_CREDENTIAL_KEYRING_FILE is preserved.
Import the existing keyring when migrating an existing database. Never generate
a replacement for existing ciphertext, and never rotate keys during deployment.

The environment fallback for database URLs, Redis ACL URLs, stable JWT material
and external provider credentials exposes those values to Docker administrators
and the owning container. Limit host and Docker privileges. Provider API keys
managed by the admin panel remain encrypted in PostgreSQL; they are not frontend
build variables or GitHub deployment credentials.

Initial setup uses fresh credentials only for a new, empty installation. Existing
installations require an operator-reviewed credential/data migration. Schema-owner
connection files are mounted only into backup/migration/grant jobs. Runtime roles
receive DML/read grants, no schema ownership. Backups contain sensitive data and
must be encrypted off-host under the operator's backup policy.
