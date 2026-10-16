# Overall system report

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

DocCraft's backend and both browser applications build successfully. Focused automated regressions, 96 browser error-state/rendering probes, 121 mounted admin API authentication probes, 17 real server-template PDFs plus a renderer security probe, and two real Redis/configuration persistence probes passed. Both frontend lint commands still fail. **Release readiness is not established.**

The final check register contains 15 passing commands and 2 failing commands; the failures are lint. Provider and remote-database workflows remain blocked, and additional categories were deliberately not run. Results are scoped in the test report and must not be interpreted as complete production workflow success.

## Discovery and coverage

- 666 repository text files scanned; 1369 inventory entries.
- 892 UI control definitions, 17 JSX route declarations, 81 admin navigation entries, 284 backend route/mount declarations.
- 20 Prisma model definitions, 42 physical-table declarations, 8 worker modules, 25 server/email template definitions.
- 311 HTTP client target expressions, plus 132 actual mounted admin method/path operations.
- 28 corrected defect groups and 15 unresolved/incomplete finding groups. Some fixes have focused runtime regressions; others have static/build verification only.

Source/control discovery is complete for the scanner's documented scope. Individual UI actions, all business workflows and external integrations are **not** fully verified. The coverage report retains NOT TESTED/BLOCKED entries instead of overstating completion.

## Actual architecture

Two React/Vite applications call a mixed Node/Python service system. The user app calls an Express gateway; the admin app directly calls a separate FastAPI control plane. The nine backend services are gateway, Auth, Chat, Document, Payment, Quota, Notification, Analytics and Admin API. Document adds a Fastify/Puppeteer sidecar. Prisma/SQLAlchemy/custom SQL describe database access; Redis supplies quotas, caches, queues and configuration invalidation. Groq is the active default chat provider; Claude helpers also exist. Payment integrates Paddle/PayHere; notifications use Resend; analytics uses PostHog. Storage supports Supabase or a local fallback.

Configured ports are gateway 3001, Auth 3011, Notification 3012, Document 3013, Payment 3014, Quota 3015, Chat 3016, Analytics 3017, Admin API 3018, sidecar 3023, user 5173 and admin 5174. Existing documentation had Chat/Notification reversed. The root Compose file has no PostgreSQL service; configured remote database resources were not exercised.

## Highest-impact corrections

Internal account/payment/notification boundaries and typed user authentication now enforce verification rather than trusting supplied headers. Current accounts/roles/plans are re-read; admin codes are not exposed and have separate purposes. Credential-like defaults and predictable bootstrap fallback were removed. Gateway route translation/raw callbacks, quota outage behavior, local download/guest protection, job ownership, PDF notification semantics, real provider checkout and account entitlement synchronization were corrected. Admin builds/refresh/audit controls and profile timezone persistence were also repaired.

## Admin-to-user results

The real configuration probe changed an isolated plan allowance from 7 to 12. The stored plan row and Redis key matched; an already-cached Node quota consumer observed the new value after actual Pub/Sub invalidation, and a fresh API read retained it. The measured delay is in the evidence. User status/plan and payment entitlement propagation have focused mocked boundary/HTTP-contract regressions. No full provider → PostgreSQL → browser synchronization journey was claimed.

Pricing/currency, active-provider model ceilings, broad feature gates, admin template publication, user announcement delivery, guest migration and distributed retry/refund guarantees still have gaps. These are detailed findings, not passed scenarios.

## Release blockers and decisions

1. Resolve conflicting physical database schemas and establish an isolated, migrated PostgreSQL stack.
2. Agree a single price/currency/entitlement/quota contract and connect all user gates/screens.
3. Complete or explicitly remove publication/delivery and metadata-only payment-method flows.
4. Validate sandbox checkout/webhooks, real identity/email/storage integrations and browser save/reload/export.
5. Complete duplicate/out-of-order/crash accounting, remaining authorization/abuse controls, lint cleanup and operational benchmarks.
6. Rotate any active formerly embedded credentials and supply consistent deployment secrets/configuration.

The source corrections are reviewable and tested to the stated limits. The application should not be described as 100% functional or production-ready on this evidence.

## Detailed reports

- [01-SYSTEM_ARCHITECTURE.md](01-SYSTEM_ARCHITECTURE.md)
- [02-USER_WORKFLOWS.md](02-USER_WORKFLOWS.md)
- [03-ADMIN_WORKFLOWS.md](03-ADMIN_WORKFLOWS.md)
- [04-CHAT_AND_DOCUMENT_LIFECYCLE.md](04-CHAT_AND_DOCUMENT_LIFECYCLE.md)
- [05-API_DATABASE_INTEGRATIONS.md](05-API_DATABASE_INTEGRATIONS.md)
- [06-FUNCTIONALITY_COVERAGE.md](06-FUNCTIONALITY_COVERAGE.md)
- [07-TEST_RESULTS.md](07-TEST_RESULTS.md)
- [08-BUGS_AND_FIXES.md](08-BUGS_AND_FIXES.md)
- [09-SECURITY_PERFORMANCE.md](09-SECURITY_PERFORMANCE.md)
- [10-IMPROVEMENT_ROADMAP.md](10-IMPROVEMENT_ROADMAP.md)
- [11-CHANGE_LOG.md](11-CHANGE_LOG.md)
