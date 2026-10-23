# Security and authentication remediation

SEC-002 and DB-001 are fixed in the tested scope. SEC-001 and FE-002 remain partially fixed pending real Google acceptance; SEC-003 remains partial because access tokens are still JavaScript-readable.

Password recovery now conditionally consumes an unused, unexpired token inside the password/session/revocation transaction. Actual gateway/Auth/PostgreSQL tests produced one200 and seven400 responses for eight concurrent requests; replay failed, prior access/refresh credentials were denied and the winning password worked. New tokens are digests at rest. Existing unexpired64-hex legacy links remain accepted for their original one-hour window; submitting a stored digest is rejected. The fixture seeded a challenge in owned PostgreSQL; it did not verify external email delivery.

Admin creation uses UUIDs and plain INSERT. Save is update-only and creation timestamps are retained. SQLite and PostgreSQL tests preserve16 concurrent accounts; duplicate normalized email returns409 without changing the original identity/role. A database unique index also rejects case variants even when application normalization is bypassed.

OAuth uses S256 PKCE, browser state, nonce-bound signed Google ID tokens, issuer/audience/expiry/verified-email checks and the same account/MFA requirements as the main sign-in flow. Unconfigured OAuth returns503 instead of using dummy credentials. Redirects use the configured frontend origin, token fragments are removed immediately, and provider exception text is not logged. Cryptographic tests use local ephemeral RSA keys and handler tests explicitly stub Google/database transport. Those tests do not establish a successful external Google sign-in or provider replay acceptance. Review official [Google OpenID Connect guidance](https://developers.google.com/identity/openid-connect/openid-connect) when configuring the approved test client.

Browser refresh credentials now use an HttpOnly cookie, Secure in production and SameSite=Lax. Cookie-based refresh checks Origin; legacy explicit refresh-token API clients remain compatible. PostgreSQL consumes a refresh session conditionally so replay loses. The browser coalesces renewal and prevents a late401 from replaying a request under a newer login. Actual browser renewal, cookie removal at logout and reload without automatic sign-in pass. Failed server logout stays visible and is not reported as successful sign-out. HTTP native tests do not prove production Secure/TLS behavior. Access localStorage/cookie storage still requires an explicit XSS/session architecture decision.

## Migration and rollout requirements

Run the existing schema-owner Python migration job, including `202610210001_admin_identity.sql`/idempotent initializer. Before deployment, an authorized operator must inspect `SELECT LOWER(TRIM(email)),COUNT(*) FROM admin_users GROUP BY LOWER(TRIM(email)) HAVING COUNT(*)>1;`. Collisions deliberately fail migration; do not auto-merge privileged accounts. Existing staff IDs stay unchanged; new IDs are UUID-based. Auth changes need no new columns. Back up before migration and exercise it on a legacy-data clone. No production schema operation was run here.

Old vulnerable images must not become approved rollback targets after a security release. Keep the original AI encryption keyring/identities across replacements. The root fixture was restarted and retained SQL state and refresh access; container/TLS/legacy migration and real approved-provider acceptance remain separate launch gates.

Evidence: [security](evidence/runtime/security-acceptance.json), [browser renewal/logout](evidence/runtime/billing-browser.json), [restart](evidence/runtime/native-restart.json), [verification](evidence/verification.json).
