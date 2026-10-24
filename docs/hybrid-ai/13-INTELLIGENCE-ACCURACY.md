# Intelligence accuracy — real inference

**1.7B: 23/112 (20.5%); 4B bounded sample: 6/16 (37.5%). Neither candidate meets production document-editing requirements.** All cases used actual inference, not mocked provider responses.

## Method

The checked-in [112 scenarios](evidence/live/scenarios.json) cover 16 categories with seven variants each. Expected fields, untouched fields, editor positions, item IDs, clarification and language corrections are fixed before inference. The corpus uses synthetic invoice/business/customer data, USD, current editor selection and provided conversation history. It does not cover every document template, language, tax jurisdiction or adversarial phrasing.

`scripts/hybrid_live_scenarios.py` calls the real existing provider adapter with the production tool schemas, without committing proposals. `scripts/hybrid_validate_results.mjs` additionally validates every returned tool's arguments with Ajv against those schemas. Wrong fields, missing operations, invalid JSON/schema, unexpected mutation, omitted clarification, truncation and timeouts fail the case. Lexical explanation/clarification checks are limited heuristics, not an independent semantic or legal review. Passing undo proposals does not prove applied undo integrity; browser/state tests address that separately. Some simple corpus prompts intentionally bypass the hybrid deterministic resolver to measure model capability; their model failures do not imply deterministic routing called a model in normal operation.

| Category | 1.7B pass / cases | 4B pass / cases |
|---|---:|---:|
| document_creation | 0 / 7 | 0 / 1 |
| multi_field | 0 / 7 | 0 / 1 |
| grammar | 0 / 7 | 1 / 1 |
| party_mapping | 0 / 7 | 0 / 1 |
| tax | 0 / 7 | 0 / 1 |
| discount | 0 / 7 | 0 / 1 |
| item_add | 0 / 7 | 0 / 1 |
| item_remove | 0 / 7 | 0 / 1 |
| style | 0 / 7 | 0 / 1 |
| movement | 0 / 7 | 1 / 1 |
| undo_redo | 7 / 7 | 1 / 1 |
| user_correction | 0 / 7 | 1 / 1 |
| side_question | 7 / 7 | 1 / 1 |
| missing_field | 7 / 7 | 0 / 1 |
| session_persistence | 0 / 7 | 0 / 1 |
| ambiguous | 2 / 7 | 1 / 1 |

## Observed weaknesses and failed cases

All 89 failed 1.7B cases and ten failed 4B cases are listed in [failed-scenarios.csv](evidence/live/failed-scenarios.csv), with complete responses/errors in [1.7B validated output](evidence/live/accuracy-1.7b-validated.json) and [4B output](evidence/live/accuracy-4b-validated.json). Timeouts remain failures. Results were not discarded or converted into mocked successes.

The 1.7B model commonly flattens update_slots arguments into field/rawValue/suggestedValue instead of the required nested fieldOperations/evidence structure. For example document_creation-01 produced individual malformed customer/business updates and an unsolicited canvas addition; schema checks rejected the proposal. Multi-field extraction and party mapping therefore fail despite some correctly recognized names. Style/movement operations also miss the production operation/patch schema. Grammar proposals do not reliably satisfy the correction contract. These are integration-level accuracy failures, not just connectivity issues.

Ambiguity succeeds in only 2/7 1.7B cases; incorrect assumptions/unrequested mutation proposals are unacceptable. Saved-context tax/correction cases also fail. The 4B sample improves a few categories but has two 90-second timeouts and cannot be extrapolated to 112 cases. Keep typed/evidenced backend guards intact. Further work should compare capable models on this unchanged corpus, investigate constrained schema generation and bounded safe retries, then repeat end-to-end applied document/UI checks. None is certified by this run.

## Separate integrated evidence

The real gateway workload completed 96/96 deterministic tax edits for eight users, concurrency8, p95 621ms and zero inference ledger delta. Actual cross-user access returned403; fresh budget denial returned AI_BUDGET_EXCEEDED before dispatch. Persisted sessions remained readable after processes/PostgreSQL restarted. Six React/canvas workflows with isolated HTTP fixtures and five additional browser checks against the actual admin API/PostgreSQL passed. Actual UI checks include provider creation, encrypted synthetic key rotation, all nine AI screens, model-registry reload and user rendering. The six fixture workflows remain fixture tests, not additional model-accuracy evidence.

The 112-case corpus is not 112 end-to-end committed browser conversations. Production document completion accuracy, broad visual command execution with these models, long-session recovery and positive real cloud fallback are unresolved. Safe refusals protect integrity but do not satisfy the requested assistant capability. Production recommendation remains NO-GO.

Revalidate stored model outputs without inference:

```sh
node scripts/hybrid_validate_results.mjs docs/hybrid-ai/evidence/live/accuracy-1.7b-optimized.jsonl docs/hybrid-ai/evidence/live/accuracy-1.7b-validated.json
node scripts/hybrid_validate_results.mjs docs/hybrid-ai/evidence/live/accuracy-4b.jsonl docs/hybrid-ai/evidence/live/accuracy-4b-validated.json
```
