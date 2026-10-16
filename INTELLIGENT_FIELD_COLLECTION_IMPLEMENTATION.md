# Intelligent field collection implementation

Implemented and verified locally on 2026-10-13. Existing application APIs and layouts remain in use; the changes extend the shared field engine and persisted conversation metadata.

Follow-up contact ownership, natural-language editing, bank/note extraction and preview synchronization fixes are documented in [CHAT_EDITING_FIX_IMPLEMENTATION.md](CHAT_EDITING_FIX_IMPLEMENTATION.md), including the latest verification results: 319 passing automated tests and live browser/provider/PDF checks. Counts below describe the earlier implementation checkpoint.

## Audit findings

1. Completion used a document-wide list and did not consult the selected template. Prisma `document_types.slotSchema` is currently empty for the built-in types, and the Prisma Template model has no per-template requirement schema. Contact requirements and conditional payment/tax requirements therefore could not be enforced consistently.
2. Short lowercase multiword names and compact recipient/contact answers were not fully recognized locally. Label parsing could absorb a following question into a company name, leaving state and provider context inconsistent.
3. The field engine trimmed values and normalized dates/currencies, but had no field-specific capitalization or complete validation/confirmation provenance.
4. Conflicts existed, but there was no persisted spelling suggestion/choice mechanism. Replacing unfamiliar names based on a dictionary would be unsafe.
5. Ready fields could trigger generation without approval of the current values. Corrections and template changes were not tied to a review approval.
6. Some renderers contained decorative bank details, tax identifiers, recipient names and example line items. The server also forced recognized frontend template IDs to the classic PDF variant, including the Odoo template.
7. Preview money formatting used two decimals and a US locale everywhere. JavaScript already used decimal arithmetic for basic totals, but discounts and currency precision were missing, and Python formatting could disagree at rounding boundaries.

## Authoritative field and template definitions

`shared/document-contract.json` defines canonical fields, aliases, validation types, field-specific formatting strategies, party ownership, supported currencies/locales and conditional document requirements.

`shared/template-schemas.json` publishes 41 registered template IDs, including their slot definitions, supported document types, server variants, required fields and conditional rules. The document service imports this registry instead of maintaining a separate `TEMPLATE_DEFS` dictionary. Both chat and frontend completion use `templateSchema()` and `workflow()` from the shared contract. Python generation applies the same registry and required keys, with parity tests for monetary calculations.

Full invoice layouts require the existing invoice fields plus business address, recipient address, business email and business phone. Minimal layouts retain the smaller core schema. Account instructions become required for bank transfer/cheque; a tax rate becomes required when tax applicability is `taxable`. Receipt transaction-reference rules remain enforced. Known additional requirements from an actual document schema are merged with the template requirements; unsupported mandatory fields fail rather than disappearing.

No database migration is needed: session metadata persists the selected template and document schema alongside the existing JSON fields.

## Processing flow

1. Load the owned, persisted session and current template requirements.
2. Extract every recognizable field from the latest message, retaining raw evidence. Compact contact replies are scoped to the party being asked about; incomplete line items retain their known components without inventing quantity or price.
3. Resolve the conversational intent separately from the extracted values. Unresolved natural-language clauses use the existing provider/MCP integration, with literal user evidence and operation receipts.
4. Validate candidate syntax, numerical bounds, dates and date chronology. Detect contradictory tax applicability and rates. Reject unsupported fields or misplaced sender/recipient evidence.
5. Apply field-specific formatting: capitalize ordinary lowercase names/descriptions, preserve mixed-case brands and uppercase acronyms, normalize email domains while preserving local parts, retain identifiers, and normalize address whitespace. Explicit legal/exact spelling and confirmed spelling choices are preserved.
6. Keep ambiguous, invalid, conflicting and awaiting-confirmation values distinct from confirmed fields. Contextual near matches and provider spelling/capitalization suggestions create a persisted choice; they never silently rename a business or person.
7. Merge verified changes into the session, invalidate outdated review approval, calculate decimal-safe totals, and reevaluate missing fields from the selected template.
8. Choose the next unanswered required field or targeted clarification. Collection acknowledgements and next questions come from committed state; arbitrary semantic explanations still use the provider. A secondary grounding check rejects stale provider questions about accepted fields.
9. Restore this same state and pending questions after refresh. Existing turn fencing, deduplication and retry behavior remain in use.

Each processed field records its identifier, raw input, normalized value, validation status, confirmation status, source turn/message identifier, bounded source excerpt and update timestamp. Complete source messages remain in the persisted transcript.

## Review and generation

`readyToGenerate` describes field completion. `canGenerate` additionally requires persisted approval of the exact current type, template, requirements and normalized values. Review approval uses a canonical fingerprint and optimistic revision check; it cannot approve a changed document from a stale summary.

The Review panel now provides **Confirm document details**. Chat requests to generate first return a review and ask for confirmation; the confirming turn emits the stable generation action. Completion, server PDF generation, PDF export and image export all enforce the approval gate. Field corrections and template changes invalidate approval and clear stale review text. A client-supplied `confirmed: true` cannot bypass the server check.

The document service fetches the authorized saved chat state, verifies approval and the selected template, recalculates totals, and queues only that state. Odoo PDF generation now uses its actual registered server variant. Sender and recipient blocks remain separate. Empty drafts leave monetary amounts blank; legitimate zero-priced items still display zero. Decorative financial samples and missing-field placeholders have been removed from the relevant renderers.

