# DocCraft complete chat intelligence implementation

Verified locally on 2026-10-14. These are implemented changes, with automated tests and a real localhost chat → PostgreSQL → refreshed browser → PDF check. Services remain native localhost processes. No deployment or destructive database operations were performed. Existing unrelated working-tree changes were preserved.

## 1. Root causes fixed

- Line-item targeting previously required an exact description. “web development” did not resolve the existing “Website Development” row. Target resolution now preserves stable IDs, accepts an unambiguous abbreviated name, and asks for a selection when several rows match.
- Price evidence treated `1lak` as the literal number `1`, rejecting the normalized price `100000`. Strict amount parsing and source-evidence checks now understand `lak`, `lakh`, `lac`, and `k` without accepting invented amounts or extracting quantities from an invoice identifier.
- Compact item-add and pending-item reply paths had separate numeric-only parsing. They now use the same amount parser; a complete reply resolves the previous partial item instead of creating a duplicate or repeating its question.
- Note instructions with text before “in the note,” misspelled “valide,” or spaced ISO dates were missed or rejected by evidence checks. Notes now have explicit append/replace operations with source validation. A date requested in a note remains note text and does not overwrite the structured due date.
- Required-field completion had no useful persisted optional-information stage. The planner now offers supported missing contact/payment fields, remembers that offer across refresh, and supports adding or skipping optional details without forcing them.
- Proposed operations and terse confirmations could lose their relationship after a tool failure or refresh. Pending typed operations, original evidence, target IDs, and confirmation questions are persisted with session state. “Yes” executes a verified pending operation; “no” preserves prior data.
- Tool schemas did not describe generic append operations, separate payment terms, fixed discounts, or supported item-level percentage discounts consistently. Shared definitions now generate the supported tool contract, and schema validation rejects unsupported arguments before execution.
- Payment terms were overwritten by notes in the Python rendering adapter. They now remain separate canonical data and appear alongside notes in templates with a single Notes area.
- Frontend and export calculations could evolve independently. Both runtimes now evaluate the same declarative financial calculation program, using integer/decimal arithmetic appropriate to their runtime.

## 2. Files modified

The working tree already contained changes from earlier repairs and unrelated work. The following are the principal files changed or extended for this task; this list does not attribute all current `git status` entries to this task.

| Area | Files |
| --- | --- |
| Canonical definitions | `shared/document-contract.json`, `shared/document-contract.mjs`, `shared/document-contract.d.mts` |
| Parsing and planning | `shared/amounts.mjs`, `shared/document-edits.mjs`, `shared/conversation-intent.mjs`, `shared/conversation-state.mjs`, `shared/field-edits.mjs`, `shared/field-processing.mjs` |
| Structured tool validation | `shared/tool-proposal.mjs` |
| Chat APIs and persistence | `services/chat/src/routes/chat.routes.ts`, `services/chat/src/controllers/session.controller.ts`, `services/chat/src/services/conversation.repository.ts`, `services/chat/src/services/mcp.service.ts`, `services/chat/src/services/context.service.ts`, `services/chat/src/services/profileClient.service.ts` |
| Frontend synchronization and rendering | `user-frontend/src/api/ai.ts`, `user-frontend/src/utils/documentValues.ts` |
| Export validation and mapping | `services/document/app/services/document_contract.py`, `services/document/app/services/sidecar.py` |
| Export discount labels | Supported native templates under `services/document/app/templates/{invoice,quotation,receipt,purchaseOrder,proposal}/` |
| Regression tests | `shared/tests/complete-intelligence.test.mjs`, existing shared workflow/formatting tests, `services/chat/src/services/__tests__/fieldWorkflow.test.ts`, `services/chat/src/services/__tests__/responseIntelligence.test.ts`, `services/chat/src/routes/__tests__/chat.routes.test.ts`, document tests under `services/document/tests/` |

No Prisma migration is required: canonical values, field metadata, pending operations, collection stage, and revisions use the existing session JSON storage. Existing API routes and the invoice design are preserved.

## 3. Required-field collection

`shared/document-contract.json` is the authoritative contract for invoice, quotation, receipt, purchase order, and proposal fields. The existing template registry supplies template-specific requirements and mappings. Definitions include keys, aliases, types, labels, questions, normalization strategies, validators, edit permissions, clear/default policies, and template bindings.

Each turn follows this flow:

1. Load the latest authorized persisted session and its revision.
2. Resolve the document type, selected template requirements, and configured conditional requirements.
3. Interpret the latest intent before assigning an answer to a pending field.
4. Extract all independently supported updates. Explicit commands use deterministic parsing; less structured language continues through the existing AI structured-tool extraction path.
5. Validate tool shape, source evidence, field ownership, values, and financial/date relationships.
6. Merge only accepted operations into existing state, retaining unrelated information.
7. Normalize each field according to its meaning and recalculate financial data.
8. Persist the authoritative state atomically using existing optimistic revision checks.
9. Recalculate unresolved required fields and choose the next question or workflow stage.
10. Return committed state through the existing SSE response for frontend reconciliation.

