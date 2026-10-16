# Provider failure and interrupted-turn retry fixes

Verified locally on 2026-10-13, following [CHAT_EDITING_FIX_IMPLEMENTATION.md](CHAT_EDITING_FIX_IMPLEMENTATION.md).

## Findings

- The Free-plan quota is saved as 1,000 in the admin API and live quota service. The subsequent failure occurs in the provider phase, independently of that application quota.
- Groq returned HTTP 413 with `rate_limit_exceeded` during the live multi-field workflow. Provider context repeated full normalized/raw field records, provenance and finalization fingerprints. Tool responses were additionally JSON-encoded inside another JSON array and appended repeatedly to model history. This inflated requests beyond the provider allowance after otherwise valid updates.
- The previously configured fallback `qwen/qwen3.6-27b` returned `model_not_found`. The live models API reports `qwen/qwen3.8-27b` as available.
- Turn selection and retry eligibility depended on object insertion order. PostgreSQL JSONB reorders UUID keys, so an older turn could incorrectly supply context, become the pending retry, or cause the actual latest failed turn to be rejected as superseded.
- The explicit four-row service table unnecessarily depended on semantic extraction. Previously saved failed turns also retained their older provider-only extraction plans across retries.

The original failed turn did not record its underlying upstream response; the 413 rejection was reproduced and diagnosed in the live workflow. Diagnostics now record upstream status, model, code and request ID without logging credentials, document values or `failed_generation`.

## Changes

- `shared/conversation-state.mjs` and its declaration, plus `services/chat/src/services/conversation.repository.ts`: persist the latest turn ID; reconstruct legacy chronology from `startedAt` rather than UUID ordering. Snapshot restoration, retry eligibility and date reference use the same selection.
- `services/chat/src/services/context.service.ts`: explicitly receives the current turn ID, uses compact authoritative task state, and bounds recent/retrieved transcript text to 8,000 characters. Current values, required fields and pending decisions remain available; full provenance stays in persisted/frontend state.
- New `shared/model-context.mjs` and declaration: compact provider snapshots and tool-result text while preserving field ownership, values, pending choices, operation receipts and error feedback. Full API snapshots and database provenance remain intact. Both Groq and Claude use compact tool feedback.
- `services/chat/src/services/groq.service.ts` and `config/env.ts`: available Qwen fallback, configurable comma-separated `GROQ_MODELS`, low reasoning effort for GPT-OSS extraction, malformed-envelope fallback, safe diagnostics, and meaningful failure classification. HTTP 413 maps to context limits; an unavailable fallback cannot hide an earlier rate limit. Rejected tool generations are never executed. Groq documents this rejection mechanism in its [local tool-calling documentation](https://console.groq.com/docs/tool-use/local-tool-calling).
- New `shared/item-table.mjs`: imports explicit TSV/Markdown tables by declared description, quantity and price columns; retains supplied currency; checks supplied amounts through existing decimal-safe calculation. Invalid amounts, missing quantities, conflicting currencies and unknown columns return to semantic clarification rather than being guessed or discarded.
- `services/chat/src/routes/chat.routes.ts`: retries can reconcile a validated table that an older extraction plan left unprocessed. Existing operation deduplication and unrelated-field preservation remain enforced.
- `shared/chat-errors.mjs`: distinguishes provider tool-generation rejection from generic provider failure.
- Regression tests: new `shared/tests/item-table.test.mjs`, `model-context.test.mjs`; extended chat `context.test.ts`, `groq.test.ts`, `intelligence.test.ts` and `fieldWorkflow.test.ts`.

## Verification

- Shared tests: **151 passed**. Chat/gateway/frontend Vitest tests: **138 passed**, across 20 files.
- Document Python tests: **50 passed**. Total: **339 passing automated tests**.
- Chat TypeScript and user frontend production builds passed. Existing frontend bundle-size warning remains. `git diff --check` passed.
- Native gateway → chat → PostgreSQL workflow saved the same four-row service table: Website Development 75,000; UI/UX Design 2 × 15,000; Domain Registration 4,500; Web Hosting 12,000. Verified subtotal/total **LKR 121,500.00** and four restored rows.
- A real AI-provider call then saved `Valid for 30 days.` and `BOC, Panadura, Account: 007903232` without changing the items or total. Fallback recovered from an actual `tool_use_failed` response. Evidence: `/tmp/doccraft-provider-fix-live.log`.
- Real browser verification loaded the saved invoice, checked all four preview rows and total, reloaded the page, and confirmed the same values with no chat error. Evidence: `/tmp/doccraft-provider-fix-browser-result.json` and `/tmp/doccraft-provider-fix-preview.png`.
- Regression coverage verifies retrying an old provider-only table plan without another provider call or duplicate user message, legacy JSONB ordering, pending decision preservation during compaction, identifier zeros, supplied-amount validation and stale-turn rejection.

Provider availability and account-level token limits remain external constraints. Arbitrary text still uses structured AI extraction; explicit tables with unresolved calculations require clarification. Raising DocCraft's quota cannot raise an external provider's allowance.
