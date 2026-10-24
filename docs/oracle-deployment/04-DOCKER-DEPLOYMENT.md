# Docker staging deployment

**No guest SSH session was opened. No Docker Engine, container, volume or firewall was changed.** Authenticated OCI discovery reports 1 OCPU / 2 vCPUs / 12 GiB on AMD x86_64, a 47 GiB boot volume and an Ubuntu 20.04 launch image. Actual guest OS/kernel, free disk/RAM, Docker, host firewall and privileges still require verified SSH. Egress, approved staging credentials and deployment approval remain prerequisites.

Use the repository's hardened [`deploy/docker/compose.production.yml`](../../deploy/docker/compose.production.yml) as the shared service definition with [`deploy/oracle/compose.staging.yml`](../../deploy/oracle/compose.staging.yml), always under project `doccraft-staging`. The shared file's name does not authorize production deployment. Do not use the production controller or create any production-enabled marker.

## Actual topology

| Component | Service / internal port | Persistence / purpose |
| --- | --- | --- |
| User frontend | `user-ui:8080` | Static Vite assets; public API base `/v1` |
| Admin frontend | `admin-ui:8080` | Static Vite assets; public API base `/api/v1` |
| Reverse proxy | `edge:80,443` | Caddy TLS data/config volumes; approved app/admin hostnames |
| Gateway | `gateway:3001` | Authenticated routing to internal services |
| Authentication | `auth:3011` | PostgreSQL; refresh tokens/OAuth/email |
| Notifications | `notification:3012` | PostgreSQL/Redis; background email jobs |
| Documents | `document:3013` | PostgreSQL plus `documents` storage volume |
| Billing / quota | `payment:3014`, `quota:3015` | PostgreSQL/Redis; sandbox flags enforced |
| Chat | `chat:3016` | PostgreSQL/Redis; deterministic paths and approved provider configuration |
| Analytics | `analytics:3017` | PostgreSQL/approved external analytics |
| Admin API | `admin-api:3018` | PostgreSQL/Redis and `admin_assets`; automation workers and admin-owned AI settings |
| PDF renderer | `pdf:3023` | Chromium; signed private `/generate`; no public renderer port |
| Database / cache | `postgres:5432`, `redis:6379` | Named persistent volumes; verified TLS and scoped users |
| Operator-only tools | `migrate-node`, `migrate-python`, `grant-roles`, `verify`, `backup` | `tools` profile, one-shot approved operations |

There are 15 default services. The document process starts its BullMQ PDF worker and recovery task; notification starts its email worker; payment starts its webhook worker; admin starts automation, event subscriber and billing inbox tasks. These workers use the existing service containers. Ollama remains behind an unselected `local-ai` profile. No model or Ollama image was downloaded.

Only edge publishes host ports. `backend` and `inference` are internal Docker networks. Egress is attached only where configured; actual OCI routing still determines Internet reachability. No public database, Redis, internal API, inference or PDF port is permitted. Public edge access itself remains subject to network/DNS approval; for initial private staging, prepare a reviewed loopback binding/ingress plan before startup instead of exposing the shared file's default ports.

## Host preparation approval

After verified SSH, inspect `/etc/os-release`, `uname -m`, CPU, RAM/swap/disk, disk mounts/ownership, existing containers, Docker socket access, firewall and outbound DNS/TLS. Install Docker Engine and a Compose plugin supporting `env_file.format: raw` (Compose 2.30+ syntax) only for the detected OS, after approval. Oracle Linux needs its own supported repository/runtime decision; do not run Ubuntu apt commands on an unknown VM. [Docker installation matrix](https://docs.docker.com/engine/install/), [Compose raw dotenv support](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

Create the non-root deployment identity and `/opt/doccraft` private tree deliberately. Docker socket access is host-privileged; a deployment identity is not a low-privilege account merely because it is non-root. Keep automatic SSH agent forwarding disabled. Preserve existing Docker data and firewall policy. Assess the Docker forwarding chain/OCI rules together; published ports can bypass ordinary UFW policies. [Docker firewall considerations](https://docs.docker.com/engine/install/ubuntu/).

The shared configuration already has restart policies, rotating JSON logs, per-service memory/CPU/PID limits, dropped capabilities, no-new-privileges, transient directories, health checks and persistent named volumes. Baseline memory limits sum to **7,552 MiB**, plus a 768 MiB verifier and host/Docker overhead. The prepared rollout conservatively requires at least 10 GiB host RAM and 15 GiB free image/storage space. These are admission checks, not measured capacity or a performance guarantee. The 1 GiB E2 micro cannot host this baseline. Do not select paid capacity or reduce limits without measured review and approval.

Bind-mounted secret ownership is unresolved until the deployment UID and actual container UIDs are known. Transfer preserves private mode 0600; Node/Python commonly run UID 1000 while Redis/PostgreSQL may use other IDs. Compose file-backed secret ownership options do not automatically solve host bind permissions. Prepare and approve an ownership or protected secret-mount staging design, including any required Compose/validator changes, and test readability **only inside authorized containers**. Current validators deliberately reject group/world-readable source files, including ACL masks exposing group read access. Do not weaken those checks or make keyrings/world-readable host credentials a shortcut. Preserve existing volume ownership; never run recursive chown across unknown data.

## Architecture and release preparation

The current VM's AMD shape establishes the **amd64** image target; confirm `uname -m` after pinned SSH. Six pinned Node, Python, nginx, Caddy, PostgreSQL and Redis registry index digests were fetched and verified; each advertises Linux amd64 and arm64. See [registry evidence](evidence/base-image-platforms.json). No image layer was pulled. This does not prove the application images, native dependencies, Prisma engines or Chromium sandbox work on the actual guest.

The launch image is Ubuntu 20.04, whose standard security maintenance ended in May 2025; actual ESM enrollment or an in-guest upgrade is unknown. Check the running OS/support state before selecting a supported Docker repository or proposing an OS migration. Do not silently perform a distribution upgrade. [Canonical lifecycle](https://ubuntu.com/about/release-cycle).

Build the existing backend/runtime/PDF/migration, Python/runtime and two frontend targets in CI for the detected architecture. Deploy digest references from an approved registry, never `latest`. Preserve normal Chromium sandboxing and the repository's TLS trust entrypoint. Existing upstream HIGH/CRITICAL image findings remain a publication gate; no scanner bypass was added.

The actual Compose parser passed structural staging validation using synthetic temporary files: 15 default services, edge-only published ports, private networks, sandbox billing and an admin-only runtime keyring. The parser is a locally available standalone Compose 5.3.0 tool, not a locally installed Docker daemon or VPS Compose plugin. [Parser evidence](evidence/compose-validation.json).

After separate host, secrets, database and deployment approvals, [`scripts/oracle_staging.py`](../../scripts/oracle_staging.py) validates staging identity, config, database approval, clean matching control checkout, architecture and capacity; pulls immutable app images; runs the private Compose rollout and integrated verifier. It runs **no migrations** and will not create missing DB/cache services. Initial PostgreSQL/Redis provisioning, backup/restore acceptance and schema-owner operations must be separately approved and completed first. The rollout fails safely while prerequisites are missing. Failed application startup does not automatically restore data, change keys or delete volumes.
