# API, database and integrations

Evidence labels: **VERIFIED** = the stated, limited assertion was exercised; **INFERRED** = source/configuration evidence only; **NOT TESTED** = no execution evidence; **BLOCKED** = safe resources or prerequisites unavailable; **NOT IMPLEMENTED** = absent/placeholder implementation; **FIXED** = correction made in this audit; **UNRESOLVED** = work remains. PASS/FAIL describe a check's observed outcome, not whole-product completeness.

Audit date: 2026-10-15. Tests used isolated fixtures. Existing remote databases, real customers, payment accounts, and email recipients were not mutated. Static discovery counts source definitions, not independent business capabilities.

Observed audit tools: Node v24.20.0, npm 11.19.0, Python 3.13.13 in `.venv-local`. Service virtual environments used a different Python version and lacked pytest. Backend and frontend dependency versions come from the checked-in package manifests/installed local toolchain; this report does not assert that Docker images match those versions.

## Gateway path contracts

| Public prefix | Actual upstream prefix | Notes |
| --- | --- | --- |
| /v1/auth, /v1/users | /v1/auth | User auth aliases; internal admin APIs require a service secret |
| /v1/chat/api, /v1/ai/api | /api | Chat session/SSE/MCP routes |
| /v1/chat/session(s) | /api/chat/session(s) | Legacy session/history shorthand |
| /v1/document(s) | /v1/document | Singular document API mount |
| /v1/templates | /v1/document/templates | Template-list/detail alias |
| /v1/payment, /v1/billing | /v1/payment | Raw provider webhook bodies preserved |
| /v1/notification(s) | /notification | Actual notification mount; callback raw bytes preserved |
| /v1/support | /api/v1/support | Public support submission mount on Admin API |
| /v1/admin | /api/v1/admin | Browser normally uses direct Admin API with its own admin bearer |
| /v1/admin/users | /api/v1/users | Users router is mounted separately from /admin |
| /v1/analytics | /v1/analytics | Reporting requires further direct-service boundary review |

The translation function preserves query bytes and uses segment boundaries. REST and SSE relays use the same path translation. The JSON ingress accepts bounded document-asset requests; payment and Resend callbacks retain original bytes. These checks do not prove every alias/verb combination against a running full stack.

## Background queues, events and caches

| Channel/key | Producer | Consumer | Contract / remaining limitation |
| --- | --- | --- | --- |
| document | Document generate API | Embedded Python PDF worker | Durable document snapshot and stable job ID; terminal retry/refund reconciliation incomplete |
| email_queue | Auth, document, notification HTTP dispatch | Node notification worker | Event name must map to a Handlebars template; userId/email/documentUrl preserved |
| Payment webhook queue | Verified Paddle/PayHere handler | Payment BullMQ worker | Three attempts/backoff configured; ack only after enqueue; cross-effect atomicity unproven |
| analytics | Analytics event API | Python PostHog worker | Event payload, anonymization flag, retry options; live ingestion untested |
| doccraft:events | Quota/payment events and admin emit | Admin event subscriber/automation engine | Pub/sub is not a durable event log; worker/action delivery needs recovery tests |
| config_invalidation | Admin ConfigEngine | Node config subscribers | Invalidate cached domain data; one live quota consumer verified |
| config:domain:* | Admin versioned config engine | Gateway/payment/quota and other feed clients | JSON configuration snapshot; internal HTTP fallback requires secret |
| quota:plan:*, quota:limit:*, quota:user:* | Admin config/override and quota service | Quota Lua/status logic | Plan daily allowance, per-user override and counters; historical monthly_quota naming |
| Conversation leases/checkpoints | Chat repository | Chat turn execution/retry | Persisted revision/turn ownership; separate Redis concurrency/rate gates also exist |

## Database definitions

The table below lists source definitions rather than a live schema dump. Repeated physical table names across owners are intentional audit evidence of ownership/schema ambiguity, not proof that both declarations are compatible.

