# DocCraft: Full Architecture, Workflow Audit, Fixes, and Overall Report Prompt

Copy the prompt below into your coding agent while the DocCraft repository is open. It asks the agent to inspect the entire project, run available checks, repair confirmed problems, and write one complete Markdown report.

This file is a reusable task prompt. It is not a completed audit or evidence that the application has passed testing.

---

## Prompt

Work on this DocCraft repository as a software architect, full-stack engineer, and QA engineer. Review the complete application, document its actual architecture and workflows, test both the user experience and admin panel, fix confirmed defects, and deliver a comprehensive Markdown report.

Do the implementation and verification work. Do not stop after a plan, code review, or list of recommendations. Continue through discovery, baseline checks, fixes, regression checks, and the final report. If an external dependency blocks a workflow, document the precise blocker and continue with independent work.

### 1. Scope and working rules

- Read applicable `AGENTS.md` instructions and inspect the current working tree before editing. Preserve existing tracked and untracked work. Do not reset, overwrite, or clean unrelated changes.
- Treat the current source code, configuration, database definitions, and observed runtime behavior as evidence. Use existing documentation as context and verify its claims.
- Review every application area, not just chat or recently modified files. Discover additional functionality beyond the checklist below.
- Build an inventory of routes, admin section IDs, UI actions, API handlers, background workers, integrations, database models, templates, feature flags, and tests. Give every discovered feature a coverage entry.
- Distinguish working features, partial implementations, placeholders, missing integrations, inaccessible features, and requirements mentioned only in documentation. Do not invent behavior or silently turn a suggested feature into a new product requirement.
- Make focused changes needed to repair confirmed defects. Preserve the existing design and product behavior unless a change is needed to correct a demonstrated problem. Explain larger architectural changes before undertaking them.
- Use isolated local/test data and provider sandbox modes. Inspect startup and migration side effects before execution. Do not reset shared databases, perform destructive migrations, deploy, charge real accounts, or send real user communications as part of testing. Use local fixtures or controlled substitutes where necessary and identify their limits.
- Inspect configuration without printing credentials, tokens, private keys, connection secrets, personal data, or sensitive document contents into reports or logs.
- Avoid repeated confirmation requests for routine local inspection, reversible fixes, and verification already covered by this task. Ask only when an essential decision or additional authorization is genuinely required.
- Do not claim a check passed unless it ran successfully. Keep static inspection, unit tests, mocked integration tests, live integration checks, and browser verification clearly distinguishable.

### 2. Repository-specific starting points

Inspect at least these areas, then expand the inventory from the code:

| Area | Starting paths | What to establish |
| --- | --- | --- |
| User application | `user-frontend/src/App.tsx`, pages, components, API clients, middleware, stores, hooks, utilities | Routes, user journeys, state persistence, backend connections, permissions, and UI behavior |
| Admin application | `admin/src/App.tsx`, `admin/src/config/adminNavSections.tsx`, `admin/src/pages/DashboardPage.tsx`, subviews, stores, `admin/src/api/adminApiClient.ts` | Every navigation item, actual rendered view, action, API request, authorization requirement, and result |
| Gateway | `services/gateway/src/` | Routing, aliases, path rewrites, proxy behavior, JWT verification, internal headers, streaming, security, and health checks |
| Authentication | `services/auth/src/`, Prisma schema and migrations | Account lifecycle, guests, Google/Firebase verification, tokens, profile, account status, and security |
| Chat / AI | `services/chat/src/`, Prisma schema and migrations | Sessions, conversation persistence, AI providers, MCP tools, document mutations, quotas, and streaming |
| Document generation | `services/document/app/`, `services/document/puppeteer/` | FastAPI endpoints, templates, preview, PDF worker, Puppeteer sidecar, storage, sharing, and ownership |
| Billing | `services/payment/src/`, Prisma schema and migrations | Paddle/PayHere routing, subscriptions, invoices, methods, coupons, webhooks, and entitlement updates |
| Quotas | `services/quota/src/`, Prisma schema and migrations | Limits, reservations/increments/refunds, resets, guest restrictions, and overrides |
| Notifications | `services/notification/src/` | Producers, queue names, worker contracts, email templates, retries, delivery records, and preferences |
| Analytics | `services/analytics/app/` | Event ingestion, database records, PostHog worker, aggregation, privacy, and dashboard consumption |
| Admin API | `services/admin-api/app/` | Router registration, auth/RBAC/TOTP, repositories, configuration, automation, reporting, and service integrations |
| Shared contracts | `shared/` | Types, document contracts, field processing, conversation state, streaming events, amounts, assets, templates, and consistency across runtimes |
| Infrastructure | Root and service `package.json` files, Dockerfiles, Compose files, Python requirements, Vite/TypeScript configuration, scripts | Actual install, startup, build, test, database, worker, environment, and deployment behavior |
| Existing documentation | `RUNNING_THE_PROJECT.md`, `doccraft-data-models.md`, existing audit/implementation reports | Useful context, stale claims, missing documentation, and differences from the current implementation |

