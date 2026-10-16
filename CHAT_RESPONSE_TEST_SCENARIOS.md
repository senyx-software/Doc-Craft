# DocCraft Chat Response Regression Scenarios

Design date: 2026-10-13. These are proposed regression specifications, not implemented fixes. Current isolated reproduction results are in [CHAT_RESPONSE_INTELLIGENCE_AUDIT.md](CHAT_RESPONSE_INTELLIGENCE_AUDIT.md). Expected behavior below describes the target; several cases intentionally fail current code.

## Safe fixtures and harness

Use synthetic user `u`, isolated session `s`, ACTIVE invoice with **READY** values: businessName Nexora; clientName Acme Corp; invoiceNumber INV-1; issueDate 2026-10-13; dueDate 2026-11-13; currency LKR; lineItems `[ {id:app, description:mobile app, quantity:1, unitPrice:99000} ]`; taxRate 0. Sender/client contacts, addresses and notes are absent unless specified. **PARTIAL** is the same fixture with the named required fields removed; an empty fixture is explicitly stated. Use stable UUID turn IDs and a clock/timezone fixed per case.

- Use Fastify inject with mocked identity/quota/limiter, mock every provider fetch/SDK call and analytics call, and connect real MCP through InMemoryTransport.
- Wire BOTH route repository and MCP `conversations` to the isolated repository. Route options alone do not inject storage into createMcpServer. Mock db/redis/env imports before evaluating application modules.
- Use MemoryDatabase for basic transactional/turn tests; extend or replace its findMany behavior for role, chronological ordering and keyword predicate tests. Its serialized transaction behavior is not a PostgreSQL contention test.
- Test gateway with fake Express request/response and mocked fetch streams; test readChatStream with fragmented ReadableStreams and wrong session/turn IDs. Verify store canvas-refresh arguments separately.
- Mock document-service HTTP, ORM session, queue, storage, sidecar and notifications. Queue/job tests must not send mail, create production documents or consume shared quota.
- Use fake timers/deferred promises for timeout, cancellation and session-switch interleavings. Flush only the relevant effects. Use independent fixtures/reset mocks for each case.
- Assert **intent, per-operation result, authoritative slots/metadata/revision, exact grounded response, displayed text and preview data**. Do not only assert that the response is nonempty or the next field changed. Changed-value acknowledgements must correspond to durable commits.
- Test each supported document type where relevant: invoice, quotation, proposal, receipt, purchase_order. Add positive/negative owner and required/conditional-field variants.
- File locations marked **proposed** do not currently exist. Existing files are extension targets; no application test source was edited during this audit.

## Conversation test cases

### T01 — Add an address after required fields are complete

- **Initial state:** READY with senderAddress absent.
- **User input / sequence:** `add my business address`
- **Expected intent:** request_field(senderAddress)
- **Expected state changes:** Persist pending optional intent; leave confirmed required slots unchanged; dataValid stays true, canGenerate follows pending-edit policy.
- **Expected assistant behavior:** Ask for the business address directly.
- **Failure conditions:** Generic completion reply; provider needed merely to phrase this supported request; required fields cleared.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T02 — Provide the address in the next message

- **Initial state:** T01 pending intent, serialized and restored before reply.
- **User input / sequence:** `address no 40/20, sagabo mawatha, diggala keselwattapanadura`
- **Expected intent:** provide_value(senderAddress)
- **Expected state changes:** Save no 40/20, sagabo mawatha, diggala keselwattapanadura; retain spelling/joined locality; clear pending intent; revision advances; preview receives same value.
- **Expected assistant behavior:** Acknowledge a committed business address and continue review.
- **Failure conditions:** Invented city/postcode/country; irrelevant question; retry error on a valid local path; acknowledgement without durable commit.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts

### T03 — Update an existing business address

- **Initial state:** READY with senderAddress=Old address.
- **User input / sequence:** `add my business address → My address is No 40/20, Sagabo Mawatha`
- **Expected intent:** request_update then correct senderAddress
- **Expected state changes:** Inspect known address first; persist scoped update intent; replace the value on next unambiguous answer.
- **Expected assistant behavior:** Offer to update the existing address, then acknowledge the committed replacement.
- **Failure conditions:** Treat as permanently missing; append to old address; restart required collection; reject because document already ready.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T04 — Correct company name