Persisted field records retain raw and normalized values, validation/confirmation status, source message, and update time. Missing, invalid, ambiguous, awaiting-confirmation, confirmed, and skipped information remain distinguishable. An invalid attempted correction can retain the previously verified value while blocking readiness until resolved or, for an optional field, explicitly skipped.

Required fields are not a universal hardcoded invoice contact list. For example, the selected Odoo invoice requires business address, email and phone, and client address in addition to the common invoice fields. Missing client email/phone remain optional unless policy makes them required. Bank details become required when the applicable payment-method condition requires them. Changing templates reevaluates readiness.

No missing quantities, prices, company names, addresses, dates, or banking information are invented. Generation requires validated completeness and explicit confirmation tied to the current state fingerprint/revision. Later edits invalidate earlier approval.

## 4. Optional-field workflow

After required information is valid, the assistant offers useful missing optional fields from the schema, including business/client contact details, notes, bank information, payment method, and payment terms where supported.

- Users can provide one or several fields, accept the offer, skip a field, or skip all optional details.
- The offer and its pending reply context survive refresh.
- An accepted field is not requested again. A completed optional offer is not repeatedly shown.
- Skipping preserves existing saved values and does not satisfy genuinely required fields.
- An optional rejected correction can be dismissed while keeping its verified prior value.
- Users can add previously skipped optional details later.
- Review and further editing remain available after required collection is complete.

## 5. Universal editing and ownership

Structured field operations support `set`, `append`, `clear`, and `skip`; user add/update/replace/correct instructions map to those operations. Append is permitted only for fields declared appendable. Required fields cannot be silently cleared. Schema-defined aliases resolve to canonical fields rather than creating parallel frontend/backend slot names.

Business fields (`senderPhone`, `senderEmail`, `senderAddress`, `businessName`) and recipient fields (`clientPhone`, `clientEmail`, `clientAddress`, `clientName`) retain explicit ownership. Compound clauses such as “Business phone is … and email is …” retain business scope; a later “Client …” clause changes scope. Compact address replies can supply address, email, and phone independently without title-casing an email inside an address.

Line-item add/update/remove operations use stable IDs. Quantity and price can change together; rename and unambiguous abbreviated targeting preserve the existing item. Multiple possible targets persist a targeted clarification. A complete reply to a partially collected row resolves that row. Valid sibling field changes are saved even when another operation needs clarification.

Read/review requests produce a summary from committed data. Pending confirmations are handled before ordinary conversational acknowledgments. Clear, safe instructions execute immediately rather than prompting for redundant approval.

## 6. Tool execution, persistence, and synchronization

The AI receives the canonical editable fields and supported operation types. Structured tool proposals are schema-checked and must be supported by user evidence. A provider cannot turn its own guess into a confirmed value. Generic confirmation proposals are dry-validated, then persisted as pending actions with original source evidence.

The existing session-owner authorization, prompt/tool guardrails, short transactions, revision fencing, retry deduplication, and generation approval checks remain active. There is no validation or authorization bypass.

Acknowledgments are derived from committed operation receipts. They include the actual row/quantity/price for item changes rather than trusting provider prose. Failed persistence does not produce a successful-save acknowledgment. Pending proposals survive later tool errors; retrying an append after interrupted persistence does not append twice.

The frontend uses authoritative returned state and existing revision fencing. Progress uses canonical required fields and verified field state. AI request authentication is fenced to its captured token so a late response cannot invalidate a newer guest/login identity. New sessions send the browser timezone unless an explicitly configured profile timezone takes precedence.

Frontend canvas/HTML and Python export adapters consume the same normalized data. Sender and recipient mappings remain distinct. Payment terms and notes render together when the template has only one Notes section; account information uses the Account Data mapping. Fixed discount labels do not display an undefined percentage.

## 7. Financial and date validation

The canonical JSON contract contains the shared financial expression program. JavaScript evaluates it with decimal-scaled BigInt primitives; Python uses Decimal with matching half-up rounding. The calculation order is:

1. Quantity × unit price, minus supported item percentage discount.
2. Sum rounded line totals.
3. Apply either the document percentage discount or its fixed amount.
4. Apply supported tax to the discounted taxable amount.
5. Calculate the final total.

A fixed discount above the subtotal is invalid. Simultaneous nonzero fixed and percentage modes require resolution. An unspecified small discount asks whether it is a percentage or amount. A foreign-currency amount does not trigger automatic conversion or silent relabeling. No exchange rates or taxes are invented. Phone and account values remain strings, retaining leading zeros.

Dates support ISO and established relative-date parsing using session timezone. “Next Friday” means the next future occurrence. Impossible dates and due/issue chronology are rejected. A validity date explicitly requested in a note is validated as note content without changing the structured due date. An invalid note date persists a targeted correction action; “yes” alone cannot validate an impossible date.

Absent optional adjustments mean no adjustment in arithmetic; they do not create fabricated confirmed field values.

## 8. Notes synchronization and before/after examples

