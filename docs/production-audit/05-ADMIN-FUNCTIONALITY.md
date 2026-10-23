# Admin functionality

The current navigation contains **91entries**, discovered directly from adminNavSections.tsx, across dashboard, users/guest/details, subscriptions, revenue, promotions/referrals/trials, packages/flags/routing, nine AI screens, generation/documents/templates, analytics, notifications, security/RBAC/audit, infrastructure/support/settings and other declared sections. These are not assumed to be91independent complete backend modules.

Actual Chromium navigated all91authenticated entries against actual admin API/PostgreSQL, with no response mocks and no uncaught page errors or failed HTTP recorded in those navigation checks. This proves render/read integration for that fixture only. Sensitive writes were separately tested through actual one-use2FA APIs: provider creation/persistence and user quota updates. Admin login used password plus a real persisted one-use code read only from the fixture database; actual email delivery remains unverified. The root/browser token injection for navigation means those91checks are not91browser login workflows.

Real admin→DB→Redis→Quota→user test changed daily quota3to2; exactly2of8signed concurrent reservation requests succeeded and6were denied. Zero limit was rejected422 according to the existing natural-number/-1schema. Regular user JWTs could not access AI config/users. Provider write optimistic version/payload validation is real. Broad paid-plan/AI assignment/cloud connectivity/credential mutation/browser permission variants remain separate test requirements; previous execution reports are not promoted to fresh proof.

Critical findings for admin scope: DB-001staff IDs can collide and overwrite under concurrent create; API-004subscription rows misstate currency/cadence; unavailability can render as empty data in some catch/allSettled views. Role/permission tests pass within the unit suite; a complete least-privilege staff/browser mutation matrix is still untested. Source sensitive configuration updates generally use live permissions and one-use2FA, while selected low-impact resolution actions use permission checks without MFA; this is a policy review item, not a universal assertion that every write requires MFA.

