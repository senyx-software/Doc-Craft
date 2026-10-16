# Change log

<!-- PHASE4_STATUS -->
## Phase 4 — Current status (2026-10-16)

**Production: NOT READY. Staging: prepared, deployment verification blocked.** Actual final native integration: **214 VERIFIED, 2 BLOCKED, 0 UNRESOLVED**. Full regression orchestration: **17 PASS, 1 BLOCKED, 2 OPEN_FINDINGS** across 20 checks. Browser/PDF rendering is blocked by the host sandbox; frontend build dependency advisories remain open. No external provider workflow or Docker deployment is claimed successful.

Current policy is **Free 3 / Pro 10 / Max 25 shared metered units per account**, each outbound AI request plus each server PDF, **20 hours from first accepted use**, admin configurable. Browser exports remain unmetered. Retention defaults and legacy cutover still need owner decisions.

Authoritative entitlements, durable payment reducer/outbox and billing downstream SQL receipts, PostgreSQL quota/window recovery, secure owner/public uploaded-template versions, encrypted single-use TOTP, durable session revocation, scoped DB roles/TLS/replay-loss controls and staging tooling have implementation/regression evidence. The original release groups remain partial or externally blocked because their full acceptance criteria have not passed.



Current sources: [16 release blockers](16-PHASE4_RELEASE_BLOCKERS.md), [17 staging guide](17-STAGING_DEPLOYMENT_GUIDE.md), [18 production checklist](18-PRODUCTION_READINESS_CHECKLIST.md), [19 final results](19-FINAL_INTEGRATION_TEST_RESULTS.md), [full technical workflow](../../DOCCRAFT_FULL_TECHNICAL_WORKFLOW.md).

**Everything below this Phase 4 preface is preserved historical evidence unless explicitly updated.** Earlier midnight quota semantics, unlimited Pro descriptions, absent upload pipeline and unresolved TOTP replay statements are superseded by the current reports; historical browser success is not Phase 4 browser evidence.
<!-- END_PHASE4_STATUS -->

## Phase 3 — Historical status (2026-10-15)

**Production readiness: NOT READY.** Latest actual isolated stack: **160/160 assertions verified**; Security-category assertions: **64/64**; actual browser assertions: **11 verified** (overlap with the stack, not additive). Pairwise service identities, receiving-service authorization/replay checks, signed jobs/events, Redis ACLs, current-account/session revocation, renderer isolation and request limits have implementation and regression evidence. Guest transfer, session canvas persistence/browser export, bundled template availability and currency-separated reporting were implemented and tested to the scope in the Phase 3 report.

The nine carried original findings are assessed individually in [15-PHASE3_REMEDIATION_REPORT.md](15-PHASE3_REMEDIATION_REPORT.md). U-R11 is fixed for tested draft/layout/export paths; the others remain partial, unresolved or externally blocked. Unified entitlements, ordered billing and quota crash repair, uploaded template authoring, deployment TLS/database privilege/rotation proof, residual build-tool advisories and actual provider sandboxes remain release requirements. Phase 2 numbers and architecture statements below are historical and superseded where Phase 3 changes them.

Current evidence: [security audit](12-MICROSERVICES_SECURITY_AUDIT.md), [communication matrix / trust diagrams](13-INTER_SERVICE_COMMUNICATION.md), [security tests](14-SECURITY_TEST_RESULTS.md), [remediation](15-PHASE3_REMEDIATION_REPORT.md).

## Historical Phase 2 / Phase 1 evidence

> Current status: Phase 2 evidence below supersedes historical Phase 1 dispositions. Release decision: **NOT READY**.

## Phase 2 — Remediation and Production Readiness Verification

**Current decision: NOT READY.** Phase 2 resolved **6 of the original 15 source finding groups**; **9 remain partially corrected, unresolved or blocked**. The work corrected **13 additional defect groups**. Original findings are not all code bugs: product gaps, provider access and credential/deployment evidence remain separate.

Both frontend lint checks and all three build commands pass. The latest real local stack run has **89/89 verified assertions**, with **6/6 actual browser assertions**. These overlap by design: the stack includes a browser-harness completion assertion. Mocked tests are not counted as live provider verification.

Current discovery: **694 scanned text files, 1368 source inventory entries, 81 admin navigation IDs**. Phase 1's 666/1369 counts are historical; source deletions/additions change the inventory. Entries are definitions, not independent completed business features. All current entries are listed in the updated coverage appendix; no overall functionality percentage is justified.

Phase 2 changed **171 source/configuration/documentation-tooling files relative to the saved Phase 2 baseline**, plus all 13 requested reports and generated evidence. This is not the count of the entire dirty Git tree; pre-existing Phase 1/unrelated changes were preserved. See [phase2-changed-files.json](evidence/phase2/phase2-changed-files.json) and [phase2-summary.json](evidence/phase2/phase2-summary.json).

### Exact Phase 2 source/configuration/tooling delta

The baseline was captured before Phase 2 changes; this list does not assign pre-existing dirty changes to Phase 2. SHA-256 values are retained in [phase2-changed-files.json](evidence/phase2/phase2-changed-files.json). Report/evidence outputs are additional generated artifacts.