| User instruction | Previous failure | Verified behavior |
| --- | --- | --- |
| `update web development qty as 2 and cost per one is 1lak` | Rejected existing-item update | Existing Website Development ID retained; quantity 2; unit price LKR 100,000.00; line amount LKR 200,000.00 |
| `add last valide date as 2026 -12-12 in the note` | Note rejected; subsequent “yes” treated as unrelated | Saved `Last valid date: 2026-12-12.`; due date preserved; note appears in preview and PDF |
| `Business phone is 0771234567 and email is hello@nexora.com` | Incomplete or confused contact collection | Both sender fields saved independently |
| `Client phone is 0712345678 and email is yohan@example.com` | Business/client values could be confused | Both client fields saved; sender contacts unchanged |
| `Apply 10% discount` | Inconsistent edit/total behavior | Discount committed and total recalculated |
| `Change client name to Yohan Maha` | Correction could be rejected or stale | Recipient updated, unrelated values retained, browser refresh restores correction |
| `yes` to a persisted pending proposal | Lost intent or “You’re welcome” | Original validated operation executes once using its preserved context |
| `Skip all optional details` | Missing optional details could block or be repeatedly requested | Optional stage dismissed while required-field validation and saved values remain intact |

## 9. Regression results and live acceptance

Commands executed after the final code changes:

| Check | Actual result |
| --- | --- |
| `npm run test:chat` — shared Node tests | **190 passed, 0 failed** |
| `npm run test:chat` — Vitest chat/gateway/frontend integration and unit tests | **155 passed across 22 files, 0 failed** |
| `/tmp/doccraft-local-py313/bin/python -m pytest services/document/tests -q` | **56 passed, 0 failed** |
| `npm run build -w doccraft-ai` | Passed |
| `npm run build --prefix user-frontend` | Passed; existing large-bundle warning remains |
| `git diff --check` | Passed |

Total relevant automated checks: **401 passing tests**. Tests exercise actual repository state using an isolated in-memory Prisma-compatible fixture, Fastify routes and SSE events, restoration, tool proposal validation, frontend canvas/HTML mappings, and Python export validation. These automated repository fixtures are complemented by the live PostgreSQL acceptance run below; they are not presented as a production database/load test.

Coverage includes required fields across all supported document types, template-specific/conditional requirements, optional offers and skipping, compound contact ownership, lowercase/brand normalization, spelling/ambiguity confirmations, abbreviated and ambiguous item targets, quantity/price updates and informal amounts, add/remove items, percentage/fixed/item discounts, taxes and rounding, relative/impossible dates, note append/replace/remove, persisted pending confirmation, independent partial success, invalid tool arguments, persistence failure, SSE interruption/retry, session restoration, stale frontend revisions, export parity, authorization, and concurrent/repeated operations. Existing regressions remain part of the passing suite.

### Real localhost acceptance

A synthetic guest created a new Odoo invoice through the public gateway and normal chat/SSE routes. Only this test user's newly created data was used for writes.

- Session: `82c5ff3b-4518-4ebb-9908-a01a3c2dfcc2`.
- Four initial rows produced subtotal LKR 121,500.00.
- Required sender contacts were requested before readiness; optional client contacts were then offered.
- Business and client contact messages saved all four independent values.
- The exact reported failing item instruction updated the original Website Development row to 2 × LKR 100,000.00. Four rows remained, without duplication.
- New subtotal: **LKR 246,500.00**.
- Applied 10% discount: **LKR 24,650.00**.
- Final total: **LKR 221,850.00**.
- The exact misspelled/spaced-date note instruction saved the normalized validity note.
- Client correction and document summary reflected the committed values.
- A direct Prisma read verified stored phones, name, four rows, updated item values, note, discount, and revision **36**.
- GET restoration returned the same authoritative data.
- Puppeteer opened the real builder and checked Zustand slots and rendered canvas text, then refreshed and checked them again. Both contact numbers, the corrected name, item amounts, final total, and note matched.
- The invoice was explicitly approved at its current fingerprint/revision before generation.
- Native document generation reached `success` for document `8137c8f8-3dcb-51c6-a456-38e815e4d4dc`.
- PyMuPDF extracted the generated PDF text and verified both phone numbers, corrected recipient, Website Development amount, subtotal, discount, final total, and validity note. The document is one page.

Review artifacts:

- Browser screenshot: `/tmp/doccraft-complete-preview.png`.
- Browser verification: `/tmp/doccraft-complete-browser-result.json`.
- PDF verification: `/tmp/doccraft-complete-pdf-result.json`.
- Generated PDF: `services/document/storage/8137c8f8-3dcb-51c6-a456-38e815e4d4dc.pdf`.
- Automated logs: `/tmp/doccraft-complete-chat-tests.log`, `/tmp/doccraft-complete-document-tests.log`, `/tmp/doccraft-complete-chat-build.log`, `/tmp/doccraft-complete-frontend-build.log`.

The screenshot was visually inspected: the existing teal Odoo invoice design, sender/recipient sections, four-row table, Notes area, and footer remain intact.

## 10. Remaining limitations

