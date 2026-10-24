# Production audit remediation plan

The authoritative baseline is the 2026-10-21 production audit, its 27-finding register and NO-GO scorecard. This work preserves pre-existing changes and does not authorize production deployment, infrastructure provisioning, credential rotation or destructive production operations.

1. **Security and account integrity:** SEC-001/SEC-002/DB-001 first. Enforce one-use transactional recovery, shared OAuth account/MFA policy, state/PKCE/nonce/verified identity checks and insert-only unique staff creation. Repair API-001/FE-002 only together with callback security.
2. **Document and billing correctness:** FE-004/FE-003/FE-001/API-004, then FE-005/FE-006. Persist custom canvases, preserve authoritative MFA state and show only persisted provider-backed financial facts. Verify actual service/browser persistence where the isolated environment permits.
3. **AI quality:** AI-001/AI-002. Keep integrity schemas; evaluate the existing representative corpus against actual inference only when hardware headroom permits. Record rejected proposals and unavailable credentials honestly.
4. **Deployment and recovery:** INF-001 through INF-004, DEV-001, OPS-001/OPS-002 and PERF-001/PERF-002. Perform available local static/runtime checks; never substitute a simulated rollout for Docker/VPS acceptance. Implement bounded operational safeguards where review supports them.
5. **Related medium findings and privacy:** API-002/API-003/CFG-001/SEC-003/DATA-001. Remove dead contracts, sanitize failure responses and production demo behavior; document unresolved retention/session architecture decisions rather than inventing acceptance.

Each finding has a remediation record with changed files, regression commands/results, evidence scope, remaining dependencies and one of: fixed, partially fixed, blocked, not fixed. Original runtime/model audit outputs are retained; finding metadata, the register and scorecard are annotated with current remediation status. New evidence belongs under `docs/production-remediation/evidence/`; credentials and verbose private runtime logs remain in ignored `.local/production-remediation/`.

Verification proceeds from targeted regression to owning-service tests/builds, then actual isolated PostgreSQL/Redis/API/browser checks. External Google/payment/cloud/registry/SSH acceptance, target container enforcement and full-host recovery require their real prerequisites. A passing unit fixture is not production readiness. The decision remains **NO-GO** until high-impact defects and required verification gates are resolved.
