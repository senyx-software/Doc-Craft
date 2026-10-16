# Chat response fix implementation report

Date: 2026-10-13. Scope: the 25 findings in `CHAT_RESPONSE_INTELLIGENCE_AUDIT.md`, the 46 scenarios in `CHAT_RESPONSE_TEST_SCENARIOS.md`, and the dependency order in `CHAT_RESPONSE_IMPLEMENTATION_PLAN.md`. The older `CHAT_SERVICE_INTELLIGENCE_AUDIT.md` was also consulted. This is an implementation report, not a replacement audit.

## Outcome

The provider-response replacement defect is fixed. Groq returns final text, the route passes it to one backend response planner, and relevant explanations survive storage, SSE parsing and frontend rendering. Readiness alone cannot replace a reply with a completion sentence. Save/remove acknowledgements are constrained by committed operation receipts; rejected tool candidates cannot produce a saved acknowledgement.

Optional-address requests, address follow-ups, scalar corrections/removal, item addition/removal/price/quantity changes, document summaries, typed generation actions, and post-readiness conversation now have explicit paths. Your selected policies are implemented: document-type changes create a new draft with compatible validated fields, and finalized edits create a revision draft. Both preserve the source and use owner-scoped stable transition IDs.

**Validation: 259 automated tests passed:** 96 shared Node tests, 101 chat/gateway/frontend Vitest tests, 21 quota tests and 41 document pytest tests. Chat, gateway, quota and frontend builds passed. Focused frontend lint passed. Full frontend lint remains failing with 138 errors and 6 warnings in the broader codebase, including large builder/renderer files touched by this work. This report does not claim that full lint passes or that all remaining lint findings were proven to predate this task.

The implementation is reviewable locally. No deployment, production migration, shared-data test, live AI-provider call or destructive database operation was performed. The original address incident remains unattributed: isolated success and synthetic failures do not establish its production cause.

## Finding outcomes

“Fixed and tested” means the defect has an implemented source change and passing isolated regression evidence. It does not mean deployed PostgreSQL/Redis/provider/browser behavior was verified. All runtime limitations are listed below.

