# User workflows

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

The user decided that administrators select billing currency and explicit prices. Implemented supported choices are **USD and LKR**, with separate monthly/yearly amounts; there is no guessed exchange-rate conversion. Checkout validates the selected currency against the chosen provider. This does not add arbitrary-currency support.

The user also chose **AI chat requests plus generated documents** as the daily quota unit. The UI now says “AI chat requests + server PDF generations per day.” Provider-requiring AI turns and server generations reserve units; deterministic field edits do not call a provider. Browser-side canvas export remains a separate path and does not currently enforce the same server generation meter; that gap remains U-R08/U-R11. The legacy `monthly_quota` field name stores the daily allowance for wire compatibility.

| Workflow | Final evidence | Status / limitation |
| --- | --- | --- |
| Register → verify → login → profile reload | Real gateway/Auth/PostgreSQL with stored challenge read only by test fixture | VERIFIED locally; email delivery and Google BLOCKED |
| Five document sessions / corrections / replay / reload / delete | Real SSE engine, owner-scoped Prisma and API reads | VERIFIED deterministic path; external AI intelligence BLOCKED |
| Server export / download / deletion | Actual Redis worker, Chromium, persisted document and extracted PDF text | VERIFIED for five fixtures; complete sharing/custom canvas path NOT TESTED |
| Pricing / annual checkout / active subscriber allowance | Actual admin-to-user UI and signed local webhook pipeline | VERIFIED fixture path; provider sandbox lifecycle BLOCKED |
| History / billing settings | Typed real sessions, reopen/delete handlers and provider portal UI; builds/regressions | FIXED source; every browser CRUD action NOT TESTED |
| Guest identity / layout restore / browser PDF accounting | Existing split persistence paths | UNRESOLVED U-R08/U-R11 |

Full assertion list: [07-TEST_RESULTS.md](07-TEST_RESULTS.md).

## Phase 1 — Historical audit evidence (preserved)

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