- Open-ended natural-language extraction still depends on the configured AI provider. Explicit supported edits, authoritative validation, persistence, and completion planning work locally; upstream outages can still produce retryable provider errors.
- New custom fields/template policies must be declared in the shared contract/registry before becoming supported editable fields. Arbitrary undeclared fields are intentionally rejected.
- Contact validation checks syntax; it does not prove ownership/deliverability of an email, phone, or bank account.
- Unfamiliar legal/brand spelling and unclear address boundaries require user clarification. No geographical lookup or invented address segmentation was added.
- Supported item discounts are percentages. Document discounts support percentages or fixed amounts; exchange-rate conversion and arbitrary item-level fixed discounts were not added.
- Some templates expose only one Notes section, so payment terms are combined with notes for display while remaining separately stored.
- Existing frontend bundle-size warnings remain. These checks do not establish production load capacity or availability of an external provider.
- Previously finalized documents are not silently rewritten. Corrections update the active session/preview and invalidate approval; exporting the revised document requires current explicit approval.

## Follow-up: screenshot discount rejection (2026-10-14)

The exact instruction `add a discount 10%` exposed a missing optional article in the amount-after-field discount parser. The amount-before-field form (`add a 10% discount`) worked, but the screenshot form fell through to provider extraction and could produce the reported rejection/scope question.

Fixed `shared/document-edits.mjs` to accept both `a` and `the` consistently. A general discount command sets the canonical document `discountRate`; it does not assign item-level discounts or require an unnecessary invoice-versus-item confirmation. Explicit item-targeting behavior remains separate. Validation, source evidence, persistence, and recalculation are unchanged.

Added four shared regression cases covering the screenshot wording and related article/percentage forms, including replacement of an existing fixed discount. Added a Fastify/repository integration regression verifying no provider fallback, unchanged line items, committed state, GET restoration, and the rendered discount/total.

Results: `npm run test:chat` passed **194 shared tests + 156 Vitest tests (350 total)**. Chat TypeScript build and `git diff --check` passed. A new synthetic guest's real localhost invoice accepted the exact screenshot message, saved a 10% discount of LKR 12,150.00 on subtotal LKR 121,500.00, and returned total LKR 109,350.00. GET restoration agreed; replaying the same turn ID preserved the revision and total without a second discount application. Session: `d9d6738d-26ff-4cc1-b37a-6b54e28848c9`.

The real builder was also verified in Puppeteer before and after refresh: discount rate 10%, discount amount LKR 12,150.00, and total LKR 109,350.00 appeared in authoritative slots and rendered canvas text. Screenshot: `/tmp/doccraft-discount-preview.png`. A direct Prisma read confirmed the stored rate, all four unchanged rows, and `needsProvider: false` for this turn.

## Follow-up: declarative item edits and confirmations (2026-10-14)

The messages `web development qty is 2` and `ux ui design price is rs 20 000` exposed additional extraction/authorization gaps:

- Named-item editing required a leading imperative verb, so valid declarative instructions fell through to the provider.
- Space-separated thousands were not accepted by amount parsing or its source-evidence checks.
- The update authorization check treated every instruction without an imperative verb as an unauthorized correction, even when its exact named target and numeric field were explicit.
- Comma-separated operation parsing also split commas inside prices such as `20,000`.
- Intent recognition did not count polite “could you set…” requests as edit authorization, blocking a structured pending proposal.

Updated `shared/amounts.mjs`, `shared/conversation-intent.mjs`, and `shared/conversation-state.mjs`. A declarative edit must name an existing item and provide an explicit supported numeric role. Updates remain tied to the matched stable item ID and precisely parsed values. Unrelated extra updates and removal operations are not authorized by a price/quantity declaration. Ambiguous names retain a persisted item-choice operation; “yes” alone cannot pick between multiple rows. Correct grouping is accepted with commas, spaces, or nonbreaking spaces; malformed grouping remains invalid. Polite explicit set requests now satisfy the existing intent guard, while schema, source-evidence, ownership, and session authorization checks remain active.

Clear screenshot instructions now execute immediately and do not ask for unnecessary confirmation. For a genuine structured confirmation, an integration test verifies that the item proposal remains pending after GET restoration and that “yes” applies it to persisted state. A historical provider-only question that never saved an operation cannot supply a target/value to a bare “yes”; resubmit the clear edit once in such conversations.

Final checks: **202 shared tests + 159 Vitest tests = 361 passing chat/gateway/frontend tests**. Added regressions cover both exact screenshot messages, grouped amounts, malformed grouping, questions versus edits, comma-separated quantity/price updates, unchanged item IDs, rejection of wrong targets/extra fields/removal, refreshed preview data, ambiguous target selection, and persisted item confirmation. Chat and frontend builds pass; the existing frontend bundle warning remains. `git diff --check` passes.

