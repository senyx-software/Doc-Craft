# Test results

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

## Final check commands

| Check | Working directory | Command | Result | Evidence scope/count | Output |
| --- | --- | --- | --- | --- | --- |
| final-backend-build | . | npm run build | PASS | Command completion | [log](evidence/final-backend-build.log) |
| final-user-build | . | npm run build --prefix user-frontend | PASS | Command completion | [log](evidence/final-user-build.log) |
| final-admin-build | . | npm run build --prefix admin | PASS | Command completion | [log](evidence/final-admin-build.log) |
| final-user-lint | . | npm run lint --prefix user-frontend | FAIL | 154 errors, 6 warnings | [log](evidence/final-user-lint.log) |
| final-admin-lint | . | npm run lint --prefix admin | FAIL | 349 errors, 6 warnings | [log](evidence/final-admin-lint.log) |
| final-chat-tests | . | npm run test:chat | PASS | 223 shared Node cases, 209 cases | [log](evidence/final-chat-tests.log) |
| final-auth-tests | . | npm run test -w doccraft-auth | PASS | 35 cases | [log](evidence/final-auth-tests.log) |
| final-payment-tests | . | npm run test -w doccraft-payment | PASS | 53 cases | [log](evidence/final-payment-tests.log) |
| final-quota-tests | . | npm run test -w doccraft-quota | PASS | 24 cases | [log](evidence/final-quota-tests.log) |
| final-document-python | services/document | /home/eranda/Projects/doc-craft/.venv-local/bin/python -m pytest tests -q | PASS | 69 cases | [log](evidence/final-document-python.log) |
| final-admin-python | services/admin-api | /home/eranda/Projects/doc-craft/.venv-local/bin/python -m pytest tests -q | PASS | 90 cases | [log](evidence/final-admin-python.log) |
| gateway-notification-tests | . | node_modules/.bin/vitest run services/gateway/src/services/__tests__ services/gateway/src/middleware/__tests__ services/notification/src/security.test.ts | PASS | 36 cases | [log](evidence/gateway-notification-tests.log) |
| mounted-api-authorization | . | .venv-local/bin/python scripts/system_audit_api.py | PASS | 121/121 scenarios | [log](evidence/mounted-api-authorization.log) |
| browser-error-states | . | node scripts/system_audit_browser.cjs | PASS | 96/96 scenarios | [log](evidence/browser-error-states.log) |
| chromium-pdf-templates | . | .venv-local/bin/python scripts/system_audit_pdf.py | PASS | 18/18 scenarios | [log](evidence/chromium-pdf-templates.log) |
| live-admin-quota-sync | . | .venv-local/bin/python scripts/system_audit_sync.py | PASS | 2/2 scenarios | [log](evidence/live-admin-quota-sync.log) |
| artifact-validation | . | .venv-local/bin/python scripts/system_audit_validate.py | PASS | Command completion | [log](evidence/artifact-validation.log) |

Counts belong to the named check. Gateway SSE/auth tests run both in the root chat suite and in the focused gateway run; do not sum those rows as unique test cases without deduplication. Repeated final commands replace the corresponding final evidence file. Baseline/intermediate evidence is retained separately where named.

The backend build succeeds independently of frontend builds. The admin build initially failed with 31 unused-declaration errors. The original admin lint invocation had no configuration. Adding the configuration exposes genuine violations; the audit did not disable lint rules to manufacture a pass. User lint already failed at baseline. Baseline admin Python execution produced 74 passes and three failures: two stale hardcoded-invitation-password test fixtures and an unsupported PostHog “connected” expectation. Fixture tests now seed/use actual state and test the reported partial configuration honestly.

Admin pytest fixtures now always allocate disposable SQLite state and test transport settings instead of trusting the developer's configured database. Python runs also used an external-network guard. TestClient exercises real FastAPI HTTP routing in process without entering service lifespan, so production workers/bootstrap were not started. The Redis synchronization probe starts/stops its own Redis process and writes only its temporary SQLite database. Browser probes intercept API traffic and use synthetic identities; error-state rendering is the verified property.