| Navigation ID | Label | Source |
| --- | --- | --- |
| home_dashboard | Dashboard | admin/src/config/adminNavSections.tsx:42 |
| users_all | All Users | admin/src/config/adminNavSections.tsx:49 |
| users_active | Active Users | admin/src/config/adminNavSections.tsx:50 |
| users_suspended | Suspended / Banned Users | admin/src/config/adminNavSections.tsx:51 |
| users_guest | Guest Sessions | admin/src/config/adminNavSections.tsx:52 |
| users_details | User Details & Manual Override | admin/src/config/adminNavSections.tsx:53 |
| subs_all | All Subscriptions | admin/src/config/adminNavSections.tsx:60 |
| subs_active | Active Plans | admin/src/config/adminNavSections.tsx:61 |
| subs_cancelled | Cancelled Plans | admin/src/config/adminNavSections.tsx:62 |
| subs_failed | Failed Payments | admin/src/config/adminNavSections.tsx:63 |
| subs_refunds | Refunds | admin/src/config/adminNavSections.tsx:64 |
| subs_plan_overview | Plan Overview (Free / Pro / Enterprise) | admin/src/config/adminNavSections.tsx:65 |
| rev_mrr_arr | MRR & ARR | admin/src/config/adminNavSections.tsx:72 |
| rev_by_plan | Revenue by Plan | admin/src/config/adminNavSections.tsx:73 |
| rev_cost_ledger | Cost Ledger & Expenses | admin/src/config/adminNavSections.tsx:74 |
| rev_churn | Churn Rate | admin/src/config/adminNavSections.tsx:75 |
| rev_ltv | LTV per User | admin/src/config/adminNavSections.tsx:76 |
| rev_transactions | Transaction History | admin/src/config/adminNavSections.tsx:77 |
| rev_payouts | Payout Summary | admin/src/config/adminNavSections.tsx:78 |
| promo_coupons | Coupon Codes | admin/src/config/adminNavSections.tsx:85 |
| promo_active | Active Promotions | admin/src/config/adminNavSections.tsx:86 |
| promo_ab_tests | A/B Tests | admin/src/config/adminNavSections.tsx:87 |
| promo_referrals | Referral Program | admin/src/config/adminNavSections.tsx:88 |
| promo_trials | Trial Management | admin/src/config/adminNavSections.tsx:89 |
| pack_current | Current Plans | admin/src/config/adminNavSections.tsx:96 |
| pack_create | Create New Plan | admin/src/config/adminNavSections.tsx:97 |
| pack_flags | Feature Flags per Plan | admin/src/config/adminNavSections.tsx:98 |
| pack_ai_models | AI Model Routing per Plan | admin/src/config/adminNavSections.tsx:99 |
| pack_performance | Plan Performance | admin/src/config/adminNavSections.tsx:100 |
| ai_providers | Providers | admin/src/config/adminNavSections.tsx:108 |
| ai_models | Model Registry | admin/src/config/adminNavSections.tsx:109 |
| ai_assignments | Plan Assignments | admin/src/config/adminNavSections.tsx:110 |
| ai_routing | Routing Policies | admin/src/config/adminNavSections.tsx:111 |
| ai_credentials | API Credentials | admin/src/config/adminNavSections.tsx:112 |
| ai_local | Local Inference | admin/src/config/adminNavSections.tsx:113 |
| ai_usage | Usage & Costs | admin/src/config/adminNavSections.tsx:114 |
| ai_health | Health & Monitoring | admin/src/config/adminNavSections.tsx:115 |
| ai_audit | Audit Logs | admin/src/config/adminNavSections.tsx:116 |
| gen_total | Total Generations | admin/src/config/adminNavSections.tsx:124 |
| gen_by_type | Generations by Document Type | admin/src/config/adminNavSections.tsx:125 |
| gen_by_user | Generations by User | admin/src/config/adminNavSections.tsx:126 |
| gen_failed | Failed Generations | admin/src/config/adminNavSections.tsx:127 |
| gen_free_tier | Free Tier Usage | admin/src/config/adminNavSections.tsx:128 |
| gen_pro_tier | Pro Tier Usage | admin/src/config/adminNavSections.tsx:129 |
| gen_drop_offs | Drop-off Points in Chat Flow | admin/src/config/adminNavSections.tsx:130 |
| doc_all | All Generated Documents | admin/src/config/adminNavSections.tsx:137 |
| doc_templates | Most Used Templates | admin/src/config/adminNavSections.tsx:138 |
| doc_version_registry | Custom Template Approvals | admin/src/config/adminNavSections.tsx:139 |
| doc_breakdown | Document Type Breakdown | admin/src/config/adminNavSections.tsx:140 |
| doc_links | Shared Document Links | admin/src/config/adminNavSections.tsx:141 |
| an_traffic | Traffic Overview | admin/src/config/adminNavSections.tsx:148 |
| an_location | Users by Location | admin/src/config/adminNavSections.tsx:149 |
| an_device | Users by Device | admin/src/config/adminNavSections.tsx:150 |
| an_duration | Page Visit Duration | admin/src/config/adminNavSections.tsx:151 |
| an_clicks | Button Click Tracking | admin/src/config/adminNavSections.tsx:152 |
| an_funnel | Subscribe Page Funnel | admin/src/config/adminNavSections.tsx:153 |
| an_conversion | Conversion Rate | admin/src/config/adminNavSections.tsx:154 |
| an_journey | Signup to Subscribe Journey | admin/src/config/adminNavSections.tsx:155 |
| sec_ip_logs | IP Address Logs | admin/src/config/adminNavSections.tsx:163 |
| sec_suspicious | Suspicious Activity | admin/src/config/adminNavSections.tsx:164 |
| sec_rate_limits | Rate Limit Violations | admin/src/config/adminNavSections.tsx:165 |
| sec_bot_logs | Bot Detection Logs | admin/src/config/adminNavSections.tsx:166 |
| sec_abuse_reports | Account Abuse Reports | admin/src/config/adminNavSections.tsx:167 |
| sec_audit | Audit Logs | admin/src/config/adminNavSections.tsx:168 |
| sec_sessions | Session Management | admin/src/config/adminNavSections.tsx:169 |
| sup_reported | User Reported Issues | admin/src/config/adminNavSections.tsx:176 |
| sup_refunds | Refund Requests | admin/src/config/adminNavSections.tsx:177 |
| sup_contact | Contact Form Submissions | admin/src/config/adminNavSections.tsx:178 |
| sup_overrides | Manual Plan Override Requests | admin/src/config/adminNavSections.tsx:179 |
| not_automation | Automation Rules & Engine | admin/src/config/adminNavSections.tsx:186 |
| not_execution_logs | Automation Execution Logs | admin/src/config/adminNavSections.tsx:187 |
| not_emit_events | Emit Domain Events | admin/src/config/adminNavSections.tsx:188 |
| not_email_logs | Email Logs | admin/src/config/adminNavSections.tsx:189 |
| not_system | System Announcements | admin/src/config/adminNavSections.tsx:190 |
| not_templates | Notification Templates | admin/src/config/adminNavSections.tsx:191 |
| inf_uptime | Uptime Monitor | admin/src/config/adminNavSections.tsx:198 |
| inf_mcp_chat | Chat MCP Server Integration | admin/src/config/adminNavSections.tsx:199 |
| inf_sentry | Error Logs (Sentry) | admin/src/config/adminNavSections.tsx:200 |
| inf_api_usage | API Usage & Limits | admin/src/config/adminNavSections.tsx:201 |
| inf_db_health | Database Health | admin/src/config/adminNavSections.tsx:202 |
| inf_deployments | Deployment History | admin/src/config/adminNavSections.tsx:203 |
| inf_staging_prod | Staging vs Production Status | admin/src/config/adminNavSections.tsx:204 |
| set_dynamic_config | Dynamic Config Engine | admin/src/config/adminNavSections.tsx:212 |
| set_profile | Admin Profile | admin/src/config/adminNavSections.tsx:213 |
| set_admin_users | Admin User Management | admin/src/config/adminNavSections.tsx:214 |
| set_2fa | 2FA Settings | admin/src/config/adminNavSections.tsx:215 |
| set_api_keys | API Keys & Integrations | admin/src/config/adminNavSections.tsx:216 |
| set_billing | Billing Configuration | admin/src/config/adminNavSections.tsx:217 |
| set_gdpr | GDPR & Data Management | admin/src/config/adminNavSections.tsx:218 |
| set_export_csv | Export Data (CSV) | admin/src/config/adminNavSections.tsx:219 |
| set_preferences | System Preferences | admin/src/config/adminNavSections.tsx:220 |