A new synthetic guest's real localhost Odoo invoice, session `7d28207a-3873-4bfc-ab3c-74fbf2602f89`, accepted both exact instructions. Website Development became quantity 2 with amount LKR 150,000.00. UI/UX Design retained quantity 2 and became unit price LKR 20,000.00 with amount LKR 40,000.00. All four original rows remained. With an existing 10% invoice discount, subtotal was LKR 206,500.00, discount LKR 20,650.00, and total LKR 185,850.00. GET restoration and repeated-turn deduplication agreed. A direct PostgreSQL/Prisma read confirmed both row changes and that neither edit needed provider extraction. Puppeteer verified authoritative slots and rendered quantities, prices, line totals, discount, and final total before and after browser refresh. Screenshot: `/tmp/doccraft-item-declaration-preview.png`; logs: `/tmp/doccraft-item-declaration-tests.log`, `/tmp/doccraft-item-declaration-live.log`, `/tmp/doccraft-item-declaration-browser.log`.

## Follow-up: editing previous conversations and misspelled item names (2026-10-14)

Read-only inspection confirmed that the reported conversation is `ACTIVE`, uses the Odoo invoice template, and retains all four canonical saved items with stable IDs. Its data is editable without starting a new conversation. The latest exact message was `web site developmnt qty is 2`, which differs from the previously tested phrase: it splits “Website” into two words and omits a letter in “Development.” The matcher did not recognize that target, allowing provider prose to incorrectly claim that existing items could not be edited.

Changes:

- `shared/amounts.mjs`: after preserving exact token matches, compare item names with normalized word boundaries/punctuation. Suggest a saved item for a single spelling edit using the existing typo detector; a suggestion does not apply an update or rename the item.
- `shared/conversation-intent.mjs`: recognize typed quantity/price edits targeting these suggestions and preserve their proposed changes as a structured item-choice operation. Unknown prose and questions remain subject to semantic extraction. Complete new-item replies continue to use the existing add path.
- `shared/conversation-state.mjs`: expose whether a single suggested target can be confirmed by “yes,” persist the target and operation, resolve confirmation using the saved ID, and show the correct label for legacy rows without IDs. Multiple candidates require an explicit selection; “no” cancels while preserving values. Prevent item instructions containing `qty` from being assigned to an unanswered company-name field. Fully recognized document-level scalar edits finish before item targeting.
- Added six shared regressions and an integration regression for an older conversation containing earlier unsuccessful provider replies. Coverage includes split words, the exact typo, refresh followed by “yes,” rejection, ambiguous suggestions, missing legacy IDs, and preservation of unrelated information.

Verification loaded the actual reported session (`94753532-c155-4f7a-a72d-05d181f3826c`, revision 80 at verification time) read-only and applied the typo → confirmation → price sequence to an isolated clone. The resulting Website Development quantity was 2, UI/UX Design unit price was 20,000, four rows remained, and the existing 10% discount produced total LKR 185,850.00. Business/client/bank/note values were preserved. A second database read confirmed that this verification did not change the user's saved session. The application fix is available for new messages in that same conversation.

Automated results: **208 shared + 160 Vitest = 368 passing tests**, chat and frontend builds passed, and `git diff --check` passed. Historical provider-only confirmation messages that never persisted an operation cannot supply a target/value to a bare “yes”; resend the edit once. New spelling clarifications persist an executable operation.

The live localhost confirmation check also passed in synthetic session `a6167891-2f53-41be-9ef8-3dd3ffa749b1`: the exact typo persisted `Did you mean Website Development? Apply quantity 2 to this saved item? Reply yes or no.`; GET restoration retained it; `yes` updated the original row. The UI/UX price edit then committed, repeated-turn replay remained deduplicated, and Puppeteer verified the final preview and state before and after refresh. Screenshot: `/tmp/doccraft-previous-chat-preview.png`; logs: `/tmp/doccraft-previous-chat-live.log`, `/tmp/doccraft-previous-chat-browser.log`, `/tmp/doccraft-previous-chat-tests.log`. No new conversation is required for an active saved invoice; its earlier chat messages remain history.

## Follow-up: “qty should be 2” and verified AI edit execution (2026-10-14)

The first screenshot correctly shows saving the due date and then asking for required line items. Added a regression verifying this sequence and subsequent table collection without repeating the accepted date.

Read-only inspection found the second screenshot's active saved invoice in session `6dae45cd-4b9d-404c-ab02-aab0bd51cf92`. Its exact request was `web development qty should be 2`. The existing edit parser and numerical source verifier did not share support for “should be,” so the request went to provider extraction. The provider could return unsupported-edit prose without executing or persisting an operation.

Implemented:

- One shared `ITEM_VALUE_LINK` grammar in `shared/conversation-intent.mjs`, also consumed by `shared/conversation-state.mjs` for numerical evidence. It supports should/must/ought/needs/has-to forms, current-value wording, and trailing polite qualifiers. Quantity and price percentages cannot masquerade as ordinary numeric values; item percentage discounts remain supported.
- Canonical item IDs, literal numerical roles, unrelated fields, existing invoice discounts, and template mappings remain preserved.
- `services/chat/src/services/groq.service.ts` accepts a trusted mutation requirement from the route. An edit's prose-only refusal triggers bounded structured-extraction repair. Reading state or an empty update cannot fulfill the edit. A committed change, verified no-op, or saved clarification is required; persistent refusal returns an incomplete-response error instead of claiming that supported editing is unavailable.
- `services/chat/src/routes/chat.routes.ts` supplies that requirement for unprocessed corrective/edit intentions. Ordinary questions remain free to receive explanations without a mutation.
- `services/chat/src/services/context.service.ts` explicitly identifies the current tool schema as authoritative over historical assistant messages and instructs updates/removals by stable ID rather than replacing the whole item table.
- Genuine model-proposed confirmations are validated in a discarded copy with provisional execution permission, while evidence, item targeting, value validation, and required-field policies remain enforced. The authoritative document remains unchanged until the user confirms. This lets a valid semantically extracted proposal persist even without an imperative keyword; it does not let the provider confirm or commit its own guess.