## Blocked or unexecuted categories

| ID | Workflow | Expected prerequisite | Actual limitation | Status | Evidence/issue |
| --- | --- | --- | --- | --- | --- |
| EXT01 | Full PostgreSQL-backed user/admin CRUD and browser persistence | Working isolated PostgreSQL and migrated compatible schema | Shared/remote configuration not mutated; no approved isolated instance available | BLOCKED | U-R01 |
| EXT02 | Live Groq/Claude provider intelligence/fallback/entitlements | Controlled provider test resources | Only isolated/mocked provider adapters exercised | BLOCKED | U-R03 |
| EXT03 | Interactive Firebase/Google account login | Test browser account and provider configuration | JWT/Firebase controller cases mocked; no external interactive sign-in | BLOCKED | final-auth-tests.log |
| EXT04 | Real Paddle/PayHere checkout, refunds, upgrades/downgrades | Confirmed sandbox account and products/webhook setup | Signed fixture/unit tests only; no real charges or refunds | BLOCKED | U-R02,U-R07 |
| EXT05 | Resend email delivery and registered callback | Controlled recipient, sandbox/approved transport, callback registration | No real communications sent | BLOCKED | gateway-notification-tests.log |
| EXT06 | Supabase upload/delete/share and cross-instance storage | Isolated bucket/test project | Renderer and mock storage tests do not prove remote object lifecycle | BLOCKED | final-document-python.log |
| EXT07 | Docker build/start and deployment readiness | Docker runtime | Tool unavailable; Compose parsed statically only | NOT TESTED | 01-SYSTEM_ARCHITECTURE.md |
| EXT08 | Load/performance/recovery, all visual and mobile/a11y cases | Defined load targets/test stack and browser matrix | No benchmark or complete accessibility/responsive evaluation | NOT TESTED | U-R13 |
| EXT09 | Legacy live document script | Isolated configured stack and corrected routes | Script mutates data and uses stale paths; deliberately not executed | NOT TESTED | services/document/test_document.py |

## Browser workflow probes