| File | Change relative to Phase 2 baseline |
| --- | --- |
| [scripts/system_audit_validate.py](../../scripts/system_audit_validate.py) | modified |
| [scripts/system_audit_phase2_browser.cjs](../../scripts/system_audit_phase2_browser.cjs) | added |
| [scripts/system_audit_phase2_reports.py](../../scripts/system_audit_phase2_reports.py) | added |
| [scripts/system_audit_phase2_probes.py](../../scripts/system_audit_phase2_probes.py) | added |
| [scripts/system_audit_inventory.cjs](../../scripts/system_audit_inventory.cjs) | modified |
| [scripts/system_audit_phase2_stack.py](../../scripts/system_audit_phase2_stack.py) | added |
| [scripts/system_audit_check.py](../../scripts/system_audit_check.py) | modified |
| [scripts/system_audit_pdf.py](../../scripts/system_audit_pdf.py) | modified |
| [scripts/system_audit_api.py](../../scripts/system_audit_api.py) | modified |
| [scripts/system_audit_browser.cjs](../../scripts/system_audit_browser.cjs) | modified |
| [services/document/test_document.py](../../services/document/test_document.py) | modified |
| [user-frontend/src/App.tsx](../../user-frontend/src/App.tsx) | modified |
| [services/payment/prisma/migrations/202610150001_payment_initial/migration.sql](../../services/payment/prisma/migrations/202610150001_payment_initial/migration.sql) | added |
| [services/payment/prisma/migrations/202610150002_checkout_intents/migration.sql](../../services/payment/prisma/migrations/202610150002_checkout_intents/migration.sql) | added |
| [services/payment/prisma/schema.prisma](../../services/payment/prisma/schema.prisma) | modified |
| [user-frontend/src/components/landing/DocumentTypeSelector.tsx](../../user-frontend/src/components/landing/DocumentTypeSelector.tsx) | modified |
| [user-frontend/src/api/billing.ts](../../user-frontend/src/api/billing.ts) | modified |
| [user-frontend/src/api/payment.ts](../../user-frontend/src/api/payment.ts) | modified |
| [user-frontend/src/components/shared/UpgradeModal.tsx](../../user-frontend/src/components/shared/UpgradeModal.tsx) | modified |
| [user-frontend/src/api/__tests__/guest.test.ts](../../user-frontend/src/api/__tests__/guest.test.ts) | modified |
| [user-frontend/src/api/__tests__/payment.test.ts](../../user-frontend/src/api/__tests__/payment.test.ts) | modified |
| [services/document/app/routers/document.py](../../services/document/app/routers/document.py) | modified |
| [user-frontend/src/api/client.ts](../../user-frontend/src/api/client.ts) | modified |
| [user-frontend/src/api/ai.ts](../../user-frontend/src/api/ai.ts) | modified |
| [user-frontend/src/api/documents.ts](../../user-frontend/src/api/documents.ts) | modified |
| [user-frontend/src/api/auth.ts](../../user-frontend/src/api/auth.ts) | modified |
| [user-frontend/src/components/common/Announcements.tsx](../../user-frontend/src/components/common/Announcements.tsx) | added |
| [user-frontend/src/components/common/Navbar.tsx](../../user-frontend/src/components/common/Navbar.tsx) | modified |
| [user-frontend/src/components/common/BackgroundEffects.tsx](../../user-frontend/src/components/common/BackgroundEffects.tsx) | modified |
| [user-frontend/src/types/index.ts](../../user-frontend/src/types/index.ts) | modified |
| [user-frontend/src/components/dashboard/PaymentMethodsCard.tsx](../../user-frontend/src/components/dashboard/PaymentMethodsCard.tsx) | modified |
| [user-frontend/src/components/dashboard/ProfileIdentityCard.tsx](../../user-frontend/src/components/dashboard/ProfileIdentityCard.tsx) | modified |
| [user-frontend/src/components/dashboard/DocumentsTable.tsx](../../user-frontend/src/components/dashboard/DocumentsTable.tsx) | modified |
| [user-frontend/src/components/dashboard/QuotaBar.tsx](../../user-frontend/src/components/dashboard/QuotaBar.tsx) | modified |
| [user-frontend/src/components/dashboard/ProfileSecurityCard.tsx](../../user-frontend/src/components/dashboard/ProfileSecurityCard.tsx) | modified |
| [services/document/app/services/storage.py](../../services/document/app/services/storage.py) | modified |
| [services/document/puppeteer/server.ts](../../services/document/puppeteer/server.ts) | modified |
| [services/payment/src/__tests__/idempotency.test.ts](../../services/payment/src/__tests__/idempotency.test.ts) | modified |
| [services/payment/src/__tests__/payment-config.test.ts](../../services/payment/src/__tests__/payment-config.test.ts) | modified |
| [services/payment/src/__tests__/checkout-security.test.ts](../../services/payment/src/__tests__/checkout-security.test.ts) | added |
| [services/payment/src/__tests__/subscription-quota.test.ts](../../services/payment/src/__tests__/subscription-quota.test.ts) | modified |
| [services/payment/src/__tests__/routing.test.ts](../../services/payment/src/__tests__/routing.test.ts) | modified |
| [services/document/app/workers/pdf_worker.py](../../services/document/app/workers/pdf_worker.py) | modified |
| [services/payment/src/controllers/payment.controller.ts](../../services/payment/src/controllers/payment.controller.ts) | modified |
| [user-frontend/src/middleware/GuestRoute.tsx](../../user-frontend/src/middleware/GuestRoute.tsx) | modified |
| [user-frontend/src/components/builder/ElementInspector.tsx](../../user-frontend/src/components/builder/ElementInspector.tsx) | modified |
| [user-frontend/src/components/builder/TemplateSelector.tsx](../../user-frontend/src/components/builder/TemplateSelector.tsx) | modified |
| [user-frontend/src/vite-env.d.ts](../../user-frontend/src/vite-env.d.ts) | added |
| [user-frontend/src/store/authStore.ts](../../user-frontend/src/store/authStore.ts) | modified |
| [services/payment/src/services/plan.service.ts](../../services/payment/src/services/plan.service.ts) | modified |
| [services/payment/src/services/paddle.service.ts](../../services/payment/src/services/paddle.service.ts) | modified |
| [services/payment/src/services/payhere.service.ts](../../services/payment/src/services/payhere.service.ts) | modified |
| [services/payment/src/services/paymentMethod.service.ts](../../services/payment/src/services/paymentMethod.service.ts) | modified |
| [services/payment/src/services/subscription.service.ts](../../services/payment/src/services/subscription.service.ts) | modified |
| [services/payment/src/services/paymentConfigClient.service.ts](../../services/payment/src/services/paymentConfigClient.service.ts) | modified |
| [services/payment/src/services/gateway-router.service.ts](../../services/payment/src/services/gateway-router.service.ts) | modified |
| [user-frontend/src/components/builder/FormatSidebar.tsx](../../user-frontend/src/components/builder/FormatSidebar.tsx) | modified |
| [user-frontend/src/components/builder/ChatAttachments.tsx](../../user-frontend/src/components/builder/ChatAttachments.tsx) | modified |
| [user-frontend/src/components/builder/AssetModal.tsx](../../user-frontend/src/components/builder/AssetModal.tsx) | modified |
| [user-frontend/src/components/builder/MultiElementInspector.tsx](../../user-frontend/src/components/builder/MultiElementInspector.tsx) | modified |
| [user-frontend/src/components/builder/FontFacePicker.tsx](../../user-frontend/src/components/builder/FontFacePicker.tsx) | modified |
| [user-frontend/src/components/builder/ChatPanel.tsx](../../user-frontend/src/components/builder/ChatPanel.tsx) | modified |
| [user-frontend/src/components/builder/InvoiceCanvas.tsx](../../user-frontend/src/components/builder/InvoiceCanvas.tsx) | modified |
| [user-frontend/src/hooks/useUserDocuments.ts](../../user-frontend/src/hooks/useUserDocuments.ts) | modified |
| [user-frontend/src/hooks/usePageDurationTracking.ts](../../user-frontend/src/hooks/usePageDurationTracking.ts) | modified |
| [user-frontend/src/hooks/useCommittedEvent.ts](../../user-frontend/src/hooks/useCommittedEvent.ts) | added |
| [user-frontend/src/hooks/usePlanCatalog.ts](../../user-frontend/src/hooks/usePlanCatalog.ts) | added |
| [services/payment/src/queues/payment-webhook.queue.ts](../../services/payment/src/queues/payment-webhook.queue.ts) | modified |
| [admin/src/store/toastStore.ts](../../admin/src/store/toastStore.ts) | modified |
| [admin/src/store/adminAuthStore.ts](../../admin/src/store/adminAuthStore.ts) | modified |
| [user-frontend/src/store/__tests__/documentExport.test.ts](../../user-frontend/src/store/__tests__/documentExport.test.ts) | modified |
| [user-frontend/src/store/__tests__/guestAuth.test.ts](../../user-frontend/src/store/__tests__/guestAuth.test.ts) | modified |
| [services/admin-api/app/security/dependencies.py](../../services/admin-api/app/security/dependencies.py) | modified |
| [user-frontend/src/store/paymentStore.ts](../../user-frontend/src/store/paymentStore.ts) | modified |
| [user-frontend/src/store/documentStore.ts](../../user-frontend/src/store/documentStore.ts) | modified |
| [admin/src/components/ui/FontFacePicker.tsx](../../admin/src/components/ui/FontFacePicker.tsx) | modified |
| [admin/src/components/ui/SortableHeader.tsx](../../admin/src/components/ui/SortableHeader.tsx) | modified |
| [admin/src/components/ui/TotpPromptModal.tsx](../../admin/src/components/ui/TotpPromptModal.tsx) | modified |
| [admin/src/components/ui/Pagination.tsx](../../admin/src/components/ui/Pagination.tsx) | modified |
| [admin/src/components/ui/Input.tsx](../../admin/src/components/ui/Input.tsx) | modified |
| [user-frontend/src/utils/__tests__/exportAlignment.test.ts](../../user-frontend/src/utils/__tests__/exportAlignment.test.ts) | modified |
| [user-frontend/src/utils/documentValues.ts](../../user-frontend/src/utils/documentValues.ts) | modified |
| [user-frontend/src/utils/invoiceElements.ts](../../user-frontend/src/utils/invoiceElements.ts) | modified |
| [user-frontend/src/utils/templateRenderer.ts](../../user-frontend/src/utils/templateRenderer.ts) | modified |
| [services/gateway/src/security/cors.config.ts](../../services/gateway/src/security/cors.config.ts) | modified |
| [admin/src/components/AdminSidebar.tsx](../../admin/src/components/AdminSidebar.tsx) | modified |
| [services/admin-api/app/schemas/plan.py](../../services/admin-api/app/schemas/plan.py) | modified |
| [RUNNING_THE_PROJECT.md](../../RUNNING_THE_PROJECT.md) | modified |
| [user-frontend/src/pages/PasswordResetPage.tsx](../../user-frontend/src/pages/PasswordResetPage.tsx) | modified |
| [user-frontend/src/pages/BuilderPage.tsx](../../user-frontend/src/pages/BuilderPage.tsx) | modified |
| [user-frontend/src/pages/PricingPage.tsx](../../user-frontend/src/pages/PricingPage.tsx) | modified |
| [user-frontend/src/pages/VerifyEmailPage.tsx](../../user-frontend/src/pages/VerifyEmailPage.tsx) | modified |
| [user-frontend/src/pages/RegisterPage.tsx](../../user-frontend/src/pages/RegisterPage.tsx) | modified |
| [user-frontend/src/pages/LandingPage.tsx](../../user-frontend/src/pages/LandingPage.tsx) | modified |
| [admin/src/api/adminApiClient.ts](../../admin/src/api/adminApiClient.ts) | modified |
| [admin/src/api/adminApiTypes.ts](../../admin/src/api/adminApiTypes.ts) | added |
| [admin/src/components/common/AdminTopbar.tsx](../../admin/src/components/common/AdminTopbar.tsx) | modified |
| [user-frontend/src/pages/dashboard/DashboardSupportPage.tsx](../../user-frontend/src/pages/dashboard/DashboardSupportPage.tsx) | modified |
| [user-frontend/src/pages/dashboard/DashboardHistoryPage.tsx](../../user-frontend/src/pages/dashboard/DashboardHistoryPage.tsx) | modified |
| [user-frontend/src/pages/dashboard/DashboardBillingPage.tsx](../../user-frontend/src/pages/dashboard/DashboardBillingPage.tsx) | modified |
| [user-frontend/src/pages/dashboard/DashboardOverviewPage.tsx](../../user-frontend/src/pages/dashboard/DashboardOverviewPage.tsx) | modified |
| [admin/src/pages/subviews/AutomationsView.tsx](../../admin/src/pages/subviews/AutomationsView.tsx) | modified |
| [admin/src/pages/subviews/CostLedgerView.tsx](../../admin/src/pages/subviews/CostLedgerView.tsx) | modified |
| [admin/src/pages/subviews/InfrastructureView.tsx](../../admin/src/pages/subviews/InfrastructureView.tsx) | modified |
| [admin/src/pages/subviews/SettingsView.tsx](../../admin/src/pages/subviews/SettingsView.tsx) | modified |
| [user-frontend/src/pages/LoginPage.tsx](../../user-frontend/src/pages/LoginPage.tsx) | modified |
| [admin/src/pages/subviews/RevenueView.tsx](../../admin/src/pages/subviews/RevenueView.tsx) | modified |
| [admin/src/pages/subviews/SubscriptionsView.tsx](../../admin/src/pages/subviews/SubscriptionsView.tsx) | modified |
| [admin/src/pages/subviews/SupportView.tsx](../../admin/src/pages/subviews/SupportView.tsx) | modified |
| [admin/src/pages/subviews/DocumentsView.tsx](../../admin/src/pages/subviews/DocumentsView.tsx) | modified |
| [admin/src/pages/subviews/PromotionsView.tsx](../../admin/src/pages/subviews/PromotionsView.tsx) | modified |
| [admin/src/pages/subviews/HomeView.tsx](../../admin/src/pages/subviews/HomeView.tsx) | modified |
| [admin/src/pages/subviews/ConfigView.tsx](../../admin/src/pages/subviews/ConfigView.tsx) | modified |
| [admin/src/pages/subviews/GenerationsView.tsx](../../admin/src/pages/subviews/GenerationsView.tsx) | modified |
| [admin/src/pages/subviews/AnalyticsView.tsx](../../admin/src/pages/subviews/AnalyticsView.tsx) | modified |
| [admin/src/pages/subviews/SecurityView.tsx](../../admin/src/pages/subviews/SecurityView.tsx) | modified |
| [admin/src/pages/subviews/PackagesView.tsx](../../admin/src/pages/subviews/PackagesView.tsx) | modified |
| [admin/src/pages/subviews/NotificationsView.tsx](../../admin/src/pages/subviews/NotificationsView.tsx) | modified |
| [admin/src/pages/subviews/UsersView.tsx](../../admin/src/pages/subviews/UsersView.tsx) | modified |
| [admin/src/pages/UserDetailPage.tsx](../../admin/src/pages/UserDetailPage.tsx) | modified |
| [admin/src/pages/DashboardPage.tsx](../../admin/src/pages/DashboardPage.tsx) | modified |
| [admin/src/hooks/useSortToggle.ts](../../admin/src/hooks/useSortToggle.ts) | added |
| [admin/src/hooks/usePagination.ts](../../admin/src/hooks/usePagination.ts) | added |
| [admin/src/hooks/useCommittedEvent.ts](../../admin/src/hooks/useCommittedEvent.ts) | added |
| [services/gateway/src/services/__tests__/cors-proxy.test.ts](../../services/gateway/src/services/__tests__/cors-proxy.test.ts) | added |
| [services/gateway/src/services/proxyClient.service.ts](../../services/gateway/src/services/proxyClient.service.ts) | modified |
| [services/admin-api/app/integrations/services/analytics_client.py](../../services/admin-api/app/integrations/services/analytics_client.py) | modified |
| [services/admin-api/app/integrations/services/quota_client.py](../../services/admin-api/app/integrations/services/quota_client.py) | modified |
| [services/analytics/tests/test_authorization.py](../../services/analytics/tests/test_authorization.py) | added |
| [services/admin-api/app/integrations/mcp/chat_client.py](../../services/admin-api/app/integrations/mcp/chat_client.py) | modified |
| [services/admin-api/app/models/plan.py](../../services/admin-api/app/models/plan.py) | modified |
| [services/analytics/app/routers/analytics.py](../../services/analytics/app/routers/analytics.py) | modified |
| [services/analytics/app/security.py](../../services/analytics/app/security.py) | added |
| [services/analytics/app/services/db.py](../../services/analytics/app/services/db.py) | modified |
| [services/admin-api/tests/test_phase2_mutations.py](../../services/admin-api/tests/test_phase2_mutations.py) | added |
| [services/admin-api/tests/test_plans_api.py](../../services/admin-api/tests/test_plans_api.py) | modified |
| [services/admin-api/tests/test_schema_namespace.py](../../services/admin-api/tests/test_schema_namespace.py) | added |
| [services/admin-api/app/api/v1/notifications.py](../../services/admin-api/app/api/v1/notifications.py) | modified |
| [services/admin-api/app/api/v1/plans.py](../../services/admin-api/app/api/v1/plans.py) | modified |
| [services/admin-api/app/api/v1/users.py](../../services/admin-api/app/api/v1/users.py) | modified |
| [services/auth/prisma/migrations/202610150003_email_verification/migration.sql](../../services/auth/prisma/migrations/202610150003_email_verification/migration.sql) | added |
| [services/admin-api/app/api/v1/auth.py](../../services/admin-api/app/api/v1/auth.py) | modified |
| [services/admin-api/app/api/v1/support.py](../../services/admin-api/app/api/v1/support.py) | modified |
| [services/admin-api/tests/test_audit_regressions.py](../../services/admin-api/tests/test_audit_regressions.py) | modified |
| [services/chat/prisma/migrations/202610150004_conversation_persistence/migration.sql](../../services/chat/prisma/migrations/202610150004_conversation_persistence/migration.sql) | added |
| [services/quota/prisma/migrations/202610150001_quota_initial/migration.sql](../../services/quota/prisma/migrations/202610150001_quota_initial/migration.sql) | added |
| [services/admin-api/app/repositories/notification_repository.py](../../services/admin-api/app/repositories/notification_repository.py) | modified |
| [services/admin-api/app/repositories/verification_repository.py](../../services/admin-api/app/repositories/verification_repository.py) | modified |
| [services/quota/prisma/schema.prisma](../../services/quota/prisma/schema.prisma) | modified |
| [services/admin-api/app/repositories/plan_repository.py](../../services/admin-api/app/repositories/plan_repository.py) | modified |
| [services/chat/prisma/migrations/202610150005_enum_contract/migration.sql](../../services/chat/prisma/migrations/202610150005_enum_contract/migration.sql) | added |
| [services/admin-api/app/db/admin_db.py](../../services/admin-api/app/db/admin_db.py) | modified |
| [services/admin-api/app/core/config.py](../../services/admin-api/app/core/config.py) | modified |
| [services/quota/src/routes/quota.routes.ts](../../services/quota/src/routes/quota.routes.ts) | modified |
| [services/chat/src/config/env.ts](../../services/chat/src/config/env.ts) | modified |
| [services/quota/src/__tests__/check.test.ts](../../services/quota/src/__tests__/check.test.ts) | modified |
| [services/notification/src/routes/notification.routes.ts](../../services/notification/src/routes/notification.routes.ts) | modified |
| [services/quota/src/__tests__/fakeRedis.ts](../../services/quota/src/__tests__/fakeRedis.ts) | modified |
| [services/notification/src/security.ts](../../services/notification/src/security.ts) | modified |
| [services/notification/src/services/email.service.ts](../../services/notification/src/services/email.service.ts) | modified |
| [services/chat/src/server.ts](../../services/chat/src/server.ts) | modified |
| [services/quota/src/controllers/quota.controller.ts](../../services/quota/src/controllers/quota.controller.ts) | modified |
| [services/quota/src/services/quota.service.ts](../../services/quota/src/services/quota.service.ts) | modified |
| [services/chat/src/routes/chat.routes.ts](../../services/chat/src/routes/chat.routes.ts) | modified |
| [services/chat/src/services/groq.service.ts](../../services/chat/src/services/groq.service.ts) | modified |
| [services/chat/src/routes/internal-resources.routes.ts](../../services/chat/src/routes/internal-resources.routes.ts) | added |
| [services/quota/src/services/plan-sync.service.ts](../../services/quota/src/services/plan-sync.service.ts) | added |
| [services/chat/src/routes/__tests__/internal-resources.test.ts](../../services/chat/src/routes/__tests__/internal-resources.test.ts) | added |
| [services/chat/src/services/planConfigClient.service.ts](../../services/chat/src/services/planConfigClient.service.ts) | modified |
| [services/chat/src/services/__tests__/groq.test.ts](../../services/chat/src/services/__tests__/groq.test.ts) | modified |
| [services/chat/src/services/__tests__/plan-policy.test.ts](../../services/chat/src/services/__tests__/plan-policy.test.ts) | added |