Regression results: **217 shared + 166 Vitest = 383 passing tests**. Added coverage includes five natural connectors, polite modifiers, identical extraction/validation semantics, percentage-as-quantity rejection, due-date → item collection, persisted invoice-discount recalculation, unprocessed semantic edits, refusal repair, persistent no-tool refusal, read/empty-tool attempts, ordinary questions, and safely validated pending proposals. Chat and frontend builds pass; the existing frontend bundle warning remains. `git diff --check` passes.

The screenshot's actual saved state (revision 69) was loaded read-only and tested on an isolated clone. The requested quantity became 2 while unit price stayed LKR 75,000.00, four rows remained, and all unrelated canonical fields were identical. With the existing 10% discount, total became LKR 176,850.00. No write was made to the user's invoice during this verification.

A real localhost request for the exact screenshot wording also committed the existing-row change and returned LKR 176,850.00. A separate live provider-backed semantic edit encountered `PROVIDER_RATE_LIMITED`; it could not establish live upstream availability. The structured-provider behavior is covered by passing automated tests; the explicit screenshot operation is handled locally and was independently verified successfully. No provider/account limits or credentials were changed or bypassed.

The independent direct-edit acceptance completed successfully in synthetic session `fbd11f59-d881-4704-83ca-55d1ca686bcf`: exact wording, 10% discount recalculation, GET restoration, and same-turn replay all passed. A direct Prisma read verified quantity 2, unchanged unit price 75,000, four rows, discount rate 10, and `needsProvider: false`. Puppeteer verified rendered quantity/line amount, discount LKR 19,650.00, and total LKR 176,850.00 before and after refresh. Screenshot: `/tmp/doccraft-should-be-preview.png`; logs: `/tmp/doccraft-should-be-direct-live.log`, `/tmp/doccraft-should-be-browser.log`, `/tmp/doccraft-should-be-tests.log`. The separate rate-limited upstream test is recorded in `/tmp/doccraft-should-be-live.log`; it is not represented as a passing live AI test.

## Admin panel: provider-limit information (2026-10-14)

Added the requested explanation at **Infrastructure → API Usage & Limits** (`http://localhost:5174/inf_api_usage`). The page shows the GPT-OSS 120B reference snapshot verified on 14 October 2026: 8,000 tokens/minute and 1,000 requests/day. It explains HTTP 429, chat/token usage before PDF generation, shared user/development usage, reset/retry guidance, preserved document data, and why increasing DocCraft's allowance to 1,000 cannot raise Groq limits. Documentation and current Groq account-limit links are included. The verification date and wording identify reference values; no ongoing healthy-provider claim or live counter is fabricated.

Reusable notices also appear under Current Plans/Plan Overview and AI Model Routing, linking to the provider-limit page. The page header identifies allowances/provider limits and hides the generic telemetry-refresh control for this informational view. Claude routing copy now explains that Groq chat configuration/provider limits are separate.

Source changes: `admin/src/components/infrastructure/ProviderLimitsInfo.tsx`, `admin/src/pages/subviews/InfrastructureView.tsx`, `admin/src/pages/subviews/PackagesView.tsx`, and `admin/src/pages/DashboardPage.tsx`. No backend configuration, provider limits, API credentials, authentication, quota values, or database records were changed.

Verification: strict targeted TypeScript checks (including unused-symbol checks) pass for the changed subviews and their component dependencies. Vite production bundling passes. Puppeteer verified the reference numbers, explanation, external-link protections, refresh restoration, plan/routing notices, and navigation. Admin API read responses were isolated browser fixtures; no mutating API requests were made. Screenshot: `/tmp/doccraft-admin-provider-limits.png`. `git diff --check` passes.

The standard `npm run build --prefix admin` remains blocked by pre-existing TS6133 unused-symbol errors in untouched Analytics, Automations, Cost Ledger, Home, Security, Subscriptions, and Support pages. Those unrelated files and compiler settings were preserved. Logs: `/tmp/doccraft-admin-provider-limits-build.log`, `/tmp/doccraft-admin-provider-limits-typecheck.log`, `/tmp/doccraft-admin-provider-limits-vite.log`, `/tmp/doccraft-admin-provider-limits-browser.log`.

## Chat attachments and direct PDF downloads (2026-10-14)

The chat composer's **+** button was inert. Existing toolkit uploads used fixed 200 × 120 geometry, which could distort artwork and cover document content, and were not restored with a conversation. PDF export also required a separate chat review/confirmation flow and refused to export when a provider failure left a pending retry, even when all required document values were already validated and saved.

