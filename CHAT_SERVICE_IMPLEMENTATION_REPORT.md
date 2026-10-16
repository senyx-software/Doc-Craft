# DocCraft Chat Intelligence Implementation Report

## 1. Root causes confirmed

The original F01 isolated reproduction interpreted an error-only SSE stream as an empty successful answer and generated “What is your business or company name?” despite saved business information. Independent frontend field orders, backend post-generation whole-message assignment, alias differences, swallowed persistence failures, and response rewriting amplified this defect. Session restoration reconstructed only portions of the workflow. Unqualified read/replace updates lacked revision checks and retry identity. Identity headers and shared guest behavior did not establish reliable ownership boundaries.

The implementation changes the data flow: authorize → claim stable turn → retrieve committed state → interpret/validate grounded candidates → persist → recompute workflow → persist assistant response → emit successful terminal SSE. Provider failures remain failures; committed fields survive them. Questions come from validated field intent, not unrestricted generated prose or frontend inference.

## 2. Audit finding disposition

“Fixed and tested” below means the identified behavior passes isolated automated regression coverage. It does **not** mean a production deployment, real-provider quality evaluation, or PostgreSQL/Redis integration run occurred.

| ID | Classification | Implementation and verification |
|---|---|---|
| F01 | Fixed and tested | Strict SSE terminal success contract; error-only/EOF streams reject; store preserves business name and displays recoverable error. |
| F02 | Fixed and tested | Shared document contract; server snapshot controls missing fields, readiness, next action and progress. |
| F03 | Fixed and tested | Removed blind presumed-field assignment; grounded explicit/multi-field extraction precedes questioning. |
| F04 | Fixed and tested | Canonical aliases, conflicting-alias rejection, preserved spelling, typed validation, optional skips and conditional receipt requirements. |
| F05 | Fixed and tested | Removed business-name regex response substitution; planner checks committed field intent. |
| F06 | Fixed and tested | Durable structured facts plus bounded recent/relevant older history; authorized historical evidence may fill missing fields without overwriting corrections. Live relevance quality remains unverified. |
| F07 | Fixed and tested | Short transactional compare-and-swap, session revisions, fenced turn leases, stable turn/message IDs and operation deduplication. Real PostgreSQL stress testing remains outstanding. |
| F08 | Fixed and tested | Full server workflow restoration, pending failed-turn recovery, session selection, lifecycle/readiness checks and no fake real-session fallback. Automated store tests cover restoration; browser end-to-end testing remains outstanding. |
| F09 | Partially fixed | Authorized profile timezone retrieval and explicit same-owner “New document with this business” reuse. No dedicated reusable business-profile product or workspace-sharing model added. |
| F10 | Fixed and tested | Field provenance/status, correction/conflict handling, explicit item operations, pending incomplete items and numeric clarification; no invented quantity/price. |
| F11 | Fixed and tested | Success only after durable final response commit; failures preserve prior successful tool updates; retries reconcile stable turn checkpoints. |
| F12 | Fixed and tested | Independent token verification, owner checks on session/history/list/update/MCP, signed guest identities, scoped transports; spoofed headers rejected. Deployment network reachability remains unverified. |
| F13 | Partially fixed | Active Groq tools, review/summary/correction/readiness contracts align. Legacy inactive Claude configuration/admin model-cap routing is not redesigned. |
| F14 | Fixed and tested | Once-only permit release across rejected turns, exceptions and disconnects; isolated cleanup tests. Real Redis contention remains unverified. |
| F15 | Fixed and tested | Request/session generation guards, aborts, identity-change reset and late-response suppression. |
| F16 | Partially fixed | Supported data-backed scalar and line-item canvas edits use revision-checked authoritative updates. Arbitrary custom text/table rows remain presentation data; full visual browser integration unverified. |
| F17 | Partially fixed | Credential-shaped provider fallback removed, tool analytics redacted, flagged history excluded, provider prose withheld from authoritative responses, HTML escaping strengthened. External credential rotation and prior analytics retention cannot be verified or changed here. |
| F18 | Fixed and tested | Stable timezone-aware reference dates, normalized currency code/symbol separation, required numeric item data and matching half-up financial rounding. Current contract uses two decimal places; currency-specific minor units are not added. |
| F19 | Partially fixed | Intelligence regression suite, outcome/retrieval metrics and privacy-safe identifiers added. Production repeated-question/reuse/completion baselines and dashboards are not established. |