| ID | Status | Root cause addressed and implementation | Regression evidence |
|---|---|---|---|
| R01 | Fixed and tested | `groq.service.ts/runGroqAgenticLoop` returns final text; `chat.routes.ts` captures it; `planResponse` retains relevant text and receipt-backed acknowledgement wording, and constrains invalid acknowledgements, stale currency questions, false totals and generic completion replies. Frontend uses the approved terminal response. | T17–T18; real route/MCP with mocked provider HTTP; adapter/store tests. |
| R02 | Fixed and tested | Shared intent routing separates questions/actions from field answers. Backend typed generation and draft actions connect existing services; authorized source reuse or a source-selection clarification replaces guessing. | T08–T11, T20–T23; generation, type-change and revision route/store tests. |
| R03 | Fixed and tested | Field-scoped correction flags and bounded value spans prevent conjunctions swallowing other fields. Unparsed residual clauses still reach the provider; explicit residual item operations run locally. | T04/T11/T24; multi-field summary, compound removal, residual explanation and action words inside company values. |
| R04 | Fixed and tested | Only genuine pending-field answers enter constrained address/name/date/currency/phone parsers. Questions, acknowledgements, cancellations and actions do not become missing-field values. | T10/T25; pending name/address fixtures and yes/no resolution tests. |
| R05 | Fixed and tested | Persisted pending intent is cleared for identical accepted answers, cancellation and skip; an existing address receives an update question. Other unresolved conflicts retain precedence. | T01–T03/T19/T23/T26. |
| R06 | Fixed and tested | `snapshot` separates `dataValid`, `canGenerate`, pending intent and recoverable turns. History and SSE use the same readiness/stage calculation. | T14/T16/T27; provider-failure history comparison. |
| R07 | Fixed and tested | Each candidate has a committed/unchanged/rejected/conflicting/needs-value/cleared outcome. Tool results expose these outcomes; planning acknowledges only committed changes. Literal address evidence is retained conservatively. | T02/T13/T28; real MCP evidence rejection without false success. |
| R08 | Fixed and tested | Relative dates use the original turn date/timezone; numeric payment terms use issue date unless explicitly anchored to now. Ambiguous “next Friday” asks for ISO clarification while preserving the saved date. | T29; tomorrow, weekday ambiguity and unambiguous follow-up. |
| R09 | Fixed and tested | Full projected item arrays are validated before commit; description/numeric roles require evidence; update/remove targets require the correct ordinal/name. IDs are immutable. Partial additions request missing components. | T05–T07/T30; aggregate/count limits, swapped roles, fabricated description, wrong target and ID forgery. |
| R10 | Fixed and tested | Explicit scalar clear operations remove canonical fields, recompute validity and report removal. Skip retains existing valid values; model skip needs user intent. | T19/T31; required/optional deletion and retained values. |
| R11 | Fixed and tested | Sorted operation identity ignores generated add IDs, supports old hashes, and fences effects by turn lease. Local proposals are checkpointed so recovery does not reinterpret a completed field. | T12–T14/T32/T36; reordered/regenerated add proposals and local-commit failure recovery. |
| R12 | Fixed and tested | `finish` stores exact approved text/actions. Cached successful retries replay those receipts without adding messages or changing revision. | T18/T32; exact response/action/revision assertions. |
| R13 | Fixed and tested | Finalized chat edits fork the full compatible confirmed document, then apply the turn in an ACTIVE revision. Source slots/status and artifacts stay untouched. Expired/unauthorized sessions remain guarded. | T33; finalized edit, cached retry, read-only summary, existing owner/expiry guards. |
| R14 | Fixed and tested | Shared safe error categories carry phase/status/retryability/request identity and committed state. Initial DB reads, writes, provider failures, tool failures, timeouts, interrupted/malformed streams, auth/input and expiry are distinguishable. | T12–T14/T34–T35; HTTP adapter, route and existing relay tests. |
| R15 | Fixed and tested | Turn checkpoints preserve local proposal, provider completion/text and successful quota reservation. Quota receipts replay the same reservation atomically. Mutation-only provider turns avoid a redundant final call. Generation uses stable document/job IDs, durable queue state and resumable enqueue. | T09/T12–T14/T32/T36; quota receipt tests and generation replay/revision/queue-failure tests. |
| R16 | Fixed and tested | Older-evidence SQL excludes recent IDs before its limit; Unicode search and an older-evidence budget are preserved. Structured confirmed fields and pending intent remain authoritative; oversized context has a non-retry-loop category. | T14–T16/T22/T37; context scoping, chronological older facts and budget tests. |
| R17 | Fixed and tested | Summary text comes from committed state and is visibly rendered in the active chat panel. Review is available for partial sessions. | T08/T38; summary route/store tests and SSR component regression. |
| R18 | Fixed and tested | Real builder/HTML/canvas previews omit sample contacts, bank details and line items. Sample tax/shipping and currency fallbacks were removed; totals use canonical data. Demo samples remain explicitly scoped. | T02/T39; every template/type rendered with absent contacts, plus totals/currency checks. |
| R19 | Fixed and tested | Plain strings bind to collision-free tokens; HTML restores them escaped after label transformation. Markdown escapes input before permitted emphasis; logo URLs/accent values are restricted. | T40; non-executing markup fixtures across all HTML templates and server autoescape tests. |
| R20 | Fixed and tested | Label rewriting runs while literal values are bound; canvas restores plain data and HTML restores escaped data. Invoice words in names/descriptions remain unchanged. | T20/T41; all five document types, HTML and canvas. |
| R21 | Fixed and tested | Session hydration is a pure presentation reset. Async generation and metadata effects are scoped; metadata choices are serialized/coalesced, acknowledgements reconcile backend revision, and failed draft hydration preserves a retryable source transition. | T15/T20/T42; zero restore writes, late generation/metadata effects, metadata revisions and draft-open retry. |
| R22 | Fixed and tested | Runtime tool validation enforces canonical aliases, type-specific fields, nested item schemas and allowed operations. Reserved metadata, fake pending answers, forged IDs and unknown getter args are rejected. | T28/T43; shared validator and actual MCP tests. |
| R23 | Partially fixed | Claude retains full schemas/current model IDs, permits the scoped state getter, returns final prose, rejects malformed arguments/failed/truncated turns and uses cancellation/timeouts. The production route remains explicitly Groq; no preference-based activation was introduced. | T44 adapter mocks passed; deployed model availability and real provider parity remain unverified. |
| R24 | Partially fixed | Redacted turn logs, bounded intent/outcome, response-preservation/constraining and failure-phase counters were added. Legitimate DAN names/invisible pastes pass; obfuscated overrides remain rejected. | T35/T45 telemetry/guardrail spies passed. Actual semantic relevance/fulfilled-intent rates require a labeled staging evaluation; routing counters are not proof of model quality. |
| R25 | Fixed and tested | Terminal snapshots and response types are validated before reconciliation. Draft transitions require matching source/destination/turn identity. HTTP error bodies preserve safe categories and valid committed state; restoration/metadata responses are also validated. | T18/T34/T46; fragmented streams, incomplete state/types, adapter and transition identity tests. |