### Implemented behavior

- **+ → Business logo / Image / Signature image** opens a file chooser. PNG, JPG, and WebP files up to 8 MB are decoded, bounded to 24 million source pixels, resized proportionally, and converted to bounded PNG data while preserving transparency. Image uploads and sizing do not call the AI provider.
- A shared placement engine measures occupied document elements, fits logos in available header space, signatures near the bottom, and other images in free document space. It preserves aspect ratio, avoids text/tables, and adds another page when a page has insufficient room. Images use `object-fit: contain` when resized manually.
- Authenticated, owner-scoped, revision-checked asset endpoints save artwork in existing session JSON metadata. Upload acknowledgements and image data commit in the same transaction. Failed writes produce neither a saved image nor a success message. Upload retries retain an identifier and are idempotent; a new logo replaces the old logo while preserving unrelated artwork and fields. Canvas deletion persists removal.
- Snapshots restore artwork after refresh. Revisions of finalized conversations retain artwork; business-detail reuse carries the business logo without unrelated document images. Base64 image data stays out of provider context, which receives only attachment identifiers, roles, and names.
- Server-computed SHA-256 image hashes participate in the document approval fingerprint. Adding, replacing, or removing an image invalidates previous approval. Existing documents without images retain their original fingerprint format.
- The native queued PDF path carries authoritative media from the saved session into the worker and renderer. The Puppeteer renderer measures its own template rectangles before placing images, preserving its template layout. Print-height handling avoids an empty second page.
- **Download** reads and validates the saved session directly, confirms its fingerprint/revision through the storage API when needed, and exports the visible preview to PDF. It does not send a chat message or create an AI generation request. The click explicitly approves the current document, as stated in the button tooltip. A remotely changed document updates the preview and requires another click; missing fields or unresolved edits display a specific error beside the download control.
- A provider failure alone does not block download of valid committed details. Its pending retry remains available. Active saves and unresolved document edits still block export. Session and revision checks prevent an outdated capture from being downloaded, and failed capture removes its temporary page clone.
- **Guest downloads remain blocked**, as explicitly requested. Desktop/mobile download controls and the Export panel are disabled for guests, with a sign-up/sign-in entry point. The store method also checks authentication/guest status before reading or exporting a document. Existing backend guest download restrictions remain in place.
- Mobile previews use the same canvas elements as desktop, including uploaded artwork.

### Files changed for this follow-up

- Shared contract and tests: `shared/document-assets.mjs`, `shared/document-assets.d.mts`, `shared/tests/document-assets.test.mjs`, `shared/conversation-state.mjs`, `shared/model-context.mjs`.
- Chat persistence/API: `services/chat/src/services/conversation.repository.ts`, `services/chat/src/services/session.service.ts`, `services/chat/src/routes/chat.routes.ts`, `services/chat/src/services/__tests__/assets.test.ts`.
- Frontend upload and state: `user-frontend/src/components/builder/ChatAttachments.tsx`, `user-frontend/src/components/builder/ChatPanel.tsx`, `user-frontend/src/utils/prepareDocumentAsset.ts`, `user-frontend/src/api/ai.ts`, `user-frontend/src/types/index.ts`, `user-frontend/src/store/chatStore.ts`, `user-frontend/src/store/documentStore.ts`, `user-frontend/src/store/__tests__/chatStore.test.ts`.
- Preview/download: `user-frontend/src/components/builder/InvoiceCanvas.tsx`, `user-frontend/src/components/builder/DocumentPreview.tsx`, `user-frontend/src/pages/BuilderPage.tsx`, `user-frontend/src/utils/pdfDownload.ts`, `user-frontend/src/utils/__tests__/pdfDownload.test.ts`, `user-frontend/src/store/__tests__/documentExport.test.ts`.
- Native PDF integration: `services/document/app/routers/document.py`, `services/document/app/services/sidecar.py`, `services/document/app/workers/pdf_worker.py`, `services/document/puppeteer/server.ts`, `services/document/tests/test_generation_integration.py`.

No database migration, deployment, destructive database operation, provider request, provider-account change, or quota increase was needed for these controls. Native localhost services remain in use; unrelated working-tree changes were preserved.

### Verification and actual results