### Original finding disposition

| ID | Severity | Component | Root cause | Fix plan / implemented correction | Verification / remaining dependency | Status |
| --- | --- | --- | --- | --- | --- | --- |
| U-R01 | High | Admin / Payment / Quota databases | Incompatible physical plans, coupons and audit_logs ownership | Namespaced admin tables and quota audit table; additive legacy-copy compatibility; reconciled checked-in migrations | Fresh PostgreSQL migrate deploy for four Prisma services; 97 admin tests include legacy-copy cases | FIXED |
| U-R02 | High | Pricing / checkout / billing | Static prices and USD values treated as LKR; benefits and actual limits diverged | Admin chooses USD/LKR and explicit amounts; canonical catalog and currency-compatible provider; annual checkout intent and live quota updates | Real admin price UI → PostgreSQL → user pricing reload; signed local annual PayHere lifecycle. Provider sandbox and mixed-currency financial reporting remain open | UNRESOLVED — partial correction |
| U-R03 | High | Active Groq model routing | Unused Claude ceiling did not constrain active Groq fallback | Intersect deployment Groq models with per-plan administrator allowlist; fail closed on policy outage; five-second refresh | Three policy units, provider-loop regressions and builds; actual external model behavior remains BLOCKED | FIXED |
| U-R04 | High | Entitlements / user gates | Plan features and separate feature_flags domain do not consistently control logo, templates, priority, retention or Max behavior | Canonical displayed benefits improved; implement an authoritative entitlement response and connect each remaining consumer | Source traces only for unresolved gates; complete toggle matrix NOT TESTED | UNRESOLVED |
| U-R05 | High | Payment method management | Process-memory metadata imitated payment method persistence | Remove raw card CRUD UI/store; provider-hosted billing portal; unsupported raw-card mutations return 501 | Payment unit regressions, frontend contracts/build; provider-hosted portal remains externally BLOCKED | FIXED — unsafe local flow removed |
| U-R06 | High | Templates / announcements | Placeholder publication modules; no user announcement consumer | Authenticated announcements now reach user banner; empty/error states replace fake template publishing success. Publication pipeline still absent | Actual create/read/disable/delete announcement APIs and user feed verified; template publication NOT IMPLEMENTED | UNRESOLVED — partial correction |
| U-R07 | High | Payment webhook worker | Check/effect/mark spans services; no atomic claim/outbox or ordered reconciliation | Fix callback ownership, recurring IDs, BullMQ IDs and invoice retry behavior; design transactional outbox/order reconciliation separately | Eight concurrent signed local duplicates yield one invoice; worker crash windows, reordered callbacks and real sandbox remain unverified | UNRESOLVED — partial correction |
| U-R08 | High | Quota / document worker | Mixed metering wording, unowned/non-idempotent refunds and incomplete crash recovery | User chose AI requests plus server generations; explicit wording; owned reservation/refund receipts; preserve successful PDF jobs and refund terminal failure once | Real Redis 12-way duplicate reserve/refund tests; quota units; five actual worker exports. Cross-store crash/day-reset reconciliation and browser export metering remain open | UNRESOLVED — partial correction |
| U-R09 | Medium | Both frontends | Unsafe any contracts, invalid effects/ref reads, unused code and purity violations | Explicit API/domain types; committed event callbacks, effect dependencies, ref/state ownership and keyed forms; no rule suppression or exclusion changes | Both npm run lint commands and both frontend builds PASS | FIXED |
| U-R10 | High | Deployment credentials | Formerly embedded defaults may remain active in history/deployments | Owner must revoke/rotate any affected database/provider/signing/internal/bootstrap credentials and verify consistent secret delivery | No production credential validity or revocation attempted; proof is unavailable locally | BLOCKED |
| U-R11 | Medium | Guest / canvas / history | Guest identity transition resets builder; server state, canvas layout and browser PDF/history have distinct persistence contracts | Wire actual chat-session history open/delete and display accurate state/currency; persistent canvas layout and guest migration still require implementation | Actual authenticated session save/reload/delete and server PDF verified; guest-to-account transfer and browser layout/export reload NOT TESTED / NOT IMPLEMENTED | UNRESOLVED — partial correction |
| U-R12 | High | Analytics / admin authentication / abuse | Direct analytics authorization gaps; OTP attempts and submission abuse insufficiently controlled | Protect direct reporting/events with internal secret or Auth verification; atomically limit/consume admin email challenges; secure private notification config feed | Analytics authorization units, admin challenge/concurrency tests and 123 API denial probes. Public support abuse, action-TOTP budgets and full session revocation remain open | UNRESOLVED — partial correction |
| U-R13 | Medium | Readiness / capacity / recovery | Liveness-only checks; repeated Chromium startup and unknown dependency capacity | Shared bounded Chromium process, page/launch timeouts, readiness and explicit overload response; measure narrow local burst/restart behavior | Five queued PDFs plus renderer capacity/recovery probe when recorded; service-wide dependency readiness, capacity and queue-drain benchmarks NOT TESTED | UNRESOLVED — partial correction |
| U-R14 | Medium | Configuration / migrations / test tooling | Chat port drift, missing Prisma migrations and unsafe stale document test entry point | Correct chat fallback port; add schema-compatible checked-in migrations; isolated local harness; legacy document entry point now launches isolated pytest | Four actual Prisma migrate deploy runs, all local services start, document legacy entry point 69 tests PASS. Existing deployment baselines still require review | FIXED — local tooling/schema scope |
| U-R15 | Medium | Admin MCP inspection | Wrong auth/transport lifecycle and no live resource inspection consumer | Private credential-gated read-only Streamable HTTP MCP, initialize/initialized/resources-read lifecycle, audited support RBAC endpoint and actual admin inspection UI | Five real resource reads, two private transport authorization units and live browser session inspection | FIXED |

