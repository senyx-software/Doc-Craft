# Chat-based document editing fixes

Implemented and verified on 2026-10-13. This follows the field collection, template validation and finalization work in [INTELLIGENT_FIELD_COLLECTION_IMPLEMENTATION.md](INTELLIGENT_FIELD_COLLECTION_IMPLEMENTATION.md). Existing APIs, Prisma models and invoice design remain in use. Unrelated workspace changes were preserved.

The subsequent provider-context, interrupted-turn retry and pasted-table fixes are documented in [PROVIDER_RETRY_FIX_IMPLEMENTATION.md](PROVIDER_RETRY_FIX_IMPLEMENTATION.md), including updated verification results of 339 passing tests. Counts below describe this editing checkpoint.

## Root causes

- Historical contact extraction could reuse an older unlabeled phone number while collecting another party's details. Missing-field recovery did not establish ownership. The screenshot's saved session confirmed that the business number had been assigned to the client field.
- A provider could ask a replacement question without persisting the proposed replacement. A subsequent `no` then had no authoritative clarification to reject.
- Literal-evidence checks rejected notes and banking values after the provider reformatted them. Provider loops could also end after the first successful tool batch, leaving later clauses unprocessed.
- Per-turn responses retained obsolete rejected tool receipts even after the provider repaired the same field. This could produce contradictory success/failure acknowledgements or unnecessarily prevent review.
- Optional deletion lacked a durable cleared marker, allowing older historical evidence to restore a removed value. Legacy formatted slots could also disagree with their field-state normalized values.
- Late SSE, semantic-edit and review callbacks could apply an older revision to the document preview. The PDF template's Notes spacer differed from the canvas layout.

## Authoritative processing flow

1. Load the owned persisted session, template requirements, revision and pending clarification.
2. Interpret explicit field commands using schema aliases and party ownership. Extract all recognized updates and retain their literal source spans. Send unresolved natural-language clauses through the existing structured AI/MCP extraction path.
3. Validate every candidate independently. Business fields and recipient fields require appropriate ownership; older unlabeled contacts cannot establish ownership. A bare phone without a trustworthy target creates a persisted business/client clarification.
4. Merge valid changes, preserving unrelated fields. Explicit corrections replace the targeted value; other conflicting values create a saved choice. `no` retains the prior value; `yes` or `change it` resolves the saved choice.
5. Apply field-specific formatting. Preserve phone/account identifiers and leading zeros, email local parts, confirmed brands and address identifiers. Normalize ordinary name casing, address labels/whitespace, sentences and banking display text. Changes to spelling or geographic meaning require confirmation.
6. Persist through the existing fenced, revision-checked session pipeline. Optional removals retain provenance and a cleared marker; mandatory removals are refused. Independently valid updates still persist if another field is invalid or unresolved.
7. Build acknowledgements from committed results, using the latest outcome for each field while retaining the full audit trail. Reevaluate missing required fields from the selected template rather than a frontend question order.
8. Return the authoritative snapshot over SSE. Frontend revision checks prevent older callbacks from refreshing or approving newer state. The same snapshot feeds canvas/HTML rendering and persisted document generation.
9. Finalization still requires complete validated fields and explicit approval of the current template/value fingerprint. Corrections invalidate approval. Decimal-safe calculations and server-side snapshot checks remain enforced.

## Backend, schema and mapping changes

- `senderPhone` and `clientPhone` remain separate canonical fields, with explicit entity-aware evidence checks. The same rule applies to addresses and emails.
- `accountData` is a compatible alias for the existing authoritative `accountDetails` field. Banking details are stored as formatted text, such as `BOC, Panadura, Account: 007903232`; no database migration or separate banking columns were added.
- `notesAndTerms` uses sentence formatting; `accountDetails` uses banking formatting. Schema edit aliases include company/business contact, recipient/customer contact, notes and bank details. Unique field-label typos such as `detalis` can resolve to the schema label; user-provided names are not dictionary-corrected.
- Provider-supplied formatted evidence is accepted only when an actual user span proves the value or a deterministic formatting equivalent. Invented bank expansions and truncated account identifiers are rejected.
- Groq and Claude can continue through multiple update batches and repair typed extraction errors. Genuine persistence failures still terminate and cannot produce a saved-field acknowledgement.
- Odoo sender/recipient bindings were verified independently. The PDF Notes spacer now matches the existing lower-page Notes placement; the teal layout and footer remain intact.
- Gateway transport was inspected; the existing API and SSE relay remain in use.

## Modified files in this follow-up

| Area | Files |
| --- | --- |
| Shared schema and engine | `shared/document-contract.json`, `shared/field-edits.mjs`, `shared/field-processing.mjs`, `shared/field-processing.d.mts`, `shared/conversation-state.mjs`, `shared/conversation-state.d.mts` |
| Chat extraction and integration | `services/chat/src/services/context.service.ts`, `mcp.service.ts`, `groq.service.ts`, `claude.service.ts`, `services/chat/src/routes/chat.routes.ts` |
| Frontend synchronization | `user-frontend/src/store/chatStore.ts` |
| Invoice PDF layout | `services/document/app/templates/invoice/odoo-community.html` |
| Shared regression tests | `shared/tests/chat-field-edits.test.mjs`, `conversation-state.test.mjs`, `response-intelligence.test.mjs` |
| Chat integration/provider tests | `services/chat/src/services/__tests__/fieldWorkflow.test.ts`, `groq.test.ts`, `claude.test.ts`, `responseIntelligence.test.ts` |
| Frontend/document tests | `user-frontend/src/store/__tests__/chatStore.test.ts`, `services/document/tests/test_field_workflow.py` |
| Documentation | This report and the follow-up link in `INTELLIGENT_FIELD_COLLECTION_IMPLEMENTATION.md` |

