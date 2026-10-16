# Chat and document lifecycle

> Current status: Phase 2 evidence below supersedes historical Phase 1 dispositions. Release decision: **NOT READY**.

## Phase 2 — Remediation and Production Readiness Verification

For **invoice, quotation, proposal, receipt and purchase_order**, the real harness creates an authenticated session, saves required fixture fields, submits two actual SSE correction turns, replays each turn, reads persisted fields, confirms the current fingerprint/revision, queues a server generation and downloads the actual PDF. Extracted PDF text contains both corrected business/client values; the four financial document types also retain the expected 43.89 tax-inclusive total for 2 × 19.95 plus 10%. Proposal output intentionally has no financial total. Job ownership and document/session deletion are checked.

These turns intentionally use the shipped deterministic parser. External model keys are disabled; multi-field natural-language intelligence, ambiguous semantic repair and live provider fallbacks remain BLOCKED. Shared/provider regression suites cover broader parsing/calculation behavior using deterministic and mocked inputs. Browser preview/layout export is a different route from the verified server PDF pipeline and remains a persistence/metering limitation.

| Artifact | What it proves | Limit |
| --- | --- | --- |
| [workflow-invoice.pdf](evidence/phase2/workflow-invoice.pdf) | Real queued export contains persisted corrected values | One fixture/template, not every user scenario |
| [workflow-quotation.pdf](evidence/phase2/workflow-quotation.pdf) | Real queued export contains persisted corrected values | One fixture/template, not every user scenario |
| [workflow-proposal.pdf](evidence/phase2/workflow-proposal.pdf) | Real queued export contains persisted corrected values | One fixture/template, not every user scenario |
| [workflow-receipt.pdf](evidence/phase2/workflow-receipt.pdf) | Real queued export contains persisted corrected values | One fixture/template, not every user scenario |
| [workflow-purchase_order.pdf](evidence/phase2/workflow-purchase_order.pdf) | Real queued export contains persisted corrected values | One fixture/template, not every user scenario |

### Resilience

Owned quota receipts deny replay after refund; refunds decrement once. Worker retries do not refund until terminal failure and already-successful records avoid duplicate rendering. This is not a transactional SQL/Redis outbox: crash-after-reserve, queue/database commit windows, day changes and refund retry exhaustion still require reconciliation. The renderer shares one Chromium process, bounds active pages, times out work and exposes readiness; local burst/recovery is scoped in the test report.

## Phase 1 — Historical audit evidence (preserved)

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

The active chat route is `services/chat/src/routes/chat.routes.ts`. `ConversationRepository` owns authorized reads, optimistic revision updates, turn leases, idempotent turn/operation receipts, persisted checkpoints, finalization, and asset ownership. No provider request runs inside its short database transaction. `shared/` owns the field/amount/stream contracts consumed by stores and the service.

## Implemented state transitions

1. Create a session for a supported type/template and validated timezone.
2. Load the user's session; enforce lifecycle/ownership and claim a unique turn.
3. Classify the current intent; extract explicit scalar/item/table facts locally.
4. Validate values, required/conditional fields, proposed edits, and any ambiguous choices. Commit evidence-backed facts with a new revision.
5. If semantic work remains, reserve quota, build bounded context, call the configured Groq candidate, and execute permitted MCP tools. Both providers/tools and transport failures remain explicit failures.
6. Reconcile committed state and assistant text; persist checkpoints/outcomes, then emit the authoritative completion snapshot. Retrying the same turn reconciles prior work instead of blindly duplicating it.
7. Browser stores apply snapshots, update semantic fields/canvas, and retain the server's readiness/finalization state.
8. Export re-reads state and confirms its fingerprint/revision. Client capture and queued server generation are different output paths.

## Verified behavior and limits

The shared and Vitest suites exercise required/optional collection, multiple supplied fields, uncertain answers, scoped corrections, add/remove/price/quantity changes, stale revisions, missing facts, provider explanations, truthful acknowledgements, duplicate operations, stream corruption/interruption, cancellation, assets, history ownership, and export race guards. These are isolated contracts and mocked provider executions, not a live model-quality evaluation.