### Validation and deployment

| Check | Latest result | Scope / observed count | Evidence |
| --- | --- | --- | --- |
| Backend workspaces build | PASS | PASS | [phase2-build-after-quota-fix](evidence/phase2-build-after-quota-fix.json) |
| User frontend lint | PASS | PASS | [phase2-last-user-lint](evidence/phase2-last-user-lint.json) |
| Admin frontend lint | PASS | PASS | [phase2-last-admin-lint](evidence/phase2-last-admin-lint.json) |
| User frontend build | PASS | PASS | [phase2-last-user-build](evidence/phase2-last-user-build.json) |
| Admin frontend build | PASS | PASS | [phase2-last-admin-build](evidence/phase2-last-admin-build.json) |
| Shared + chat/frontend contract regressions | PASS | 223 Node tests + 216 Vitest tests passed | [phase2-final-valid-account-regression](evidence/phase2-final-valid-account-regression.json) |
| Auth units/contracts | PASS | 35 passed | [phase2-final-auth](evidence/phase2-final-auth.json) |
| Payment units/contracts | PASS | 62 passed | [phase2-final-payment](evidence/phase2-final-payment.json) |
| Quota units/contracts | PASS | 25 passed; later durable-removal route verified in actual stack | [phase2-final-quota-route-regression](evidence/phase2-final-quota-route-regression.json) |
| Gateway / notification security / real CORS | PASS | 37 passed; some root-suite overlap | [phase2-final-gateway-notification](evidence/phase2-final-gateway-notification.json) |
| Admin API units/in-process contracts | PASS | 97 passed | [phase2-final-admin-validation](evidence/phase2-final-admin-validation.json) |
| Analytics authorization | PASS | 3 passed | [phase2-final-analytics-tests](evidence/phase2-final-analytics-tests.json) |
| Legacy document entry point / isolated pytest | PASS | 69 passed | [phase2-final-document-tests](evidence/phase2-final-document-tests.json) |
| Mounted admin API denial probes | PASS | 123 denied as expected; 133 mounted method/path operations | [phase2-final-api-auth](evidence/phase2-final-api-auth.json) |
| Real migrated stack / admin / billing / chat / worker | PASS | 89/89 VERIFIED | [phase2-final-tax-crud-stack](evidence/phase2-final-tax-crud-stack.json) |
| Renderer PDF/security, capacity/recovery, browser error states | PASS | 18 PDF probes; 96 browser scenarios; see exact command result | [phase2-probes-recovery-retest](evidence/phase2-probes-recovery-retest.json) |

