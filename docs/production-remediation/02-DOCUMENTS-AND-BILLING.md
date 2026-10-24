# Document, MFA and financial correctness

FE-004 stores a validated `canvasMode` with the existing session-scoped layout, alongside literal elements, overrides and page dimensions. Literal templates no longer regenerate a built-in base after reload. Old layouts default to template mode. Local history retains mode; server undo/redo flush pending canvas writes first. Document generation preserves literal presentation. A transition regression caught an incorrectly reset mode during implementation; the corrected17 targeted tests pass. Real Apply -> save -> same-session reload passes. Already-lost snapshots cannot be recovered from absent data. Literal snapshots do not acquire automatic semantic bindings.

FE-003 preserves `twoFactorEnabled` on profile reads and saves, and profile updates use the complete backend response. Actual enrollment and profile reload now show enabled MFA. Regular user/admin ownership checks remain enforced by the owning services.

FE-001/FE-005 remove the fixed paid invoice and fake download alert. Billing loads persisted history regardless of plan, initializes entitlements on entry and has loading, unavailable/retry, empty and pagination states. Paid provider invoices, pending payments, failed/refunded entries are labeled from recorded data; a plan override never creates a receipt. A real pro account with zero invoice rows shows no transactions. That test does not create synthetic paid records or prove checkout/webhook/receipt acceptance. Approved Paddle/PayHere positive transactions, downloads, refunds and reconciliation remain required.

API-004 maps subscription amount, currency and cadence from persisted billing facts. Unknown facts stay null; current catalog monthly prices and guessed USD are no longer substituted. USD/LKR minor-unit tests use explicit synthetic values and prove formatting/contract behavior only. Admin invoice views remove dollar/default-currency guesses. Other currencies need explicit unit metadata and reconciliation rather than guessing.

API-002 removes four unused missing-path wrappers. API-003 returns sanitized503 reporting errors and propagates failures through affected admin breakdown consumers. Isolated outage fixtures now assert503 instead of empty200. Healthy real backend browser navigation is tested separately; not every reporting fallback/action is certified.

The normal signed PDF service still returns readiness503 and render500 on this host. Its sandbox remains enabled. Browser rasterization tests use the explicit test-only browser launcher; this is not production PDF-sandbox certification.

Evidence: [custom reload](evidence/runtime/custom-template-reload.json), [main browser matrix](evidence/runtime/browser-tests.json), [billing](evidence/runtime/billing-browser.json), [PDF](evidence/runtime/pdf-readiness.json), [runtime API checks](evidence/runtime/integrated-tests.json).