## Interactive admin components

| ID | Component | Interaction count/types | API IDs | Classification | Functional status |
| --- | --- | --- | --- | --- | --- |
| FEATURE-001 | admin/src/App.tsx | 18 {'onClick': 8, 'onSubmit': 4, 'onChange': 6} | FE-API-152,FE-API-153,FE-API-154,FE-API-155 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-002 | admin/src/components/AdminSidebar.tsx | 3 {'onClick': 3} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-003 | admin/src/components/EntitlementControls.tsx | 6 {'onChange': 4, 'onClick': 2} | FE-API-103,FE-API-104,FE-API-105 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-004 | admin/src/components/TemplateUpload.tsx | 9 {'onChange': 8, 'onClick': 1} | FE-API-106 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-005 | admin/src/components/common/AdminNavbar.tsx | 1 {'onClick': 1} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-006 | admin/src/components/common/AdminTopbar.tsx | 29 {'onChange': 4, 'onClick': 24, 'onSubmit': 1} | FE-API-087,FE-API-091,FE-API-158 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-007 | admin/src/components/common/ToastContainer.tsx | 1 {'onClick': 1} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-008 | admin/src/components/ui/DateRangeFilter.tsx | 5 {'onClick': 3, 'onChange': 2} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-009 | admin/src/components/ui/FontFacePicker.tsx | 3 {'onClick': 2, 'onChange': 1} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-010 | admin/src/components/ui/Pagination.tsx | 2 {'onClick': 2} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-011 | admin/src/components/ui/SortableHeader.tsx | 1 {'onClick': 1} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-012 | admin/src/components/ui/SystemDialogModal.tsx | 4 {'onClick': 4} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-013 | admin/src/components/ui/TotpPromptModal.tsx | 7 {'onClick': 5, 'onSubmit': 1, 'onChange': 1} | FE-API-025 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-014 | admin/src/pages/DashboardPage.tsx | 2 {'onClick': 2} |  | frontend-only or indirect store/hook integration; manual trace required | UNTESTED; render probes alone do not verify all actions |
| FEATURE-015 | admin/src/pages/UserDetailPage.tsx | 6 {'onClick': 2, 'onSubmit': 1, 'onChange': 3} | FE-API-029,FE-API-030,FE-API-033 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-016 | admin/src/pages/subviews/AIManagementView.tsx | 37 {'onChange': 16, 'onClick': 18, 'onSubmit': 3} | FE-API-004,FE-API-005,FE-API-006,FE-API-007,FE-API-008,FE-API-009,FE-API-010,FE-API-011,FE-API-012,FE-API-013,FE-API-014,FE-API-015,FE-API-016 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-017 | admin/src/pages/subviews/AnalyticsView.tsx | 12 {'onChange': 9, 'onClick': 3} | FE-API-120,FE-API-121,FE-API-122,FE-API-123,FE-API-124,FE-API-125 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-018 | admin/src/pages/subviews/AutomationsView.tsx | 33 {'onClick': 15, 'onChange': 16, 'onSubmit': 2} | FE-API-078,FE-API-079,FE-API-080,FE-API-081,FE-API-082,FE-API-083,FE-API-084,FE-API-085 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-019 | admin/src/pages/subviews/ConfigView.tsx | 7 {'onClick': 6, 'onChange': 1} | FE-API-128,FE-API-129,FE-API-130 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-020 | admin/src/pages/subviews/CostLedgerView.tsx | 15 {'onChange': 9, 'onClick': 5, 'onSubmit': 1} | FE-API-145,FE-API-146,FE-API-147,FE-API-148,FE-API-149 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-021 | admin/src/pages/subviews/DocumentsView.tsx | 15 {'onClick': 9, 'onChange': 5, 'onSubmit': 1} | FE-API-108,FE-API-109,FE-API-110,FE-API-111,FE-API-113,FE-API-114,FE-API-118 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-022 | admin/src/pages/subviews/GenerationsView.tsx | 4 {'onChange': 4} | FE-API-118 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-023 | admin/src/pages/subviews/HomeView.tsx | 4 {'onClick': 2, 'onSubmit': 1, 'onChange': 1} | FE-API-043,FE-API-085,FE-API-086,FE-API-090,FE-API-091,FE-API-093,FE-API-115,FE-API-116 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-024 | admin/src/pages/subviews/InfrastructureView.tsx | 8 {'onClick': 8} | FE-API-100,FE-API-101,FE-API-102,FE-API-134 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-025 | admin/src/pages/subviews/NotificationsView.tsx | 40 {'onChange': 17, 'onClick': 19, 'onSubmit': 4} | FE-API-086,FE-API-089,FE-API-090,FE-API-091,FE-API-092,FE-API-093,FE-API-094,FE-API-095,FE-API-096,FE-API-097,FE-API-098,FE-API-099 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-026 | admin/src/pages/subviews/PackagesView.tsx | 42 {'onChange': 27, 'onClick': 13, 'onSubmit': 2} | FE-API-056,FE-API-057,FE-API-058,FE-API-060,FE-API-069,FE-API-129 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-027 | admin/src/pages/subviews/PromotionsView.tsx | 21 {'onChange': 12, 'onClick': 6, 'onSubmit': 3} | FE-API-062,FE-API-063,FE-API-064,FE-API-065,FE-API-066,FE-API-067,FE-API-068,FE-API-070,FE-API-071,FE-API-072,FE-API-073 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-028 | admin/src/pages/subviews/RevenueView.tsx | 4 {'onClick': 3, 'onChange': 1} | FE-API-055,FE-API-076,FE-API-116,FE-API-149 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-029 | admin/src/pages/subviews/SecurityView.tsx | 20 {'onClick': 10, 'onChange': 9, 'onSubmit': 1} | FE-API-043,FE-API-044,FE-API-045,FE-API-046,FE-API-047,FE-API-048,FE-API-049,FE-API-050,FE-API-051,FE-API-052,FE-API-053,FE-API-054 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-030 | admin/src/pages/subviews/SettingsView.tsx | 43 {'onSubmit': 6, 'onChange': 17, 'onClick': 20} | FE-API-001,FE-API-002,FE-API-022,FE-API-023,FE-API-024,FE-API-026,FE-API-034,FE-API-035,FE-API-037,FE-API-039,FE-API-040,FE-API-041,FE-API-042,FE-API-055,FE-API-128,FE-API-129,FE-API-131,FE-API-132,FE-API-133,FE-API-156,FE-API-157 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-031 | admin/src/pages/subviews/SubscriptionsView.tsx | 14 {'onChange': 9, 'onClick': 5} | FE-API-056,FE-API-058,FE-API-074,FE-API-075,FE-API-076 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-032 | admin/src/pages/subviews/SupportView.tsx | 27 {'onChange': 7, 'onClick': 20} | FE-API-135,FE-API-137,FE-API-138,FE-API-139,FE-API-140,FE-API-141,FE-API-142,FE-API-143,FE-API-144 | API-linked component | UNTESTED; render probes alone do not verify all actions |
| FEATURE-033 | admin/src/pages/subviews/UsersView.tsx | 17 {'onSubmit': 2, 'onChange': 9, 'onClick': 6} | FE-API-028,FE-API-029,FE-API-030,FE-API-033,FE-API-061 | API-linked component | UNTESTED; render probes alone do not verify all actions |

[Feature inventory](evidence/feature-inventory.json) and [all interaction attributes](evidence/frontend-interactions.json) preserve review scope. Unexecuted CRUD, invalid-value, audit-log, cache propagation and dependent-user assertions remain explicit rather than inferred from screen existence.