- **Initial state:** READY with Nexora.
- **User input / sequence:** `Change the business name to Nexora Technologies`
- **Expected intent:** correct businessName
- **Expected state changes:** Replace only businessName with exact casing; track operation/source and revision; totals/address remain unchanged.
- **Expected assistant behavior:** Confirm the new saved name without asking it again.
- **Failure conditions:** Old name persists despite accepted correction; name absorbs command text; unrelated fields change; readiness blocks conversation.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T05 — Add another line item with missing components

- **Initial state:** READY has item app quantity 1/price 99000.
- **User input / sequence:** `Add another service for 25000 → Consulting → 1`
- **Expected intent:** add_item with missing description/quantity
- **Expected state changes:** Mock provider proposes a partial item with price 25000 and no invented description/quantity; retain existing item; persist partial operation; finalize once clarified.
- **Expected assistant behavior:** Ask only for unresolved description/quantity, then confirm added Consulting.
- **Failure conditions:** Default quantity or fabricated service; overwrite existing item; repeat already-known price; duplicate on retry.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts; services/chat/src/services/__tests__/groq.test.ts

### T06 — Remove second line item

- **Initial state:** READY has stable IDs app and consulting.
- **User input / sequence:** `Remove the second item`
- **Expected intent:** remove_item(consulting)
- **Expected state changes:** Model maps ordinal against the current item ordering/revision; remove consulting only; recompute totals.
- **Expected assistant behavior:** Acknowledge removal of the identified service.
- **Failure conditions:** Delete wrong item; remove without explicit intent; leave total stale; append a replacement; generic no-change completion.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T07 — Change an item price

- **Initial state:** READY app=99000 and consulting=25000.
- **User input / sequence:** `Change the first item price to 88000`
- **Expected intent:** update_item(app.unitPrice)
- **Expected state changes:** Replace app price only; preserve quantity/description/second item; recompute monetary totals using canonical rounding.
- **Expected assistant behavior:** Confirm the changed price and relevant item.
- **Failure conditions:** Append third item; change quantity/name; claim saved on failed tool; use arbitrary occurrence of a number as sufficient role evidence.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T08 — Ask for document summary

- **Initial state:** READY; repeat with PARTIAL containing name/items but missing date/currency.
- **User input / sequence:** `Summarize the document`
- **Expected intent:** summary
- **Expected state changes:** No slot mutation; produce snapshot-backed summary of known facts, totals only if valid, and missing details if partial.
- **Expected assistant behavior:** Direct concise summary rather than another collection/completion template.
- **Failure conditions:** Provider summary discarded; guessed missing details; summary unavailable until ready; raw JSON dump only.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; proposed shared/tests/response-plan.test.mjs

### T09 — Ask for generation

- **Initial state:** READY, no pending turn/edit; repeat with PARTIAL and completed generation job.
- **User input / sequence:** `Generate the invoice`
- **Expected intent:** generate
- **Expected state changes:** Authorize session, use committed revision, invoke mocked existing generation service once or return a typed action for it; record queued artifact/job identity. PARTIAL must not queue.
- **Expected assistant behavior:** Say queued/generating until worker reports success; then offer the actual artifact. If incomplete, explain the specific missing requirements.
- **Failure conditions:** Generic review sentence; false generated claim on queue acceptance; guessed client slots; duplicate job on retry; mark conversation read-only merely because data is ready.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; services/document/tests/test_generation_integration.py; proposed user-frontend/src/components/builder/__tests__/conversationActions.test.tsx

### T10 — Ask unrelated question while a field is missing

- **Initial state:** PARTIAL businessName missing; repeat when READY.
- **User input / sequence:** `Tell me a joke; What is VAT?`
- **Expected intent:** temporary_topic or question
- **Expected state changes:** No businessName/address/item mutation; keep the document question/pending intent available without assigning the entire message to it.
- **Expected assistant behavior:** Brief relevant answer or document-scoped clarification according to product topic policy.
- **Failure conditions:** Tell me a joke saved as company name; correct provider reply overwritten; invented tax advice inserted into document fields.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T11 — Provide several fields together

- **Initial state:** PARTIAL empty or READY needing explicit corrections.
- **User input / sequence:** `My company is Nexora, client name is Acme Corp, business phone is 0771234567, business email is hello@example.com`
- **Expected intent:** provide_multiple_fields
- **Expected state changes:** Save four canonical fields from their separate spans in one committed outcome; no service/line-item fabrication. Also test My phone is 0771234567 and email is hello@example.com under known sender-contact intent.
- **Expected assistant behavior:** Acknowledge saved fields once and ask only genuinely missing data.
- **Failure conditions:** Only first field saved; phone/email become name; roles inferred without context; unsupported remainder ignored.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T12 — Recover from failed provider response