Use code and runtime configuration to verify service names, ports, network addresses, and dependencies. Do not assume the execution guide is current: the document service includes a Python API and a Node/Puppeteer sidecar, and database hosting must be established from the actual configuration. Identify whether storage/databases are local, Supabase-hosted, or otherwise remote without exposing secret values.

### 3. Document the full architecture

Explain:

1. The product's purpose, supported actors, document types, and plan/role capabilities discovered in the code.
2. The repository structure and responsibility of every application, service, worker, and shared module.
3. The browser-to-gateway-to-service request path, including both user and admin API clients, direct calls, aliases, header forwarding, and authentication boundaries.
4. Database ownership and relationships; Prisma and SQLAlchemy usage; schema initialization and migrations; shared-table assumptions; identifiers, timestamps, soft deletion, and retention.
5. Redis usage for caches, quotas, locks, rate limits, sessions, and queues. Map each queue's producer, payload, consumer, retry behavior, and failure handling.
6. AI provider selection and plan routing, context construction, MCP interactions, document field contracts, guardrails, and persistence.
7. Preview and export paths, including client rendering, server templates, PDF jobs, the sidecar, storage, signed URLs, and public sharing.
8. Payment callbacks/webhooks, billing state transitions, quota/entitlement propagation, notifications, analytics, and admin reporting.
9. Dynamic configuration, feature flags, plan changes, cache invalidation, secrets, external dependencies, and environment differences.
10. Startup order, readiness, health checks, resource usage, observability, error recovery, deployment assumptions, and operational gaps.

Include Mermaid diagrams for the system architecture, major data relationships, document creation/export, subscription updates, and admin configuration changes reaching user behavior. Use actual component names and clearly label inferred or unverified connections.

For each important workflow, trace:

`Actor → UI route/action → client/store → gateway or direct API → middleware → handler/service → database/queue/provider → response/event → visible UI outcome`

Record prerequisites, state changes, side effects, failure paths, retry behavior, authorization checks, and supporting source locations.

### 4. Audit and test every user workflow

Discover all current routes from `user-frontend/src/App.tsx` and all additional functionality reachable through components and APIs. Cover at least:

- Landing page, navigation, pricing, document type/template selection, guest entry, redirects, deep links, refresh behavior, and unknown routes.
- Registration, verification and resend, email/password login, Google login with Firebase token validation, logout, password recovery/reset, token expiration/refresh, authentication restoration, and two-factor flows where implemented.
- Guest permissions, quota enforcement, download restrictions, transition to a registered account, and handling of any existing guest document/session state. Check that one user's or guest's data cannot appear in another account after login/logout.
- `/builder`: session creation, document type/template selection, chat, preview, editing, export, and recovery after reload or interrupted requests.
- `/dashboard`: overview, profile/settings, document history, billing, and support. Trace every visible action through its actual backend implementation.
- Profile identity and security settings, password/2FA changes, preferences, subscriptions, quota display, validation errors, and persistence where supported.
- History loading, sorting/filtering/search/pagination where present, opening documents, downloads, deletion, and public sharing/access expiry where exposed.
- Plan comparison, upgrade/downgrade behavior, checkout, cancellation, coupons, payment methods, invoices, billing portal, and failed-payment states where implemented.
- Support submission and its appearance/action in the admin support panel.
- Loading, empty, validation, permission-denied, offline, timeout, and server-error states; repeat submissions; keyboard usability; responsive layouts; light/dark themes where provided.