| Test ID | Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| BR001 | user / | Public page or protected-route redirect handles unavailable APIs without a render crash | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR002 | user /login | Public page or protected-route redirect handles unavailable APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR003 | user /register | Public page or protected-route redirect handles unavailable APIs without a render crash | 23 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR004 | user /verify-email | Public page or protected-route redirect handles unavailable APIs without a render crash | 19 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR005 | user /password-reset | Public page or protected-route redirect handles unavailable APIs without a render crash | 17 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR006 | user /pricing | Public page or protected-route redirect handles unavailable APIs without a render crash | 15 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR007 | user /builder | Public page or protected-route redirect handles unavailable APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR008 | user /dashboard | Public page or protected-route redirect handles unavailable APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR009 | user /dashboard | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR010 | user /dashboard/profile | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR011 | user /dashboard/document-history | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR012 | user /dashboard/billing | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR013 | user /dashboard/support | Authenticated screen handles unavailable downstream APIs without a render crash | 22 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR014 | user /builder?new=true | Authenticated screen handles unavailable downstream APIs without a render crash | 13 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR015 | admin /home_dashboard | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR016 | admin /users_all | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR017 | admin /users_active | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR018 | admin /users_suspended | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR019 | admin /users_guest | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR020 | admin /users_details | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR021 | admin /subs_all | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR022 | admin /subs_active | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR023 | admin /subs_cancelled | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR024 | admin /subs_failed | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR025 | admin /subs_refunds | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR026 | admin /subs_plan_overview | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR027 | admin /rev_mrr_arr | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR028 | admin /rev_by_plan | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR029 | admin /rev_cost_ledger | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR030 | admin /rev_churn | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR031 | admin /rev_ltv | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR032 | admin /rev_transactions | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR033 | admin /rev_payouts | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR034 | admin /promo_coupons | Admin section renders an error/empty state for backend 503 responses | 38 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR035 | admin /promo_active | Admin section renders an error/empty state for backend 503 responses | 38 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR036 | admin /promo_ab_tests | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR037 | admin /promo_referrals | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR038 | admin /promo_trials | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR039 | admin /pack_current | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR040 | admin /pack_create | Admin section renders an error/empty state for backend 503 responses | 39 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR041 | admin /pack_flags | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR042 | admin /pack_ai_models | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR043 | admin /pack_performance | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR044 | admin /gen_total | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR045 | admin /gen_by_type | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR046 | admin /gen_by_user | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR047 | admin /gen_failed | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR048 | admin /gen_free_tier | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR049 | admin /gen_pro_tier | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR050 | admin /gen_drop_offs | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR051 | admin /doc_all | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR052 | admin /doc_templates | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR053 | admin /doc_breakdown | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR054 | admin /doc_links | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR055 | admin /an_traffic | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR056 | admin /an_location | Admin section renders an error/empty state for backend 503 responses | 35 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR057 | admin /an_device | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR058 | admin /an_duration | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR059 | admin /an_clicks | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR060 | admin /an_funnel | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR061 | admin /an_conversion | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR062 | admin /an_journey | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR063 | admin /sec_ip_logs | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR064 | admin /sec_suspicious | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR065 | admin /sec_rate_limits | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR066 | admin /sec_bot_logs | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR067 | admin /sec_abuse_reports | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR068 | admin /sec_audit | Admin section renders an error/empty state for backend 503 responses | 32 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR069 | admin /sec_sessions | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR070 | admin /sup_reported | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR071 | admin /sup_refunds | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR072 | admin /sup_contact | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR073 | admin /sup_overrides | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR074 | admin /not_automation | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR075 | admin /not_execution_logs | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR076 | admin /not_emit_events | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR077 | admin /not_email_logs | Admin section renders an error/empty state for backend 503 responses | 33 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR078 | admin /not_system | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR079 | admin /not_templates | Admin section renders an error/empty state for backend 503 responses | 34 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR080 | admin /inf_uptime | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR081 | admin /inf_mcp_chat | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR082 | admin /inf_sentry | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR083 | admin /inf_api_usage | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR084 | admin /inf_db_health | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR085 | admin /inf_deployments | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR086 | admin /inf_staging_prod | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR087 | admin /set_dynamic_config | Admin section renders an error/empty state for backend 503 responses | 37 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR088 | admin /set_profile | Admin section renders an error/empty state for backend 503 responses | 35 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR089 | admin /set_admin_users | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR090 | admin /set_2fa | Admin section renders an error/empty state for backend 503 responses | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR091 | admin /set_api_keys | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR092 | admin /set_billing | Admin section renders an error/empty state for backend 503 responses | 28 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR093 | admin /set_gdpr | Admin section renders an error/empty state for backend 503 responses | 31 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR094 | admin /set_export_csv | Admin section renders an error/empty state for backend 503 responses | 30 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR095 | admin /set_preferences | Admin section renders an error/empty state for backend 503 responses | 36 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |
| BR096 | admin / | Unauthenticated admin login screen renders | 29 controls; page errors=0; boundary=False | PASS | [scenario data](evidence/browser-scenarios.json) |

## Mounted API authentication probes

