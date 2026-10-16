# Security, performance and reliability

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

## Security conclusions

Critical/High findings fixed in source include unauthenticated internal account/payment/notification operations, identity-header trust, token-type confusion, exposed admin verification codes, non-persistent verified account creation, forwarded-IP spoofing, stale account-role/plan authorization, quota fail-open behavior, unsigned local file capabilities, guest bypasses, unauthenticated configuration reads and signed webhook body corruption. Focused tests substantiate the corrected boundaries; this is not a comprehensive penetration test.

Credential-like defaults were removed from current admin source. No attempt was made to authenticate with them, rotate external credentials, rewrite Git history, or change deployed secrets. Active credentials must be handled by the owner using the appropriate provider/deployment controls. User access-token secrets across services were compared without recording their values; root/shared configuration drift remains documented.

Resend callbacks now check raw-body signatures and timestamp freshness. The sidecar binds to loopback, disables page scripts and blocks external/file resource requests. Synthetic callback and actual Chromium/trap-server checks passed. Signed callbacks inside the freshness window still need any required event-ID deduplication/reconciliation policy; these controls are not an all-purpose delivery guarantee.

Admin read/write permission checks have been tightened and current roles/status reloaded. OTP attempt budgets, TOTP replay handling, all session-revocation semantics, credential storage/history, public support submission abuse, direct analytics authorization and every file/SSRF input variation were not exhaustively tested. See the unresolved finding table.

## Reliability conclusions

Quota and account-verification failures now stop protected work with retryable dependency errors, and payment acknowledgements require accepted queue writes. Auth's process-local fallback users were removed. Completed PDF state survives a notification failure. These improve failure truthfulness but do not provide an atomic distributed transaction.

Outstanding concerns include schema ownership conflicts, webhook check-then-write races, out-of-order provider events, non-idempotent quota refunds, queue/SQL crash windows, best-effort notification loss, Pub/Sub message loss and pending-state recovery. Database create/alter-on-start behavior and absent service migrations need isolated deployment validation. Readiness must check dependencies, not merely HTTP liveness.

## Performance conclusions

No throughput, concurrency, latency percentile or resource budget was measured. Current-account authorization adds network/database work to protected requests; repeated lookups can amplify Auth load. The Puppeteer sidecar launches Chromium per render; the 17-template probe establishes functionality, not capacity. Review browser pooling/concurrency limits, SQL/connection pools, Redis command/timeout behavior, analytics SQL/aggregation costs, memory caches and queue backpressure with explicit load targets.

Native builds warn about large frontend bundles; no bundle-size budget or user performance requirement was supplied. Broad lint/React hook issues can affect maintainability and state correctness and remain unresolved rather than suppressed.

## Severity register

