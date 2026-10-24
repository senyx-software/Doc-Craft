# Security verification

| Control | Implementation and verification |
| --- | --- |
| Admin authorization | Existing live-session/RBAC dependencies on every management operation; sensitive writes use second factor |
| Scope separation | Settings, registry, assignments, credentials, routing, usage and local deployments checked independently |
| Credentials at rest | AES-256-GCM envelopes with random nonce, provider-bound associated data and versioned key IDs; tampering/provider swap tests |
| Secret reads/logs | Write-only input, generated masked identifiers, no plaintext read API, no secret-valued audit records, sanitized validation/upstream errors |
| Rotation/revocation | Generation increments, old ciphertext replaced/deleted, health fingerprint invalidated; queued inference rechecks before dispatch |
| Network egress | Exact local origin allowlist; approved HTTPS cloud names; public/private IP checks including mapped IPv6; DNS pinning, SNI verification, no redirects |
| User infrastructure privacy | Public entitlement allowlist, omitted legacy session preference, registry excluded from generic config APIs, known private reply identifiers filtered |
| Service identity | Existing signed caller/audience/path/method/body requests and replay protection; only Chat can use internal inference/runtime routes |
| Subscription/budgets | Authoritative account/plan feature checks plus transaction-serialized global/plan/user limits |
| Tenant isolation | Repository owner checks and fenced session-scoped MCP tools; cross-tenant test denies before inference |
| Tool integrity | Typed argument schemas, explicit user evidence, bounded operations, canonical document validation and backend financial calculations |
| Prompt injection | Existing flagged-message rejection, untrusted document context, allowlisted tools and mandatory evidence; model output cannot execute code |
| Editor/undo integrity | Stable IDs, layout revision checks, bounded durable history, semantic data kept in document tools and permissions checked for visual restoration |
| Local exposure | Optional deployment overlay has no published inference port and an internal inference network |

The continuation review fixed public entitlement model leakage, broad internal configuration snapshots, stale cached authorization, queued credential revocation, deterministic item/clear permission bypasses, visual undo permission bypasses foreign-currency price relabeling, and malformed upstream response handling. These are covered by targeted regressions.

Limitations: no penetration test, packet capture, production secret-manager deployment or live PostgreSQL role/egress validation was performed. Mounted managed secret files are supported; direct cloud KMS/Vault envelope operations are not implemented. An operator owns key distribution, backup, access policy and retention. Prompt injection defenses reduce authority and mutation risk; no claim of eliminating all adversarial prompt behavior is made.

Existing rate-limit, authentication, billing and document-service tests remain applicable. The supplied staging role generator explicitly grants the four new AI tables to admin-api; other service roles do not receive credential-table access. Migrations must run with schema-owner privileges, while runtime roles retain only required DML.