- **Initial state:** READY or PARTIAL; mock provider failure before tool, then after one real isolated tool commit.
- **User input / sequence:** `Use info@nexora.test for contact → Retry response with same turnId`
- **Expected intent:** provide_information then recover_turn
- **Expected state changes:** Preserve existing slots and any committed senderEmail; one user message; retry only remaining work. Use a model-dependent wording to avoid deterministic bypass.
- **Expected assistant behavior:** Specific transient failure and whether the contact edit saved; eventual exact acknowledgement on recovery.
- **Failure conditions:** Empty-state reset; synthetic missing-name question; duplicate item/message; changed payload accepted under same turnId.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; services/chat/src/services/__tests__/groq.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts

### T13 — Recover from failed tool call

- **Initial state:** READY; mocked provider asks update_slots; repository or MCP returns validation/storage failure.
- **User input / sequence:** `Update my address to No 40/20, Sagabo Mawatha`
- **Expected intent:** correct senderAddress
- **Expected state changes:** For failed transaction retain old value. For a later failure after commit report committed revision separately. Reconcile same turn before retry.
- **Expected assistant behavior:** Report specific validation ambiguity or transient save failure without a false saved claim.
- **Failure conditions:** MCP isError ignored; rejected candidate has opaque success; old address removed on exception; repeated generic completion.
- **Suggested automated test location:** services/chat/src/services/__tests__/mcp.test.ts; services/chat/src/services/__tests__/groq.test.ts; services/chat/src/services/__tests__/intelligence.test.ts

### T14 — Restore session and interrupted workflow

- **Initial state:** Two isolated sessions; serialize `_chat` pending address/partial item/conflict/failed turn for session A.
- **User input / sequence:** `Load A history after simulated browser refresh → answer/retry`
- **Expected intent:** resume
- **Expected state changes:** Replace transcript, slots, field states, stage, readiness and pending turn; restore original turn ID; no B data contamination.
- **Expected assistant behavior:** Show actual saved context and actionable interrupted-turn recovery; accept following address without asking required fields again.
- **Failure conditions:** Stale currentField/summary; missing pending intent; fake session ID on failed history; private cross-owner data.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts

### T15 — Switch documents while a request is running

- **Initial state:** A invoice provider deferred; B receipt has distinct business, client, template and accent.
- **User input / sequence:** `Send in A → load B → resolve A`
- **Expected intent:** switch_document
- **Expected state changes:** Abort/fence A response; B slots/transcript/preview/metadata remain authoritative. Later reload A may show its independently committed data.
- **Expected assistant behavior:** No A reply appears in B; any cancellation is scoped to A.
- **Failure conditions:** Late A response or hydration writes change B; custom elements/documentId from A survive B.
- **Suggested automated test location:** user-frontend/src/store/__tests__/chatStore.test.ts; proposed user-frontend/src/store/__tests__/documentHydration.test.ts

### T16 — Continue after document readiness

- **Initial state:** READY ACTIVE session; distinct from COMPLETED.
- **User input / sequence:** `Client name is Acme → Change company name to Nexora Technologies → Add my business address`
- **Expected intent:** correct/request_field
- **Expected state changes:** Corrections and pending optional intent remain allowed; lifecycle stays ACTIVE; validity recomputed after edits.
- **Expected assistant behavior:** Relevant acknowledgement/question each turn; document ready does not end conversation.
- **Failure conditions:** Input disabled purely because ready; lifecycle automatically COMPLETED; every message gives generic review.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts

### T17 — Prevent repeated generic completion responses

- **Initial state:** READY, no state mutation needed.
- **User input / sequence:** `Summarize the document → Explain your previous response → What information is missing?`
- **Expected intent:** summary, clarify, status
- **Expected state changes:** No repeated field mutation; response plans differ by intent; status may legitimately say requirements are complete.
- **Expected assistant behavior:** Answer each request; completion notification occurs on transition/status intent, not every turn.
- **Failure conditions:** Exact completion sentence used for all three; same response despite relevant provider answers; repeated-name suppression is the only assertion.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; proposed shared/tests/response-plan.test.mjs

### T18 — Preserve correct response through every layer