Percentage discounts are calculated before tax. Line totals, discounts, tax and total use decimal-safe arithmetic with the currency's precision; JPY uses zero decimal places. Display dates use an explicitly selected date format. Supported locales are declared in the contract.

## Representative before/after examples

**Lowercase name**

- Before: `nexora` appeared in the document with inconsistent capitalization, and a provider could ask the name again.
- After: `nexora` is stored as raw input, normalized to `Nexora`, marked confirmed, and collection advances to the recipient.

**Several fields and incomplete item**

User: `my company name is nexora and client is john perera. invoice for website development 50000 lkr`

- Before: the client name could absorb the following invoice clause, or the service information needed another provider turn.
- After: company `Nexora`, recipient `John Perera`, currency `LKR`, description and price are recognized together. The item remains pending because quantity is unknown. The assistant asks: `What is the quantity for website development?`
- User: `1`
- Result: description `Website Development`, quantity `1`, unit price `50,000.00`; only the remaining template requirements are collected.

**Recipient contacts**

User, answering the recipient question: `John Perera, john@gmail.com, Colombo`

Result: all three recipient fields are saved together. They do not populate business email/address fields, and those recipient details are not requested again.

**Possible spelling error with context**

Previously confirmed business: `Nexora`. User: `Change company name to Nexroa`.

The assistant asks whether to use `Nexroa` or `Nexora`, keeping the prior verified value until a choice is supplied. Choosing the original spelling preserves `Nexroa` exactly. A new unfamiliar brand without contextual evidence is accepted rather than renamed by a dictionary.

**Finalization**

- All fields valid → review is available, approval remains false.
- `Generate the invoice` → a review and confirmation request, no generation action.
- `yes` → approval is persisted and generation is requested.
- `Change client name to jane perera` → preview shows `Jane Perera`; the prior approval becomes invalid.

## Modified files

- Shared definitions/engine: `shared/document-contract.json`, `shared/template-schemas.json`, `shared/document-contract.mjs`, `shared/document-contract.d.mts`, `shared/field-processing.mjs`, `shared/field-processing.d.mts`, `shared/conversation-state.mjs`, `shared/conversation-intent.mjs`, `shared/tool-proposal.mjs`.
- Chat: `services/chat/src/services/session.service.ts`, `conversation.repository.ts`, `context.service.ts`, `mcp.service.ts`, and `services/chat/src/routes/chat.routes.ts`.
- Document: `services/document/app/services/document_contract.py`, `sidecar.py`, `services/document/app/routers/document.py`, and HTML templates under `services/document/app/templates/{invoice,quotation,proposal,receipt,purchaseOrder}` for monetary formatting/discounts and sample removal.
- Frontend: `user-frontend/src/api/ai.ts`, `src/store/chatStore.ts`, `src/store/documentStore.ts`, `src/types/index.ts`, `src/components/builder/ChatPanel.tsx`, `src/pages/BuilderPage.tsx`, `src/utils/documentValues.ts`, `invoiceElements.ts`, and `templateRenderer.ts`.
- Tests: new `shared/tests/field-processing.test.mjs`, `services/chat/src/services/__tests__/fieldWorkflow.test.ts`, `services/document/tests/test_field_workflow.py` and `services/document/tests/conftest.py`; extended existing shared, chat, frontend rendering/store and document generation integration tests.

Existing unrelated workspace changes were retained. Gateway behavior and the earlier request-limit fix remain in place; its build was verified.

## Verification

- Shared tests: 110 passed.
- Chat/gateway/frontend unit and integration tests: 116 passed across 20 files.
- Python document tests: 49 passed, including JavaScript/Python arithmetic parity.
- Chat, gateway and user frontend production builds passed. The existing frontend bundle-size warning remains.
- `git diff --check` passed.
- A real localhost browser conversation collected all required Odoo invoice fields, restored after refresh, persisted review approval, and invalidated it after correcting the recipient.
- A real queue-generated PDF completed successfully: one page, correct parties, `Website Development`, quantity `1`, and `Rs. 50,000.00`, with no sample recipient/bank/tax data. Artifact: `services/document/storage/dcf531d6-ef21-53da-a801-6b96fb6f9da4.pdf`. Browser/PDF previews are under `/tmp/doccraft-intelligent-field-preview.png` and `/tmp/doccraft-intelligent-field-pdf.png`.

## Remaining limitations

- Semantic extraction depends on the configured AI provider for genuinely unstructured or unresolved text. Provider failures remain recoverable and retain committed facts.
- Spelling correction requires contextual evidence or a model proposal followed by confirmation. Unknown names are not dictionary-corrected; the system cannot know the intended spelling of an unfamiliar company without user input.
- Contact validation checks syntax and plausible phone length, not mailbox deliverability, phone ownership, bank account validity or legal registration.
- Template-specific requirements for built-in templates are now explicit. Arbitrary custom required fields must be declared in the canonical field contract and template schema before the engine can validate/collect them.
- Currency precision and the six supported locales are explicit configuration. This implementation supports document-level percentage discounts; it does not add unsupported per-item discounts, shipping-charge fields or jurisdiction-specific tax rules.
- Legacy frontend-only Figma variants without a matching server HTML implementation still use their registered classic server variant for queued PDFs. Browser canvas PDF export preserves the selected frontend layout; the Odoo layout is verified through both paths.
- Finalization approval protects the structured document values. The existing visual editor can still change presentation; arbitrary manual visual content is outside semantic field verification.