| Test ID | Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| API-AUTH-001 | POST /api/v1/admin/auth/change-password | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-002 | POST /api/v1/admin/auth/totp/setup | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-003 | POST /api/v1/admin/auth/totp/verify | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-004 | POST /api/v1/admin/auth/totp/disable | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-005 | POST /api/v1/admin/auth/request-action-code | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-006 | GET /api/v1/admin/auth/me | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-007 | PATCH /api/v1/admin/auth/me | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-008 | GET /api/v1/admin/roles | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-009 | POST /api/v1/admin/roles | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-010 | PATCH /api/v1/admin/roles/{role_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-011 | DELETE /api/v1/admin/roles/{role_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-012 | GET /api/v1/admin/permissions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-013 | GET /api/v1/admin/staff | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-014 | POST /api/v1/admin/staff/invite | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-015 | PATCH /api/v1/admin/staff/{staff_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-016 | DELETE /api/v1/admin/staff/{staff_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-017 | GET /api/v1/admin/audit-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-018 | GET /api/v1/admin/audit-logs/all | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-019 | GET /api/v1/admin/audit-logs/{log_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-020 | GET /api/v1/admin/security/alerts | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-021 | PATCH /api/v1/admin/security/alerts/{alert_id}/resolve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-022 | GET /api/v1/admin/security/sessions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-023 | DELETE /api/v1/admin/security/sessions/{session_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-024 | GET /api/v1/admin/security/ip-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-025 | GET /api/v1/admin/security/rate-limits | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-026 | GET /api/v1/admin/security/bot-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-027 | GET /api/v1/admin/security/abuse-reports | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-028 | PATCH /api/v1/admin/security/abuse-reports/{report_id}/resolve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-029 | POST /api/v1/admin/security/bot-detection-event | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-030 | POST /api/v1/admin/security/rate-limit-violation | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-031 | POST /api/v1/admin/security/auto-suspend | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-032 | GET /api/v1/admin/security/api-keys | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-033 | GET /api/v1/admin/plans | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-034 | POST /api/v1/admin/plans | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-035 | GET /api/v1/admin/plans/performance | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-036 | PATCH /api/v1/admin/plans/{plan_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-037 | POST /api/v1/admin/plans/{plan_id}/archive | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-038 | POST /api/v1/admin/users/{user_id}/quota-override | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-039 | DELETE /api/v1/admin/users/{user_id}/quota-override | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-040 | GET /api/v1/admin/coupons | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-041 | POST /api/v1/admin/coupons | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-042 | POST /api/v1/admin/coupons/{coupon_id}/archive | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-043 | GET /api/v1/admin/trials | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-044 | POST /api/v1/admin/trials | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-045 | PATCH /api/v1/admin/trials/{trial_id}/extend | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-046 | POST /api/v1/admin/trials/{trial_id}/end | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-047 | GET /api/v1/admin/subscriptions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-048 | GET /api/v1/admin/subscriptions/stats | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-049 | GET /api/v1/admin/revenue | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-050 | GET /api/v1/admin/invoices | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-051 | GET /api/v1/admin/failed-payments | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-052 | GET /api/v1/admin/refunds | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-053 | GET /api/v1/admin/cost-ledger | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-054 | POST /api/v1/admin/cost-ledger | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-055 | DELETE /api/v1/admin/cost-ledger/{entry_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-056 | GET /api/v1/admin/cost-ledger/summary | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-057 | GET /api/v1/admin/promotions/ab-tests | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-058 | GET /api/v1/admin/promotions/referrals | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-059 | POST /api/v1/admin/promotions/referrals | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-060 | POST /api/v1/admin/promotions/referrals/{referral_id}/convert | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-061 | GET /api/v1/admin/automation/rules | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-062 | POST /api/v1/admin/automation/rules | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-063 | PATCH /api/v1/admin/automation/rules/{rule_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-064 | DELETE /api/v1/admin/automation/rules/{rule_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-065 | POST /api/v1/admin/automation/rules/{rule_id}/dry-run | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-066 | POST /api/v1/admin/automation/dry-run | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-067 | POST /api/v1/admin/automation/events/emit | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-068 | GET /api/v1/admin/automation/execution-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-069 | GET /api/v1/admin/analytics/overview | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-070 | GET /api/v1/admin/analytics/revenue | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-071 | GET /api/v1/admin/analytics/generations | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-072 | GET /api/v1/admin/analytics/generations/detailed | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-073 | GET /api/v1/admin/analytics/journey | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-074 | GET /api/v1/admin/analytics/users | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-075 | GET /api/v1/admin/analytics/traffic | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-076 | GET /api/v1/admin/analytics/posthog/config | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-077 | GET /api/v1/admin/analytics/button-clicks | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-078 | GET /api/v1/admin/analytics/page-duration | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-079 | POST /api/v1/admin/analytics/events | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-080 | GET /api/v1/admin/notifications/email-logs | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-081 | GET /api/v1/admin/notifications/failed | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-082 | GET /api/v1/admin/notifications/history | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-083 | GET /api/v1/admin/notifications/status | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-084 | GET /api/v1/admin/notifications/announcements | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-085 | POST /api/v1/admin/notifications/announcements | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-086 | PATCH /api/v1/admin/notifications/announcements/{announcement_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-087 | DELETE /api/v1/admin/notifications/announcements/{announcement_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-088 | GET /api/v1/admin/notifications/templates | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-089 | POST /api/v1/admin/notifications/templates | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-090 | PUT /api/v1/admin/notifications/templates/{template_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-091 | DELETE /api/v1/admin/notifications/templates/{template_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-092 | GET /api/v1/admin/notifications/settings | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-093 | PUT /api/v1/admin/notifications/settings | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-094 | GET /api/v1/admin/support/tickets | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-095 | GET /api/v1/admin/support/tickets/{ticket_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-096 | PATCH /api/v1/admin/support/tickets/{ticket_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-097 | POST /api/v1/admin/support/tickets/{ticket_id}/resolve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-098 | GET /api/v1/admin/support/refunds | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-099 | PATCH /api/v1/admin/support/refunds/{refund_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-100 | GET /api/v1/admin/support/contact | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-101 | PATCH /api/v1/admin/support/contact/{contact_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-102 | GET /api/v1/admin/support/plan-overrides | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-103 | PATCH /api/v1/admin/support/plan-overrides/{override_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-104 | POST /api/v1/admin/support/plan-overrides/{override_id}/approve | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-105 | GET /api/v1/admin/gdpr/export | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-106 | POST /api/v1/admin/gdpr/purge | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-107 | GET /api/v1/admin/reports/users-csv | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-108 | GET /api/v1/admin/infrastructure/mcp/sessions | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-109 | GET /api/v1/admin/infrastructure/mcp/templates | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-110 | GET /api/v1/admin/infrastructure/health | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-111 | GET /api/v1/users/ | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-112 | GET /api/v1/users/{user_id} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-113 | PATCH /api/v1/users/{user_id}/status | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-114 | PATCH /api/v1/users/{user_id}/plan | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-115 | PATCH /api/v1/users/{user_id}/quota | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-116 | POST /api/v1/users/{user_id}/override | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-117 | GET /api/v1/internal/config/{domain} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-118 | GET /api/v1/internal/config | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-119 | GET /api/v1/admin/config/{domain} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-120 | PUT /api/v1/admin/config/{domain} | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |
| API-AUTH-121 | GET /api/v1/admin/config/{domain}/history | 401 or 403 before any protected handler executes | 401 | PASS | [scenario data](evidence/api-authorization-scenarios.json) |

## Renderer and synchronization probes

| Test ID | Workflow | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| PDF01 | invoice classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF02 | invoice grid-bordered | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF03 | invoice minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF04 | invoice modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF05 | invoice odoo-community | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF06 | proposal classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF07 | proposal minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF08 | proposal modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF09 | purchase_order classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF10 | purchase_order minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF11 | purchase_order modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF12 | quotation classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF13 | quotation minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF14 | quotation modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF15 | receipt classic | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF16 | receipt minimal | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF17 | receipt modern | PDF text/bytes or blocked active content | {'Nexora': True, 'Audit Customer': True, '8.63': True} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| PDF18 | Security Renderer blocks active scripts and internal network fetches | PDF text/bytes or blocked active content | {'trap_requests': 0} | PASS | [scenario data](evidence/pdf-scenarios.json) |
| SYNC01 | Admin plan quota update reaches an already-cached Node consumer over real Redis pub/sub | Persisted admin change consumed correctly | 12 | PASS | [scenario data](evidence/synchronization-scenarios.json) |
| SYNC02 | Plan update survives a new admin API read | Persisted admin change consumed correctly | Fresh API read matched | PASS | [scenario data](evidence/synchronization-scenarios.json) |