- `npm run test:chat`: **223 Node shared tests + 193 Vitest tests = 416 passing**. New regressions cover format/size checks, proportional and non-overlapping placement, upload transactions, rollback of success acknowledgements, ownership, stale revisions, idempotency, replacement/removal, session restoration, preserved fields and pending retry, artwork in approval fingerprints, safe document reuse, direct PDF approval, guest store-level blocking, storage failures, and edits during capture.
- `/tmp/doccraft-local-py313/bin/python -m pytest services/document/tests -q`: **57 passing**, including authoritative artwork passed to the PDF worker instead of client-injected media.
- Frontend, chat-service, and document-sidecar TypeScript/production builds pass. Vite reports the existing large-chunk/dynamic-import warnings. `git diff --check` passes.
- A real guest identity and isolated native PostgreSQL-backed invoice verified **+ upload → committed snapshot → browser preview → refresh restoration**. A 480 × 120 logo appeared as 120 × 30 without covering sender, client, or financial fields. Distinct sender/client phones remained `0771234567` / `0712345678`; two LKR 100,000 items with 10% discount retained total **LKR 180,000.00**. Guest Download was disabled. No `/message` AI request occurred. Verified session: `49ff5d41-4336-4f34-9bff-7661ed2a444e`; screenshot: `/tmp/doccraft-assets-guest-preview.png`.
- An isolated signed-in **browser/API fixture** clicked the actual Download button and saved a real, single-page **235,963-byte PDF** containing the logo. It made one direct confirmation write, zero chat-agent calls, and zero document-generation calls. This is frontend/export verification with fixture authentication/API responses, not a claim that a real registered account or live provider was exercised. Artifact: `/tmp/doccraft-direct-download/DocCraft-invoice-9152.pdf`. Backend confirmation/ownership/persistence paths are separately covered by repository and route integration tests.
- The native Python/Puppeteer renderer independently produced a **single-page, 83,427-byte PDF**, with one embedded logo image, preserved invoice text and LKR 180,000.00 total. Pixel inspection confirmed the uploaded logo is present in both PDF outputs. Artifacts: `/tmp/doccraft-native-artwork.pdf`, `/tmp/doccraft-native-artwork-preview.png`. Browser harness: `/tmp/doccraft-assets-browser.mjs`.
- Logs: `/tmp/doccraft-assets-tests.log`, `/tmp/doccraft-assets-python-tests.log`, `/tmp/doccraft-assets-build.log`, `/tmp/doccraft-assets-chat-build.log`, `/tmp/doccraft-assets-document-build.log`.

### Remaining limits

The upload menu supports raster artwork, not SVG, PDF attachments, or extracting text from files. A document supports six bounded images; detailed large images are downscaled. Automatic placement is recalculated on restoration and document changes; manual placement/style overrides retain the editor's existing session-local behavior. Completed conversations must first be opened as an editable revision to add new artwork. Native server template geometry can differ from the interactive canvas, so it calculates placement against its own layout; the Download button captures the current canvas directly.

## Downloaded invoice alignment correction (2026-10-14)

Inspected `/home/eranda/Downloads/DocCraft-invoice-5020.pdf`. It contained an A4 raster page whose text was displaced downwards: the Account Data caption reached the banner's lower edge, table headings crowded their separator, and the footer address was clipped at the page boundary.

The installed html2canvas renderer measures font baselines using an invisible one-pixel image placed beside sample text in the source document. Tailwind's global `img { display: block }` reset put that measurement image on another line, producing an incorrect baseline for every text run. Waiting for fonts alone did not correct that measurement.

Implemented `user-frontend/src/utils/exportFontMetrics.ts`, which temporarily restores inline display only for the renderer's hidden one-pixel measurement image. Visible artwork retains its existing display and dimensions. The style is removed after capture, including capture failures. Applied this correction to both PDF canvas capture paths, HTML fallback capture, and image-export capture in `documentStore.ts` and `BuilderPage.tsx`. The HTML fallback container now uses the document's page width. No document fields, template coordinates, totals, approval requirements, or guest download policy were changed.

Added `user-frontend/src/utils/__tests__/exportAlignment.test.ts`, a real Chromium regression that compares browser screenshot text positions with exported raster text positions under the app's block-image reset. It reproduces the original downward displacement, verifies corrected top/bottom text alignment within one pixel, checks that artwork display is preserved, and verifies cleanup after a failure. Updated the document-export unit fixture to support the temporary measurement stylesheet.

Verification:

- `npm run test:chat`: **223 shared tests + 194 Vitest tests = 417 passing**.
- `npm run build --prefix user-frontend`: passes, with the existing Vite chunk/dynamic-import warnings.
- `git diff --check`: passes.
- A read-only query identified the matching saved invoice (`859c8cb5-cb04-499d-b5ac-b8199869e355`). An isolated browser authentication/API fixture loaded that authoritative saved snapshot into the actual Builder and clicked Download. It made no document-state mutation or AI request. The original source values and **LKR 176,850.00** total were preserved.
- Exported at **100% and 175% preview zoom**, with the header selected in the second capture. Both PDFs are single-page A4 (595.28 × 841.89 points). Their embedded page images have identical SHA-256 hashes, confirming zoom and selection do not shift exported content.
- Rendered and visually checked the corrected PDF: the banner caption is centered within its band, table headings and rows have clear spacing, and both footer address lines fit within the page.

Corrected copy: `/home/eranda/Downloads/DocCraft-invoice-5020-aligned.pdf` (**285,973 bytes**). The original PDF was preserved. Browser harness: `/tmp/doccraft-download-alignment.mjs`; screenshot/render: `/tmp/doccraft-alignment-preview.png`, `/tmp/doccraft-aligned-user-page.png`. Logs: `/tmp/doccraft-alignment-browser.log`, `/tmp/doccraft-alignment-tests.log`, `/tmp/doccraft-alignment-build.log`.