## 3. Files changed

Implementation files are grouped below. Existing unrelated admin, quota, billing and Google-auth work was preserved; those changes are not claimed as this implementation.

- Shared: `shared/document-contract.json`, `document-contract.mjs`, `conversation-state.mjs`, `chat-stream.mjs`, `canvas-fields.mjs`, their `.d.mts` declarations, and `shared/tests/`.
- Chat: `src/routes/chat.routes.ts`, `mcp.routes.ts`, `status.routes.ts`; `controllers/session.controller.ts`; `middleware/auth.middleware.ts`, `concurrency.ts`; `services/conversation.repository.ts`, `context.service.ts`, `profileClient.service.ts`, `session.service.ts`, `mcp.service.ts`, `groq.service.ts`, `claude.service.ts`, `metrics.service.ts`, `posthogTracking.service.ts`; `config/env.ts`, `server.ts`, isolated tests and `testing/`; `Dockerfile`, `tsconfig.json`.
- Gateway: `src/middleware/auth.middleware.ts`, `src/security/jwtVerifier.ts`, `src/services/sseRelay.service.ts`, `proxyClient.service.ts`, and isolated tests.
- Frontend: `src/api/ai.ts`, `documents.ts`; `store/chatStore.ts`, `documentStore.ts`, chat store tests; `App.tsx`, `pages/BuilderPage.tsx`, `LoginPage.tsx`, `components/builder/ChatPanel.tsx`; `types/index.ts`, `canvasElement.ts`; `utils/invoiceElements.ts`, `templateRenderer.ts`; `Dockerfile`.
- Document service: `app/services/document_contract.py`, `sidecar.py`, `app/routers/document.py`, supported HTML templates, two privacy-focused worker log changes in `app/workers/pdf_worker.py`, isolated tests, `Dockerfile`.
- Wiring: root `package.json` test command and `docker-compose.yml` shared build contexts/service URLs.

## 4. Explanation of the fixes

### Authoritative state and validated collection

The JSON contract defines five existing document types: invoice, quotation, proposal, purchase order and receipt. Shared helpers normalize aliases, validate values, determine dependencies/conditional requirements, and produce the authoritative missing-field list. Python reads the same contract for generation validation. The frontend renders returned workflow state rather than assigning answers to an independently presumed field.

`conversation-state.mjs` records confirmed, uncertain, conflicting and skipped values with provenance. Model proposals require literal current-message evidence or evidence from authorized retrieved historical messages. Older evidence fills gaps but cannot supersede confirmed corrections. Natural-language input can supply several fields at once. A short answer is accepted only against a known pending field and its validator. Ambiguous facts prompt one relevant clarification. Incomplete line items preserve their known description/price and ask for the missing quantity, rather than inserting defaults.

Example: “Nexora” answers the pending business-name question; “Client name is Acme Corp” adds the client without overwriting Nexora; “Actually, change the company name to Nexora Technologies” changes the confirmed business name while retaining Acme. A provider failure does not start the questionnaire again.

### Persistence, retries and recovery

`conversation.repository.ts` stores workflow metadata and turn checkpoints in existing JSON slots. Updates use short transactions and compare-and-swap against the original JSON. Network requests occur outside database transactions. A leased turn token fences late writers; stable turn IDs reject different payloads reusing an ID. Deterministic message IDs and operation fingerprints prevent equivalent retries duplicating persistence. Failed turns can reconcile already committed tool updates and restore the same turn identifier on reload.

Assistant acknowledgements and successful terminal events follow a successful assistant-message/checkpoint transaction. Tool or provider failures return failure/incomplete/cancelled outcomes with committed state when available. Session switching and authentication changes invalidate old frontend requests. Completed/expired sessions cannot silently resume mutation. Turn ledgers currently stop accepting additional turns at the safety cap rather than silently discarding idempotency records.

### Security and context

Chat independently verifies signed access tokens and loads sessions by verified owner. Caller identity headers are discarded at the gateway. Anonymous use first obtains the existing Auth service's unique signed guest identity; shared `guest_user` is rejected. External MCP transports are bound to owner/session; external writes use the authorized revision-checked PATCH endpoint. Runtime tool argument allowlists reject internal pending-answer bypass flags, beyond the advertised tool schema.