JavaScript/Python calculation tests verify amounts and rounding across the contract. The real sidecar probe rendered all 17 server templates for five types and extracted names/totals from the actual PDFs. It also used a local trap server and script-bearing HTML to verify blocked internal fetches and page-script execution. There is no claim of a complete SSRF/security proof or all browser layouts/font combinations.

Generation validates the authorized chat state rather than accepting client-injected fields/assets. Stable generation operation IDs and persisted queue-pending state permit reconciliation. Quota-service outages now prevent new provider/generation work with a retryable error instead of unmetered access. Job polling first checks durable ownership and preserves failed status even when queue data is gone.

The PDF worker now emits the consumer's actual `document_ready` event and `documentUrl`/recipient fields. A notification queue failure cannot mark an already persisted successful PDF failed or refund it. Pro and Max avoid the free-tier worker watermark; broad admin-managed feature-flag enforcement is still incomplete.

Local downloads use an HMAC-protected 24-hour URL; tampering, expiry, and directory traversal have regression tests. Guests do not receive download URLs from document detail/history or create share links to bypass their download restriction. Server storage uploads/deletes and public share behavior against actual Supabase were BLOCKED.

## Remaining lifecycle concerns

- The same quota counter is charged for provider-reaching chat turns and server document generation. UI descriptions call it documents/day. Defining distinct AI/document budgets or documenting the combined unit requires a product decision.
- Worker refund does not carry an idempotent reservation/refund operation ID. Retry/crash reconciliation and terminal retry accounting are not established for the whole distributed pipeline.
- Payment and PDF effects lack a durable transactional outbox/reconciliation guarantee across SQL, Redis, external providers and notifications.
- Browser-only layout changes and custom canvas elements are not necessarily the server template's layout. The legacy document API export/layout/content wrappers also reference endpoints that are absent; primary browser export avoids some of those paths.
- Guest-to-account migration is absent; an identity change resets chat/document state. No preservation guarantee is made.
- Live provider fallback/tool quality, long-document paging, all asset placements, every template in the interactive editor, browser reload/export against PostgreSQL, and multi-worker failure recovery remain NOT TESTED or BLOCKED.

## Real PDF artifacts

| Type | Template | Result | Pages | Evidence |
| --- | --- | --- | --- | --- |
| invoice | classic | PASS | 1 | [PDF](evidence/pdf-invoice-classic.pdf) |
| invoice | grid-bordered | PASS | 1 | [PDF](evidence/pdf-invoice-grid-bordered.pdf) |
| invoice | minimal | PASS | 1 | [PDF](evidence/pdf-invoice-minimal.pdf) |
| invoice | modern | PASS | 1 | [PDF](evidence/pdf-invoice-modern.pdf) |
| invoice | odoo-community | PASS | 1 | [PDF](evidence/pdf-invoice-odoo-community.pdf) |
| proposal | classic | PASS | 1 | [PDF](evidence/pdf-proposal-classic.pdf) |
| proposal | minimal | PASS | 1 | [PDF](evidence/pdf-proposal-minimal.pdf) |
| proposal | modern | PASS | 1 | [PDF](evidence/pdf-proposal-modern.pdf) |
| purchase_order | classic | PASS | 1 | [PDF](evidence/pdf-purchase_order-classic.pdf) |
| purchase_order | minimal | PASS | 1 | [PDF](evidence/pdf-purchase_order-minimal.pdf) |
| purchase_order | modern | PASS | 1 | [PDF](evidence/pdf-purchase_order-modern.pdf) |
| quotation | classic | PASS | 1 | [PDF](evidence/pdf-quotation-classic.pdf) |
| quotation | minimal | PASS | 1 | [PDF](evidence/pdf-quotation-minimal.pdf) |
| quotation | modern | PASS | 1 | [PDF](evidence/pdf-quotation-modern.pdf) |
| receipt | classic | PASS | 1 | [PDF](evidence/pdf-receipt-classic.pdf) |
| receipt | minimal | PASS | 1 | [PDF](evidence/pdf-receipt-minimal.pdf) |
| receipt | modern | PASS | 1 | [PDF](evidence/pdf-receipt-modern.pdf) |