| ID | Workflow | Route | Actual path | Evidence status | Evidence / issue |
| --- | --- | --- | --- | --- | --- |
| U01 | Landing/pricing/navigation | /, /pricing | Page → router → UI actions; plan cards are hardcoded | VERIFIED rendering/error states; UNRESOLVED dynamic pricing | browser-scenarios.json; U-R02 |
| U02 | Email registration and verification | /register, /verify-email | Auth client → gateway → Auth → users → email_queue → verification update | VERIFIED focused controllers; BLOCKED live email/DB journey | final-auth-tests.log |
| U03 | Password login and MFA | /login | Credentials → user lookup → optional MFA token/TOTP → refresh session → access bearer | VERIFIED typed-token/account checks; BLOCKED real account journey | final-auth-tests.log |
| U04 | Google sign-in | /login, /register | Firebase UI → ID token → Auth signature/provider/email checks → existing/new user → session | VERIFIED mocked token/account cases; BLOCKED interactive Firebase | final-auth-tests.log |
| U05 | Password recovery/reset | /password-reset, /reset-password | Token email → stored reset row → password mutation | INFERRED user flow; BLOCKED live delivery | services/auth/src/controllers/auth.controller.ts |
| U06 | Guest creation | Guest CTA / builder | guestLogin → persisted unique guest → 24-hour access bearer → chat session | VERIFIED mocked persistence and failure cases | final-auth-tests.log |
| U07 | Guest restrictions | Builder export and document APIs | Guest identity → frontend gate + no public URL/share bypass | VERIFIED export guards and server regressions | final-chat-tests.log; final-document-python.log |
| U08 | Guest-to-account transition | Login/register while guest | Identity subscription resets chat/document stores; no guest migration endpoint found | NOT IMPLEMENTED preservation/migration; NOT TESTED live transition | user-frontend/src/App.tsx; U-R11 |
| U09 | Dashboard overview | /dashboard | Dashboard queries → APIs/stores → cards/history/quota | VERIFIED unavailable-backend rendering; BLOCKED real data accuracy | browser-scenarios.json |
| U10 | Profile/timezone/security | /dashboard/profile | users client → /auth/me → persisted profile; TOTP endpoints | FIXED timezone persistence; VERIFIED focused controller cases | final-auth-tests.log; browser-scenarios.json |
| U11 | History and reopen | /dashboard/document-history | Chat/session history + document history APIs → restored state | VERIFIED isolated owner/snapshot tests; BLOCKED complete PostgreSQL reopen | final-chat-tests.log |
| U12 | Billing and methods | /dashboard/billing | Payment client → payment routes → subscriptions/invoices/method metadata | FIXED path/serialization/error behavior; UNRESOLVED memory-only methods | final-chat-tests.log; U-R05 |
| U13 | Support submission | /dashboard/support | Public /support endpoints → gateway → Admin API → support tables → admin views | FIXED gateway connection; VERIFIED isolated admin support tests | final-admin-python.log; gateway-notification-tests.log |
| U14 | Document type/template selection | /builder | Builder → template definitions → chat session/template revision | VERIFIED shared schema/template tests; NOT TESTED every browser variant | final-chat-tests.log |
| U15 | Required/optional collection | Builder chat | Intent/local extraction → field validation → conversation revision → next missing field | VERIFIED isolated field/conversation tests | final-chat-tests.log |
| U16 | Multiple values/ambiguous input | Builder chat | Explicit clauses/table extraction → candidates or clarification → commit | VERIFIED shared/route tests; BLOCKED live model accuracy | final-chat-tests.log |
| U17 | Natural-language corrections | Builder chat | Scoped change/remove/add intent → tool/field processing → committed snapshot | VERIFIED isolated provider/tool/field tests | final-chat-tests.log |
| U18 | Amounts/taxes/discounts | All supported types | Shared decimal-safe calculation → preview data → Python equivalent → template | VERIFIED contract tests and exported fixture totals | final-chat-tests.log; final-document-python.log; pdf-scenarios.json |
| U19 | Manual/canvas edits | Builder canvas | Semantic field mapping → revision-checked update → regenerated canvas | VERIFIED store/field tests; NOT TESTED all visual edit controls | final-chat-tests.log |
| U20 | Images/logos/attachments | Builder attachments | Validate/prepare asset → owned session revision → canvas/sidecar asset placement | VERIFIED unit contracts; BLOCKED live persisted asset journey | final-chat-tests.log; final-document-python.log |
| U21 | SSE/resilience | Chat message endpoint | Lease/turn ID → bounded provider/tools → checkpoint → framed completion/error | VERIFIED mocked failures, relay, cancellation and duplicate handling | final-chat-tests.log; gateway-notification-tests.log |
| U22 | Session recovery/ownership | Builder refresh/history | Authenticated account → repository ownership/revision → persisted snapshot | VERIFIED isolated repository cases; BLOCKED live browser recovery | final-chat-tests.log |
| U23 | Client PDF export | Builder download | Re-read/confirm snapshot → clone rendered canvas → image/font capture → jsPDF | VERIFIED mocked capture/guard tests; NOT TESTED full real-user export | final-chat-tests.log |
| U24 | Queued PDF generation | POST /document/generate | Validated chat snapshot → reserve → durable request → queue → Python worker → sidecar → storage | VERIFIED isolated generation contracts + real renderer; BLOCKED full distributed job | final-document-python.log; pdf-scenarios.json |
| U25 | Download/share/delete | Document API | Owner lookup → signed URL or binary; share token+expiry; delete storage/row | FIXED ownership/capability checks; BLOCKED real storage lifecycle | final-document-python.log |
| U26 | Custom reusable templates | Builder save/load template | Canvas elements → custom_templates CRUD → user-scoped restore | INFERRED implementation; NOT TESTED full CRUD/reload | services/document/app/routers/document.py |
| U27 | Checkout and cancellation | Pricing/billing | Actual provider URL/form → signed callback → queue/worker → subscription and Auth/quota | FIXED simulated success; VERIFIED focused handlers; BLOCKED sandbox | final-payment-tests.log; final-chat-tests.log |
| U28 | Coupons/trials | Billing + admin promotions | Admin APIs → Payment service table → validation/checkout/trial functions | VERIFIED focused coupon/config tests; BLOCKED provider application | final-payment-tests.log; final-admin-python.log |
| U29 | Quota and plan updates | Profile/dashboard/builder | Admin plan row → Redis keys/pubsub → cached Node client → user request | VERIFIED real consumer invalidation and isolated counters | synchronization-scenarios.json; final-quota-tests.log |
| U30 | Notifications/preferences | Notification API | Current Auth identity → own preferences/logs; internal send → queue → Resend | FIXED authorization/signature/queue contracts; BLOCKED live delivery | gateway-notification-tests.log; final-document-python.log |
| U31 | Announcements | Admin notifications | Admin persists announcement; no matching user fetch/display consumer found | NOT IMPLEMENTED end-to-end delivery | U-R06 |
| U32 | Responsive/theme/keyboard | Both applications | Responsive utility styles and theme stores; form controls and route shells | VERIFIED desktop render only; NOT TESTED mobile/a11y matrix | browser-scenarios.json |