The earlier report lists the broader field-validation, template registry, persistence, document-generation and UI approval changes already completed before this follow-up.

## Before and after

**Separate contact owners**

Before: a client phone could be compared with a business phone recovered from older conversation history.

After: `business phone is 0382298760 and client phone is 0741234567` persists two independent values. `Change my business phone to 0771234567` changes only `senderPhone`. The preview retains client phone `0741234567`.

**Compound note and bank update**

Before: `add note valid 30 days add my bank details boc panadura 7903232` failed literal validation and requested exact values again.

After: the note becomes `Valid for 30 days.` and payment information becomes `BOC, Panadura, Account: 7903232`. Both persist in the same turn. A supplied account `007903232` retains its leading zeros. The same behavior was verified through the actual AI provider for the less explicit clause `add BOC Panadura account 007903232`.

**Address formatting**

Input: `senyx software, address no 40/20, sagabo mawatha, diggala, keselwatta, panadura` with confirmed brand `SENYX`.

Output: `SENYX Software, No. 40/20, Sagabo Mawatha, Diggala, Keselwatta, Panadura`.

An unsplit locality such as `keselwattapanadura` is capitalized without inventing geographic boundaries. A proposed split must be confirmed.

**Reject, remove and restore**

A proposed different client phone creates a persisted choice. Refresh followed by `no` retains the original. `Remove the client phone number` clears the optional field and its preview binding, preserves the business phone, and prevents older history from silently restoring the removed value.

**Partially valid message**

`Change client phone to 123, change notes to payment within 30 days` preserves the previous valid phone, saves `Payment within 30 days.`, and reports the invalid phone without discarding the note.

## Verification

- `npm run test:chat`: **142 shared tests and 127 Vitest tests passed** across 20 Vitest files.
- `/tmp/doccraft-local-py313/bin/python -m pytest services/document/tests -q`: **50 passed**. Total automated coverage: **319 passing tests**.
- Chat TypeScript and user frontend production builds passed. The existing frontend bundle-size warning remains.
- `git diff --check` passed.
- Route integration tests exercise extraction, persisted restoration, correction, rejection, removal, independent partial updates, template requirements, review approval and frontend HTML/canvas population. Provider tests cover multiple tool batches and extraction repair; frontend tests cover stale callback protection. Python tests verify actual template mappings and arithmetic parity.
- A real localhost conversation collected a complete Odoo invoice, saved distinct phone numbers and compound notes/payment information, corrected business phone and client address, restored a pending choice after refresh, rejected it, removed/re-added an optional contact, and confirmed the current document.
- The real queue-generated PDF completed successfully: `services/document/storage/bd4c1b1b-7c16-5882-8e8f-01e4b931235a.pdf`. Browser verification loaded the saved session, inspected the invoice canvas, reloaded the page and checked the successful document response. Session revision was 37. Browser evidence: `/tmp/doccraft-chat-edit-browser-result.json` and `/tmp/doccraft-chat-edit-preview.png`.
- The current Odoo template, including its Notes placement adjustment, was additionally rendered through the native Puppeteer service. `/tmp/doccraft-chat-edit-verified.pdf` was checked as one page with correct names, business phone `0771234567`, client phone `0741234567`, corrected client address, account `007903232`, note and `99,000.00` total. The old business number was absent.
- An actual external AI-provider call successfully extracted the compound semantic banking clause and returned a truthful persisted acknowledgement. Evidence: `/tmp/doccraft-live-semantic-edit.log`. Mock-provider tests are separate from this live check.
- Native localhost endpoints returned HTTP 200 for gateway 3001; auth 3011; notification 3012; document 3013; payment 3014; quota 3015; chat 3016; analytics 3017; admin API 3018; user frontend 5173; admin frontend 5174; and Puppeteer 3023. Application services run as native processes, without Docker. The existing configured PostgreSQL connection remains in use; this does not claim that database infrastructure was migrated.

## Remaining limits

- Unresolved natural-language extraction depends on the configured AI provider. A provider outage returns a recoverable error while preserving committed facts; it cannot guarantee every possible phrasing.
- Geographic boundaries and unfamiliar brand spelling cannot be inferred safely without evidence. Existing incorrectly assigned legacy contacts require an explicit correction; the system does not guess their intended owner.
- Validation checks syntax, amounts and document consistency, not mailbox deliverability, phone ownership or bank-account authenticity.
- Custom mandatory fields must be declared in the shared contract/template schema. Currency precision, supported locales and percentage-discount support remain as documented in the earlier report.
- These local integration, live-provider, browser and PDF checks verify the described behavior; they do not constitute a production load or availability certification.
