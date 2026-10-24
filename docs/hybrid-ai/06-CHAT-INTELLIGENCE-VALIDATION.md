# Chat intelligence validation

Validation combines shared contract tests, actual Chat route/MCP/repository flows with isolated storage, control-plane authorization/budget tests, frontend store tests and Chromium workflows. Provider responses in these checks are fixtures. This verifies orchestration and integrity; it is not a measurement of a live model's reasoning quality.

| Required scenario | Automated evidence |
| --- | --- |
| Add provider/model, configure/rotate/revoke key | `services/admin-api/tests/test_hybrid_ai.py` and browser provider/credential forms |
| Free/paid assignments, runtime changes, in-flight snapshots | Separate registered model tests and policy version tests |
| Admin isolation and granular scopes | Authenticated/unauthenticated staff and signed internal endpoint tests |
| Simple tax/item edits avoid inference | Hybrid Chat tests count zero outbound inference calls |
| Compound customer/heading edit | Chat route persists both; browser renders blue heading and changed customer |
| Spelling/grammar preserve meaning | Shared correction tests; persisted suggestions and explicit acceptance after reload |
| Side questions preserve active document | Shared reviewed knowledge, Chat state assertions and rendered browser conversation |
| Ambiguous resizing | Zero/multiple selection clarifies; one selected element resizes; clarification survives reload |
| Local failure/fallback and cloud budgets | Scripted local failure uses only allowed fallback; atomic spend/request tests |
| Durable context, undo/redo, replay | Session restoration, revision checks and stable operation receipts |
| Cross-tenant access | Denied before tools or provider calls |
| Concurrent quotas and model concurrency | Threaded reservation tests, queue admission tests and quota ledger suite |
| Secret leakage and malformed endpoints | Encryption/AAD, sanitized read/error/echo tests, SSRF and DNS tests |

Representative conversations include `Change the tax to 10%`, `Add another item, a mouse for 25 dollars`, `Actually change the customer to Alex and make the invoice heading blue`, `Make it bigger`, invoice-versus-quotation questions and the supplied misspelled delivery instruction. Existing broader intelligence suites retain multi-field parsing, contact ownership corrections, item targeting, dates, discounts, banking details and interrupted turns.

Initial continuation baseline: the explicit item phrase `Add another item, a mouse quantity 1 for 25 USD` fell through to inference and failed the fixture turn. After extending the existing parser, that phrase and the natural singular version save a 1 × 25 line item, reuse USD and make zero inference calls. No general before/after accuracy percentage is claimed.

The browser runner `scripts/verify_hybrid_ai_browser.mjs` loads actual React screens, ChatPanel, SSE client, Zustand stores and InvoiceCanvas using an isolated HTTP fixture transport. Its evidence must not be described as a live microservice/database/provider end-to-end test. The existing PDF export test also rasterizes in Chromium and compares rendered text geometry.

Live acceptance remains necessary: replay the same corpus against the selected local and cloud endpoints in an isolated full deployment. Score field precision/recall, unsupported mutations, clarification appropriateness, answer usefulness, completed documents, editor success, retries and latency. Include paraphrases and multi-field creation such as the Nexora/John/three-laptops example. Have a reviewer compare resulting documents, not just HTTP statuses. A connectivity tool check alone does not certify model intelligence.

## Recorded execution

275 shared Node tests, 265 Chat/Gateway/frontend tests, 193 admin tests (37 hybrid), 25 quota tests, 73 document-service tests and six Chromium workflows passed. Service/admin/user builds passed. [Machine-readable results](evidence/validation-results.json) and [browser results](evidence/browser-validation.json) identify the fixture boundaries. The supplied Nexora/John/three-laptops creation case now has a direct Chat regression: it saves both names and 3 × 500, asks only for missing required data, and never invents currency or dates.
