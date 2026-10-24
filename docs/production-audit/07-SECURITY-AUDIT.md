# Security audit

Aligned with [OWASP ASVS5.0](https://asvs.owasp.org/downloads/) and [OWASP API Security2023](https://api-security.owasp.org/editions/2023/en/0x00-header/). This is a scoped engineering audit, not an ASVS certification, complete penetration test or legal determination. Essential unexecuted controls remain deployment blockers.

| Boundary | Verified evidence | Limits / findings |
|---|---|---|
| Password/access/refresh/logout | Actual registration/verification/profile/rotation/replay/logout plus auth unit tests | SEC-002same reset token succeeded twice; external email recovery untested |
| MFA/OAuth | Actual TOTP enrollment and profile UI check; four-state alternate callback handler probe | SEC-001alternate OAuth bypass is stubbed external transport, no live Google flow; FE-003UI state wrong |
| Admin RBAC | Regular JWT rejected401; live admin challenge/permissions;195admin tests | Staff create overwriteDB-001; full low-privilege mutation matrix untested |
| Ownership/BOLA | Actual other-user session403/custom-template404; stale revision409 | Not every object endpoint/mutation tested; no blanket cross-tenant safety claim |
| Service identity/replay | Real signed request200,replay409,body tamper401; Redis pause refusal503/recovery200 | Private-TLS/Docker/firewall enforcement remains blocked |
| Quotas | Actual3→2admin propagation;2/8durable reservations; user private increment denied | Positive real payment/webhook/refund chain blocked by approved credentials |
| AI keys/tools | AES-GCM purpose-bound encryption source; typed/evidenced MCP/SSRF allowlists; tests | No fresh local/cloud dispatch; real-model proposal failures remain |
| Files/rendering | Document ownership tests, upload/storage/contract unit suites;16actualdiagnostic PDFs | Production sandbox readiness503/render500; signed public URL/asset variants not exhausted |
| Secrets/dependencies | Fresh source scan0; default history273classified; production npm/Python audits clean | Pinned image scanner findings remain; final application layers not built |
| CI/SSH/Terraform | SHA-pinned actions, minimal permissions, digest allowlist, forced command, reviewed apply boundary | Hosted settings, GHCR/SSH/firewall/state controls not executed |

Receiver/caller/method/path/body/nonce checks live in shared/service-auth.mjs and shared/service_auth.py, not legacy X-Internal-Secret comments. Gateway strips untrusted identity headers; owning services verify live account/ownership. Signed queue envelopes bind producer/queue/job name/ID/data. Redis replay failures fail closed in tested cases. Typed tool proposals and document transactions prevent unrestricted arbitrary LLM database/code operations. SSRF inference transport validates/pins DNS addresses, HTTPS cloud allowlists and restricted local origins; this is source/test evidence, not a full external SSRF pentest.

Confirmed security/data-integrity blockers: alternate OAuth MFA path, reset-token race, concurrent staff overwrite, misleading financial records and canvas persistence loss. Browser bearer storage lacks Secure/HttpOnly protection (client-readable storage); this is an XSS/session architecture risk, not proof of an exploitable XSS or CSRF vulnerability. Data purge/export needs a complete retention inventory. SQL parameterization, path handling, upload types/sizes and output escaping have tests/source controls, but all variants were not fuzzed.

[Secret findings](evidence/secret-findings-redacted.json) omit raw values. Default full-history scan covered both available commits;258hashes,9framework prose,5synthetic fixture values and1public Firebase web identifier explain273matches. Private ignored credentials were not externally validated and cannot be assumed safe or active. No production keys were used or rotated. Current source secret scan, Git boundary and compiled-asset checks pass; these controls do not prove absence of every possible leak.

See [findings register](15-FINDINGS-REGISTER.md) for severity, root causes, reproduction and remediation. Security is FAIL for production because confirmed high risks and essential blocked verification remain.
