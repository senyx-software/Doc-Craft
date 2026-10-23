# Deployment guide

This is an operator-run guide; no production deployment was performed.

## Database and service preparation

Back up the existing admin database and encryption keyring separately. Apply `services/admin-api/migrations/202610200001_hybrid_ai.sql` with the existing schema-owner migration process; it adds only AI credentials, health, inference ledger and queue tables/indexes. The existing admin initialization/migration job includes this schema. Runtime production services should use `ADMIN_RUN_MIGRATIONS=false` and DML-only roles. Grant admin-api SELECT/INSERT/UPDATE/DELETE on the four new AI tables; do not grant Chat, Gateway, analytics or frontend users access to `ai_credentials`. The staging role script has explicit table grants. Keep existing Prisma conversation, quota and billing migrations.

Build the services and both frontends. Deploy the admin and Chat code together with updated shared service permissions. Configure the existing signed service identities and Redis nonce enforcement; new paths are narrowly scoped to Chat. Generic config APIs cannot configure the new domain. Keep managed routing disabled until endpoint tests and assignments are complete.

## Encryption keys

Supply either `AI_CREDENTIAL_KEYRING_FILE` (preferred, mounted read-only from the available secret-management system) or `AI_CREDENTIAL_KEYRING` to admin-api only. The JSON shape is `{"active_kid":"key-2026-10","keys":{"key-2026-10":"<base64url-encoded 32 random bytes>"}}`. Generate cryptographically random keys outside the browser; never commit this file or include it in frontend environment variables. Ensure only the service runtime/secret-management operator can read it. Encryption is purpose-separated from existing TOTP keys.

For encryption-key rotation, distribute the new key while retaining all existing key IDs, then switch `active_kid`. New provider replacements use the new key; existing ciphertext remains decryptable with retained old keys. Replace provider credentials via the admin panel to re-encrypt them, verify connectivity and generation changes, and remove old encryption keys only after every old envelope and retained backup has an explicit recovery plan. There is no automatic bulk re-encryption job in this change. Losing keys makes stored credentials unrecoverable; they must be re-entered.

## Endpoints and local runtime

`AI_ALLOWED_LOCAL_ENDPOINTS` is a comma-separated exact-origin allowlist, initially loopback Ollama only. `AI_ALLOWED_CLOUD_HOSTS` lists approved cloud names with optional `*.` subdomains. Allowlist changes are operator deployment configuration; administrators cannot grant their own unrestricted egress. Keep local runtime ports private and apply host/firewall/network policy. Model/provider HTTP URLs must be inference base paths without secrets or query parameters.

An optional overlay is provided at `deploy/hybrid-ai/compose.local.yml`. Set a tested pinned `OLLAMA_IMAGE` and private `AI_CREDENTIAL_KEYRING_HOST_FILE` before composing it with the existing root topology. It publishes no inference host port, separates inference traffic, limits one loaded model/parallel request, and sets configurable memory/CPU limits. The default 4 GB inference cap is an example limit, not a hardware-sizing recommendation.

Provision/download the selected model separately under operator control after reviewing its license, revision, disk and RAM requirements. A background task such as a controlled one-shot runtime pull may be used; never run a download inside an admin HTTP request. Register only the resulting callable endpoint. The overlay does not choose/install any model automatically.
Basic information
Name
instance-20261021-1441
Create in compartment
erandasathsara (root)
Placement
Availability domain
AD-1
Capacity type
on-demand
Fault domain
Let Oracle choose the best fault domain
Image
Operating system
Oracle Linux 9
Image build
2026.10.16-0
Security
Shielded instance, Confidential computing, BM Confidential computing
Shape
Shape
VM.Standard.E2.4
Shape build
Virtual machine, 4 core OCPU, 32 GB memory, 2.8 Gbps network bandwidth
Management
Authorization header
Enabled
Tags
Namespace
	
Key
	
Value
No items to display
Create new items or search again using different filters or search terms.
Availability configuration
Live migration
Let Oracle choose the best migration option
Restart after infrastucture maintenance
Enabled
Oracle Cloud Agent
WebLogic Management Service
Disabled
Vulnerability Scanning
Disabled
Oracle Java Management Service
Disabled
OS Management Hub Agent
Disabled
Management Agent
Disabled
Fleet Application Management Service
Disabled
Custom Logs Monitoring
Enabled
Compute RDMA GPU Monitoring
Disabled
Compute Instance Run Command
Enabled
Compute Instance Monitoring
Enabled
Compute HPC RDMA Auto-Configuration
Disabled
Compute HPC RDMA Authentication
Disabled
Cloud Guard Workload Protection
Enabled
Block Volume Management
Disabled
Bastion
Disabled
Security
Secure Boot
Disabled
Measured Boot
Disabled
Trusted Platform Module
Disabled
Confidential computing
Disabled
Security attributes
Namespace
	