- **Initial state:** READY; provider/plan returns a unique valid summary or explanation; stream split into arbitrary byte chunks.
- **User input / sequence:** `Explain the total; retry the same successful turnId after lost network response`
- **Expected intent:** question then replay
- **Expected state changes:** Persist one approved response; parser/store render exact final response; cached replay uses saved response even after other edits.
- **Expected assistant behavior:** Text equals the approved grounded answer, including any pertinent explanation.
- **Failure conditions:** Groq content discarded; route replaces answer; frontend synthesizes next question; replay changes acknowledgement; multiple assistant DB rows.
- **Suggested automated test location:** services/chat/src/services/__tests__/groq.test.ts; services/chat/src/services/__tests__/intelligence.test.ts; shared/tests/chat-stream.test.mjs; user-frontend/src/store/__tests__/chatStore.test.ts

### T19 — Remove an optional scalar

- **Initial state:** READY senderAddress populated.
- **User input / sequence:** `Remove my business address`
- **Expected intent:** clear senderAddress
- **Expected state changes:** Explicit authorized clear removes the scalar, clears pending intent and updates preview; retain required data.
- **Expected assistant behavior:** Confirm address removal; do not reprompt for an optional address unless requested.
- **Failure conditions:** Null interpreted as invalid update; skip leaves old value; placeholder/sample address appears on export.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/mcp.test.ts

### T20 — Change document type through chat

- **Initial state:** READY invoice with company/client/items.
- **User input / sequence:** `Change this to a receipt`
- **Expected intent:** change_document_type
- **Expected state changes:** Clarify whether to convert or create revision per product policy; use authorized current data; require receipt paymentMethod and conditional reference; choose compatible template.
- **Expected assistant behavior:** Explain the new type and request only new required fields.
- **Failure conditions:** Generic invoice completion; silent blank new session; invoice due date required on receipt; old type label rewrites company text.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; services/chat/src/services/__tests__/session.service.test.ts

### T21 — Clarify a previous reply

- **Initial state:** READY transcript includes an explanation and prior item question; pending intent restored.
- **User input / sequence:** `What did you mean by unit price?`
- **Expected intent:** clarify_previous
- **Expected state changes:** No field mutation; preserve pending question; use relevant prior assistant text/item.
- **Expected assistant behavior:** Explain unit price for that context and optionally return to the same question.
- **Failure conditions:** Text saved as address/name; unrelated completion response; older explanation unavailable with no graceful clarification.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; services/chat/src/services/__tests__/context.test.ts

### T22 — Reuse company details from a prior document

- **Initial state:** Current session partial; authorized source A and unauthorized source B; possibly multiple businesses.
- **User input / sequence:** `Use the same company details as before`
- **Expected intent:** reuse_business_details
- **Expected state changes:** Use only explicitly selected authorized confirmed business fields; no client/items/payment values copied unless separately requested. Clarify ambiguous source.
- **Expected assistant behavior:** Name source/business and copied field outcomes concisely.
- **Failure conditions:** Cross-user lookup; inferred personal name as business; hallucinated prior address; current confirmed override without correction.
- **Suggested automated test location:** services/chat/src/services/__tests__/session.service.test.ts; services/chat/src/services/__tests__/intelligence.test.ts

### T23 — Return to an earlier field

- **Initial state:** PARTIAL currently asks invoiceNumber; businessName already confirmed.
- **User input / sequence:** `Actually change the company name to Nexora Technologies`
- **Expected intent:** correct_prior_field
- **Expected state changes:** Change businessName only; retain current document-number pending question.
- **Expected assistant behavior:** Acknowledge correction and return to the genuinely missing reference.
- **Failure conditions:** Treat input as invoiceNumber; re-ask saved business name; overwrite unrelated data.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T24 — Process compound request and residual content

- **Initial state:** READY.
- **User input / sequence:** `Change business name to Nexora Technologies and client name is Acme Corp; Business name is Nexora, summarize the document`
- **Expected intent:** multiple_field_operations and summary
- **Expected state changes:** Save exact separate names; process summary even if a field is identical/conflicting; span coverage prevents command clauses becoming values.
- **Expected assistant behavior:** Resolve conflicts and answer summary rather than dropping residual request.
- **Failure conditions:** Contaminated businessName; recognized proposal suppresses all remaining intents; unsupported fragments falsely acknowledged.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T25 — Keep acknowledgements and topic changes out of pending fields

- **Initial state:** READY then pending senderAddress; repeat PARTIAL pending businessName.
- **User input / sequence:** `thanks; summarize this; remove the second item; cancel; Tell me a joke`
- **Expected intent:** acknowledge/summary/remove/cancel/topic
- **Expected state changes:** Do not save these as address or businessName; route intended operation and preserve or explicitly cancel pending intent.
- **Expected assistant behavior:** Contextual reply; targeted clarification only when truly ambiguous.
- **Failure conditions:** thanks becomes senderAddress; delete command saved as name; broad string validation treated as intent proof.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T26 — Accept identical pending answer and cancel edit