## Authoritative turn contract

1. Verify the user and load owned session state. Completed mutations fork an authorized revision; expired/abandoned writes remain denied.
2. Claim a unique turn and a fenced lease before quota/provider effects. A successful replay returns stored response/actions.
3. Identify current intent independently of readiness. Extract local candidates and scoped operations; retain unresolved residual content for semantic processing.
4. Validate candidates, target identity, literal evidence and projected limits. Commit accepted data inside short optimistic transactions; never hold a DB transaction across provider execution.
5. Store operation outcomes and recovery checkpoints. Build bounded owner-scoped context from committed fields, pending intent and authorized messages.
6. Run the provider only when needed. MCP edits use the same repository/lease/schema; tool failure cannot become successful completion.
7. Reload committed state, recompute document validity and conversation stage, and plan one reply using current intent, results and provider text.
8. Persist exact approved text/actions, then send the authoritative SSE terminal. The frontend renders that text and reconciles the saved snapshot without inventing field progression.
9. Typed generation includes operation identity and expected revision. The document service retrieves authorized chat state, reserves quota idempotently, saves the document request and queues the same stable job ID. “Queued” remains distinct from “completed.”
10. Hydrate preview from committed values, with plain-text HTML escaping and label-only transformations. Late callbacks from another session cannot replace active state.

Source anchors in the final tree:

- `services/chat/src/routes/chat.routes.ts:22` — `chatRoutes`, including message handling, cached replay, revision/type transition and generation actions.
- `services/chat/src/services/groq.service.ts:8` — `runGroqAgenticLoop`; `services/chat/src/services/mcp.service.ts:12` — `createMcpServer`.
- `services/chat/src/services/conversation.repository.ts:11,67,92,131,138` — load/claim/apply/checkpoint/finish.
- `services/chat/src/services/session.service.ts:10` — `forkSession`, including ownership, compatible-field filtering and stable draft identity.
- `shared/conversation-intent.mjs:11,38` — intent routing and explicit item operations.
- `shared/conversation-state.mjs:32,73,248,333,346` — snapshot, validation/apply, extraction, committed summary and authoritative planner.
- `shared/tool-proposal.mjs:3`; `shared/chat-errors.mjs:1`; `shared/chat-stream.mjs:18,88,92` — tool, error and SSE runtime contracts.
- `user-frontend/src/store/chatStore.ts:69,102,166` — revision reconciliation, message/action consumption and session restoration.
- `user-frontend/src/store/documentStore.ts:223,266,288,345,364` — metadata queue, pure hydration, scoped presentation updates and generation.
- `user-frontend/src/utils/documentValues.ts:3,10`; `templateRenderer.ts:3933`; `invoiceElements.ts:2645` — safe literal-value binding/restoration.
- `services/document/app/routers/document.py:344,376` — durable enqueue recovery and authorized idempotent generation.

## Requested workflow: executed results

`services/chat/src/services/__tests__/responseIntelligence.test.ts` executes the six turns through Fastify, the repository and isolated transactional storage. Provider-dependent tests use the real Groq/MCP adapters with mocked HTTP and in-memory MCP transport.