Key
	
Value
No items to display
Create new items or search again using different filters or search terms.
Networking
VNIC name
-
New virtual cloud network name
vcn-20261021-1443
Create in compartment
erandasathsara (root)
New subnet name
subnet-20261021-1443
Create in compartment
erandasathsara (root)
CIDR block
10.0.0.0/24
Launch options
-
DNS record
Yes
Use network security groups to control traffic
No
Public IPv4 address
No
Private IPv4 address
Automatically assigned on creation
Private IPv4 Ocid
-
IPv6 address
undefined
IPv6 address OCID
SSH keys
SSH keys
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDLkhpzAupb3fVDR//KGZ3xiVClfiJNGZT5sByllD4UMOclLqaymrZXKttn6ns+J8O2D3++bHzMghgTiGW6EHvncKgzTdNI+xKCirN3K3AxKEQB2lOiRXjSCzZ0Ff5b77xYxLADBYy6J9yb+yzWZBSZeOtrKZyGKaxNvwqrBrHjY3FrLFVEB25C9J6p7Rhhj34T/m1+CQXlVTBuHYUAIIxj+sO1i4f8qKb/FNlGBUZ/nybMZdqSpjeyhytZALkY934WW4ZeWj1lqZPvvhlHou5e6h3uGOE1EDQFISoBqBqxEP8c8rfoqiYyiQ8L7YF/GSFARpsHiU9rUimyWUOyEyVF ssh-key-2026-10-21ssh-rsa AA...
Storage
Boot volume
Specify a custom boot volume size and performance setting
-
Boot volume performance (VPU)
-
Use in-transit encryption
Enabled
Master encryption key
-
Block volume
Name
	
Attachment type
	
Create type
	
Reservations
	
Access
No items to display
Create new items or search again using different filters or search terms.
Tasks Completed4 of 4

## Activation and rollback

In AI Management, create a disabled registry entry, configure/enable its provider and credential, run the structured-tool connectivity test, enable the model, assign every intended subscription plan and set plan/global budgets. Set zero cloud budgets to prohibit cloud inference. Enable managed routing last. Health checks cost real inference and expire; schedule checks operationally if desired. Retest after key/endpoint/runtime changes. Do not activate a model that merely passes a greeting but fails document/tool acceptance.

Exercise the representative corpus and simultaneous PDF/quota/billing load in isolated staging. Verify actual ownership, service signatures, PostgreSQL grants, Redis outages, provider failures, budget refusal, reload/undo and both frontends. Monitor all service memory/CPU, runtime peaks, queue time and request/token/spend reservations. Expand resources only from full-deployment measurements.

Rollback through the admin version selector creates a new validated configuration version. Credentials are independent and cannot be restored from history. Disabling a provider/model immediately stops subsequent calls; an already dispatched HTTP request may finish and remain billable. Assignment-only changes apply on new turns while original turn snapshots may complete.

## Reproducible local checks

```sh
npm run test:chat
PYTHONPATH=services/admin-api .venv-local/bin/python -m pytest services/admin-api/tests -q
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:9/fixture REDIS_URL=redis://127.0.0.1:9 npx vitest run services/quota/src/__tests__
npm run build
npm run build --prefix admin
npm run build --prefix user-frontend
node scripts/verify_hybrid_ai_browser.mjs
node scripts/benchmark_hybrid_ai.mjs
```

Use an installed Chromium compatible with Puppeteer, or set `PUPPETEER_EXECUTABLE_PATH`. This workspace required a test-only launcher with sandbox disabled because unprivileged browser namespaces are unavailable; production browser/runtime sandbox settings were not changed. Use the project's Python environment with requirements installed. Tests use disposable data and fixture provider responses; live inference and full-VPS benchmarking are separate acceptance work.

Docker was unavailable in this workspace, so the optional Compose overlay has not been validated with the Compose CLI or started. Validate the merged configuration and private network/memory limits in isolated staging before use.