Context includes committed fields, stage/pending action, bounded recent conversation and selectively retrieved older evidence. Flagged messages are excluded. Profile lookup retrieves only relevant authorized timezone information; a personal name/email never becomes a business identity. Business reuse requires explicit selection of an owned source session. Tool analytics and PDF logs no longer include raw document/tool payloads or email values.

### SSE and capacity

A successful stream requires an explicit terminal successful completion containing matching session/turn identity and authoritative state. Error-only, malformed, truncated, cancelled and incomplete streams reject. Gateway upstream HTTP failures retain their HTTP status safely. Disconnect cleanup cancels upstream reads and heartbeat timers. Once-only concurrency release guards cover early rejection, failure and disconnect paths.

### Canvas and generation

Supported semantic canvas text bindings are annotated/mapped to canonical fields; edits persist through the same revision-controlled state API. Styling remains visual. Export/generation rechecks readiness and refuses unsettled failed turns. Backend generation retrieves authorized committed state and ignores caller-injected field data. It validates before quota, database and queue side effects.

Dates use a stable original turn reference and authorized timezone; relative due dates use the issue-date basis consistently. Currency codes remain distinct from symbols. Missing quantity/price is invalid, never silently one/zero. JavaScript decimal calculations match Python Decimal half-up totals. Server PDF template aliases preserve semantic data; frontend-only template IDs map to classic server PDF templates, while browser exports retain canvas styling. This compatibility trade-off is explicit rather than pretending server/browser renderers are identical.

## 5. Database/schema changes

No Prisma schema migration was created or applied. Existing `ChatSession.slots` JSON carries `_chat` metadata: revision, field status/provenance, workflow-related information, turn ledger and lease. Existing messages store durable turn transcripts. Legacy aliases are normalized lazily; ambiguous legacy values require clarification. Legacy UUID document types resolve through existing records.

No shared/production database test scripts or destructive operations ran. Old shared-guest sessions are deliberately inaccessible through authenticated ownership logic; any legitimate recovery requires a separately reviewed ownership migration. Review JSON growth and retention before high-volume rollout. Dedicated ledger tables may become appropriate only if measured scale requires them.

## 6. Tests executed and results

| Check | Result |
|---|---|
| `npm run test:chat` | **Passed: 52 Node shared tests + 57 Vitest tests across 12 files (109 total).** Final rerun passed after the gateway compatibility adjustment. |
| Chat `npm run build` | **Passed**, TypeScript compilation. |
| Gateway `npm run build` | **Passed**, including final rerun. |
| Frontend `npm run build` | **Passed**, TypeScript project build and Vite production bundle. Existing chunk-size/dynamic-import warnings remain. |
| Targeted ESLint: rewritten `api/ai.ts`, `store/chatStore.ts`, store test | **Passed**, no diagnostics. |
| Full frontend `npm run lint` | **Failed: 138 errors, 6 warnings.** Remaining categories include explicit `any`, hook rules, unused declarations and a missing configured accessibility rule across the broader application. No claim of full lint success. |
| Dependency-free Python financial/document validator | **Passed: 11 isolated scenarios**, all five types, half-cent rounding, missing item values, conflicting aliases, invalid dates, boolean quantity rejection and currency aliases. |
| Document pytest suite | Earlier implementation run recorded **35 passing tests**. Final rerun could not start: service environment lacks pytest; existing user pytest lacks Pygments components. The added exact-rounding case is verified by the direct validator run, but the full current pytest suite is **not final-verified**. No packages installed to bypass the constraint. |
| Read-only local health/auth smoke | Gateway health returned 200; direct and gateway chat history with spoofed identity and no verified token returned 401. |
| `git diff --check` | Passed before final report; checked again at completion. |

The automated suites use mocked AI/network/Redis boundaries and an isolated transactional memory database. They exercise actual route, repository, MCP SDK transport, gateway relay, shared contract and Zustand paths. Coverage includes SSE failure/EOF, false persistence acknowledgements, multi-field extraction, unusual names, aliases, corrections/conflicts, concurrent writes, deduplication, lease fencing, partial tool commits, restoration, cross-user denial, late replies, skipped/null/empty values, long context, document readiness, semantic mappings and cleanup. No live-provider accuracy or real PostgreSQL concurrency result is claimed.

## 7. Remaining issues and verification limits