| Turn | Observed isolated result |
|---|---|
| `mobile app 1 rs99000` | Exactly one mobile-app row persisted; genuinely missing currency requested. |
| `lkr` | Currency committed as LKR; response `Saved currency.`; document became valid. |
| `add my business address` | Canonical senderAddress pending intent persisted; relevant business-address question returned. |
| `No 40/20, Sagabo Mawatha, Diggala, Keselwatta, Panadura` | Exact address persisted; response `Saved business address.`; pending request cleared. |
| `change the mobile app price to 120000` | Existing row updated without duplication; authoritative total became LKR 120000.00. |
| `show me the document summary` | Committed address and updated total appeared in the summary; generic completion sentence absent. |

Frontend store/adapter and HTML/canvas fixtures separately verify consumption of committed values and exact reply text. This is layered isolated integration evidence, not a deployed end-to-end browser/database simulation.

## Regression specification coverage

All 46 scenario IDs have automated coverage of applicable code invariants. Some specifications have multiple assertions spread over shared/provider/route/store/rendering/document tests; the table does not claim that every scenario ran as a full browser journey.

| Scenario IDs | Automated coverage |
|---|---|
| T01–T04 | Ready optional-address request/value/update, unchanged answer, contextual follow-up and field-scoped company correction. |
| T05–T07 | Partial item addition, missing-component follow-ups, ordinal removal, price/quantity edits, aggregate limits and target evidence. |
| T08–T11 | Grounded review/summary, typed generation, unrelated questions and multi-field extraction. |
| T12–T15 | Provider/tool/storage failure, same-turn recovery, session restoration, late response/generation/metadata fences. |
| T16–T19 | Post-readiness continuation, no repeated generic reply, provider reply preservation and optional scalar clear. |
| T20–T23 | Compatible new drafts, finalized revisions, clarification replies, authorized company reuse and returning to optional fields. |
| T24–T27 | Compound/residual operations, action words inside values, acknowledgements/topic changes, identical answer/cancel and consistent readiness on failure/history. |
| T28–T32 | Rejected evidence, conservative address text, date ambiguity, projected item/provenance validation, required clear/skip and stable successful replay. |
| T33–T37 | Finalized/expired ownership guards, error categories, injection-vs-infrastructure policy, checkpoint/quota recovery and bounded older evidence. |
| T38–T42 | Visible partial Review, no real sample values, escaping, literal document-type words and pure hydration. |
| T43–T46 | Nested runtime schemas, Claude adapter parity, redacted response/phase telemetry and complete terminal validation. |

Tests added or extended include:

- `shared/tests/response-intelligence.test.mjs` and `shared/tests/chat-stream.test.mjs`.
- Chat `responseIntelligence.test.ts`, `intelligence.test.ts`, `mcp.test.ts`, `context.test.ts`, `session.service.test.ts` and the new `claude.test.ts`.
- Frontend `api/__tests__/ai.test.ts`, `store/__tests__/chatStore.test.ts`, `documentHydration.test.ts`, `utils/__tests__/documentRendering.test.ts`, and `components/builder/__tests__/review.test.tsx`.
- Quota `check.test.ts` with isolated FakeRedis receipt behavior.
- Document `test_generation_integration.py`, including authorized generation, idempotent replay, revision mismatch, invalid operation IDs, uncertain enqueue recovery and harmless close failure.

## Checks executed and actual results

| Check | Actual result |
|---|---|
| `npm run test:chat` | PASS: 96 shared Node tests + 101 Vitest tests in 18 files; zero failed/skipped. |
| `npm run test -w doccraft-quota` | PASS: 21 tests in 5 files, isolated storage/Redis fixtures. |
| Document pytest command below | PASS: 41 tests, mocked HTTP/ORM/queue; no shared database. |
| `npm run build -w doccraft-ai` | PASS: TypeScript compilation. |
| `npm run build -w doccraft-gateway` | PASS: TypeScript compilation. |
| `npm run build -w doccraft-quota` | PASS: TypeScript compilation. |
| `npm run build --prefix user-frontend` | PASS: TypeScript project checks and Vite build; existing large-chunk advisory remains. |
| Focused ESLint command below | PASS. |
| `npm run lint --prefix user-frontend` | FAIL: 138 errors / 6 warnings across the wider frontend. Remaining hook, any-type, unused-variable and missing-rule diagnostics require separate cleanup; changed files are not exempt from this limitation. |
| `git diff --check` | PASS for tracked diffs. |