Environment prerequisites: [environment.json](evidence/phase2/environment.json). Exploratory quality diagnostics are retained under `evidence/phase2/manual-quality-diagnostics/`; final wrapped checks above are authoritative. The owned PostgreSQL fixture was stopped after verification; application processes were cleaned up and isolated data files retained.

1. Back up and inspect the actual deployment schema read-only. **Do not run the new Payment/Quota initial migrations blindly against populated databases**: establish a reviewed Prisma baseline. Validate legacy plan/coupon/audit-table ownership and compatible copy predicates. Retain old audit history; moving historical quota events to `quota_audit_logs` needs an explicit reviewed copy, not a reset.
2. Preflight Chat status/role values before enum conversion; unexpected legacy text must fail the migration. Rehearse locks, startup order and data preservation on an isolated copy. Auth verification fields and Chat persistence tables must exist before new code starts. Admin namespace copies preserve old tables and do not overwrite current namespaced rows.
3. Deploy the CheckoutIntent schema before enabling new checkouts. Reconcile in-flight legacy PayHere orders without intents from trusted provider/account records; the new worker rejects unbound callbacks. Configure explicit USD/LKR amounts and real sandbox product/price identifiers first. No currency conversion or price-identifier fabrication is provided.
4. Supply rotated stable signing/internal/bootstrap secrets and correct service URLs privately. Keep the read-only MCP endpoint on the private service network; admin RBAC/auditing is enforced at its consuming endpoint. Back up configuration versions and verify Redis invalidation/override recovery.
5. Preserve database backups and queue/event evidence. Roll back compatible application/configuration versions only after checking namespace/ledger compatibility; do not drop the new tables or undo enum conversion against live writers. A blind return to old admin table names can read incompatible/stale rows. Prefer a reviewed forward correction; rehearse recovery before release.
6. Release remains blocked until the original high-risk gaps and mandatory provider/CRUD/operational gates pass or a narrower release scope is explicitly approved. No such narrower approval was supplied in this task.

