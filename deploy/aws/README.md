# AWS staging deployment

Target: account `506192652462`, region `ap-southeast-2`, existing Ubuntu 24.04
instance `i-098228a0d829d7eb2` (`doccraft-staging`, `m7i-flex.large`). The public
address reported after startup was `3.107.76.247`.

Terraform adds an Elastic IP and a deployment security group to this server.
It cannot create, replace, resize or terminate the EC2 instance. The Elastic IP
becomes its permanent public address; assigning it changes the current address.
AWS charges for the running instance, storage and public IPv4 address.

The interfaces use the same IP with different HTTPS ports:

| Interface | Address |
| --- | --- |
| User app | `https://<Elastic-IP>` |
| Admin UI | `https://<Elastic-IP>:8443` |

Caddy 2.11.7, rebuilt with patched Go and HTTP/2 dependencies, requests a public IP certificate from Let's Encrypt using the
`shortlived` profile and renews it automatically. No domain or DNS setup is needed.
Port 80 must remain reachable for certificate issuance/renewal. Admin port 8443 is
restricted to the configured operator/VPN CIDRs at both the security group and
proxy. Existing secure browser cookies continue to work over HTTPS.

## Secret input file

The complete dotenv template is [github-secrets.env.example](github-secrets.env.example).
The private local copy is `.env.deployment`, excluded from Git
with mode 0600. It has the supplied PEM, the observed SSH host key, an initial
admin password and the operator's current public `/32` filled in. It is an input
for GitHub CLI, not a shell script or a container env_file.

Fill the blanks for AWS credentials, Resend, administrator email, certificate
contact and verified notification sender. The file contains 33 individual GitHub
secret names, including optional AI, Google/Firebase, Supabase, payments and
PostHog settings. Each top-level assignment becomes one GitHub Actions secret;
leave unused integrations empty. Actions generates the IP-based origins and
private service URLs automatically.

| Secret | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Deployment IAM user with the scoped S3/EC2 policy in `bootstrap-iam-policy.json` |
| `AWS_SESSION_TOKEN` | Only when using temporary AWS credentials |
| `AWS_STAGING_SSH_KEY` | Contents of `doccraft.pem` |
| `AWS_STAGING_KNOWN_HOSTS` | Verified host key, keyed by alias `i-098228a0d829d7eb2` so it survives an IP change |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Notification delivery credential and verified sender |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Initial staging administrator; password must be at least 16 characters |
| `AWS_STAGING_ADMIN_CIDRS` | JSON array such as `["198.51.100.10/32"]`; use your real public/VPN IP |
| `ACME_EMAIL`, `CONFIG_VERSION` | Certificate contact and staging configuration version |
| Provider keys/IDs listed in the file | Optional Groq, Anthropic, Google, Supabase, payment and PostHog configuration |

Database/Redis passwords, scoped connection URLs, JWT keys, service identities,
private TLS and encryption keys are generated on EC2 once. Do not supply a shared
`DATABASE_URL`, `JWT_SECRET` or `INTERNAL_SERVICE_SECRET` to every service.
`GITHUB_TOKEN` is provided automatically by Actions.

## GitHub setup and deployment

1. Authenticate with GitHub CLI (`.local/bin/gh auth login` is available locally).
2. Create the GitHub environment `aws-staging` and restrict its deployment branches
   to `eranda-dev`. The secrets may be environment-scoped or repository-scoped.
3. Import the completed private file:

   ```sh
   gh secret set --repo senyx-software/Doc-Craft --env aws-staging \
     --env-file .env.deployment
   ```

4. Commit/push the deployment files to `eranda-dev`. Manual-only workflows may
   need to exist on the repository's default branch before GitHub exposes the
   Dispatch button/API. Review and merge those workflow definitions through the
   repository's normal process when needed; use `eranda-dev` as the run ref.
5. Run **Bootstrap AWS staging access** with `apply=false` and inspect the plan.
   Run with `apply=true` to create the encrypted, versioned, private state bucket.
   Its state moves into that S3 bucket after the first apply. IAM resources are
   not created or changed.
6. Run **AWS staging infrastructure** with `apply=false`, review the plan, then
   run with `apply=true`. This provisions the EIP and web/admin security rules.
   Both infrastructure workflows share the deployment concurrency group.
7. Set the **repository variable** `AWS_STAGING_DEPLOY_ENABLED=true`. It must be
   repository-scoped because the CI gate runs before entering the environment.
8. Run **Deploy AWS staging** on `eranda-dev`. Later pushes to that branch deploy
   automatically while enabled.