Focused lint, run in `user-frontend`:

```sh
npx eslint src/api/ai.ts src/store/chatStore.ts src/utils/documentValues.ts src/store/__tests__ src/utils/__tests__ src/api/__tests__ src/components/builder/__tests__
```

Document regression command, run at the repository root:

```sh
PYTHONPATH=/tmp/doccraft-document-test-deps:services/document/.venv/lib/python3.13/site-packages:/home/eranda/.local/lib/python3.14/site-packages /usr/bin/python3.13 -m pytest services/document/tests -q
```

The Pygments initialization blocker was a test-interpreter/dependency-path issue. Test-only Pygments and psycopg2-binary packages were installed under `/tmp/doccraft-document-test-deps`; Python 3.13 service packages take precedence over the incompatible default user interpreter path. No application dependency/lockfile was changed to solve it. An initial root-level quota invocation omitted its service setup and failed environment initialization; rerunning the package's configured command passed all 21 tests. Intermediate regression failures were corrected before the final counts above; historical audit counts were not used as proof of current correctness.

## Remaining issues, limits and blockers

- **Blocked verification:** Real provider availability, deployed model configuration and semantic accuracy need credentials and controlled staging. Claude remains inactive in the message route; passing adapter mocks does not justify activating it or honoring previously misleading model-preference comments.
- **Blocked verification:** Actual PostgreSQL contention, Redis Lua/cluster behavior, BullMQ delivery, sidecar PDF rendering and a real browser click/export journey were not run. Repository/queue/Redis tests are isolated adapters and mocks. No isolated running PostgreSQL/Redis infrastructure was available for this pass.
- **Partially fixed R24:** Metrics now reveal routing, operation rejection, response authority and recovery phases. They do not establish semantic relevance for arbitrary natural language. Run a labeled staging set before claiming production intelligence/relevance rates.
- **Full lint remains failing:** The targeted conversational code checks pass, but the entire frontend has unresolved lint debt, including some modified large files. No lint configuration was weakened to hide those failures.
- Context retrieval intentionally stays bounded (recent messages plus keyword-selected older evidence); it does not guarantee recall of every historic constraint. Ambiguous old-company sources require selection, and ambiguous weekdays require an explicit date.
- Deterministic parsing handles supported clauses; other language uses provider extraction. Evidence and target checks intentionally reject unsupported interpretations rather than fabricate values. Free-form explanatory text is constrained for unsupported save/completion/total claims, but arbitrary factual correctness still needs model evaluation.
- Same-turn operation identity canonicalizes key ordering/generated IDs and supports legacy hashes; it is not an arbitrary natural-language semantic equivalence engine. A new turn is a new authorized request, not automatically a duplicate.
- The audit's existing browser-template → server-classic mapping remains: queued server PDFs may use a different layout from canvas export. Data escaping/validation is tested; pixel/layout equivalence was not claimed.
- Original finalized artifacts stay immutable. Chat edits open revision drafts; the finalized canvas itself stays read-only until the user enters an editable draft. Expired identity/session handling remains an explicit guard rather than automatic revival.
- Enqueue requests now persist through uncertain failures. A crash between queue acceptance and its database acknowledgement reconciles by stable job ID on retry; this depends on actual BullMQ job-ID behavior and needs the isolated infrastructure check above.
- Original Scenario B incident attribution remains **unverified** without its deployment/version/turn diagnostics. The new categories make a subsequent incident distinguishable.

## Migration and deployment steps

No schema migration is required: intent, outcomes, checkpoints, draft provenance and queue phase use existing JSON fields; stable IDs use existing primary keys. No migration was generated or applied.