For every supported document type—initially invoice, quotation, proposal, receipt, and purchase order—exercise the applicable templates, field rules, calculations, preview, persistence, and export. Discover any additional types or template variants from the repository. Cover custom templates if implemented. Record the tested combinations and any remaining combinations explicitly.

### 5. Audit the complete chat and document lifecycle

Check all of the following against the actual contracts and behavior:

- Session creation, ownership, restoration, history, expiration, concurrency, and account changes.
- Required/optional field collection, multi-field messages, ambiguous answers, corrections, additions, removals, skipped fields, and returning to earlier fields.
- Shared state versus AI-generated text: a claimed update must match persisted fields, rendered preview, and downloaded output.
- Line items, stable item identity, quantity/unit price edits, discounts, taxes, subtotal/total calculations, currency formatting, decimal precision, dates, and invalid values.
- Logos/images/attachments, upload validation, cropping/preparation, ownership, persistence, browser display, and PDF rendering where supported.
- Provider selection, available provider adapters, model routing, retry/fallback behavior, timeouts, cancellation, context limits, and circuit breakers where implemented.
- SSE event framing and parsing, partial chunks, errors, completion, disconnects, retries, duplicate requests, tool checkpoints, and idempotency.
- Prompt injection protection, MCP tool permissions/validation, cross-user access, and untrusted model/tool output handling.
- Atomic quota enforcement under concurrent requests, reservation/increment/refund behavior, and consistent counters after failures, retries, and worker restarts.
- Template switching, layout customization, canvas edits, shared field mappings, save/reload consistency, and pending edit preservation.
- HTML preview, client export where present, server PDF generation, job polling, worker/sidecar failures, status/error propagation, and safe retries.
- Font/image loading, page breaks, long content, large item tables, watermark/branding rules, file naming, download URLs, share expiry, revocation if supported, and deletion effects.

### 6. Audit every admin section and action

Treat `admin/src/config/adminNavSections.tsx` as a starting inventory, then inspect actual rendering, hidden routes, API endpoints, and role-dependent features. Cover every discovered navigation ID individually. The current navigation includes:

| Section | Required feature coverage |
| --- | --- |
| Home | Dashboard widgets, totals, refresh, date ranges, layouts, and underlying data sources |
| Users | All/active/suspended/banned users, guest sessions, user details, manual overrides, search/filter/pagination, and status actions |
| Subscriptions | All/active/cancelled subscriptions, failed payments, refunds, and plan overview |
| Revenue | MRR/ARR, revenue by plan, cost ledger/expenses, churn, LTV, transactions, and payouts |
| Promotions | Coupons, active promotions, A/B tests, referrals, and trial management |
| Packages | Current plans, plan creation/editing, per-plan feature flags, AI model routing, and plan performance |
| Generations | Totals, document type/user breakdowns, failures, free/pro usage, and chat drop-off points |
| Documents | Generated documents, template usage, type breakdowns, and shared links |
| Analytics | Traffic, location/device breakdowns, visit duration, button clicks, subscription funnel, conversion, and signup-to-subscribe journey |
| Security | IP logs, suspicious activity, rate-limit violations, bot logs, abuse reports, audit logs, and session management |
| Support | Reported issues, refund requests, contact submissions, and manual plan override requests |
| Notifications and automation | Rules/engine, execution logs, domain events, email logs, announcements, and notification templates |
| Infrastructure | Uptime, chat MCP integration, Sentry errors, API usage/limits, database health, deployments, and staging/production status |
| Settings | Dynamic config, admin profile/users, 2FA, API keys/integrations, billing config, GDPR/data management, CSV exports, and system preferences |