- **Initial state:** READY senderAddress=40/20, Sagabo Mawatha.
- **User input / sequence:** `add my business address → 40/20, Sagabo Mawatha; alternate branch: cancel address edit`
- **Expected intent:** confirm_unchanged or cancel_pending
- **Expected state changes:** Clear pending intent after identical valid answer/cancel; no unnecessary field revision/source replacement; readiness returns to review.
- **Expected assistant behavior:** Confirm existing address remains or edit cancelled, without asking address again.
- **Failure conditions:** pendingField cleared only when changed[] is nonempty; cancel offered as provider retry; pending address loops forever.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T27 — Keep readiness invariant across errors and restoration

- **Initial state:** READY; failed provider response with no slot updates, then history GET, store restore and generation validation.
- **User input / sequence:** `What is VAT? with injected provider failure → reload`
- **Expected intent:** question then recover
- **Expected state changes:** One invariant for dataValid/canGenerate/stage/pendingTurn on error SSE/history/store; committed slots retained.
- **Expected assistant behavior:** Specific failure; review can inspect facts; generation obeys recovery policy consistently.
- **Failure conditions:** Error snapshot says ready while history says not; input remains pending but Review enabled incorrectly; required slots appear missing.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts

### T28 — Explain rejected evidence and conservative address normalization

- **Initial state:** READY address absent; model tool proposes punctuation-normalized address with real source span.
- **User input / sequence:** `no 40/20 sagabo mawatha`
- **Expected intent:** provide_address with canonical source span
- **Expected state changes:** Either conservatively accept exact provided components or return a typed evidence/ambiguity rejection; no added geography. Include mixed accepted email/rejected address.
- **Expected assistant behavior:** Acknowledge only committed fields and identify unresolved address, rather than unrelated completion.
- **Failure conditions:** isError false with no rejection information; model claims normalized address saved when it was dropped; no-op reported as full request success.
- **Suggested automated test location:** services/chat/src/services/__tests__/mcp.test.ts; shared/tests/conversation-state.test.mjs

### T29 — Resolve weekday and relative-date corrections

- **Initial state:** READY; original turn reference 2026-10-13 Asia/Colombo; issueDate deliberately earlier; freeze retries across midnight.
- **User input / sequence:** `Change due date to next Friday; due date tomorrow; 14 days from issue; 14 days from now`
- **Expected intent:** correct_date with explicit anchor
- **Expected state changes:** Use documented weekday convention or ask one ambiguity question; current-date wording uses stable turn reference, issue-relative wording uses issueDate; unsupported local syntax may invoke semantic extraction.
- **Expected assistant behavior:** Confirm saved absolute date with concise anchor explanation when needed.
- **Failure conditions:** Local invalid extraction prevents provider; retry changes date; ambiguous next interpreted silently; issueDate change silently changes unrelated deadline.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts; services/document/tests/test_document_contract.py

### T30 — Validate complete item projection and provenance

- **Initial state:** READY app plus 100-item fixture and aggregate near contract maxSubtotal.
- **User input / sequence:** `Change first item price to 99000; Add Consulting quantity 1 price 1`
- **Expected intent:** update/add_item
- **Expected state changes:** Reject invented description on a price-only request; reject 101st item and subtotal overflow before commit; preserve old valid array. Also test two numbers whose roles are swapped.
- **Expected assistant behavior:** Specific rejected component/limit explanation; no saved claim for rejected projection.
- **Failure conditions:** Per-item-only validation commits invalid full array; description edit accepted without literal evidence; number occurrence suffices regardless of role.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/mcp.test.ts

### T31 — Clear required field and distinguish skip from removal

- **Initial state:** READY with dueDate and senderAddress.
- **User input / sequence:** `Clear due date; skip business address`
- **Expected intent:** clear required field; skip/cancel optional collection
- **Expected state changes:** Required clear makes data incomplete and requests date; define whether skipping populated optional means retain, omit or cancel, and communicate it. Never silently treat it as deletion.
- **Expected assistant behavior:** Accurate operation outcome and missing required question.
- **Failure conditions:** Null ignored without explanation; required skip accepted; old address silently retained despite promised omission.
- **Suggested automated test location:** shared/tests/conversation-state.test.mjs; services/chat/src/services/__tests__/intelligence.test.ts

### T32 — Stable operation identity and successful replay

