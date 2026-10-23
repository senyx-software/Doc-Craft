# Single VPS architecture

One Docker host runs 12 application containers, PostgreSQL, Redis and Caddy; Ollama is optional. Only Caddy publishes 80/443. SSH is a separate restricted management port, never an application/data endpoint. `backend` and `inference` networks are internal. Only admin-api joins inference; Ollama has a separate model-download egress network. No PostgreSQL, Redis, application service, metric or inference port is published.

User HTTPS routes `/v1/*` through the existing gateway, including SSE flushing. Admin HTTPS routes `/api/v1/*` to the existing admin API and all other paths to the admin frontend. Admin host CIDR restrictions are enforced at Caddy using the actual network peer; do not put an unconfigured CDN/proxy in front of it. Backend RBAC and one-use 2FA remain mandatory. HTTPS certificates use ACME; internal service/PostgreSQL/Redis TLS uses the existing private CA scheme.

Named volumes preserve PostgreSQL, Redis AOF, local documents, uploaded admin assets, Caddy ACME state and Ollama models. Existing Supabase storage remains configurable; preserve legacy storage-provider interpretation and credentials when migrating existing files. Redis AOF uses always fsync and noeviction because service replay/queue integrity depends on durable state.

Application memory caps: gateway 256 MiB; auth/notification/payment/quota 384 MiB each; chat/analytics 512 MiB each; document/admin-api 768 MiB each; PDF 1024 MiB; frontends 64 MiB each. PostgreSQL cap 1536 MiB (128 MiB shared buffers, 160 max connections); Redis cap 384 MiB with 256 MiB configured maxmemory; Caddy 128 MiB. These are initial enforceable caps, not measured minimums. Sum of caps is not an idle estimate or a RAM reservation guarantee. CPU caps and PID bounds are in Compose. All long-running services restart unless stopped; logs rotate at 10 MiB × 3.

Local inference defaults to one loaded model and one parallel request, optional 6144 MiB / 2 CPU limit; choosing local-ai requires explicit operator sizing and model provisioning. Do not infer that 8 GB supports all caps and inference. Native live results show serious context-dependent memory/latency and poor 1.7B tool accuracy; see hybrid reports 12–16. No provider-specific minimum price or final VPS size is asserted without a full Docker workload benchmark.

Single-host Compose recreations may interrupt connections. No zero-downtime or high-availability claim is made. Off-host encrypted backups and a tested restore procedure remain operational prerequisites.