For a reviewed release, rebuild/restart chat, gateway, quota and document services and serve the matching frontend build. Ensure the images include the shared modules. Roll quota receipt support out before relying on chat/document idempotent reservation behavior; older two-key quota requests remain supported. Configure internal service URLs/secrets and provider credentials through the existing environment mechanism. The document service must retrieve authorized chat state from the configured `AI_SERVICE_URL`.

Validate in disposable staging: the six-turn workflow, generation/status polling, a lost terminal replay, concurrent same-turn reservation, same-draft concurrent edits, type/revision transitions, and literal-value exports. Review full frontend lint debt and run actual PostgreSQL/Redis/BullMQ/browser/provider checks before labeling this production verified. This task did not deploy anything.

## Files changed

The following list is computed against the worktree hashes captured at the start of this implementation, not against HEAD. It separates this task from the substantial pre-existing uncommitted work. All three response audit reports and the older intelligence audit retain their original hashes. Unrelated auth/admin/payment/config/dependency work was left untouched.

- `package.json`
- `services/chat/src/middleware/concurrency.ts`
- `services/chat/src/routes/chat.routes.ts`
- `services/chat/src/security/prompt-injection.ts`
- `services/chat/src/security/tool-guardrails.ts`
- `services/chat/src/services/__tests__/claude.test.ts`
- `services/chat/src/services/__tests__/context.test.ts`
- `services/chat/src/services/__tests__/intelligence.test.ts`
- `services/chat/src/services/__tests__/mcp.test.ts`
- `services/chat/src/services/__tests__/responseIntelligence.test.ts`
- `services/chat/src/services/__tests__/session.service.test.ts`
- `services/chat/src/services/claude.service.ts`
- `services/chat/src/services/context.service.ts`
- `services/chat/src/services/conversation.repository.ts`
- `services/chat/src/services/groq.service.ts`
- `services/chat/src/services/mcp.service.ts`
- `services/chat/src/services/metrics.service.ts`
- `services/chat/src/services/quotaClient.service.ts`
- `services/chat/src/services/session.service.ts`
- `services/chat/src/testing/memory-db.ts`
- `services/document/app/routers/document.py`
- `services/document/tests/test_generation_integration.py`
- `services/gateway/src/services/sseRelay.service.ts`
- `services/quota/src/__tests__/check.test.ts`
- `services/quota/src/__tests__/fakeRedis.ts`
- `services/quota/src/controllers/quota.controller.ts`
- `services/quota/src/services/quota.service.ts`
- `shared/chat-errors.d.mts`
- `shared/chat-errors.mjs`
- `shared/chat-stream.d.mts`
- `shared/chat-stream.mjs`
- `shared/conversation-intent.d.mts`
- `shared/conversation-intent.mjs`
- `shared/conversation-state.d.mts`
- `shared/conversation-state.mjs`
- `shared/document-contract.json`
- `shared/document-contract.mjs`
- `shared/tests/chat-stream.test.mjs`
- `shared/tests/response-intelligence.test.mjs`
- `shared/tool-proposal.d.mts`
- `shared/tool-proposal.mjs`
- `user-frontend/src/api/__tests__/ai.test.ts`
- `user-frontend/src/api/ai.ts`
- `user-frontend/src/api/documents.ts`
- `user-frontend/src/components/builder/ChatPanel.tsx`
- `user-frontend/src/components/builder/__tests__/review.test.tsx`
- `user-frontend/src/pages/BuilderPage.tsx`
- `user-frontend/src/store/__tests__/chatStore.test.ts`
- `user-frontend/src/store/__tests__/documentHydration.test.ts`
- `user-frontend/src/store/chatStore.ts`
- `user-frontend/src/store/documentStore.ts`
- `user-frontend/src/types/index.ts`
- `user-frontend/src/utils/__tests__/documentRendering.test.ts`
- `user-frontend/src/utils/documentValues.ts`
- `user-frontend/src/utils/invoiceElements.ts`
- `user-frontend/src/utils/templateRenderer.ts`
- `CHAT_RESPONSE_FIX_IMPLEMENTATION_REPORT.md` (this report).