- **Initial state:** READY, failed turn after item add.
- **User input / sequence:** `Retry same Add Design quantity 1 price 100 with reordered JSON/tool IDs; replay successful name correction after later edit`
- **Expected intent:** recover_operation/replay_turn
- **Expected state changes:** One item and user message; stable semantic operation ID dedupes equivalent serialization; changed payload rejected; original response replayed exactly with appropriate current snapshot.
- **Expected assistant behavior:** Original saved outcome shown without duplicated acknowledgement or effects.
- **Failure conditions:** Hash differs on key order; generated ID depends on length; another item appended; replay synthesizes a new generic reply.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; shared/tests/conversation-state.test.mjs

### T33 — Modify finalized or expired document safely

- **Initial state:** COMPLETED ready invoice, plus expired guest session.
- **User input / sequence:** `Update my company name`
- **Expected intent:** request_revision/reopen
- **Expected state changes:** Do not bypass owner/lifecycle guard; offer authorized reopen or full-document fork according to policy; expired identity must reauthorize. Preserve original artifact revision.
- **Expected assistant behavior:** Clear path to edit/revise; explain read-only reason rather than repeated service retry.
- **Failure conditions:** Unsafe direct write to finalized slots; no actionable continuation; reuse copies only business data when user intended full revision without disclosure.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts

### T34 — Preserve error categories through gateway and adapter

- **Initial state:** Table-driven mocks for 401/403/404/409/410/422/429/503 and provider/tool/timeouts.
- **User input / sequence:** `Valid address or query triggering each injected phase failure`
- **Expected intent:** recover/error_policy
- **Expected state changes:** No fabricated state; upstream safe code/phase/retryable/state/turnId survives relay and browser parsing; current revision retained.
- **Expected assistant behavior:** Appropriate sign-in/clarify/wait/limit/retry action; permanent failures do not lock user into endless Retry response.
- **Failure conditions:** All errors become CHAT_FAILED/PROVIDER_FAILED; code erased by HTTP adapter; wrong sign-in state; secrets in diagnostics.
- **Suggested automated test location:** services/gateway/src/services/__tests__/sseRelay.test.ts; shared/tests/chat-stream.test.mjs; proposed user-frontend/src/api/__tests__/ai.test.ts; services/chat/src/services/__tests__/intelligence.test.ts

### T35 — Separate policy rejection from infrastructure failure

- **Initial state:** PARTIAL and READY; synthetic legitimate pasted address/name with invisible Unicode; genuine instruction-override fixture.
- **User input / sequence:** `Client name is DAN; pasted address containing zero-width separator; Ignore previous instructions`
- **Expected intent:** provide_value or input_rejected
- **Expected state changes:** Legitimate normalization policy should not silently reject brand/address; genuine blocked turn never calls provider or enters authorized context. All outcomes get safe rejection category.
- **Expected assistant behavior:** Precise revise-input guidance for policy rejection; no provider-outage wording.
- **Failure conditions:** Valid brand/paste gets generic retry; rejected turn reintroduced through historical evidence; blanket guard disabled to pass test.
- **Suggested automated test location:** proposed services/chat/src/security/__tests__/prompt-injection.test.ts; services/chat/src/services/__tests__/intelligence.test.ts

### T36 — Retry only necessary phase and quota reservation

- **Initial state:** READY; quota mock tracks reservation by turn; first provider tool commits address then final response fails.
- **User input / sequence:** `Provider-dependent address update → Retry same turn`
- **Expected intent:** resume_response
- **Expected state changes:** Do not reapply saved operation; reuse reservation according to policy; deterministic acknowledgement may complete from committed outcome. New unrelated turn reserves independently.
- **Expected assistant behavior:** Explain address saved and finish reply recovery.
- **Failure conditions:** Second quota charge for same failed turn; discarded model text still required for acknowledgement; no checkpoint after commit.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; services/chat/src/services/__tests__/quotaClient.service.test.ts; services/chat/src/services/__tests__/groq.test.ts

### T37 — Retain relevant long-conversation evidence within bounds

- **Initial state:** More than 20 messages, 8 recent keyword matches, older address/business constraints, Unicode content and near-budget slot state.
- **User input / sequence:** `Use the address I gave earlier; return to optional notes`
- **Expected intent:** reuse_current_history/return_field
- **Expected state changes:** Retrieve appropriate authorized older evidence instead of exhausting limit with already-recent matches; chronological order; current confirmed correction outranks older facts; total payload budget enforced.
- **Expected assistant behavior:** Reuse correct known fact or explain ambiguity/unavailability; never invent missing facts or discard confirmed slots.
- **Failure conditions:** Older fact filtered out because match limit contains recent messages; character-only budget throws opaque error; older evidence overwrites confirmed value.
- **Suggested automated test location:** services/chat/src/services/__tests__/context.test.ts; services/chat/src/services/__tests__/intelligence.test.ts

