# Configuration management

The authoritative operator template is `deploy/config/production.env.example`, validated against `config.schema.json` by `deploy/scripts/configure.py`. `runtime-map.json` lists actual service settings and required/allowed secret names. The repository audit JSON lists all discovered application variables, including optional/legacy settings; not every discovered variable is required in production.

Required new deployment settings: APP_DOMAIN, ADMIN_DOMAIN, ADMIN_ALLOWED_CIDRS, ACME_EMAIL, CONFIG_VERSION, REGISTRY_PREFIX, POSTGRES_DB and LOCAL_AI_ENABLED. Admin CIDRs are space-separated operator VPN/static source networks; unrestricted /0 is rejected. REGISTRY_PREFIX is `ghcr.io/<lowercase-owner>/doccraft`. Optional deployment sizing settings are OLLAMA_MEMORY_MB and OLLAMA_CPUS. These are introduced deployment controls, not inferred provider credentials or existing application settings.

Keep `/etc/doccraft/production.env` private and non-secret. Store scoped credentials under `/etc/doccraft/secrets/<service>.env`, service identities/TLS files individually, and the AI keyring as `ai-credential-keyring.json`. Never give the deployment SSH user access to these files. Secrets beneath the root-only 0700 directory may be 0444 when mounted into non-root containers; env files remain 0600. File-backed Compose secrets retain host ownership. Only selected files are mounted.

Generate a new immutable runtime directory using:

```sh
sudo python3 /opt/doccraft/control/deploy/scripts/configure.py --config /etc/doccraft/production.env --home /etc/doccraft --output /etc/doccraft/runtime/<config-version>
```

The generator evaluates no shell code, rejects unknown central keys, duplicate assignments, shell expansion, insecure env permissions, symlinked files, mismatched identities, missing scoped credentials and plaintext Redis URLs. Config versions cannot be overwritten or changed in place; the controller compares the recorded configuration and scoped env content before deployment. Optional example settings are commented out. Uncomment only required integrations and supply real operator-owned values outside Git.

Runtime files include only each service's mapped settings/credentials. PDF/gateway receive no DB connection. User/admin static images receive no runtime secret mounts. Migration-owner files are used only by migration/backup jobs; the grant job alone receives persistent runtime-role credentials and the separate DB administrative connection.

AI_CREDENTIAL_KEYRING_FILE remains `/run/secrets/ai_credential_keyring` in admin-api only. The keyring remains outside image/config release directories and survives replacements/rollbacks. Import the original keyring with an existing database; do not regenerate it. Admin-managed model/provider/plan settings remain database-backed runtime configuration and need no redeployment.

The ninth required central setting is the existing RESEND_FROM_EMAIL: use an approved verified sender. Notification requires an operator-supplied RESEND_API_KEY in its scoped secret file; freshly generated infrastructure credentials alone cannot provide real email/2FA delivery. Public OAuth/payment callback overrides require HTTPS and the authorized application hostname. Notification receives its actual AUTH_SERVICE_URL/ADMIN_API_URL, quota its FRONTEND_URL and chat its CORS_ORIGIN. Existing provider/storage/analytics credentials remain optional per approved integration.