Also inspect admin API features without an obvious navigation entry, including RBAC/permissions, template/version management, reporting, monitoring, dashboard layouts, configuration, and background workers. Verify whether each router is actually mounted and reachable.

For every admin page or subview:

1. Verify navigation/deep links and the correct view for each section ID.
2. Identify every interactive control, table, chart, modal, export, refresh, and mutation. Record intentionally read-only screens.
3. Trace real data sources. Identify hardcoded values, simulated success messages, random metrics, fallback data, placeholders, and buttons without effective handlers.
4. Exercise create/read/update/delete operations where implemented, validation, persistence after reload, filters, pagination, and error states using local test data.
5. Enforce authorization on the API as well as the UI. Test unauthenticated users, normal users, permitted admins, and restricted admins; verify TOTP requirements for sensitive actions where configured.
6. Verify audit records for sensitive mutations and make sure secrets remain redacted.
7. Verify downstream behavior: plan changes affect pricing and entitlements; overrides affect quota enforcement; user status affects access; announcements and support updates reach the intended user views; routing/configuration updates affect the intended services after cache refresh.
8. Distinguish information-only provider limits from settings the application can actually control. Confirm that displayed success reflects a persisted operation.

### 7. Run appropriate checks and real workflows

Start by inspecting available dependencies, lockfiles, package scripts, Python environments, environment variable names, existing processes, databases, and service health. Determine whether the configured resources are safe test resources before starting applications or executing mutations.

Build a baseline, then repeat affected checks after fixes. Existing command entry points to evaluate include:

```sh
npm run build
npm run build --prefix user-frontend
npm run build --prefix admin
npm run lint --prefix user-frontend
npm run lint --prefix admin
npm run test:chat
npm run test -w doccraft-auth
npm run test -w doccraft-payment
npm run test -w doccraft-quota
```

These are starting points, not proof of complete coverage. Inspect scripts and test configuration before running them. Root workspace builds do not necessarily include the separate frontend packages, and placeholder scripts are not meaningful validation. Discover Python test files, their required runner, and their fixture/dependency requirements; run them in the appropriate environment. Do not assume every Python service already has a test suite or invent unavailable commands.

- Use the local scripts or Docker Compose path that matches the verified environment. Check both frontend builds, backend builds, Python services, workers, and the sidecar.
- Inspect health/readiness, logs, actual API responses, database state changes, and queue consumption. A successful `/health` response alone does not verify dependencies or a user journey.
- Use browser automation or available browser tooling to exercise both frontends when possible. Verify network requests, visible outcomes, persistence after reload, console errors, and downloaded files. If browser tooling is unavailable, record that limitation and perform API/static checks without calling them browser tests.
- Exercise successful, invalid-input, expired-session, forbidden-access, duplicate-request, exhausted-quota, and dependency-failure scenarios where relevant.
- Test billing/webhooks with sandbox data or controlled signed fixtures. Verify signatures, replay/idempotency, out-of-order events, local entitlement updates, and notification side effects. Clearly distinguish fixture results from provider sandbox verification.
- Use controlled notification destinations/transports; verify queue/template behavior without contacting real users.
- For important bug fixes, add focused regression coverage where it establishes behavior that existing tests miss. Do not weaken assertions or hide failures to produce green results.
- Record the working directory, command, result, relevant test count, and concise evidence for each check. Explain missing tooling, configuration, services, accounts, or provider access precisely.
- Clean up only processes and test data created for this task, and record any retained test artifacts. Preserve pre-existing services and data.

### 8. Fix confirmed defects

Maintain a finding list with severity, affected actor/workflow, reproduction steps, expected/actual behavior, source evidence, and root cause. Prioritize broken core journeys, access-control/data-isolation defects, data loss, incorrect document totals, quota/billing inconsistency, and misleading admin mutations.

Implement focused fixes in the appropriate layer. Check the entire affected contract rather than patching only visible UI symptoms. For cross-service issues, verify consumers, producers, shared types/contracts, persistence, gateway behavior, and downstream UI together.