### T38 — Make Review visibly useful

- **Initial state:** Active BuilderPage with READY and PARTIAL session; summary mock available.
- **User input / sequence:** `Click Review; ask Show what we have so far`
- **Expected intent:** review/summary
- **Expected state changes:** No unnecessary slot mutation; render summary in current builder surface with committed values and unresolved requirements.
- **Expected assistant behavior:** Visible review and actionable generation/edit choices.
- **Failure conditions:** Only store.summary changes with no visible consumer; component gated by no previewHtml while preview already exists; raw implementation JSON in normal flow.
- **Suggested automated test location:** proposed user-frontend/src/components/builder/__tests__/review.test.tsx; services/chat/src/services/__tests__/intelligence.test.ts

### T39 — No sample values in real preview/export

- **Initial state:** READY with all optional contact/address fields absent; iterate HTML/canvas/server templates.
- **User input / sequence:** `Generate/preview/export current document`
- **Expected intent:** review/generate
- **Expected state changes:** Missing optional values are omitted or clearly editor-only placeholders; actual saved address appears identically after T02.
- **Expected assistant behavior:** Preview accurately reflects saved data.
- **Failure conditions:** 4945 Forest Avenue or sample email/phone on real HTML/PDF; HTML and canvas disagree about business identity/address; editor placeholders included in export.
- **Suggested automated test location:** proposed user-frontend/src/utils/__tests__/documentRendering.test.ts; services/document/tests/test_generation_integration.py

### T40 — Escape user-controlled markup

- **Initial state:** READY businessName/notes/address contain harmless markup and non-executing event-attribute fixture strings.
- **User input / sequence:** `My company is <b>Audit marker</b>`
- **Expected intent:** provide_literal_text
- **Expected state changes:** Store literal data without executing it; every HTML sink escapes data; any supported markdown allows only approved tags/attributes.
- **Expected assistant behavior:** Normal acknowledgement; safe literal document rendering.
- **Failure conditions:** Raw tag/event-bearing string enters dangerouslySetInnerHTML; unsafe link protocol; sanitizer corrupts ordinary ampersands; tests execute payload against a real account.
- **Suggested automated test location:** proposed user-frontend/src/utils/__tests__/documentRendering.test.ts; proposed isolated browser preview test; services/document/tests/test_generation_integration.py

### T41 — Keep literal words unchanged across document types

- **Initial state:** quotation/proposal/receipt/purchase_order fixtures with businessName=Invoice Solutions and service Invoice integration.
- **User input / sequence:** `Switch document type or preview`
- **Expected intent:** change_type/review
- **Expected state changes:** Type labels change; user names/descriptions/notes/reference strings stay exact in HTML, element canvas and server output.
- **Expected assistant behavior:** Acknowledged type with unchanged literal facts.
- **Failure conditions:** Quotation Solutions replaces company name; invoice keyword replaced inside service/HTML attributes; canvas text mutation without DB mutation.
- **Suggested automated test location:** proposed user-frontend/src/utils/__tests__/documentRendering.test.ts; services/document/tests/test_generation_integration.py

### T42 — Pure document hydration on history restore

- **Initial state:** A and B distinct templates/accents/document IDs; B accent null; defer template import/write and switch.
- **User input / sequence:** `Load A → Load B`
- **Expected intent:** restore
- **Expected state changes:** Use pure setters; no PATCH caused by restore; reset absent accent/layout/documentId/custom elements; async work fenced to originating session.
- **Expected assistant behavior:** B preview/style/state restored accurately, including read-only history.
- **Failure conditions:** A template written into B; PATCH during read-only load; stale generated docId retained; failed metadata promise unhandled.
- **Suggested automated test location:** proposed user-frontend/src/store/__tests__/documentHydration.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts

### T43 — Enforce advertised document-specific tool schema

- **Initial state:** Invoice and receipt in isolated MCP clients; malformed slots/skip/itemOperations payloads.
- **User input / sequence:** `Tool proposes unknown field, receipt-only field on invoice, forged pendingAnswer, cross-session argument`
- **Expected intent:** validated_operation
- **Expected state changes:** Reject unsupported keys/operations with typed reason; retain intentional documented aliases; no reserved `_chat` write; role/type membership enforced.
- **Expected assistant behavior:** Useful clarification for invalid data; successful result only for supported accepted/no-change outcome.
- **Failure conditions:** Unknown keys silently dropped; globally known but disallowed fields committed; cross-session read/write; runtime contract weaker than discovery.
- **Suggested automated test location:** services/chat/src/services/__tests__/mcp.test.ts; shared/tests/conversation-state.test.mjs

