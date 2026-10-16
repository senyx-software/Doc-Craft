# Improvement roadmap

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

| Priority | Work | Required decision/resource | Acceptance evidence |
| --- | --- | --- | --- |
| P0 | Resolve schema/table ownership and migrations | Read-only actual-schema inspection; explicit migration/backup approval before modifying a shared database | Fresh isolated PostgreSQL can migrate/start every service without incompatible columns/tables |
| P0 | Establish safe environment and credentials | Provider/deployment owner rotation/configuration; stable admin secret and consistent service URLs | No source defaults; secret equality/availability and authenticated sandbox health checks without printing values |
| P1 | Define authoritative pricing/currency/entitlements | Agree USD/LKR conversion and provider prices, effective dates, quota units, plan/feature semantics | Admin edit → checkout + user pricing/feature behavior verified after reload |
| P1 | Complete distributed billing/quota recovery | Choose event claim/outbox/reconciliation and reservation/refund ownership | Concurrent duplicate/out-of-order/crash/retry tests do not lose entitlements or over/under-charge usage |
| P1 | Apply model policies to the active provider | Choose supported Groq per-plan model ceilings/fallback rules | Changing admin model access affects actual provider candidate selection |
| P1 | Complete missing publication/delivery paths | Agree admin template publishing and announcement audiences; guest migration/persistence policy | Real CRUD/publish/feed/display and guest save/reopen journeys pass |
| P1 | Replace metadata-only payment methods | Decide provider portal/tokenization/persistence behavior | No fabricated methods; durable provider-backed lifecycle validated with sandbox |
| P2 | Repair lint and UI state issues in focused batches | No broad rule suppression; preserve business behavior | Both frontend lint commands and focused interaction regressions pass |
| P2 | Harden remaining boundaries and operations | Analytics access, abuse/OTP budgets, session revocation, readiness and monitoring requirements | Authorization/abuse/revocation tests and dependency-failure alerts succeed |
| P2 | Benchmark and expand workflow matrix | Isolated complete stack, load targets, desktop/mobile/a11y requirements | Measured capacity plus browser save/reload/export, worker restart and sandbox integration coverage |

Major migration, currency/entitlement policy, provider-routing policy, and new publication/migration workflows are concrete remaining decisions, not silently introduced product requirements. The audit has not applied a destructive migration or speculative rewrite. Review these proposals and authorize the chosen design before implementation against shared resources.