1. Run PostgreSQL-backed transaction/CAS and Redis capacity integration tests in a disposable database/Redis environment. Memory tests cannot establish deployed Prisma JSON semantics or infrastructure contention behavior.
2. Repair the existing Python test environment, then rerun `services/document/tests` including handler/queue fixtures and all template/XSS cases. No dependency installation was performed in this task.
3. Run browser end-to-end checks for refresh, history selection, account switching, canvas edits and exports; run controlled Groq quality evaluations for complex free-form extraction. Deterministic flows and mocked orchestration are covered, real provider quality is not.
4. Docker build contexts were updated but container builds were not executed here. Coordinate shared contract deployment across frontend/chat/document services.
5. Arbitrary canvas tables/custom text are visual until explicitly mapped; no automatic semantic guessing was introduced. Server PDF classic mapping may differ visually from selected frontend templates.
6. Existing full frontend lint failures require separate cleanup. Some are in previously modified broad files; the report does not classify every remaining lint error as preexisting.
7. Legacy inactive Claude/admin model-cap configuration remains; active Groq execution has bounded retries/deadlines but no redesigned model-policy product.
8. Cross-session reuse is explicit same-owner source-session reuse, not a multi-business profile manager. UTC fallback applies if authorized timezone retrieval fails; no personal identity is inferred as business identity.
9. Production repeated-question, reuse, completion and recovery metrics need baselines/dashboard instrumentation. Outcome and context-retrieval counters provide initial signals without sensitive values.
10. Current financial rounding uses two decimal places. Currency-specific zero/three-decimal conventions require a future explicitly scoped contract change.

## 8. Security implications

Conversation reads and writes now require verified ownership, including MCP and document generation. Signed guests are isolated; shared anonymous identities are rejected. Session switching cannot apply an old request to new state. Historical extraction cannot overwrite confirmed corrections, and internal validation flags cannot be supplied by model tools. Provider errors and failed database operations cannot claim saved facts. Raw tool payload analytics and document/email worker logging were removed.

Credential values are absent from this report. Removal of a credential-shaped source fallback does not establish whether it was previously valid; any real exposed credential and prior analytics retention must be reviewed externally. Existing JWT/internal-service secrets must remain configured consistently. The dedicated analytics ingress retains its downstream-verified internal-secret header; chat receives no such caller header.

## 9. Deployment or migration steps requiring approval

No deployment or production migration was performed. Before deployment approval:

1. Complete the outstanding isolated infrastructure, Python suite, browser and provider checks above.
2. Configure valid existing JWT, Groq and internal-service secrets through deployment configuration; verify Auth/chat/document service URLs and timezone fallback behavior. Never use placeholders as production secrets.
3. Build the updated root-context frontend/chat/document images with shared contract assets and deploy compatible versions together.
4. Review legacy shared-guest ownership recovery separately; do not assign old shared sessions to arbitrary signed guests.
5. Review JSON ledger retention/capacity and observe recovery/outcome metrics during a controlled rollout. Rotate any confirmed exposed credential through the authorized secret-management process.

The F01 repeated-question defect is fixed at the parser/store/persistence/workflow level. Final release readiness remains conditional on the explicitly unverified integration checks and the Python runtime repair, rather than an assertion that every audit concern has been fully eliminated.

### Follow-up: compact relative due dates

The screenshot's `50days` and `with in 50days` failed the original relative-date parser, which required a space between number/unit and accepted only `in`/`net` prefixes. Valid replies therefore fell through to provider extraction; an unavailable/failed provider produced a recoverable error instead of saving this locally parseable date. The parser now accepts compact units, `within`, and `with in`, plus terminal punctuation, while preserving the saved issue-date reference and rejecting out-of-range dates without exceptions. Regression cases cover asking and uncertain-field clarification. Follow-up `npm run test:chat`: **61 shared + 57 Vitest tests passed (118 total)**.

### Follow-up: optional-field intent after review

The address screenshot exposed a missing optional-field selection flow: review state ignored “add my business address,” leaving the subsequent address without a pending field and falling through to provider extraction. Explicit supported field-selection requests now persist `_chat.pendingField`, return the field-specific question, survive restoration, and accept validated address replies including commas and longer street details. Explicit address edits can replace the selected field without resetting required information. Successful save/skip clears the pending intent. Follow-up tests: **63 shared + 57 Vitest tests passed (120 total)**, including the screenshot sequence and an existing-address correction.