## Phase 1 — Historical audit evidence (preserved)

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

Baseline revision: `a09e7b2b1f45d85ee8f8a8c2901d9c6ed22ac4d5`. The working tree already contained extensive tracked/untracked changes. This list compares source hashes captured before this audit to the final inventory; it does not attribute the entire Git diff to the audit. The prompt file and existing reports were preserved. Build outputs and temporary test databases are not source changes.

| Audit-touched source/configuration | Purpose / scope |
| --- | --- |
| [RUNNING_THE_PROJECT.md:1](../../RUNNING_THE_PROJECT.md#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/eslint.config.js:1](../../admin/eslint.config.js#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/DashboardPage.tsx:1](../../admin/src/pages/DashboardPage.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/subviews/AnalyticsView.tsx:1](../../admin/src/pages/subviews/AnalyticsView.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/subviews/AutomationsView.tsx:1](../../admin/src/pages/subviews/AutomationsView.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/subviews/CostLedgerView.tsx:1](../../admin/src/pages/subviews/CostLedgerView.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/subviews/HomeView.tsx:1](../../admin/src/pages/subviews/HomeView.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/subviews/SecurityView.tsx:1](../../admin/src/pages/subviews/SecurityView.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/subviews/SubscriptionsView.tsx:1](../../admin/src/pages/subviews/SubscriptionsView.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/pages/subviews/SupportView.tsx:1](../../admin/src/pages/subviews/SupportView.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [admin/src/store/adminAuthStore.ts:1](../../admin/src/store/adminAuthStore.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [docker-compose.yml:1](../../docker-compose.yml#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_api.py:1](../../scripts/system_audit_api.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_browser.cjs:1](../../scripts/system_audit_browser.cjs#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_check.py:1](../../scripts/system_audit_check.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_inventory.cjs:1](../../scripts/system_audit_inventory.cjs#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_pdf.py:1](../../scripts/system_audit_pdf.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_quota_probe.ts:1](../../scripts/system_audit_quota_probe.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_reports.py:1](../../scripts/system_audit_reports.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_sync.py:1](../../scripts/system_audit_sync.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [scripts/system_audit_validate.py:1](../../scripts/system_audit_validate.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/api/v1/config.py:1](../../services/admin-api/app/api/v1/config.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/api/v1/infrastructure.py:1](../../services/admin-api/app/api/v1/infrastructure.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/cli/bootstrap.py:1](../../services/admin-api/app/cli/bootstrap.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/core/config.py:1](../../services/admin-api/app/core/config.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/integrations/config_client.py:1](../../services/admin-api/app/integrations/config_client.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/integrations/mcp/chat_client.py:1](../../services/admin-api/app/integrations/mcp/chat_client.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/integrations/services/auth_client.py:1](../../services/admin-api/app/integrations/services/auth_client.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/repositories/permission_repository.py:1](../../services/admin-api/app/repositories/permission_repository.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/repositories/verification_repository.py:1](../../services/admin-api/app/repositories/verification_repository.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/schemas/auth.py:1](../../services/admin-api/app/schemas/auth.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/security/dependencies.py:1](../../services/admin-api/app/security/dependencies.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/security/middleware.py:1](../../services/admin-api/app/security/middleware.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/services/automation_engine.py:1](../../services/admin-api/app/services/automation_engine.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/app/services/email_service.py:1](../../services/admin-api/app/services/email_service.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/conftest.py:1](../../services/admin-api/tests/conftest.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/test_analytics_and_posthog.py:1](../../services/admin-api/tests/test_analytics_and_posthog.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/test_audit_logging.py:1](../../services/admin-api/tests/test_audit_logging.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/test_audit_regressions.py:1](../../services/admin-api/tests/test_audit_regressions.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/test_automation_engine.py:1](../../services/admin-api/tests/test_automation_engine.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/test_config_engine.py:1](../../services/admin-api/tests/test_config_engine.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/test_rbac_engine.py:1](../../services/admin-api/tests/test_rbac_engine.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/admin-api/tests/test_security_and_api.py:1](../../services/admin-api/tests/test_security_and_api.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/controllers/auth.controller.ts:1](../../services/auth/src/controllers/auth.controller.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/controllers/googleLogin.test.ts:1](../../services/auth/src/controllers/googleLogin.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/controllers/internal.controller.ts:1](../../services/auth/src/controllers/internal.controller.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/middleware/auth.middleware.test.ts:1](../../services/auth/src/middleware/auth.middleware.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/middleware/auth.middleware.ts:1](../../services/auth/src/middleware/auth.middleware.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/routes/internal.routes.test.ts:1](../../services/auth/src/routes/internal.routes.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/services/email.service.ts:1](../../services/auth/src/services/email.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/services/jwt.service.test.ts:1](../../services/auth/src/services/jwt.service.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/auth/src/services/jwt.service.ts:1](../../services/auth/src/services/jwt.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/chat/src/middleware/__tests__/rate-limit.test.ts:1](../../services/chat/src/middleware/__tests__/rate-limit.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/chat/src/middleware/auth.middleware.ts:1](../../services/chat/src/middleware/auth.middleware.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/chat/src/services/__tests__/intelligence.test.ts:1](../../services/chat/src/services/__tests__/intelligence.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/chat/src/services/__tests__/quotaClient.service.test.ts:1](../../services/chat/src/services/__tests__/quotaClient.service.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/chat/src/services/planConfigClient.service.ts:1](../../services/chat/src/services/planConfigClient.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/chat/src/services/quotaClient.service.ts:1](../../services/chat/src/services/quotaClient.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/app/main.py:1](../../services/document/app/main.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/app/routers/document.py:1](../../services/document/app/routers/document.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/app/services/authentication.py:1](../../services/document/app/services/authentication.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/app/services/storage.py:1](../../services/document/app/services/storage.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/app/workers/pdf_worker.py:1](../../services/document/app/workers/pdf_worker.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/puppeteer/server.ts:1](../../services/document/puppeteer/server.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/requirements.txt:1](../../services/document/requirements.txt#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/tests/conftest.py:1](../../services/document/tests/conftest.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/tests/test_authentication.py:1](../../services/document/tests/test_authentication.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/tests/test_generation_integration.py:1](../../services/document/tests/test_generation_integration.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/tests/test_storage_signing.py:1](../../services/document/tests/test_storage_signing.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/document/tests/test_worker_delivery.py:1](../../services/document/tests/test_worker_delivery.py#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/config/env.ts:1](../../services/gateway/src/config/env.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/index.ts:1](../../services/gateway/src/index.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/middleware/__tests__/bodyParser.test.ts:1](../../services/gateway/src/middleware/__tests__/bodyParser.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/middleware/__tests__/chat-auth.test.ts:1](../../services/gateway/src/middleware/__tests__/chat-auth.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/middleware/auth.middleware.ts:1](../../services/gateway/src/middleware/auth.middleware.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/middleware/bodyParser.middleware.ts:1](../../services/gateway/src/middleware/bodyParser.middleware.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/security/jwtVerifier.ts:1](../../services/gateway/src/security/jwtVerifier.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/services/__tests__/routing.test.ts:1](../../services/gateway/src/services/__tests__/routing.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/services/configClient.service.ts:1](../../services/gateway/src/services/configClient.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/services/proxyClient.service.ts:1](../../services/gateway/src/services/proxyClient.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/services/serviceRegistry.ts:1](../../services/gateway/src/services/serviceRegistry.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/services/sseRelay.service.ts:1](../../services/gateway/src/services/sseRelay.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/gateway/src/services/upstreamPath.ts:1](../../services/gateway/src/services/upstreamPath.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/notification/src/controllers/notification.controller.ts:1](../../services/notification/src/controllers/notification.controller.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/notification/src/routes/notification.routes.ts:1](../../services/notification/src/routes/notification.routes.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/notification/src/security.test.ts:1](../../services/notification/src/security.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/notification/src/security.ts:1](../../services/notification/src/security.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/notification/src/server.ts:1](../../services/notification/src/server.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/notification/src/services/email.service.ts:1](../../services/notification/src/services/email.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/__tests__/authentication.test.ts:1](../../services/payment/src/__tests__/authentication.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/__tests__/subscription-quota.test.ts:1](../../services/payment/src/__tests__/subscription-quota.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/__tests__/webhook-delivery.test.ts:1](../../services/payment/src/__tests__/webhook-delivery.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/config/env.ts:1](../../services/payment/src/config/env.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/controllers/payment.controller.ts:1](../../services/payment/src/controllers/payment.controller.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/middleware/authenticate.ts:1](../../services/payment/src/middleware/authenticate.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/services/paddle.service.ts:1](../../services/payment/src/services/paddle.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/services/paymentConfigClient.service.ts:1](../../services/payment/src/services/paymentConfigClient.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/services/paymentMethod.service.ts:1](../../services/payment/src/services/paymentMethod.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/payment/src/services/subscription.service.ts:1](../../services/payment/src/services/subscription.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/quota/src/__tests__/authentication.test.ts:1](../../services/quota/src/__tests__/authentication.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/quota/src/middleware/authenticate.ts:1](../../services/quota/src/middleware/authenticate.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [services/quota/src/services/quotaConfigClient.service.ts:1](../../services/quota/src/services/quotaConfigClient.service.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [shared/chat-errors.mjs:1](../../shared/chat-errors.mjs#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [user-frontend/src/api/__tests__/payment.test.ts:1](../../user-frontend/src/api/__tests__/payment.test.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [user-frontend/src/api/billing.ts:1](../../user-frontend/src/api/billing.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [user-frontend/src/pages/PricingPage.tsx:1](../../user-frontend/src/pages/PricingPage.tsx#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [user-frontend/src/store/paymentStore.ts:1](../../user-frontend/src/store/paymentStore.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |
| [user-frontend/src/store/quotaStore.ts:1](../../user-frontend/src/store/quotaStore.ts#L1) | Focused correction, regression coverage, safe audit tooling or setup documentation; see bug groups and source diff |

## Artifacts

The master report and twelve numbered reports were generated, alongside a complete source/control/route inventory, sanitized baseline/configuration evidence, command logs, browser scenario data/screenshots, 17 synthetic PDFs, renderer security checks, mounted API authorization results and real Redis synchronization evidence.

Temporary databases and Redis data live only in audit-created system temporary directories. The live synchronization probe owns and stops its Redis/Node processes. Audit-owned browser and sidecar dev processes were stopped at completion; see [cleanup.json](evidence/cleanup.json). Pre-existing processes/data were preserved.

## Material risks of the corrections

- Internal HTTP clients/deployments must supply the matching service secret; unauthenticated shortcuts now fail.
- Admin credentials/signing configuration must be explicitly supplied; old unsigned download links and leaked code-hint response contracts no longer work.
- Account/quota outages now block work instead of granting unmetered access; operational readiness must account for this availability dependency.
- Provider checkout replaces the simulated pricing modal. Payment-method metadata is still not durable/provider-tokenized.
- The sidecar blocks remote fonts/resources and page scripts; templates need self-contained assets/local fonts. Visual/font parity with all previous exports was not established.
- Shared/live PostgreSQL migrations and provider behavior remain unverified; these changes are not a production-ready declaration.