### T44 — Provider contract parity before switching providers

- **Initial state:** Same scoped tools and synthetic input; Groq mocked HTTP, Claude mocked client/stream.
- **User input / sequence:** `Read session state → propose correction → tool failure or normal final reply`
- **Expected intent:** question/correct with shared tool outcomes
- **Expected state changes:** Both adapters expose exact schema and permit get_session_state; never turn failed tool into approved save; preserve authoritative response and bounded cancellation.
- **Expected assistant behavior:** Equivalent relevant outcomes through backend plan.
- **Failure conditions:** Claude blocks discovered state tool; schema strips constraints; mapped model configuration not supported; false done after failed tool.
- **Suggested automated test location:** services/chat/src/services/__tests__/groq.test.ts; proposed services/chat/src/services/__tests__/claude.test.ts

### T45 — Measure intent relevance and failure phase without private values

- **Initial state:** Synthetic successful, rejected, discarded-answer, retry and interrupted conversations.
- **User input / sequence:** `Run T01/T08/T12/T24/T34 under telemetry spy`
- **Expected intent:** instrumentation
- **Expected state changes:** Metrics/logs contain IDs, intent, phase, revisions and operation statuses; no raw contacts/addresses/bank details/provider credentials. Compare success vs fulfilled-intent outcomes.
- **Expected assistant behavior:** No telemetry detail displayed to normal document user.
- **Failure conditions:** Only terminal success counted; silent rejection/discard invisible; duplicated metrics on cached replay; private input/tool state logged.
- **Suggested automated test location:** services/chat/src/services/__tests__/intelligence.test.ts; proposed services/chat/src/services/__tests__/conversationTelemetry.test.ts

### T46 — Validate terminal snapshot and response types

- **Initial state:** Valid current browser session/turn; mocked stream success with partial or incompatible state.
- **User input / sequence:** `Send a message; receive done with state={sessionId:s} or response of the wrong type`
- **Expected intent:** Transport validation and committed-turn reconciliation.
- **Expected state changes:** Reject malformed completion before statePatch; retain existing slots/transcript and stable turn ID; resolve saved outcome through authorized history if needed.
- **Expected assistant behavior:** Specific compatibility/incomplete-response recovery without invented missing fields.
- **Failure conditions:** Identity-only snapshot accepted; nextAction/schema access throws into opaque generic error; wrong response type rendered; fabricated state used to recover.
- **Suggested automated test location:** shared/tests/chat-stream.test.mjs; proposed user-frontend/src/api/__tests__/ai.test.ts; user-frontend/src/store/__tests__/chatStore.test.ts.

## Matrix extensions and verification status

For T12–T15/T18/T32/T34, cover failure before claim, after user persistence, before/after tool commit, before assistant finish and after finish but before successful browser completion. Check DB transcript and turn metadata independently of visible text. A canceled request may have a committed update; cancellation is not a rollback assertion.

For T05–T07/T30/T32, vary explicit add/update/remove, repeated same-description services, item IDs, reordered tool JSON, partial item replies, zero prices, invalid/nonfinite numbers, aggregate limits and ordinal ambiguity after a concurrent edit. Keep submitted operation identity distinct from model-generated tool-call identity.

For T02/T03/T25/T28, test informal Sri Lankan addresses, punctuation/case variants, joined localities, commas, multiline input and sender-versus-client ambiguity. The target is conservative text preservation, not invented geographic correction.

Existing validation run during the audit: `npm run test:chat` passed **63 shared tests and 57 Vitest tests**. A temporary `/tmp` suite passed **24 current-behavior assertions**, including one actual synthetic route/Groq/MCP persistence flow and 3 renderer checks. Those probes reproduce defects and are not a replacement for the desired assertions above. The document pytest suite could not initialize due to missing Pygments components; no Python test pass is claimed.

Review acceptance: all Critical/High findings must be mapped to passing desired-behavior tests before release, with current-behavior defect assertions inverted or replaced. Preserve existing authorization, explicit failure, revision/lease and no-fabricated-price tests. Live providers are unnecessary for deterministic orchestration regressions; controlled staging conversations should separately assess model extraction quality and deployed configuration after implementation approval.