Re-run relevant checks and the previously failing workflow. Document before/after behavior and residual limitations. Keep unresolved findings visible; do not describe inaccessible integrations or placeholders as working. If a major missing feature requires product decisions, explain the gap and proposed next step instead of inventing functionality.

### 9. Write the final Markdown report

Create `DOC_CRAFT_FULL_PROJECT_REPORT.md` at the repository root. It must describe the final state after your changes and contain all of these sections:

1. **Executive assessment:** What works, what was fixed, what remains broken or unverified, and whether release readiness is supported by the evidence.
2. **Scope and environment:** Audit date, revision/current working-tree context, runtime/tool versions, startup method, inspected areas, test setup, and limitations. Identify pre-existing changes separately from your own work.
3. **Complete architecture:** Repository/component inventory, service responsibilities, verified ports and dependencies, security boundaries, Mermaid diagrams, startup/deployment behavior, and configuration ownership.
4. **Data and integration map:** Models/relationships, schema ownership/migrations, storage, Redis uses, queue contracts, external services, AI providers, payment providers, and secrets configuration by variable name only.
5. **Complete functionality inventory:** One row for every discovered route/feature/action, including admin navigation IDs and backend-only capabilities. Suggested columns: ID, actor, route/section, action, source files, endpoint/service, state/data effects, implementation status, verification method/result, and finding reference. Split rows when actions have different outcomes; do not hide untested features inside a broad “passed” category.
6. **User workflows:** Step-by-step prerequisites, UI/API/service/data paths, success/failure behavior, role/plan constraints, and evidence.
7. **Admin workflows:** Every section and action, real versus placeholder data, authorization, persistence, audit records, and downstream effects.
8. **Chat/document lifecycle:** Field collection/editing, conversation persistence, tools/streaming, templates, calculations, assets, preview/export, jobs, quota accounting, sharing, and recovery.
9. **Verification results:** Exact commands and working directories, exit/results and relevant counts, browser/API scenarios, document type/template coverage, artifacts, and baseline-versus-final outcomes. Use `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, or `NOT APPLICABLE` with a reason. State whether each result came from static inspection, unit tests, mocks, live APIs, or browser execution.
10. **Findings and fixes:** Severity, reproduction, root cause, changed files, behavior before/after, and regression evidence. Clearly identify fixed, partially fixed, and unresolved findings.
11. **Security, reliability, and performance observations:** Only evidence-backed findings, with impact and practical remediation. Identify authorization, privacy, concurrency, idempotency, retry, observability, and resource concerns where demonstrated.
12. **Documentation/configuration corrections:** Explain stale setup instructions or architecture claims and document the commands/configuration actually needed to run the project.
13. **Remaining work:** Prioritized unresolved defects, unimplemented functionality, external blockers, precise steps to complete verification, and architectural recommendations separated from required fixes.
14. **Change summary:** Files you changed, purpose, checks performed, and material risks or limitations.

Use repository-relative source links with line numbers where useful. Link evidence artifacts if created, but keep the report understandable without reading earlier chat messages. Do not include credentials or sensitive user data.

### 10. Completion criteria

- Every discovered component, user route, admin navigation item, significant action, worker, and integration is represented in the report's inventory.
- Every inventory entry has an implementation status and an explicit verification outcome, including blocked or untested entries.
- Both user and admin workflows have been traced through their real backend/data paths; visual presence alone is not counted as a functional feature.
- Confirmed defects within scope have been repaired where feasible and the relevant checks repeated. Remaining issues have concrete evidence and next steps.
- Architecture diagrams and workflow descriptions match the final implementation. Unverified assumptions and documentation-only requirements are clearly labeled.
- `DOC_CRAFT_FULL_PROJECT_REPORT.md` exists and includes all required sections, test evidence, changes, and remaining work.

When finished, respond briefly with a link to the report, the main fixes, the checks that passed or failed, and any significant blockers. Do not claim the complete application works if essential workflows remain unverified.