| Finding | Severity | Status | Practical impact |
| --- | --- | --- | --- |
| B01 | High | FIXED | Gateway aliases preserved incorrect upstream paths; support registry entry missing |
| B02 | High | FIXED | Gateway parsed/re-serialized signed provider payloads |
| B03 | Medium | FIXED | 100 KB ingress conflicted with bounded image asset payloads |
| B04 | Critical | FIXED | Auth service accepted user headers and exposed internal user mutations without authentication |
| B05 | High | FIXED | Quota internal reset/refund accepted ordinary gateway identity headers |
| B06 | Critical | FIXED | Payment admin namespace lacked a shared authentication gate |
| B07 | Critical | FIXED | Admin login/reset responses disclosed codes; code purposes overlapped; TOTP could skip password challenge |
| B08 | High | FIXED | Admin token role/status claims outlived account changes |
| B09 | High | FIXED | Untrusted forwarded IP headers controlled allowlist checks; IPv6 addresses were truncated |
| B10 | Critical | FIXED | Source supplied hosted DB/provider credentials and predictable signing/internal/bootstrap fallbacks |
| B11 | High | FIXED | Notification APIs permitted arbitrary dispatch or caller-chosen user data |
| B12 | High | FIXED | Unsigned Resend delivery events could trigger configured relays |
| B13 | High | FIXED | Document identities trusted headers; job status was not owner-scoped |
| B14 | High | FIXED | Document and chat quota dependency failures granted unmetered work |
| B15 | High | FIXED | Local URLs had no expiry/signature; guests could obtain URLs or shares |
| B16 | High | FIXED | Worker notification name/payload mismatched consumer; notification failure invalidated completed PDF |
| B17 | High | FIXED | Pricing simulated payment and changed browser plan; API failures fabricated success |
| B18 | High | FIXED | Payment client duplicated /v1, double-serialized bodies, and used absent legacy billing routes |
| B19 | High | FIXED | Callbacks acknowledged before durable enqueue; account plan was not synchronized; renewal used fabricated quota |
| B20 | Medium | FIXED | Timezone profile field was accepted by schema but discarded/not serialized |
| B21 | Critical | FIXED | Database failures substituted temporary auth users; any six-character verification code could create a verified account |
| B22 | Medium | FIXED | Admin build failed on unused declarations; lint script lacked configuration |
| B23 | Medium | FIXED | Admin refresh only emitted success; audit filters/pagination/error state were disconnected |
| B24 | High | FIXED | Analytics/notification/infrastructure used generic admin authentication without domain permissions; required scopes absent in catalogue |
| B25 | Medium | FIXED | Refresh session expiry multiplied access-token lifetime into an incorrect retention period |
| B26 | High | FIXED | Max tier was collapsed to free in boundaries and received a free worker watermark |
| B27 | High | FIXED | Long-lived user tokens retained suspended status or old plan at protected service boundaries |
| B28 | Medium | FIXED | Read-only admin MCP adapter returned a fabricated found resource on HTTP failure |
| U-R01 | High | UNRESOLVED / BLOCKED | Different services declare incompatible physical plans/coupons/audit_logs schemas; PostgreSQL compatibility unknown |
| U-R02 | High | UNRESOLVED | Hardcoded pricing/limits disagree with admin config; USD admin fields merge into values used as LKR checkout amounts |
| U-R03 | High | UNRESOLVED | Claude ceiling helpers have no active caller; production chat defaults to Groq |
| U-R04 | High | UNRESOLVED | Plan feature flags, logos/templates/priority/retention and Max UI behavior are not consistently consumed |
| U-R05 | High | NOT IMPLEMENTED | Payment methods are process-memory metadata with no durable provider tokenization |
| U-R06 | High | NOT IMPLEMENTED | Admin template publishing modules are placeholders; announcements have no user consumer |
| U-R07 | High | UNRESOLVED / NOT TESTED | Webhook idempotency is check-then-write across non-atomic effects; ordering and crash reconciliation unproven |
| U-R08 | High | UNRESOLVED | Quota counts provider chat turns and server generations; refunds lack idempotent reservation IDs; retry/crash accounting incomplete |
| U-R09 | Medium | UNRESOLVED | Both frontend lint checks fail on substantive existing violations |
| U-R10 | High | BLOCKED | Removed credential-like source defaults may remain in history/deployments; live validity/revocation not verified |
| U-R11 | Medium | NOT IMPLEMENTED / NOT TESTED | Guest identity change resets builder state; layout/export/history paths have different persistence semantics and absent legacy endpoints |
| U-R12 | High | UNRESOLVED / NOT TESTED | Direct analytics reporting lacks equivalent independent authorization; public submission abuse and OTP attempt limits need work |
| U-R13 | Medium | UNRESOLVED / NOT TESTED | Health can be green despite dependency failure; per-request Auth lookups and Chromium launches need capacity/recovery measurements |
| U-R14 | Medium | UNRESOLVED | Root and service configuration drift, partial migrations and an unsafe stale live document test script |
| U-R15 | Medium | UNRESOLVED / NOT TESTED | Read-only admin MCP adapter posts JSON-RPC with an admin bearer to a user-session-authenticated SSE endpoint; no successful resource-read wiring verified |