## Trace the outcomes rather than the screen alone

The complete control inventory links each input, button, form, navigation element, and event-bearing custom component to its source line. An attached handler establishes only a source connection. Validation, API behavior, persistence, and visible success are separate assertions. Controls not exercised have NOT TESTED entries; browser error-state success must not be upgraded to CRUD success.

### Authentication and account state

The browser stores access tokens in localStorage and a JavaScript-readable cookie. Its generic request wrapper clears the session on a matching-token 401; an Auth dependency outage now returns 503 at the protected boundaries instead of falsely expiring a valid session. No claim is made that browser storage protects tokens from all XSS risks. Refresh-token endpoints exist; full automatic frontend refresh behavior was not verified.

Registration/verification no longer substitute process-local users for failed persistence or provision an email-verified account from an arbitrary six-character code. Google verification, account reuse, disabled accounts, guest persistence failure, and MFA-token rejection have focused regression coverage. Profile timezone-only edits now write and serialize the timezone instead of silently discarding it.

### Builder and persistence

User messages can populate several fields, amend existing facts, add/remove items, and ask questions without blindly filling the next field. The shared field engine tracks confirmed/missing/ambiguous states, conditional requirements, provenance, and finalization fingerprints. Saved facts remain authoritative when provider output fails. Business names preserve supplied spelling/capitalization; uncertain identity values are not invented. The tests exercise `Nexora` fixtures, not a guarantee that arbitrary brand normalization is correct.

The JavaScript contract uses `purchase_order`; server template directories also use `purchaseOrder`. This alias is explicit. All five types and 17 server template files were rendered into real PDFs. The fixture includes 3 × 2.675 = 8.03 subtotal, 7.5% tax = 0.60, and total 8.63. Tests also cover supported discounts, dates, item edits, and schema disagreement. This does not cover every locale, discount/tax combination, pagination limit, or provider response.

Semantic session fields and browser layout state have different persistence paths. A downloaded canvas PDF is not proof of a server `documents` record. Custom template CRUD exists independently of admin template publishing, whose module is a placeholder. Browser save/reload, long documents, external storage, and guest migration still need dedicated environment-backed checks.

### Payments and communication

Pricing no longer upgrades a browser after a timer or accepts a simulated card payment. Checkout uses server-returned provider navigation/form data; backend failures propagate. Payment-method stores update UI state after a successful API result. The backend methods implementation remains memory-only metadata; it is not verified provider tokenization or durable storage.

Support submission routes now have both a registry destination and the correct Admin API path. Public support endpoints still accept submitted identity/contact fields and need abuse/ownership validation beyond the existing fixture checks. Announcements can be persisted/administered, but no user-facing announcement feed/display was found.