| Definition | Kind | Source | Validation |
| --- | --- | --- | --- |
| admin_users | database-table | [services/admin-api/app/db/admin_db.py:69](../../services/admin-api/app/db/admin_db.py#L69) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| admin_roles | database-table | [services/admin-api/app/db/admin_db.py:88](../../services/admin-api/app/db/admin_db.py#L88) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| audit_logs | database-table | [services/admin-api/app/db/admin_db.py:101](../../services/admin-api/app/db/admin_db.py#L101) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| verification_codes | database-table | [services/admin-api/app/db/admin_db.py:117](../../services/admin-api/app/db/admin_db.py#L117) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| plans | database-table | [services/admin-api/app/db/admin_db.py:126](../../services/admin-api/app/db/admin_db.py#L126) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| coupons | database-table | [services/admin-api/app/db/admin_db.py:146](../../services/admin-api/app/db/admin_db.py#L146) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| user_quota_overrides | database-table | [services/admin-api/app/db/admin_db.py:162](../../services/admin-api/app/db/admin_db.py#L162) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| security_alerts | database-table | [services/admin-api/app/db/admin_db.py:175](../../services/admin-api/app/db/admin_db.py#L175) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| active_sessions | database-table | [services/admin-api/app/db/admin_db.py:187](../../services/admin-api/app/db/admin_db.py#L187) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| ip_access_logs | database-table | [services/admin-api/app/db/admin_db.py:199](../../services/admin-api/app/db/admin_db.py#L199) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| bot_detection_logs | database-table | [services/admin-api/app/db/admin_db.py:211](../../services/admin-api/app/db/admin_db.py#L211) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| rate_limit_violations | database-table | [services/admin-api/app/db/admin_db.py:224](../../services/admin-api/app/db/admin_db.py#L224) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| account_abuse_reports | database-table | [services/admin-api/app/db/admin_db.py:238](../../services/admin-api/app/db/admin_db.py#L238) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| support_tickets | database-table | [services/admin-api/app/db/admin_db.py:253](../../services/admin-api/app/db/admin_db.py#L253) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| refund_requests | database-table | [services/admin-api/app/db/admin_db.py:271](../../services/admin-api/app/db/admin_db.py#L271) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| contact_submissions | database-table | [services/admin-api/app/db/admin_db.py:290](../../services/admin-api/app/db/admin_db.py#L290) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| plan_override_requests | database-table | [services/admin-api/app/db/admin_db.py:305](../../services/admin-api/app/db/admin_db.py#L305) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| cost_ledger | database-table | [services/admin-api/app/db/admin_db.py:325](../../services/admin-api/app/db/admin_db.py#L325) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| notification_templates | database-table | [services/admin-api/app/db/admin_db.py:341](../../services/admin-api/app/db/admin_db.py#L341) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| system_announcements | database-table | [services/admin-api/app/db/admin_db.py:356](../../services/admin-api/app/db/admin_db.py#L356) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| notification_server_settings | database-table | [services/admin-api/app/db/admin_db.py:369](../../services/admin-api/app/db/admin_db.py#L369) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| automation_rules | database-table | [services/admin-api/app/db/admin_db.py:380](../../services/admin-api/app/db/admin_db.py#L380) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| automation_execution_logs | database-table | [services/admin-api/app/db/admin_db.py:396](../../services/admin-api/app/db/admin_db.py#L396) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| config_entries | database-table | [services/admin-api/app/db/admin_db.py:478](../../services/admin-api/app/db/admin_db.py#L478) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| config_history | database-table | [services/admin-api/app/db/admin_db.py:489](../../services/admin-api/app/db/admin_db.py#L489) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| documents | database-table | [services/admin-api/app/db/admin_db.py:321](../../services/admin-api/app/db/admin_db.py#L321) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| User | database-model | [services/auth/prisma/schema.prisma:15](../../services/auth/prisma/schema.prisma#L15) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| Session | database-model | [services/auth/prisma/schema.prisma:42](../../services/auth/prisma/schema.prisma#L42) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| PasswordReset | database-model | [services/auth/prisma/schema.prisma:43](../../services/auth/prisma/schema.prisma#L43) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| LoginEvent | database-model | [services/auth/prisma/schema.prisma:78](../../services/auth/prisma/schema.prisma#L78) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| Referral | database-model | [services/auth/prisma/schema.prisma:97](../../services/auth/prisma/schema.prisma#L97) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| DocumentType | database-model | [services/chat/prisma/schema.prisma:13](../../services/chat/prisma/schema.prisma#L13) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| Template | database-model | [services/chat/prisma/schema.prisma:21](../../services/chat/prisma/schema.prisma#L21) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| ChatSession | database-model | [services/chat/prisma/schema.prisma:19](../../services/chat/prisma/schema.prisma#L19) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| ChatMessage | database-model | [services/chat/prisma/schema.prisma:63](../../services/chat/prisma/schema.prisma#L63) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| GeneratedDocument | database-model | [services/chat/prisma/schema.prisma:20](../../services/chat/prisma/schema.prisma#L20) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| ToolExecution | database-model | [services/chat/prisma/schema.prisma:67](../../services/chat/prisma/schema.prisma#L67) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| AIUsage | database-model | [services/chat/prisma/schema.prisma:62](../../services/chat/prisma/schema.prisma#L62) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| custom_templates | database-table | [services/document/app/models/custom_template.py:6](../../services/document/app/models/custom_template.py#L6) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| documents | database-table | [services/document/app/models/document.py:6](../../services/document/app/models/document.py#L6) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| Plan | database-model | [services/payment/prisma/schema.prisma:4](../../services/payment/prisma/schema.prisma#L4) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| Subscription | database-model | [services/payment/prisma/schema.prisma:5](../../services/payment/prisma/schema.prisma#L5) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| BillingInvoice | database-model | [services/payment/prisma/schema.prisma:6](../../services/payment/prisma/schema.prisma#L6) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| Coupon | database-model | [services/payment/prisma/schema.prisma:7](../../services/payment/prisma/schema.prisma#L7) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| WebhookEvent | database-model | [services/payment/prisma/schema.prisma:8](../../services/payment/prisma/schema.prisma#L8) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| Quota | database-model | [services/quota/prisma/schema.prisma:2](../../services/quota/prisma/schema.prisma#L2) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| QuotaResetLog | database-model | [services/quota/prisma/schema.prisma:33](../../services/quota/prisma/schema.prisma#L33) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| AuditLog | database-model | [services/quota/prisma/schema.prisma:45](../../services/quota/prisma/schema.prisma#L45) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| users | database-table | [supabase-schema.sql:12](../../supabase-schema.sql#L12) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| sessions | database-table | [supabase-schema.sql:28](../../supabase-schema.sql#L28) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| password_resets | database-table | [supabase-schema.sql:44](../../supabase-schema.sql#L44) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| quotas | database-table | [supabase-schema.sql:63](../../supabase-schema.sql#L63) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| quota_reset_logs | database-table | [supabase-schema.sql:80](../../supabase-schema.sql#L80) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| plans | database-table | [supabase-schema.sql:90](../../supabase-schema.sql#L90) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| subscriptions | database-table | [supabase-schema.sql:105](../../supabase-schema.sql#L105) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| billing_invoices | database-table | [supabase-schema.sql:135](../../supabase-schema.sql#L135) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| coupons | database-table | [supabase-schema.sql:158](../../supabase-schema.sql#L158) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| webhook_events | database-table | [supabase-schema.sql:174](../../supabase-schema.sql#L174) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| document_types | database-table | [supabase-schema.sql:188](../../supabase-schema.sql#L188) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| templates | database-table | [supabase-schema.sql:199](../../supabase-schema.sql#L199) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| chat_sessions | database-table | [supabase-schema.sql:212](../../supabase-schema.sql#L212) | INFERRED source; PostgreSQL migration compatibility BLOCKED |
| chat_messages | database-table | [supabase-schema.sql:232](../../supabase-schema.sql#L232) | INFERRED source; PostgreSQL migration compatibility BLOCKED |

## Mounted Admin API

The actual FastAPI OpenAPI application exposed the following method/path declarations. The separate authorization probe covers protected endpoints without credentials; it does not prove every successful CRUD operation.

| Method | Mounted path | Operation |
| --- | --- | --- |
| POST | /api/v1/admin/auth/login | login_api_v1_admin_auth_login_post |
| POST | /api/v1/admin/auth/verify-login-code | verify_login_code_api_v1_admin_auth_verify_login_code_post |
| POST | /api/v1/admin/auth/forgot-password | forgot_password_api_v1_admin_auth_forgot_password_post |
| POST | /api/v1/admin/auth/reset-password | reset_password_api_v1_admin_auth_reset_password_post |
| POST | /api/v1/admin/auth/change-password | change_password_api_v1_admin_auth_change_password_post |
| POST | /api/v1/admin/auth/totp/setup | setup_totp_api_v1_admin_auth_totp_setup_post |
| POST | /api/v1/admin/auth/totp/verify | verify_and_enable_totp_api_v1_admin_auth_totp_verify_post |
| POST | /api/v1/admin/auth/totp/disable | disable_totp_api_v1_admin_auth_totp_disable_post |
| POST | /api/v1/admin/auth/request-action-code | request_action_code_api_v1_admin_auth_request_action_code_post |
| GET | /api/v1/admin/auth/me | get_my_profile_api_v1_admin_auth_me_get |
| PATCH | /api/v1/admin/auth/me | update_my_profile_api_v1_admin_auth_me_patch |
| GET | /api/v1/admin/roles | list_roles_api_v1_admin_roles_get |
| POST | /api/v1/admin/roles | create_role_api_v1_admin_roles_post |
| PATCH | /api/v1/admin/roles/{role_id} | update_role_api_v1_admin_roles__role_id__patch |
| DELETE | /api/v1/admin/roles/{role_id} | delete_role_api_v1_admin_roles__role_id__delete |
| GET | /api/v1/admin/permissions | list_permissions_api_v1_admin_permissions_get |
| GET | /api/v1/admin/staff | list_staff_api_v1_admin_staff_get |
| POST | /api/v1/admin/staff/invite | invite_staff_api_v1_admin_staff_invite_post |
| PATCH | /api/v1/admin/staff/{staff_id} | update_staff_api_v1_admin_staff__staff_id__patch |
| DELETE | /api/v1/admin/staff/{staff_id} | remove_staff_api_v1_admin_staff__staff_id__delete |
| GET | /api/v1/admin/audit-logs | search_audit_logs_api_v1_admin_audit_logs_get |
| GET | /api/v1/admin/audit-logs/all | get_all_audit_logs_api_v1_admin_audit_logs_all_get |
| GET | /api/v1/admin/audit-logs/{log_id} | get_audit_log_detail_api_v1_admin_audit_logs__log_id__get |
| GET | /api/v1/admin/security/alerts | list_security_alerts_api_v1_admin_security_alerts_get |
| PATCH | /api/v1/admin/security/alerts/{alert_id}/resolve | resolve_security_alert_api_v1_admin_security_alerts__alert_id__resolve_patch |
| GET | /api/v1/admin/security/sessions | list_active_sessions_api_v1_admin_security_sessions_get |
| DELETE | /api/v1/admin/security/sessions/{session_id} | terminate_session_api_v1_admin_security_sessions__session_id__delete |
| GET | /api/v1/admin/security/ip-logs | get_ip_logs_api_v1_admin_security_ip_logs_get |
| GET | /api/v1/admin/security/rate-limits | get_rate_limit_violations_api_v1_admin_security_rate_limits_get |
| GET | /api/v1/admin/security/bot-logs | get_bot_detection_logs_api_v1_admin_security_bot_logs_get |
| GET | /api/v1/admin/security/abuse-reports | get_account_abuse_reports_api_v1_admin_security_abuse_reports_get |
| PATCH | /api/v1/admin/security/abuse-reports/{report_id}/resolve | resolve_abuse_report_api_v1_admin_security_abuse_reports__report_id__resolve_patch |
| POST | /api/v1/admin/security/bot-detection-event | report_bot_detection_event_api_v1_admin_security_bot_detection_event_post |
| POST | /api/v1/admin/security/rate-limit-violation | report_rate_limit_violation_api_v1_admin_security_rate_limit_violation_post |
| POST | /api/v1/admin/security/auto-suspend | auto_suspend_user_api_v1_admin_security_auto_suspend_post |
| GET | /api/v1/admin/security/api-keys | get_api_key_status_api_v1_admin_security_api_keys_get |
| GET | /api/v1/admin/plans | list_plans_api_v1_admin_plans_get |
| POST | /api/v1/admin/plans | create_plan_api_v1_admin_plans_post |
| GET | /api/v1/admin/plans/performance | get_plan_performance_api_v1_admin_plans_performance_get |
| PATCH | /api/v1/admin/plans/{plan_id} | update_plan_api_v1_admin_plans__plan_id__patch |
| POST | /api/v1/admin/plans/{plan_id}/archive | archive_plan_api_v1_admin_plans__plan_id__archive_post |
| POST | /api/v1/admin/users/{user_id}/quota-override | grant_user_quota_override_api_v1_admin_users__user_id__quota_override_post |
| DELETE | /api/v1/admin/users/{user_id}/quota-override | remove_user_quota_override_api_v1_admin_users__user_id__quota_override_delete |
| GET | /api/v1/admin/coupons | list_coupons_api_v1_admin_coupons_get |
| POST | /api/v1/admin/coupons | create_coupon_api_v1_admin_coupons_post |
| POST | /api/v1/admin/coupons/{coupon_id}/archive | archive_coupon_api_v1_admin_coupons__coupon_id__archive_post |
| GET | /api/v1/admin/trials | list_trials_api_v1_admin_trials_get |
| POST | /api/v1/admin/trials | start_trial_api_v1_admin_trials_post |
| PATCH | /api/v1/admin/trials/{trial_id}/extend | extend_trial_api_v1_admin_trials__trial_id__extend_patch |
| POST | /api/v1/admin/trials/{trial_id}/end | end_trial_api_v1_admin_trials__trial_id__end_post |
| GET | /api/v1/admin/subscriptions | list_all_subscriptions_api_v1_admin_subscriptions_get |
| GET | /api/v1/admin/subscriptions/stats | get_subscription_stats_api_v1_admin_subscriptions_stats_get |
| GET | /api/v1/admin/revenue | get_revenue_summary_api_v1_admin_revenue_get |
| GET | /api/v1/admin/invoices | list_all_invoices_api_v1_admin_invoices_get |
| GET | /api/v1/admin/failed-payments | list_failed_payments_api_v1_admin_failed_payments_get |
| GET | /api/v1/admin/refunds | list_refunds_api_v1_admin_refunds_get |
| GET | /api/v1/admin/cost-ledger | list_cost_entries_api_v1_admin_cost_ledger_get |
| POST | /api/v1/admin/cost-ledger | create_cost_entry_api_v1_admin_cost_ledger_post |
| DELETE | /api/v1/admin/cost-ledger/{entry_id} | delete_cost_entry_api_v1_admin_cost_ledger__entry_id__delete |
| GET | /api/v1/admin/cost-ledger/summary | get_cost_summary_api_v1_admin_cost_ledger_summary_get |
| GET | /api/v1/admin/promotions/ab-tests | list_ab_tests_api_v1_admin_promotions_ab_tests_get |
| GET | /api/v1/admin/promotions/referrals | list_referrals_api_v1_admin_promotions_referrals_get |
| POST | /api/v1/admin/promotions/referrals | create_referral_api_v1_admin_promotions_referrals_post |
| POST | /api/v1/admin/promotions/referrals/{referral_id}/convert | convert_referral_api_v1_admin_promotions_referrals__referral_id__convert_post |
| GET | /api/v1/admin/automation/rules | list_automation_rules_api_v1_admin_automation_rules_get |
| POST | /api/v1/admin/automation/rules | create_automation_rule_api_v1_admin_automation_rules_post |
| PATCH | /api/v1/admin/automation/rules/{rule_id} | update_automation_rule_api_v1_admin_automation_rules__rule_id__patch |
| DELETE | /api/v1/admin/automation/rules/{rule_id} | delete_automation_rule_api_v1_admin_automation_rules__rule_id__delete |
| POST | /api/v1/admin/automation/rules/{rule_id}/dry-run | dry_run_automation_rule_api_v1_admin_automation_rules__rule_id__dry_run_post |
| POST | /api/v1/admin/automation/dry-run | dry_run_any_payload_api_v1_admin_automation_dry_run_post |
| POST | /api/v1/admin/automation/events/emit | emit_domain_event_api_v1_admin_automation_events_emit_post |
| GET | /api/v1/admin/automation/execution-logs | list_execution_logs_api_v1_admin_automation_execution_logs_get |
| GET | /api/v1/admin/analytics/overview | get_analytics_overview_api_v1_admin_analytics_overview_get |
| GET | /api/v1/admin/analytics/revenue | get_revenue_analytics_api_v1_admin_analytics_revenue_get |
| GET | /api/v1/admin/analytics/generations | get_generation_analytics_api_v1_admin_analytics_generations_get |
| GET | /api/v1/admin/analytics/generations/detailed | get_detailed_generation_analytics_api_v1_admin_analytics_generations_detailed_get |
| GET | /api/v1/admin/analytics/journey | get_journey_analytics_api_v1_admin_analytics_journey_get |
| GET | /api/v1/admin/analytics/users | get_users_analytics_api_v1_admin_analytics_users_get |
| GET | /api/v1/admin/analytics/traffic | get_traffic_analytics_api_v1_admin_analytics_traffic_get |
| GET | /api/v1/admin/analytics/posthog/config | get_posthog_config_api_v1_admin_analytics_posthog_config_get |
| GET | /api/v1/admin/analytics/button-clicks | get_button_click_analytics_api_v1_admin_analytics_button_clicks_get |
| GET | /api/v1/admin/analytics/page-duration | get_page_duration_analytics_api_v1_admin_analytics_page_duration_get |
| POST | /api/v1/admin/analytics/events | track_posthog_event_api_v1_admin_analytics_events_post |
| GET | /api/v1/admin/notifications/email-logs | get_email_logs_api_v1_admin_notifications_email_logs_get |
| GET | /api/v1/admin/notifications/failed | get_failed_notifications_api_v1_admin_notifications_failed_get |
| GET | /api/v1/admin/notifications/history | get_notification_history_api_v1_admin_notifications_history_get |
| GET | /api/v1/admin/notifications/status | get_notification_status_overview_api_v1_admin_notifications_status_get |
| GET | /api/v1/admin/notifications/announcements | list_announcements_api_v1_admin_notifications_announcements_get |
| POST | /api/v1/admin/notifications/announcements | create_announcement_api_v1_admin_notifications_announcements_post |
| PATCH | /api/v1/admin/notifications/announcements/{announcement_id} | update_announcement_api_v1_admin_notifications_announcements__announcement_id__patch |
| DELETE | /api/v1/admin/notifications/announcements/{announcement_id} | delete_announcement_api_v1_admin_notifications_announcements__announcement_id__delete |
| GET | /api/v1/admin/notifications/templates | get_templates_api_v1_admin_notifications_templates_get |
| POST | /api/v1/admin/notifications/templates | create_template_api_v1_admin_notifications_templates_post |
| PUT | /api/v1/admin/notifications/templates/{template_id} | update_template_api_v1_admin_notifications_templates__template_id__put |
| DELETE | /api/v1/admin/notifications/templates/{template_id} | delete_template_api_v1_admin_notifications_templates__template_id__delete |
| GET | /api/v1/admin/notifications/settings | get_server_settings_api_v1_admin_notifications_settings_get |
| PUT | /api/v1/admin/notifications/settings | update_server_settings_api_v1_admin_notifications_settings_put |
| GET | /api/v1/admin/notifications/config/public | get_public_notification_config_api_v1_admin_notifications_config_public_get |
| POST | /api/v1/support/tickets | public_submit_ticket_api_v1_support_tickets_post |
| POST | /api/v1/support/refunds | public_submit_refund_api_v1_support_refunds_post |
| POST | /api/v1/support/contact | public_submit_contact_api_v1_support_contact_post |
| POST | /api/v1/support/plan-override-requests | public_submit_override_request_api_v1_support_plan_override_requests_post |
| GET | /api/v1/admin/support/tickets | admin_list_tickets_api_v1_admin_support_tickets_get |
| GET | /api/v1/admin/support/tickets/{ticket_id} | admin_get_ticket_api_v1_admin_support_tickets__ticket_id__get |
| PATCH | /api/v1/admin/support/tickets/{ticket_id} | admin_update_ticket_api_v1_admin_support_tickets__ticket_id__patch |
| POST | /api/v1/admin/support/tickets/{ticket_id}/resolve | admin_resolve_ticket_api_v1_admin_support_tickets__ticket_id__resolve_post |
| GET | /api/v1/admin/support/refunds | admin_list_refunds_api_v1_admin_support_refunds_get |
| PATCH | /api/v1/admin/support/refunds/{refund_id} | admin_update_refund_api_v1_admin_support_refunds__refund_id__patch |
| GET | /api/v1/admin/support/contact | admin_list_contacts_api_v1_admin_support_contact_get |
| PATCH | /api/v1/admin/support/contact/{contact_id} | admin_update_contact_api_v1_admin_support_contact__contact_id__patch |
| GET | /api/v1/admin/support/plan-overrides | admin_list_overrides_api_v1_admin_support_plan_overrides_get |
| PATCH | /api/v1/admin/support/plan-overrides/{override_id} | admin_update_override_api_v1_admin_support_plan_overrides__override_id__patch |
| POST | /api/v1/admin/support/plan-overrides/{override_id}/approve | admin_approve_override_api_v1_admin_support_plan_overrides__override_id__approve_post |
| GET | /api/v1/admin/gdpr/export | export_user_data_api_v1_admin_gdpr_export_get |
| POST | /api/v1/admin/gdpr/purge | purge_user_data_api_v1_admin_gdpr_purge_post |
| GET | /api/v1/admin/reports/users-csv | export_users_csv_api_v1_admin_reports_users_csv_get |
| GET | /api/v1/admin/infrastructure/mcp/sessions | get_mcp_chat_sessions_api_v1_admin_infrastructure_mcp_sessions_get |
| GET | /api/v1/admin/infrastructure/mcp/templates | get_mcp_templates_api_v1_admin_infrastructure_mcp_templates_get |
| GET | /api/v1/admin/infrastructure/health | get_infrastructure_health_api_v1_admin_infrastructure_health_get |
| GET | /api/v1/users/ | list_users_api_v1_users__get |
| GET | /api/v1/users/{user_id} | get_user_api_v1_users__user_id__get |
| PATCH | /api/v1/users/{user_id}/status | update_user_status_api_v1_users__user_id__status_patch |
| PATCH | /api/v1/users/{user_id}/plan | update_user_plan_api_v1_users__user_id__plan_patch |
| PATCH | /api/v1/users/{user_id}/quota | update_user_quota_api_v1_users__user_id__quota_patch |
| POST | /api/v1/users/{user_id}/override | apply_user_override_api_v1_users__user_id__override_post |
| GET | /api/v1/internal/config/{domain} | get_internal_domain_config_api_v1_internal_config__domain__get |
| GET | /api/v1/internal/config | get_internal_all_configs_api_v1_internal_config_get |
| GET | /api/v1/admin/config/{domain} | get_admin_domain_config_api_v1_admin_config__domain__get |
| PUT | /api/v1/admin/config/{domain} | update_admin_domain_config_api_v1_admin_config__domain__put |
| GET | /api/v1/admin/config/{domain}/history | get_domain_config_history_api_v1_admin_config__domain__history_get |
| GET | /health | health_check_health_get |
| GET | / | root__get |

## All discovered backend route declarations

Includes router mount points, repeated registrations and direct-service aliases. These source declarations are not a count of unique live endpoints.

| ID | Declaration | Source | Handler / registration |
| --- | --- | --- | --- |
| F0483 | GET /admin/analytics/overview | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_analytics_overview(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0484 | GET /admin/analytics/revenue | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_revenue_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0485 | GET /admin/analytics/generations | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_generation_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0486 | GET /admin/analytics/generations/detailed | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_detailed_generation_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0487 | GET /admin/analytics/journey | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_journey_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0488 | GET /admin/analytics/users | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_users_analytics(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0489 | GET /admin/analytics/traffic | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_traffic_analytics( |
| F0490 | GET /admin/analytics/posthog/config | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_posthog_config(current_admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0491 | GET /admin/analytics/button-clicks | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_button_click_analytics( |
| F0492 | GET /admin/analytics/page-duration | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def get_page_duration_analytics( |
| F0493 | POST /admin/analytics/events | [services/admin-api/app/api/v1/analytics.py:1](../../services/admin-api/app/api/v1/analytics.py#L1) | async def track_posthog_event( |
| F0494 | GET /admin/audit-logs | [services/admin-api/app/api/v1/audit.py:11](../../services/admin-api/app/api/v1/audit.py#L11) | async def search_audit_logs( |
| F0495 | GET /admin/audit-logs/all | [services/admin-api/app/api/v1/audit.py:1](../../services/admin-api/app/api/v1/audit.py#L1) | async def get_all_audit_logs( |
| F0496 | GET /admin/audit-logs/{log_id} | [services/admin-api/app/api/v1/audit.py:1](../../services/admin-api/app/api/v1/audit.py#L1) | async def get_audit_log_detail( |
| F0497 | POST /admin/auth/login | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def login(payload: AdminLoginRequest, request: Request): |
| F0498 | POST /admin/auth/verify-login-code | [services/admin-api/app/api/v1/auth.py:85](../../services/admin-api/app/api/v1/auth.py#L85) | async def verify_login_code(payload: AdminVerifyLoginCodeRequest, request: Request): |
| F0499 | POST /admin/auth/forgot-password | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def forgot_password(payload: ForgotPasswordRequest, request: Request): |
| F0500 | POST /admin/auth/reset-password | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def reset_password(payload: ResetPasswordRequest, request: Request): |
| F0501 | POST /admin/auth/change-password | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def change_password( |
| F0502 | POST /admin/auth/totp/setup | [services/admin-api/app/api/v1/auth.py:326](../../services/admin-api/app/api/v1/auth.py#L326) | async def setup_totp(current_admin: AdminUserPayload = Depends(get_current_admin)): |
| F0503 | POST /admin/auth/totp/verify | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def verify_and_enable_totp( |
| F0504 | POST /admin/auth/totp/disable | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def disable_totp( |
| F0505 | POST /admin/auth/request-action-code | [services/admin-api/app/api/v1/auth.py:363](../../services/admin-api/app/api/v1/auth.py#L363) | async def request_action_code(request: Request, current_admin: AdminUserPayload = Depends(get_current_admin)): |
| F0506 | GET /admin/auth/me | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def get_my_profile(current_admin: AdminUserPayload = Depends(get_current_admin)): |
| F0507 | PATCH /admin/auth/me | [services/admin-api/app/api/v1/auth.py:1](../../services/admin-api/app/api/v1/auth.py#L1) | async def update_my_profile( |
| F0508 | GET /admin/automation/rules | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def list_automation_rules( |
| F0509 | POST /admin/automation/rules | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def create_automation_rule( |
| F0510 | PATCH /admin/automation/rules/{rule_id} | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def update_automation_rule( |
| F0511 | DELETE /admin/automation/rules/{rule_id} | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def delete_automation_rule( |
| F0512 | POST /admin/automation/rules/{rule_id}/dry-run | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def dry_run_automation_rule( |
| F0513 | POST /admin/automation/dry-run | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def dry_run_any_payload( |
| F0514 | POST /admin/automation/events/emit | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def emit_domain_event( |
| F0515 | GET /admin/automation/execution-logs | [services/admin-api/app/api/v1/automation.py:1](../../services/admin-api/app/api/v1/automation.py#L1) | async def list_execution_logs( |
| F0516 | GET /api/v1/internal/config/{domain} | [services/admin-api/app/api/v1/config.py:18](../../services/admin-api/app/api/v1/config.py#L18) | async def get_internal_domain_config(domain: str): |
| F0517 | GET /api/v1/internal/config | [services/admin-api/app/api/v1/config.py:18](../../services/admin-api/app/api/v1/config.py#L18) | async def get_internal_all_configs(): |
| F0518 | GET /api/v1/admin/config/{domain} | [services/admin-api/app/api/v1/config.py:39](../../services/admin-api/app/api/v1/config.py#L39) | async def get_admin_domain_config( |
| F0519 | PUT /api/v1/admin/config/{domain} | [services/admin-api/app/api/v1/config.py:39](../../services/admin-api/app/api/v1/config.py#L39) | async def update_admin_domain_config( |
| F0520 | GET /api/v1/admin/config/{domain}/history | [services/admin-api/app/api/v1/config.py:90](../../services/admin-api/app/api/v1/config.py#L90) | async def get_domain_config_history( |
| F0521 | GET /admin/cost-ledger | [services/admin-api/app/api/v1/cost_ledger.py:18](../../services/admin-api/app/api/v1/cost_ledger.py#L18) | async def list_cost_entries( |
| F0522 | POST /admin/cost-ledger | [services/admin-api/app/api/v1/cost_ledger.py:18](../../services/admin-api/app/api/v1/cost_ledger.py#L18) | async def create_cost_entry( |
| F0523 | DELETE /admin/cost-ledger/{entry_id} | [services/admin-api/app/api/v1/cost_ledger.py:1](../../services/admin-api/app/api/v1/cost_ledger.py#L1) | async def delete_cost_entry( |
| F0524 | GET /admin/cost-ledger/summary | [services/admin-api/app/api/v1/cost_ledger.py:1](../../services/admin-api/app/api/v1/cost_ledger.py#L1) | async def get_cost_summary( |
| F0525 | GET /admin/gdpr/export | [services/admin-api/app/api/v1/gdpr.py:1](../../services/admin-api/app/api/v1/gdpr.py#L1) | async def export_user_data( |
| F0526 | POST /admin/gdpr/purge | [services/admin-api/app/api/v1/gdpr.py:1](../../services/admin-api/app/api/v1/gdpr.py#L1) | async def purge_user_data( |
| F0527 | GET /admin/infrastructure/mcp/sessions | [services/admin-api/app/api/v1/infrastructure.py:1](../../services/admin-api/app/api/v1/infrastructure.py#L1) | async def get_mcp_chat_sessions(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0528 | GET /admin/infrastructure/mcp/templates | [services/admin-api/app/api/v1/infrastructure.py:1](../../services/admin-api/app/api/v1/infrastructure.py#L1) | async def get_mcp_templates(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0529 | GET /admin/infrastructure/health | [services/admin-api/app/api/v1/infrastructure.py:1](../../services/admin-api/app/api/v1/infrastructure.py#L1) | async def get_infrastructure_health(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0530 | GET /admin/notifications/email-logs | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def get_email_logs( |
| F0531 | GET /admin/notifications/failed | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def get_failed_notifications(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0532 | GET /admin/notifications/history | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def get_notification_history(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0533 | GET /admin/notifications/status | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def get_notification_status_overview(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0534 | GET /admin/notifications/announcements | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def list_announcements(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0535 | POST /admin/notifications/announcements | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def create_announcement( |
| F0536 | PATCH /admin/notifications/announcements/{announcement_id} | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def update_announcement( |
| F0537 | DELETE /admin/notifications/announcements/{announcement_id} | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def delete_announcement( |
| F0538 | GET /admin/notifications/templates | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def get_templates(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0539 | POST /admin/notifications/templates | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def create_template( |
| F0540 | PUT /admin/notifications/templates/{template_id} | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def update_template( |
| F0541 | DELETE /admin/notifications/templates/{template_id} | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def delete_template( |
| F0542 | GET /admin/notifications/settings | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def get_server_settings(current_admin: AdminUserPayload = Depends(require_permission("settings", "view"))): |
| F0543 | PUT /admin/notifications/settings | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def update_server_settings( |
| F0544 | GET /admin/notifications/config/public | [services/admin-api/app/api/v1/notifications.py:1](../../services/admin-api/app/api/v1/notifications.py#L1) | async def get_public_notification_config(): |
| F0545 | GET /admin/plans | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def list_plans( |
| F0546 | GET /admin/plans/performance | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def get_plan_performance(admin: AdminUserPayload = Depends(require_permission("plans", "view"))): |
| F0547 | POST /admin/plans | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def create_plan( |
| F0548 | PATCH /admin/plans/{plan_id} | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def update_plan( |
| F0549 | POST /admin/plans/{plan_id}/archive | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def archive_plan( |
| F0550 | POST /admin/users/{user_id}/quota-override | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def grant_user_quota_override( |
| F0551 | DELETE /admin/users/{user_id}/quota-override | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def remove_user_quota_override( |
| F0552 | GET /admin/coupons | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def list_coupons(admin: AdminUserPayload = Depends(require_permission("plans", "view"))): |
| F0553 | POST /admin/coupons | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def create_coupon( |
| F0554 | POST /admin/coupons/{coupon_id}/archive | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def archive_coupon( |
| F0555 | GET /admin/trials | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def list_trials(admin: AdminUserPayload = Depends(require_permission("plans", "view"))): |
| F0556 | POST /admin/trials | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def start_trial( |
| F0557 | PATCH /admin/trials/{trial_id}/extend | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def extend_trial( |
| F0558 | POST /admin/trials/{trial_id}/end | [services/admin-api/app/api/v1/plans.py:1](../../services/admin-api/app/api/v1/plans.py#L1) | async def end_trial( |
| F0559 | GET /admin/promotions/ab-tests | [services/admin-api/app/api/v1/promotions.py:1](../../services/admin-api/app/api/v1/promotions.py#L1) | async def list_ab_tests(admin: AdminUserPayload = Depends(require_permission("analytics", "view"))): |
| F0560 | GET /admin/promotions/referrals | [services/admin-api/app/api/v1/promotions.py:1](../../services/admin-api/app/api/v1/promotions.py#L1) | async def list_referrals( |
| F0561 | POST /admin/promotions/referrals | [services/admin-api/app/api/v1/promotions.py:1](../../services/admin-api/app/api/v1/promotions.py#L1) | async def create_referral( |
| F0562 | POST /admin/promotions/referrals/{referral_id}/convert | [services/admin-api/app/api/v1/promotions.py:1](../../services/admin-api/app/api/v1/promotions.py#L1) | async def convert_referral( |
| F0563 | GET /admin/roles | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def list_roles(admin: AdminUserPayload = Depends(require_permission("rbac", "view"))): |
| F0564 | POST /admin/roles | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def create_role( |
| F0565 | PATCH /admin/roles/{role_id} | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def update_role( |
| F0566 | DELETE /admin/roles/{role_id} | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def delete_role( |
| F0567 | GET /admin/permissions | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def list_permissions(admin: AdminUserPayload = Depends(require_permission("rbac", "view"))): |
| F0568 | GET /admin/staff | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def list_staff(admin: AdminUserPayload = Depends(require_permission("rbac", "view"))): |
| F0569 | POST /admin/staff/invite | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def invite_staff( |
| F0570 | PATCH /admin/staff/{staff_id} | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def update_staff( |
| F0571 | DELETE /admin/staff/{staff_id} | [services/admin-api/app/api/v1/rbac.py:1](../../services/admin-api/app/api/v1/rbac.py#L1) | async def remove_staff( |
| F0572 | GET /admin/reports/users-csv | [services/admin-api/app/api/v1/reports.py:1](../../services/admin-api/app/api/v1/reports.py#L1) | async def export_users_csv( |
| F0573 | GET /admin/security/alerts | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def list_security_alerts( |
| F0574 | PATCH /admin/security/alerts/{alert_id}/resolve | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def resolve_security_alert( |
| F0575 | GET /admin/security/sessions | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def list_active_sessions( |
| F0576 | DELETE /admin/security/sessions/{session_id} | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def terminate_session( |
| F0577 | GET /admin/security/ip-logs | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def get_ip_logs( |
| F0578 | GET /admin/security/rate-limits | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def get_rate_limit_violations( |
| F0579 | GET /admin/security/bot-logs | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def get_bot_detection_logs( |
| F0580 | GET /admin/security/abuse-reports | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def get_account_abuse_reports( |
| F0581 | PATCH /admin/security/abuse-reports/{report_id}/resolve | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def resolve_abuse_report( |
| F0582 | POST /admin/security/bot-detection-event | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def report_bot_detection_event(payload: BotDetectionEventRequest, request: Request): |
| F0583 | POST /admin/security/rate-limit-violation | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def report_rate_limit_violation(payload: RateLimitViolationRequest, request: Request): |
| F0584 | POST /admin/security/auto-suspend | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def auto_suspend_user(payload: AutoSuspendRequest, request: Request): |
| F0585 | GET /admin/security/api-keys | [services/admin-api/app/api/v1/security.py:1](../../services/admin-api/app/api/v1/security.py#L1) | async def get_api_key_status( |
| F0586 | GET /admin/subscriptions | [services/admin-api/app/api/v1/subscriptions.py:1](../../services/admin-api/app/api/v1/subscriptions.py#L1) | async def list_all_subscriptions( |
| F0587 | GET /admin/subscriptions/stats | [services/admin-api/app/api/v1/subscriptions.py:1](../../services/admin-api/app/api/v1/subscriptions.py#L1) | async def get_subscription_stats( |
| F0588 | GET /admin/revenue | [services/admin-api/app/api/v1/subscriptions.py:1](../../services/admin-api/app/api/v1/subscriptions.py#L1) | async def get_revenue_summary( |
| F0589 | GET /admin/invoices | [services/admin-api/app/api/v1/subscriptions.py:1](../../services/admin-api/app/api/v1/subscriptions.py#L1) | async def list_all_invoices( |
| F0590 | GET /admin/failed-payments | [services/admin-api/app/api/v1/subscriptions.py:1](../../services/admin-api/app/api/v1/subscriptions.py#L1) | async def list_failed_payments( |
| F0591 | GET /admin/refunds | [services/admin-api/app/api/v1/subscriptions.py:1](../../services/admin-api/app/api/v1/subscriptions.py#L1) | async def list_refunds( |
| F0592 | POST /support/tickets | [services/admin-api/app/api/v1/support.py:96](../../services/admin-api/app/api/v1/support.py#L96) | async def public_submit_ticket(payload: TicketCreateSchema): |
| F0593 | POST /support/refunds | [services/admin-api/app/api/v1/support.py:111](../../services/admin-api/app/api/v1/support.py#L111) | async def public_submit_refund(payload: RefundCreateSchema): |
| F0594 | POST /support/contact | [services/admin-api/app/api/v1/support.py:127](../../services/admin-api/app/api/v1/support.py#L127) | async def public_submit_contact(payload: ContactCreateSchema): |
| F0595 | POST /support/plan-override-requests | [services/admin-api/app/api/v1/support.py:140](../../services/admin-api/app/api/v1/support.py#L140) | async def public_submit_override_request(payload: OverrideRequestCreateSchema): |
| F0596 | GET /admin/support/tickets | [services/admin-api/app/api/v1/support.py:158](../../services/admin-api/app/api/v1/support.py#L158) | async def admin_list_tickets( |
| F0597 | GET /admin/support/tickets/{ticket_id} | [services/admin-api/app/api/v1/support.py:176](../../services/admin-api/app/api/v1/support.py#L176) | async def admin_get_ticket( |
| F0598 | PATCH /admin/support/tickets/{ticket_id} | [services/admin-api/app/api/v1/support.py:176](../../services/admin-api/app/api/v1/support.py#L176) | async def admin_update_ticket( |
| F0599 | POST /admin/support/tickets/{ticket_id}/resolve | [services/admin-api/app/api/v1/support.py:206](../../services/admin-api/app/api/v1/support.py#L206) | async def admin_resolve_ticket( |
| F0600 | GET /admin/support/refunds | [services/admin-api/app/api/v1/support.py:229](../../services/admin-api/app/api/v1/support.py#L229) | async def admin_list_refunds( |
| F0601 | PATCH /admin/support/refunds/{refund_id} | [services/admin-api/app/api/v1/support.py:245](../../services/admin-api/app/api/v1/support.py#L245) | async def admin_update_refund( |
| F0602 | GET /admin/support/contact | [services/admin-api/app/api/v1/support.py:268](../../services/admin-api/app/api/v1/support.py#L268) | async def admin_list_contacts( |
| F0603 | PATCH /admin/support/contact/{contact_id} | [services/admin-api/app/api/v1/support.py:284](../../services/admin-api/app/api/v1/support.py#L284) | async def admin_update_contact( |
| F0604 | GET /admin/support/plan-overrides | [services/admin-api/app/api/v1/support.py:305](../../services/admin-api/app/api/v1/support.py#L305) | async def admin_list_overrides( |
| F0605 | PATCH /admin/support/plan-overrides/{override_id} | [services/admin-api/app/api/v1/support.py:373](../../services/admin-api/app/api/v1/support.py#L373) | async def admin_update_override( |
| F0606 | POST /admin/support/plan-overrides/{override_id}/approve | [services/admin-api/app/api/v1/support.py:404](../../services/admin-api/app/api/v1/support.py#L404) | async def admin_approve_override( |
| F0607 | GET / | [services/admin-api/app/api/v1/users.py:16](../../services/admin-api/app/api/v1/users.py#L16) | async def list_users( |
| F0608 | GET /{user_id} | [services/admin-api/app/api/v1/users.py:46](../../services/admin-api/app/api/v1/users.py#L46) | async def get_user( |
| F0609 | PATCH /{user_id}/status | [services/admin-api/app/api/v1/users.py:74](../../services/admin-api/app/api/v1/users.py#L74) | async def update_user_status( |
| F0610 | PATCH /{user_id}/plan | [services/admin-api/app/api/v1/users.py:101](../../services/admin-api/app/api/v1/users.py#L101) | async def update_user_plan( |
| F0611 | PATCH /{user_id}/quota | [services/admin-api/app/api/v1/users.py:128](../../services/admin-api/app/api/v1/users.py#L128) | async def update_user_quota( |
| F0612 | POST /{user_id}/override | [services/admin-api/app/api/v1/users.py:182](../../services/admin-api/app/api/v1/users.py#L182) | async def apply_user_override( |
| F0639 | GET /health | [services/admin-api/app/main.py:83](../../services/admin-api/app/main.py#L83) | def health_check(): |
| F0640 | GET / | [services/admin-api/app/main.py:38](../../services/admin-api/app/main.py#L38) | def root(): |
| F0644 | GET /health | [services/analytics/app/main.py:64](../../services/analytics/app/main.py#L64) | def health_check(): |
| F0645 | POST /event | [services/analytics/app/routers/analytics.py:16](../../services/analytics/app/routers/analytics.py#L16) | async def track_event(event: AnalyticsEvent, request: Request): |
| F0646 | POST /client-event | [services/analytics/app/routers/analytics.py:43](../../services/analytics/app/routers/analytics.py#L43) | async def track_client_event(payload: ClientEventRequest, request: Request): |
| F0647 | GET /overview | [services/analytics/app/routers/analytics.py:69](../../services/analytics/app/routers/analytics.py#L69) | def get_overview(db: Session = Depends(get_db)): |
| F0648 | GET /revenue | [services/analytics/app/routers/analytics.py:90](../../services/analytics/app/routers/analytics.py#L90) | def get_revenue(db: Session = Depends(get_db)): |
| F0649 | GET /generations | [services/analytics/app/routers/analytics.py:118](../../services/analytics/app/routers/analytics.py#L118) | def get_generations(db: Session = Depends(get_db)): |
| F0650 | GET /users | [services/analytics/app/routers/analytics.py:144](../../services/analytics/app/routers/analytics.py#L144) | def get_users(db: Session = Depends(get_db)): |
| F0651 | GET /traffic | [services/analytics/app/routers/analytics.py:178](../../services/analytics/app/routers/analytics.py#L178) | def get_traffic(from_date: str \| None = None, to_date: str \| None = None, db: Session = Depends(get_db)): |
| F0652 | GET /journey | [services/analytics/app/routers/analytics.py:384](../../services/analytics/app/routers/analytics.py#L384) | def get_journey(): |
| F0660 | POST /login/google | [services/auth/src/routes/auth.routes.ts:12](../../services/auth/src/routes/auth.routes.ts#L12) | googleLogin |
| F0661 | POST /guest | [services/auth/src/routes/auth.routes.ts:22](../../services/auth/src/routes/auth.routes.ts#L22) | guestLogin |
| F0662 | POST /register | [services/auth/src/routes/auth.routes.ts:40](../../services/auth/src/routes/auth.routes.ts#L40) | register |
| F0663 | POST /login | [services/auth/src/routes/auth.routes.ts:12](../../services/auth/src/routes/auth.routes.ts#L12) | login |
| F0664 | POST /login/2fa | [services/auth/src/routes/auth.routes.ts:101](../../services/auth/src/routes/auth.routes.ts#L101) | login2FA |
| F0665 | POST /refresh | [services/auth/src/routes/auth.routes.ts:133](../../services/auth/src/routes/auth.routes.ts#L133) | refresh |
| F0666 | POST /logout | [services/auth/src/routes/auth.routes.ts:156](../../services/auth/src/routes/auth.routes.ts#L156) | logout |
| F0667 | POST /password/forgot | [services/auth/src/routes/auth.routes.ts:178](../../services/auth/src/routes/auth.routes.ts#L178) | forgotPassword |
| F0668 | POST /password/reset | [services/auth/src/routes/auth.routes.ts:201](../../services/auth/src/routes/auth.routes.ts#L201) | resetPassword |
| F0669 | POST /verify-email | [services/auth/src/routes/auth.routes.ts:225](../../services/auth/src/routes/auth.routes.ts#L225) | verifyEmail |
| F0670 | POST /verify-email/resend | [services/auth/src/routes/auth.routes.ts:250](../../services/auth/src/routes/auth.routes.ts#L250) | resendVerificationCode |
| F0671 | GET /me | [services/auth/src/routes/auth.routes.ts:274](../../services/auth/src/routes/auth.routes.ts#L274) | getMe |
| F0672 | PATCH /me | [services/auth/src/routes/auth.routes.ts:274](../../services/auth/src/routes/auth.routes.ts#L274) | updateMe |
| F0673 | GET /oauth/google/callback | [services/auth/src/routes/auth.routes.ts:345](../../services/auth/src/routes/auth.routes.ts#L345) | googleCallback |
| F0674 | POST /2fa/enable | [services/auth/src/routes/auth.routes.ts:353](../../services/auth/src/routes/auth.routes.ts#L353) | enable2FA |
| F0675 | POST /2fa/verify | [services/auth/src/routes/auth.routes.ts:372](../../services/auth/src/routes/auth.routes.ts#L372) | verify2FA |
| F0676 | POST /2fa/disable | [services/auth/src/routes/auth.routes.ts:396](../../services/auth/src/routes/auth.routes.ts#L396) | disable2FA |
| F0677 | GET /users | [services/auth/src/routes/internal.routes.ts:15](../../services/auth/src/routes/internal.routes.ts#L15) | listUsers |
| F0678 | GET /users/:id | [services/auth/src/routes/internal.routes.ts:33](../../services/auth/src/routes/internal.routes.ts#L33) | getUserById |
| F0679 | PATCH /users/:id/status | [services/auth/src/routes/internal.routes.ts:47](../../services/auth/src/routes/internal.routes.ts#L47) | updateUserStatus |
| F0680 | PATCH /users/:id/plan | [services/auth/src/routes/internal.routes.ts:68](../../services/auth/src/routes/internal.routes.ts#L68) | updateUserPlan |
| F0681 | GET /users/stats-by-plan | [services/auth/src/routes/internal.routes.ts:89](../../services/auth/src/routes/internal.routes.ts#L89) | getUserCountsByPlan |
| F0682 | GET /referrals | [services/auth/src/routes/internal.routes.ts:93](../../services/auth/src/routes/internal.routes.ts#L93) | listReferrals |
| F0683 | POST /referrals | [services/auth/src/routes/internal.routes.ts:93](../../services/auth/src/routes/internal.routes.ts#L93) | createReferral |
| F0684 | PATCH /referrals/:id/convert | [services/auth/src/routes/internal.routes.ts:113](../../services/auth/src/routes/internal.routes.ts#L113) | convertReferral |
| F0685 | POST /verify-token | [services/auth/src/routes/internal.routes.ts:121](../../services/auth/src/routes/internal.routes.ts#L121) | verifyInternalToken |
| F0686 | GET /health | [services/auth/src/server.ts:113](../../services/auth/src/server.ts#L113) | async (request, reply) => {     try {       await prisma.$queryRaw`SELECT 1`;       return { status: 'ok', service: 'auth', db: 'connected'  |
| F0694 | POST /chat/session | [services/chat/src/routes/chat.routes.ts:27](../../services/chat/src/routes/chat.routes.ts#L27) | (req, reply) => sessionController.create(req, reply) |
| F0695 | GET /chat/sessions | [services/chat/src/routes/chat.routes.ts:28](../../services/chat/src/routes/chat.routes.ts#L28) | (req, reply) => sessionController.list(req, reply) |
| F0696 | PATCH /chat/session/:sessionId | [services/chat/src/routes/chat.routes.ts:29](../../services/chat/src/routes/chat.routes.ts#L29) | (req, reply) => sessionController.update(req, reply) |
| F0697 | DELETE /chat/session/:sessionId | [services/chat/src/routes/chat.routes.ts:29](../../services/chat/src/routes/chat.routes.ts#L29) | (req, reply) => sessionController.delete(req, reply) |
| F0698 | GET /chat/session/:sessionId/messages | [services/chat/src/routes/chat.routes.ts:31](../../services/chat/src/routes/chat.routes.ts#L31) | async (req, reply) => {         try {             const session = await repo.load((req as any).user?.id, (req.params as any).sessionId);     |
| F0699 | POST /chat/session/:sessionId/confirm | [services/chat/src/routes/chat.routes.ts:44](../../services/chat/src/routes/chat.routes.ts#L44) | async(req,reply)=>{         const body=z.object({fingerprint:z.string().min(1).max(60000),expectedRevision:z.number().int().nonnegative()}). |
| F0700 | POST /chat/session/:sessionId/assets | [services/chat/src/routes/chat.routes.ts:51](../../services/chat/src/routes/chat.routes.ts#L51) | async(req,reply)=>{         const body=z.object({expectedRevision:z.number().int().nonnegative(),asset:z.object({             id:z.string(). |
| F0701 | DELETE /chat/session/:sessionId/assets | [services/chat/src/routes/chat.routes.ts:51](../../services/chat/src/routes/chat.routes.ts#L51) | async(req,reply)=>{         const body=z.object({expectedRevision:z.number().int().nonnegative(),ids:z.array(z.string().regex(/^[a-zA-Z0-9_- |
| F0702 | POST /chat/session/:sessionId/resolve | [services/chat/src/routes/chat.routes.ts:76](../../services/chat/src/routes/chat.routes.ts#L76) | async (req, reply) => {         const parsed = z.object({ field: z.string(), accept: z.boolean() }).safeParse(req.body);         if (!parsed |
| F0703 | POST /chat/session/:sessionId/message | [services/chat/src/routes/chat.routes.ts:31](../../services/chat/src/routes/chat.routes.ts#L31) | async (req, reply) => {         let lease: any, session: any, reuseResolved = false, providerText = '', mcpClient: Client \| undefined, mcpSe |
| F0704 | GET /mcp | [services/chat/src/routes/mcp.routes.ts:3](../../services/chat/src/routes/mcp.routes.ts#L3) | async (req, reply) => {         const userId = (req as any).user?.id;         const sessionId = (req.query as any).chatSessionId;         if |
| F0705 | POST /mcp/message | [services/chat/src/routes/mcp.routes.ts:17](../../services/chat/src/routes/mcp.routes.ts#L17) | async (req, reply) => {         const entry = transports.get((req.query as any).sessionId);         if (!entry \|\| entry.userId !== (req as a |
| F0706 | GET /metrics | [services/chat/src/routes/metrics.routes.ts:2](../../services/chat/src/routes/metrics.routes.ts#L2) | async (req, reply) => {     reply.header("Content-Type", registry.contentType);     return registry.metrics();   } |
| F0707 | GET /internal/status/keys | [services/chat/src/routes/status.routes.ts:9](../../services/chat/src/routes/status.routes.ts#L9) | async (req: FastifyRequest, reply: FastifyReply) => {     const secret = req.headers["x-internal-secret"];     if (secret !== env.INTERNAL_S |
| F0708 | GET /health | [services/chat/src/server.ts:72](../../services/chat/src/server.ts#L72) | async (_req, reply) => {   try {     await db.$queryRaw`SELECT 1`;     return { status: "ok", service: "chat", db: "connected" };   } catch  |
| F0709 | GET /health | [services/document/app/main.py:74](../../services/document/app/main.py#L74) | def health_check(): |
| F0712 | GET /templates | [services/document/app/routers/document.py:27](../../services/document/app/routers/document.py#L27) | def get_templates(type: Optional[str] = None): |
| F0713 | POST /templates/custom | [services/document/app/routers/document.py:38](../../services/document/app/routers/document.py#L38) | def create_custom_template( |
| F0714 | GET /templates/custom | [services/document/app/routers/document.py:38](../../services/document/app/routers/document.py#L38) | def list_custom_templates( |
| F0715 | GET /templates/custom/{template_id} | [services/document/app/routers/document.py:110](../../services/document/app/routers/document.py#L110) | def get_custom_template( |
| F0716 | DELETE /templates/custom/{template_id} | [services/document/app/routers/document.py:110](../../services/document/app/routers/document.py#L110) | def delete_custom_template( |
| F0717 | GET /templates/{template_id} | [services/document/app/routers/document.py:145](../../services/document/app/routers/document.py#L145) | def get_template_detail(template_id: str): |
| F0718 | POST /preview | [services/document/app/routers/document.py:167](../../services/document/app/routers/document.py#L167) | def get_preview(payload: Dict[str, Any]): |
| F0719 | POST /generate | [services/document/app/routers/document.py:217](../../services/document/app/routers/document.py#L217) | async def generate_document( |
| F0720 | GET /job/{job_id} | [services/document/app/routers/document.py:343](../../services/document/app/routers/document.py#L343) | async def get_job_status(job_id: str, db: Session = Depends(get_db), x_user_id: str = Header(..., alias="x-user-id")): |
| F0721 | GET /history | [services/document/app/routers/document.py:387](../../services/document/app/routers/document.py#L387) | def get_history( |
| F0722 | GET /download-file/{pdf_key} | [services/document/app/routers/document.py:429](../../services/document/app/routers/document.py#L429) | def download_local_file(pdf_key: str, expires: int = Query(...), signature: str = Query(...)): |
| F0723 | GET /{document_id} | [services/document/app/routers/document.py:448](../../services/document/app/routers/document.py#L448) | def get_document_details( |
| F0724 | GET /{document_id}/download | [services/document/app/routers/document.py:477](../../services/document/app/routers/document.py#L477) | def download_document( |
| F0725 | POST /{document_id}/share | [services/document/app/routers/document.py:509](../../services/document/app/routers/document.py#L509) | def share_document( |
| F0726 | DELETE /{document_id} | [services/document/app/routers/document.py:448](../../services/document/app/routers/document.py#L448) | def delete_document( |
| F0727 | GET /shared/{share_token} | [services/document/app/routers/document.py:538](../../services/document/app/routers/document.py#L538) | def get_shared_document(share_token: str, db: Session = Depends(get_db)): |
| F0746 | POST /generate | [services/document/puppeteer/server.ts:43](../../services/document/puppeteer/server.ts#L43) | async (request, reply) => {   const { htmlString, assets } = request.body as { htmlString?: string; assets?:unknown[] };   if (!htmlString)  |
| F0747 | USE / | [services/gateway/src/index.ts:3](../../services/gateway/src/index.ts#L3) | routes |
| F0748 | ALL /* | [services/gateway/src/routes/admin.routes.ts:7](../../services/gateway/src/routes/admin.routes.ts#L7) | proxyHandler |
| F0749 | ALL /* | [services/gateway/src/routes/analytics.routes.ts:7](../../services/gateway/src/routes/analytics.routes.ts#L7) | proxyHandler |
| F0750 | ALL /* | [services/gateway/src/routes/auth.routes.ts:7](../../services/gateway/src/routes/auth.routes.ts#L7) | proxyHandler |
| F0751 | ALL /* | [services/gateway/src/routes/chat.routes.ts:18](../../services/gateway/src/routes/chat.routes.ts#L18) | proxyHandler |
| F0752 | ALL /* | [services/gateway/src/routes/document.routes.ts:7](../../services/gateway/src/routes/document.routes.ts#L7) | proxyHandler |
| F0753 | GET /health | [services/gateway/src/routes/index.ts:2](../../services/gateway/src/routes/index.ts#L2) | healthCheck |
| F0754 | GET /health/deep | [services/gateway/src/routes/index.ts:16](../../services/gateway/src/routes/index.ts#L16) | deepHealthCheck |
| F0755 | USE /v1/auth | [services/gateway/src/routes/index.ts:19](../../services/gateway/src/routes/index.ts#L19) | authRoutes |
| F0756 | USE /v1/users | [services/gateway/src/routes/index.ts:20](../../services/gateway/src/routes/index.ts#L20) | authRoutes |
| F0757 | USE /v1/ai | [services/gateway/src/routes/index.ts:21](../../services/gateway/src/routes/index.ts#L21) | chatRoutes |
| F0758 | USE /v1/chat | [services/gateway/src/routes/index.ts:22](../../services/gateway/src/routes/index.ts#L22) | chatRoutes |
| F0759 | USE /v1/quota | [services/gateway/src/routes/index.ts:23](../../services/gateway/src/routes/index.ts#L23) | quotaRoutes |
| F0760 | USE /v1/payment | [services/gateway/src/routes/index.ts:24](../../services/gateway/src/routes/index.ts#L24) | paymentRoutes |
| F0761 | USE /v1/billing | [services/gateway/src/routes/index.ts:25](../../services/gateway/src/routes/index.ts#L25) | paymentRoutes |
| F0762 | USE /v1/notification | [services/gateway/src/routes/index.ts:26](../../services/gateway/src/routes/index.ts#L26) | notificationRoutes |
| F0763 | USE /v1/notifications | [services/gateway/src/routes/index.ts:27](../../services/gateway/src/routes/index.ts#L27) | notificationRoutes |
| F0764 | USE /v1/document | [services/gateway/src/routes/index.ts:28](../../services/gateway/src/routes/index.ts#L28) | documentRoutes |
| F0765 | USE /v1/documents | [services/gateway/src/routes/index.ts:29](../../services/gateway/src/routes/index.ts#L29) | documentRoutes |
| F0766 | USE /v1/templates | [services/gateway/src/routes/index.ts:30](../../services/gateway/src/routes/index.ts#L30) | documentRoutes |
| F0767 | USE /v1/analytics | [services/gateway/src/routes/index.ts:31](../../services/gateway/src/routes/index.ts#L31) | analyticsRoutes |
| F0768 | USE /v1/admin | [services/gateway/src/routes/index.ts:32](../../services/gateway/src/routes/index.ts#L32) | adminRoutes |
| F0769 | USE /v1/support | [services/gateway/src/routes/index.ts:33](../../services/gateway/src/routes/index.ts#L33) | adminRoutes |
| F0770 | ALL /* | [services/gateway/src/routes/notification.routes.ts:7](../../services/gateway/src/routes/notification.routes.ts#L7) | proxyHandler |
| F0771 | ALL /* | [services/gateway/src/routes/payment.routes.ts:7](../../services/gateway/src/routes/payment.routes.ts#L7) | proxyHandler |
| F0772 | ALL /* | [services/gateway/src/routes/quota.routes.ts:7](../../services/gateway/src/routes/quota.routes.ts#L7) | proxyHandler |
| F0773 | USE /docs | [services/gateway/src/swagger.ts:48](../../services/gateway/src/swagger.ts#L48) | swaggerUi.setup(spec, {       customSiteTitle: 'DocCraft API Gateway Docs',     }) as any |
| F0774 | GET /docs.json | [services/gateway/src/swagger.ts:54](../../services/gateway/src/swagger.ts#L54) | (_req, res) => {     res.json(spec);   } |
| F0775 | GET /preferences | [services/notification/src/routes/notification.routes.ts:14](../../services/notification/src/routes/notification.routes.ts#L14) | getPreferences |
| F0776 | PATCH /preferences | [services/notification/src/routes/notification.routes.ts:14](../../services/notification/src/routes/notification.routes.ts#L14) | updatePreferences |
| F0777 | POST /send | [services/notification/src/routes/notification.routes.ts:42](../../services/notification/src/routes/notification.routes.ts#L42) | sendNotification |
| F0778 | GET /logs | [services/notification/src/routes/notification.routes.ts:59](../../services/notification/src/routes/notification.routes.ts#L59) | getLogs |
| F0779 | GET /logs/admin | [services/notification/src/routes/notification.routes.ts:71](../../services/notification/src/routes/notification.routes.ts#L71) | getAdminLogs |
| F0780 | POST /webhooks/resend-status | [services/notification/src/routes/notification.routes.ts:91](../../services/notification/src/routes/notification.routes.ts#L91) | receiveResendWebhook |
| F0781 | GET /health | [services/notification/src/server.ts:18](../../services/notification/src/server.ts#L18) | async () => {   return { status: 'ok', service: 'notification', queue: 'listening' }; } |
| F0787 | USE /health | [services/payment/src/app.ts:6](../../services/payment/src/app.ts#L6) | healthRoutes |
| F0788 | USE /v1/payment | [services/payment/src/app.ts:25](../../services/payment/src/app.ts#L25) | paymentRoutes |
| F0790 | GET / | [services/payment/src/routes/health.routes.ts:3](../../services/payment/src/routes/health.routes.ts#L3) | async (_req: Request, res: Response) => {   const checks: Record<string, 'ok' \| 'error'> = {     redis:    'error',     postgres: 'error',   |
| F0791 | GET /plans | [services/payment/src/routes/payment.routes.ts:12](../../services/payment/src/routes/payment.routes.ts#L12) | payment.listPlans |
| F0792 | POST /webhook/paddle | [services/payment/src/routes/payment.routes.ts:23](../../services/payment/src/routes/payment.routes.ts#L23) | payment.paddleWebhook |
| F0793 | POST /webhook/payhere | [services/payment/src/routes/payment.routes.ts:35](../../services/payment/src/routes/payment.routes.ts#L35) | payment.payhereWebhook |
| F0794 | POST /subscribe | [services/payment/src/routes/payment.routes.ts:48](../../services/payment/src/routes/payment.routes.ts#L48) | payment.createCheckout |
| F0795 | POST /portal | [services/payment/src/routes/payment.routes.ts:51](../../services/payment/src/routes/payment.routes.ts#L51) | payment.getBillingPortal |
| F0796 | GET /subscription | [services/payment/src/routes/payment.routes.ts:54](../../services/payment/src/routes/payment.routes.ts#L54) | payment.getSubscription |
| F0797 | POST /cancel | [services/payment/src/routes/payment.routes.ts:57](../../services/payment/src/routes/payment.routes.ts#L57) | payment.cancelSubscription |
| F0798 | GET /invoices | [services/payment/src/routes/payment.routes.ts:60](../../services/payment/src/routes/payment.routes.ts#L60) | payment.listInvoices |
| F0799 | POST /coupon/validate | [services/payment/src/routes/payment.routes.ts:63](../../services/payment/src/routes/payment.routes.ts#L63) | payment.validateCouponHandler |
| F0800 | GET /methods | [services/payment/src/routes/payment.routes.ts:67](../../services/payment/src/routes/payment.routes.ts#L67) | payment.listPaymentMethods |
| F0801 | POST /methods | [services/payment/src/routes/payment.routes.ts:67](../../services/payment/src/routes/payment.routes.ts#L67) | payment.addPaymentMethod |
| F0802 | DELETE /methods/:id | [services/payment/src/routes/payment.routes.ts:69](../../services/payment/src/routes/payment.routes.ts#L69) | payment.deletePaymentMethod |
| F0803 | POST /methods/:id/default | [services/payment/src/routes/payment.routes.ts:70](../../services/payment/src/routes/payment.routes.ts#L70) | payment.setDefaultPaymentMethod |
| F0804 | USE /admin | [services/payment/src/routes/payment.routes.ts:73](../../services/payment/src/routes/payment.routes.ts#L73) | requireInternalSecret |
| F0805 | GET /admin/subscriptions/stats | [services/payment/src/routes/payment.routes.ts:76](../../services/payment/src/routes/payment.routes.ts#L76) | payment.adminSubscriptionStats |
| F0806 | GET /admin/subscriptions | [services/payment/src/routes/payment.routes.ts:75](../../services/payment/src/routes/payment.routes.ts#L75) | payment.adminListSubscriptions |
| F0807 | GET /admin/invoices | [services/payment/src/routes/payment.routes.ts:79](../../services/payment/src/routes/payment.routes.ts#L79) | payment.adminListInvoices |
| F0808 | GET /admin/revenue | [services/payment/src/routes/payment.routes.ts:82](../../services/payment/src/routes/payment.routes.ts#L82) | payment.adminRevenueSummary |
| F0809 | GET /admin/revenue/trajectory | [services/payment/src/routes/payment.routes.ts:85](../../services/payment/src/routes/payment.routes.ts#L85) | payment.adminRevenueTrajectory |
| F0810 | GET /admin/failed-payments | [services/payment/src/routes/payment.routes.ts:88](../../services/payment/src/routes/payment.routes.ts#L88) | payment.adminFailedPayments |
| F0811 | GET /admin/refunds | [services/payment/src/routes/payment.routes.ts:91](../../services/payment/src/routes/payment.routes.ts#L91) | payment.adminRefunds |
| F0812 | GET /admin/keys/status | [services/payment/src/routes/payment.routes.ts:94](../../services/payment/src/routes/payment.routes.ts#L94) | payment.adminKeyStatus |
| F0813 | GET /admin/coupons | [services/payment/src/routes/payment.routes.ts:98](../../services/payment/src/routes/payment.routes.ts#L98) | payment.adminListCoupons |
| F0814 | POST /admin/coupons | [services/payment/src/routes/payment.routes.ts:98](../../services/payment/src/routes/payment.routes.ts#L98) | payment.adminCreateCoupon |
| F0815 | POST /admin/coupons/:id/archive | [services/payment/src/routes/payment.routes.ts:100](../../services/payment/src/routes/payment.routes.ts#L100) | payment.adminArchiveCoupon |
| F0816 | GET /admin/trials | [services/payment/src/routes/payment.routes.ts:103](../../services/payment/src/routes/payment.routes.ts#L103) | payment.adminListTrials |
| F0817 | POST /admin/trials | [services/payment/src/routes/payment.routes.ts:103](../../services/payment/src/routes/payment.routes.ts#L103) | payment.adminStartTrial |
| F0818 | PATCH /admin/trials/:id/extend | [services/payment/src/routes/payment.routes.ts:105](../../services/payment/src/routes/payment.routes.ts#L105) | payment.adminExtendTrial |
| F0819 | POST /admin/trials/:id/end | [services/payment/src/routes/payment.routes.ts:106](../../services/payment/src/routes/payment.routes.ts#L106) | payment.adminEndTrial |
| F0820 | USE /docs | [services/payment/src/swagger.ts:384](../../services/payment/src/swagger.ts#L384) | swaggerUi.setup(spec, {       customSiteTitle: 'DocCraft Payment API',       customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }' |
| F0821 | GET /docs.json | [services/payment/src/swagger.ts:391](../../services/payment/src/swagger.ts#L391) | (_req, res) => {     res.json(spec);   } |
| F0825 | USE /health | [services/quota/src/app.ts:6](../../services/quota/src/app.ts#L6) | healthRoutes |
| F0826 | USE /v1/quota | [services/quota/src/app.ts:29](../../services/quota/src/app.ts#L29) | quotaRoutes |
| F0828 | GET / | [services/quota/src/routes/health.routes.ts:3](../../services/quota/src/routes/health.routes.ts#L3) | async (_req: Request, res: Response) => {   const checks: Record<string, 'ok' \| 'error'> = {     redis:    'error',     postgres: 'error',   |
| F0829 | GET /me | [services/quota/src/routes/quota.routes.ts:11](../../services/quota/src/routes/quota.routes.ts#L11) | ctrl.getMyQuota |
| F0830 | POST /check | [services/quota/src/routes/quota.routes.ts:20](../../services/quota/src/routes/quota.routes.ts#L20) | ctrl.checkQuota |
| F0831 | POST /increment | [services/quota/src/routes/quota.routes.ts:28](../../services/quota/src/routes/quota.routes.ts#L28) | ctrl.incrementQuota |
| F0832 | POST /refund | [services/quota/src/routes/quota.routes.ts:35](../../services/quota/src/routes/quota.routes.ts#L35) | ctrl.refundQuota |
| F0833 | POST /reset | [services/quota/src/routes/quota.routes.ts:45](../../services/quota/src/routes/quota.routes.ts#L45) | ctrl.resetUserQuota |
| F0834 | POST /guest/check | [services/quota/src/routes/quota.routes.ts:56](../../services/quota/src/routes/quota.routes.ts#L56) | ctrl.checkGuestQuota |
| F0835 | POST /guest/increment | [services/quota/src/routes/quota.routes.ts:63](../../services/quota/src/routes/quota.routes.ts#L63) | ctrl.incrementGuestQuota |
| F0836 | POST /override | [services/quota/src/routes/quota.routes.ts:72](../../services/quota/src/routes/quota.routes.ts#L72) | ctrl.overrideQuotaHandler |
| F0837 | GET /admin/stats | [services/quota/src/routes/quota.routes.ts:80](../../services/quota/src/routes/quota.routes.ts#L80) | ctrl.getAdminQuotaStats |
| F0838 | USE /docs | [services/quota/src/swagger.ts:250](../../services/quota/src/swagger.ts#L250) | swaggerUi.setup(spec, {     customSiteTitle: 'DocCraft Quota API',     customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',   }) |
| F0839 | GET /docs.json | [services/quota/src/swagger.ts:254](../../services/quota/src/swagger.ts#L254) | (_req, res) => {     res.json(spec);   } |

## Discovered HTTP client targets

These are source expressions; dynamic values are not resolved or assumed working. User clients append paths to a base URL that already includes `/v1`; admin clients use a base already ending `/api/v1`.

| Source | Call | Target expression | Verification |
| --- | --- | --- | --- |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/login' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/verify-login-code' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/forgot-password' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/reset-password' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/change-password' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/totp/setup' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/totp/verify' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/totp/disable' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/request-action-code' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/me' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/auth/me' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/users/${query ? `?${query}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/users/${userId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/users/${userId}/status` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/users/${userId}/plan` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/users/${userId}/quota` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/users/${userId}/override` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/roles' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/roles' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/roles/${roleId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/roles/${roleId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/permissions' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/staff' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/staff/invite' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/staff/${staffId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/staff/${staffId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/audit-logs${query ? `?${query}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/audit-logs/all' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/audit-logs/${logId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/security/alerts${status ? `?status=${status}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/security/alerts/${alertId}/resolve` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/security/sessions' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/security/sessions/${sessionId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/security/ip-logs${limit ? `?limit=${limit}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/security/rate-limits${limit ? `?limit=${limit}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/security/bot-logs' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/security/abuse-reports${status ? `?status=${status}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/security/abuse-reports/${reportId}/resolve` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/security/api-keys' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/plans' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/plans' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/plans/${planId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/plans/${planId}/archive` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/users/${userId}/quota-override` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/users/${userId}/quota-override` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/coupons' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/coupons' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/coupons/${couponId}/archive` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/trials' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/trials' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/trials/${trialId}/extend` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/trials/${trialId}/end` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/plans/performance' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/promotions/ab-tests' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/promotions/referrals${status ? `?status=${status}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/promotions/referrals' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/promotions/referrals/${referralId}/convert` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/subscriptions${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/subscriptions/stats' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/invoices${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/payment/plans' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/automation/rules' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/automation/rules' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/automation/rules/${ruleId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/automation/rules/${ruleId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/automation/rules/${ruleId}/dry-run` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/automation/dry-run' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/automation/events/emit' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/automation/execution-logs' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/notifications/email-logs${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/failed' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/history' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/status' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/announcements' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/announcements' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/notifications/announcements/${announcementId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/notifications/announcements/${announcementId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/templates' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/templates' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/notifications/templates/${templateId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/notifications/templates/${templateId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/settings' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/notifications/settings' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/infrastructure/health' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/infrastructure/mcp/sessions' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/infrastructure/mcp/templates' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/templates' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/templates' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/templates/${templateId}/publish` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/overview' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/revenue' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/generations' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/generations/detailed' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/users' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/analytics/traffic${qs ? `?${qs}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/journey' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/analytics/button-clicks${days ? `?days=${days}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/analytics/page-duration${days ? `?days=${days}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/posthog/config' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/analytics/events' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/internal/config/${domain}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/internal/config' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/config/${domain}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/config/${domain}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/config/${domain}/history` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/gdpr/purge' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/tickets${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/tickets/${ticketId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/tickets/${ticketId}/resolve` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/refunds${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/refunds/${refundId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/contact${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/contact/${contactId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/plan-overrides${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/plan-overrides/${overrideId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/support/plan-overrides/${overrideId}/approve` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/cost-ledger${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/cost-ledger' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/cost-ledger/${entryId}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/cost-ledger/summary' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | '/admin/revenue' | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/failed-payments${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/api/adminApiClient.ts:1](../../admin/src/api/adminApiClient.ts#L1) | apiRequest | `/admin/refunds${q ? `?${q}` : ''}` | INFERRED; see workflow-specific evidence |
| [admin/src/store/adminAuthStore.ts:1](../../admin/src/store/adminAuthStore.ts#L1) | fetch | `${API_BASE_URL}/admin/auth/verify-login-code` | INFERRED; see workflow-specific evidence |
| [admin/src/store/adminAuthStore.ts:1](../../admin/src/store/adminAuthStore.ts#L1) | fetch | `${API_BASE_URL}/admin/auth/login` | INFERRED; see workflow-specific evidence |
| [admin/src/store/adminAuthStore.ts:1](../../admin/src/store/adminAuthStore.ts#L1) | fetch | `${API_BASE_URL}/admin/auth/forgot-password` | INFERRED; see workflow-specific evidence |
| [admin/src/store/adminAuthStore.ts:1](../../admin/src/store/adminAuthStore.ts#L1) | fetch | `${API_BASE_URL}/admin/auth/reset-password` | INFERRED; see workflow-specific evidence |
| [admin/src/store/adminAuthStore.ts:1](../../admin/src/store/adminAuthStore.ts#L1) | fetch | `${API_BASE_URL}/admin/auth/change-password` | INFERRED; see workflow-specific evidence |
| [admin/src/store/adminAuthStore.ts:1](../../admin/src/store/adminAuthStore.ts#L1) | fetch | `${API_BASE_URL}/admin/auth/me` | INFERRED; see workflow-specific evidence |
| [services/auth/src/controllers/auth.controller.ts:1](../../services/auth/src/controllers/auth.controller.ts#L1) | fetch | 'https://www.googleapis.com/oauth2/v2/userinfo' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/login/google' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/guest' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/register' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/login' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/login/2fa' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/refresh' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/logout' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/password/forgot' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/password/reset' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/verify-email' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/verify-email/resend' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.get | '/me' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.patch | '/me' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.get | '/oauth/google/callback' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/2fa/enable' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/2fa/verify' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/auth.routes.ts:1](../../services/auth/src/routes/auth.routes.ts#L1) | fastify.post | '/2fa/disable' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.get | '/users' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.get | '/users/:id' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.patch | '/users/:id/status' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.patch | '/users/:id/plan' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.get | '/users/stats-by-plan' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.get | '/referrals' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.post | '/referrals' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.patch | '/referrals/:id/convert' | INFERRED; see workflow-specific evidence |
| [services/auth/src/routes/internal.routes.ts:1](../../services/auth/src/routes/internal.routes.ts#L1) | fastify.post | '/verify-token' | INFERRED; see workflow-specific evidence |
| [services/auth/src/server.ts:1](../../services/auth/src/server.ts#L1) | server.get | '/health' | INFERRED; see workflow-specific evidence |
| [services/auth/src/services/email.service.ts:1](../../services/auth/src/services/email.service.ts#L1) | fetch | `${notificationServiceUrl}/notification/send` | INFERRED; see workflow-specific evidence |
| [services/auth/src/services/productTracking.service.ts:1](../../services/auth/src/services/productTracking.service.ts#L1) | fetch | `${ANALYTICS_SERVICE_URL}/v1/analytics/event` | INFERRED; see workflow-specific evidence |
| [services/chat/src/middleware/auth.middleware.ts:1](../../services/chat/src/middleware/auth.middleware.ts#L1) | fetch | `${process.env.AUTH_SERVICE_URL \|\| 'http://localhost:3011'}/internal/verify-token` | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.post | '/chat/session' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.get | '/chat/sessions' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.patch | '/chat/session/:sessionId' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.delete | '/chat/session/:sessionId' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.get | '/chat/session/:sessionId/messages' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.post | '/chat/session/:sessionId/confirm' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.post | '/chat/session/:sessionId/assets' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.delete | '/chat/session/:sessionId/assets' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.post | '/chat/session/:sessionId/resolve' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/chat.routes.ts:1](../../services/chat/src/routes/chat.routes.ts#L1) | fastify.post | '/chat/session/:sessionId/message' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/mcp.routes.ts:1](../../services/chat/src/routes/mcp.routes.ts#L1) | fastify.get | '/mcp' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/mcp.routes.ts:1](../../services/chat/src/routes/mcp.routes.ts#L1) | fastify.post | '/mcp/message' | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/metrics.routes.ts:1](../../services/chat/src/routes/metrics.routes.ts#L1) | fastify.get | "/metrics" | INFERRED; see workflow-specific evidence |
| [services/chat/src/routes/status.routes.ts:1](../../services/chat/src/routes/status.routes.ts#L1) | fastify.get | "/internal/status/keys" | INFERRED; see workflow-specific evidence |
| [services/chat/src/server.ts:1](../../services/chat/src/server.ts#L1) | fastify.get | "/health" | INFERRED; see workflow-specific evidence |
| [services/chat/src/services/groq.service.ts:1](../../services/chat/src/services/groq.service.ts#L1) | fetch | 'https://api.groq.com/openai/v1/chat/completions' | INFERRED; see workflow-specific evidence |
| [services/chat/src/services/planConfigClient.service.ts:1](../../services/chat/src/services/planConfigClient.service.ts#L1) | fetch | `${env.ADMIN_API_SERVICE_URL}/api/v1/internal/config/ai_model_routing` | INFERRED; see workflow-specific evidence |
| [services/chat/src/services/posthogTracking.service.ts:1](../../services/chat/src/services/posthogTracking.service.ts#L1) | fetch | `${env.ANALYTICS_SERVICE_URL}/v1/analytics/event` | INFERRED; see workflow-specific evidence |
| [services/chat/src/services/quotaClient.service.ts:1](../../services/chat/src/services/quotaClient.service.ts#L1) | fetch | `${env.QUOTA_SERVICE_URL}/v1/quota/check` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | "/chat/session" | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | "/chat/session" | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | "/chat/session" | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | "/chat/session" | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | get | "/chat/sessions" | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId}/message` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId}/message` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId}/message` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | get | "/chat/session/00000000-0000-0000-0000-000000000000/messages" | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | get | `/chat/session/${sessionId}/messages` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | "/chat/session/00000000-0000-0000-0000-000000000000/abandon" | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId}/abandon` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId}/message` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId}/abandon` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId2}/complete` | INFERRED; see workflow-specific evidence |
| [services/chat/test-chat.ts:1](../../services/chat/test-chat.ts#L1) | post | `/chat/session/${sessionId2}/complete` | INFERRED; see workflow-specific evidence |
| [services/document/puppeteer/server.ts:1](../../services/document/puppeteer/server.ts#L1) | server.post | '/generate' | INFERRED; see workflow-specific evidence |
| [services/gateway/src/controllers/health.controller.ts:1](../../services/gateway/src/controllers/health.controller.ts#L1) | fetch | `${value.baseUrl}/health` | INFERRED; see workflow-specific evidence |
| [services/gateway/src/middleware/rateLimiter.middleware.ts:1](../../services/gateway/src/middleware/rateLimiter.middleware.ts#L1) | fetch | `${env.ADMIN_API_SERVICE_URL}/api/v1/admin/security/rate-limit-violation` | INFERRED; see workflow-specific evidence |
| [services/gateway/src/routes/index.ts:1](../../services/gateway/src/routes/index.ts#L1) | router.get | '/health' | INFERRED; see workflow-specific evidence |
| [services/gateway/src/routes/index.ts:1](../../services/gateway/src/routes/index.ts#L1) | router.get | '/health/deep' | INFERRED; see workflow-specific evidence |
| [services/gateway/src/security/jwtVerifier.ts:1](../../services/gateway/src/security/jwtVerifier.ts#L1) | fetch | `${env.AUTH_SERVICE_URL}/internal/verify-token` | INFERRED; see workflow-specific evidence |
| [services/gateway/src/swagger.ts:1](../../services/gateway/src/swagger.ts#L1) | app.get | '/docs.json' | INFERRED; see workflow-specific evidence |
| [services/gateway/test-gateway.ts:1](../../services/gateway/test-gateway.ts#L1) | fetch | 'http://localhost:3001/health' | INFERRED; see workflow-specific evidence |
| [services/notification/src/routes/notification.routes.ts:1](../../services/notification/src/routes/notification.routes.ts#L1) | fastify.get | '/preferences' | INFERRED; see workflow-specific evidence |
| [services/notification/src/routes/notification.routes.ts:1](../../services/notification/src/routes/notification.routes.ts#L1) | fastify.patch | '/preferences' | INFERRED; see workflow-specific evidence |
| [services/notification/src/routes/notification.routes.ts:1](../../services/notification/src/routes/notification.routes.ts#L1) | fastify.post | '/send' | INFERRED; see workflow-specific evidence |
| [services/notification/src/routes/notification.routes.ts:1](../../services/notification/src/routes/notification.routes.ts#L1) | fastify.get | '/logs' | INFERRED; see workflow-specific evidence |
| [services/notification/src/routes/notification.routes.ts:1](../../services/notification/src/routes/notification.routes.ts#L1) | fastify.get | '/logs/admin' | INFERRED; see workflow-specific evidence |
| [services/notification/src/routes/notification.routes.ts:1](../../services/notification/src/routes/notification.routes.ts#L1) | fastify.post | '/webhooks/resend-status' | INFERRED; see workflow-specific evidence |
| [services/notification/src/security.ts:1](../../services/notification/src/security.ts#L1) | fetch | `${process.env.AUTH_SERVICE_URL \|\| 'http://localhost:3011'}/v1/auth/me` | INFERRED; see workflow-specific evidence |
| [services/notification/src/server.ts:1](../../services/notification/src/server.ts#L1) | fastify.get | '/health' | INFERRED; see workflow-specific evidence |
| [services/notification/src/services/email.service.ts:1](../../services/notification/src/services/email.service.ts#L1) | fetch | `${adminApiUrl}/api/v1/admin/notifications/config/public` | INFERRED; see workflow-specific evidence |
| [services/payment/src/middleware/authenticate.ts:1](../../services/payment/src/middleware/authenticate.ts#L1) | fetch | `${process.env.AUTH_SERVICE_URL \|\| 'http://localhost:3011'}/internal/verify-token` | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/health.routes.ts:1](../../services/payment/src/routes/health.routes.ts#L1) | router.get | '/' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/plans' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/webhook/paddle' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/webhook/payhere' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/subscribe' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/portal' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/subscription' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/cancel' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/invoices' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/coupon/validate' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/methods' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/methods' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.delete | '/methods/:id' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/methods/:id/default' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/subscriptions/stats' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/subscriptions' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/invoices' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/revenue' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/revenue/trajectory' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/failed-payments' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/refunds' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/keys/status' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/coupons' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/admin/coupons' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/admin/coupons/:id/archive' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.get | '/admin/trials' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/admin/trials' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.patch | '/admin/trials/:id/extend' | INFERRED; see workflow-specific evidence |
| [services/payment/src/routes/payment.routes.ts:1](../../services/payment/src/routes/payment.routes.ts#L1) | router.post | '/admin/trials/:id/end' | INFERRED; see workflow-specific evidence |
| [services/payment/src/services/subscription.service.ts:1](../../services/payment/src/services/subscription.service.ts#L1) | fetch | `${env.ANALYTICS_SERVICE_URL}/v1/analytics/event` | INFERRED; see workflow-specific evidence |
| [services/payment/src/services/subscription.service.ts:1](../../services/payment/src/services/subscription.service.ts#L1) | fetch | `${env.QUOTA_SERVICE_URL}/v1/quota/reset` | INFERRED; see workflow-specific evidence |
| [services/payment/src/services/subscription.service.ts:1](../../services/payment/src/services/subscription.service.ts#L1) | fetch | `${env.QUOTA_SERVICE_URL}/v1/quota/override` | INFERRED; see workflow-specific evidence |
| [services/payment/src/services/subscription.service.ts:1](../../services/payment/src/services/subscription.service.ts#L1) | fetch | `${env.AUTH_SERVICE_URL}/internal/users/${encodeURIComponent(userId)}/plan` | INFERRED; see workflow-specific evidence |
| [services/payment/src/services/subscription.service.ts:1](../../services/payment/src/services/subscription.service.ts#L1) | fetch | `${env.AUTH_SERVICE_URL}/internal/users/${encodeURIComponent(userId)}` | INFERRED; see workflow-specific evidence |
| [services/payment/src/services/subscription.service.ts:1](../../services/payment/src/services/subscription.service.ts#L1) | fetch | `${env.NOTIFICATION_SERVICE_URL}/notification/send` | INFERRED; see workflow-specific evidence |
| [services/payment/src/swagger.ts:1](../../services/payment/src/swagger.ts#L1) | app.get | '/docs.json' | INFERRED; see workflow-specific evidence |
| [services/quota/src/middleware/authenticate.ts:1](../../services/quota/src/middleware/authenticate.ts#L1) | fetch | `${process.env.AUTH_SERVICE_URL \|\| 'http://localhost:3011'}/internal/verify-token` | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/health.routes.ts:1](../../services/quota/src/routes/health.routes.ts#L1) | router.get | '/' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.get | '/me' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.post | '/check' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.post | '/increment' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.post | '/refund' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.post | '/reset' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.post | '/guest/check' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.post | '/guest/increment' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.post | '/override' | INFERRED; see workflow-specific evidence |
| [services/quota/src/routes/quota.routes.ts:1](../../services/quota/src/routes/quota.routes.ts#L1) | router.get | '/admin/stats' | INFERRED; see workflow-specific evidence |
| [services/quota/src/security/ipAbuseDetection.ts:1](../../services/quota/src/security/ipAbuseDetection.ts#L1) | fetch | `${env.ADMIN_API_SERVICE_URL}/api/v1/admin/security/bot-detection-event` | INFERRED; see workflow-specific evidence |
| [services/quota/src/services/quota.service.ts:1](../../services/quota/src/services/quota.service.ts#L1) | fetch | `${env.ANALYTICS_SERVICE_URL}/v1/analytics/event` | INFERRED; see workflow-specific evidence |
| [services/quota/src/services/quota.service.ts:1](../../services/quota/src/services/quota.service.ts#L1) | fetch | `${env.ADMIN_API_SERVICE_URL}/api/v1/admin/security/auto-suspend` | INFERRED; see workflow-specific evidence |
| [services/quota/src/swagger.ts:1](../../services/quota/src/swagger.ts#L1) | app.get | '/docs.json' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/ai.ts:1](../../user-frontend/src/api/ai.ts#L1) | post | '/chat/api/chat/session' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/ai.ts:1](../../user-frontend/src/api/ai.ts#L1) | get | '/chat/api/chat/sessions' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/analytics.ts:1](../../user-frontend/src/api/analytics.ts#L1) | post | '/analytics/client-event' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/register' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/login' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/login/google' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/logout' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/password/forgot' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/password-reset' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/password/reset' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | apiRequest | '/auth/guest' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | apiRequest | '/auth/me' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/verify-email' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/verify-email/resend' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/2fa/enable' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/2fa/verify' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/2fa/disable' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/auth.ts:1](../../user-frontend/src/api/auth.ts#L1) | post | '/auth/login/2fa' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/billing.ts:1](../../user-frontend/src/api/billing.ts#L1) | get | '/quota/me' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | post | '/documents/generate' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | patch | `/documents/${documentId}/layout` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | patch | `/documents/${documentId}/content` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | get | `/document/templates?type=${documentType}` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | get | `/templates?document_type=${documentType}` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | get | '/chat/sessions' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | get | `/chat/session/${sessionId}/messages` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | post | '/document/templates/custom' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | get | `/document/templates/custom?type=${documentType}` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | get | `/document/templates/custom/${id}` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | apiRequest | `/document/templates/custom/${id}` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | apiRequest | `/document/generate` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/documents.ts:1](../../user-frontend/src/api/documents.ts#L1) | apiRequest | `/documents/${documentId}/export/pdf` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | '/payment/methods' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | '/payment/methods' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | `/payment/methods/${encodeURIComponent(id)}` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | `/payment/methods/${encodeURIComponent(id)}/default` | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | '/payment/subscription' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | '/payment/subscribe' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | '/payment/cancel' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/payment.ts:1](../../user-frontend/src/api/payment.ts#L1) | apiRequest | '/payment/portal' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/support.ts:1](../../user-frontend/src/api/support.ts#L1) | post | '/support/tickets' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/support.ts:1](../../user-frontend/src/api/support.ts#L1) | post | '/support/refunds' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/support.ts:1](../../user-frontend/src/api/support.ts#L1) | post | '/support/contact' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/support.ts:1](../../user-frontend/src/api/support.ts#L1) | post | '/support/plan-override-requests' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/users.ts:1](../../user-frontend/src/api/users.ts#L1) | get | '/auth/me' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/api/users.ts:1](../../user-frontend/src/api/users.ts#L1) | patch | '/auth/me' | INFERRED; see workflow-specific evidence |
| [user-frontend/src/hooks/usePageDurationTracking.ts:1](../../user-frontend/src/hooks/usePageDurationTracking.ts#L1) | post | '/analytics/client-event' | INFERRED; see workflow-specific evidence |

## External services and configuration

Firebase, Groq/Anthropic, Paddle, PayHere, Resend, Supabase storage and PostHog have implementation/configuration references. Their existence is not evidence of valid credentials, provider availability, account entitlement, successful sandbox transactions or data correctness. No live validity checks were made with existing secrets.

The sanitized environment inventory records variable names, port values, remote-database classification and equality comparisons without secret values: [environment-summary.json](evidence/environment-summary.json). Most service user JWT secrets match Auth's configured secret; the root shared file's user signing secret differs. Notification preferences verify with Auth, avoiding reliance on that root signing value. Resolve configuration drift before deployment. Admin JWT configuration is separate and currently lacks an explicit stable key in its service environment file.

Admin notification settings and configuration feeds contain operational data and require appropriate permissions/internal authentication. Resend callback verification follows the provider's requirement to verify the original payload, supported by [Resend's documentation](https://resend.com/changelog/managing-webhooks-via-api) and the [Svix verification guide](https://www.svix.com/guides/receiving/receive-webhooks-with-javascript-express/). The local regression uses signed synthetic bytes and freshness checks; provider callback registration and actual delivery were NOT TESTED.