Keep the AWS deployment credentials in GitHub Secrets for future releases. This
account's Organizations service control policy explicitly denies OIDC discovery,
so these workflows use the existing IAM user rather than provisioning federation.
Attach the policy in `bootstrap-iam-policy.json` to `eranda`; it scopes network
changes to the pinned instance/interface and staging-tagged resources, plus the
named state bucket. It does not grant IAM management or instance termination.

The optional `AWS_STAGING_SSH_USER` secret/variable defaults to `ubuntu`. Ensure
Actions can publish packages and access any existing
`ghcr.io/senyx-software/doccraft-*` packages. EC2 registry login uses the job's
short-lived `GITHUB_TOKEN`; its temporary Docker credentials are removed after
rollout.

## Deployment behavior

Full reusable CI passes before 15 Linux/amd64 images are built, scanned and
recorded by digest. Actions starts the instance if necessary, discovers its EIP,
and opens SSH only for the runner's public `/32`. Strict SSH uses the instance's
known host key. IMDSv2 verifies account, region and instance ID before any host
installation or credential initialization.

Image scans block all HIGH/CRITICAL findings by default. The optional staging OS
exception, its remaining risks and retained reports are described in
[image-scan-policy.md](image-scan-policy.md). It remains disabled unless the
repository variable `AWS_STAGING_ALLOW_UNFIXED_OS` is explicitly set to `true`.

The installer prepares Docker/Compose and a commit-specific controller checkout.
It creates fresh credentials only for a new installation, then validates and
preserves them on subsequent releases. To rotate credentials or change config,
perform an operator update and generate a new runtime configuration version;
changing GitHub values alone does not reset an existing database or identity.

The staging controller uses the existing database backup, migration and rollback
logic under a host lock. It verifies database/Redis readiness, signed service
requests, user/admin frontend HTML, real PDF rendering and public HTTPS before
marking the release successful. Failed migrations retain a backup and block later
rollouts for operator review. Compatible application rollbacks require the same
schema epoch and configuration; the database is never automatically restored.

Runner SSH access and temporary secret files are removed even on failure. A
later run also removes rules left by a forcibly terminated runner. Existing
instance security groups remain attached: their permissions are additive, so
inspect any old public database/Redis/SSH rules separately.

Staging container memory limits total 5,376 MiB. The capacity check reserves
another 2,048 MiB for a migration and the OS. The inspected host has 7,962,856 KiB
RAM and 55 GiB free root storage. These are staging limits, not load-test results.
Local inference stays disabled, payments use sandbox mode, and managed AI remains
disabled until configured by an administrator. Provider credentials are scoped to
their consuming services. Google/provider callbacks may impose domain requirements
of their own; email/password login is the initial authentication path.

## Remote state and operations

| Path | Purpose |
| --- | --- |
| `/etc/doccraft-aws-staging` | Root-only configuration and credentials |
| `/var/lib/doccraft-aws-staging` | Release state, database dumps and private logs |
| `/opt/doccraft-aws/releases/<commit>` | Immutable release controller code |
| Docker project `doccraft-aws-staging` | Isolated database, Redis, document and Caddy volumes |

The workflow summary reports the final app address; a non-secret artifact retains
the release manifest. Before trusting staging for durable data, configure off-host
backup retention. Internal service certificates initially last 90 days; renew
them through a controlled configuration update. The public six-day IP certificate
is renewed by Caddy automatically while the server and port 80 remain reachable.

```sh
sudo python3 /opt/doccraft-aws/releases/COMMIT/deploy/aws/staging.py health
sudo python3 /opt/doccraft-aws/releases/COMMIT/deploy/aws/staging.py rollback
```

For local infrastructure administration, initialize `terraform/aws-bootstrap`
with administrator credentials and preserve its private state. For networking:

```sh
terraform -chdir=terraform/aws-staging init -backend-config=backend.hcl.example
terraform -chdir=terraform/aws-staging plan -var='admin_source_cidrs=["YOUR_PUBLIC_IP/32"]' -out=staging.tfplan
terraform -chdir=terraform/aws-staging apply staging.tfplan
```

References: [AWS credentials action](https://github.com/aws-actions/configure-aws-credentials),
[Let's Encrypt IP certificates](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability),
[Caddy ACME profiles](https://caddyserver.com/docs/caddyfile/directives/tls),
[EC2 public IP lifecycle](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html),
[Terraform S3 locking](https://developer.hashicorp.com/terraform/language/backend/s3).
