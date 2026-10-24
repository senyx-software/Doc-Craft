# Frontend to backend integration

228 source transport/wrapper callsites were extracted:158admin and70user.216match a current method/route after actual gateway alias rewrites,8are generic dynamic transports, and4legacy wrappers have no backend declaration. This is declaration coverage, not successful integration coverage. Every extracted callsite has file/line, wrapper, payload expression, auth default, consumers and candidate backend controller in [frontend-api-map.json](evidence/frontend-api-map.json). API schema/database fields are linked to report02 and remain explicit where runtime/transitive validation is incomplete.

Four unmatched wrappers: GET/admin/payment/plans, POST/admin/templates, PATCH/documents/{id}/layout and PATCH/documents/{id}/content. Direct import/call review found these unused. The initial name-only extractor falsely associated a same-named document-store method with updateLayout; the final inventory corrects it. Current canvas persistence uses PUT/chat/api/chat/session/{id}/canvas, not those legacy wrappers. Public GET/templates aliases exist, but fallback query document_type differs from the preferred type filter and should be kept under contract tests.

The actual user trace is React action -> normalized API client -> gateway upstreamPath alias -> Auth/Chat/Document/Quota -> signed policy/context calls -> PostgreSQL/Redis -> typed response -> Zustand -> UI. Current admin trace is React subview -> adminApiClient/apiRequest -> admin API JWT/live permission/one-use action challenge -> repository or signed owning service -> config version/cache invalidation -> UI refresh. Client typed interfaces alone do not validate runtime payloads.

Defects: OAuth callback URL/parser mismatch; profile normalization loses twoFactorEnabled; custom literal canvas disappears after reload; billing deep-link policy state is uninitialized; paid receipt row is fabricated; frontend has no refresh-token recovery despite backend support. Some admin views use catch/allSettled fallbacks that can hide dependency failure as empty/zero data; not every fallback is necessarily wrong, so individual unavailable-state tests remain pending. SSE tests verify supported framing/idempotency/error handling, but broad network-interruption/browser compatibility is not fully executed.

| ID/app | Method / frontend path | Callsite | Mapped backend | Status | Consumer count |
| --- | --- | --- | --- | --- | --- |
| FE-API-001/admin | GET {API_BASE_URL}{endpoint} | admin/src/api/adminApiClient.ts:20 | None PARAM | dynamic_transport_wrapper | 1 |
| FE-API-002/admin | GET {API_BASE_URL}{endpoint} | admin/src/api/adminApiClient.ts:39 | None PARAM | dynamic_transport_wrapper | 1 |
| FE-API-003/admin | GET {API_BASE_URL}{endpoint} | admin/src/api/adminApiClient.ts:68 | None PARAM | dynamic_transport_wrapper | 0 |
| FE-API-004/admin | GET /admin/ai | admin/src/api/adminApiClient.ts:91 | admin-api /api/v1/admin/ai | source_route_match | 1 |
| FE-API-005/admin | POST /admin/ai/providers | admin/src/api/adminApiClient.ts:92 | admin-api /api/v1/admin/ai/providers | source_route_match | 2 |
| FE-API-006/admin | POST /admin/ai/models | admin/src/api/adminApiClient.ts:93 | admin-api /api/v1/admin/ai/models | source_route_match | 2 |
| FE-API-007/admin | DELETE /admin/ai/{resource}/{encodeURIComponent(id)}?expected_version={version} | admin/src/api/adminApiClient.ts:94 | admin-api /api/v1/admin/ai/PARAM/PARAM | source_route_match | 2 |
| FE-API-008/admin | PUT /admin/ai/assignments | admin/src/api/adminApiClient.ts:95 | admin-api /api/v1/admin/ai/assignments | source_route_match | 1 |
| FE-API-009/admin | PUT /admin/ai/routing | admin/src/api/adminApiClient.ts:96 | admin-api /api/v1/admin/ai/routing | source_route_match | 1 |
| FE-API-010/admin | PUT /admin/ai/providers/{encodeURIComponent(id)}/credential | admin/src/api/adminApiClient.ts:97 | admin-api /api/v1/admin/ai/providers/PARAM/credential | source_route_match | 1 |
| FE-API-011/admin | DELETE /admin/ai/providers/{encodeURIComponent(id)}/credential | admin/src/api/adminApiClient.ts:98 | admin-api /api/v1/admin/ai/providers/PARAM/credential | source_route_match | 1 |
| FE-API-012/admin | POST /admin/ai/models/{encodeURIComponent(id)}/test | admin/src/api/adminApiClient.ts:99 | admin-api /api/v1/admin/ai/models/PARAM/test | source_route_match | 3 |
| FE-API-013/admin | GET /admin/ai/usage | admin/src/api/adminApiClient.ts:100 | admin-api /api/v1/admin/ai/usage | source_route_match | 1 |
| FE-API-014/admin | GET /admin/ai/history | admin/src/api/adminApiClient.ts:101 | admin-api /api/v1/admin/ai/history | source_route_match | 1 |
| FE-API-015/admin | POST /admin/ai/rollback | admin/src/api/adminApiClient.ts:102 | admin-api /api/v1/admin/ai/rollback | source_route_match | 1 |
| FE-API-016/admin | GET /admin/ai/audit?page={page} | admin/src/api/adminApiClient.ts:103 | admin-api /api/v1/admin/ai/audit | source_route_match | 1 |
| FE-API-017/admin | POST /admin/auth/login | admin/src/api/adminApiClient.ts:107 | admin-api /api/v1/admin/auth/login | source_route_match | 0 |
| FE-API-018/admin | POST /admin/auth/verify-login-code | admin/src/api/adminApiClient.ts:109 | admin-api /api/v1/admin/auth/verify-login-code | source_route_match | 0 |
| FE-API-019/admin | POST /admin/auth/forgot-password | admin/src/api/adminApiClient.ts:111 | admin-api /api/v1/admin/auth/forgot-password | source_route_match | 0 |
| FE-API-020/admin | POST /admin/auth/reset-password | admin/src/api/adminApiClient.ts:113 | admin-api /api/v1/admin/auth/reset-password | source_route_match | 0 |
| FE-API-021/admin | POST /admin/auth/change-password | admin/src/api/adminApiClient.ts:115 | admin-api /api/v1/admin/auth/change-password | source_route_match | 0 |
| FE-API-022/admin | POST /admin/auth/totp/setup | admin/src/api/adminApiClient.ts:117 | admin-api /api/v1/admin/auth/totp/setup | source_route_match | 1 |
| FE-API-023/admin | POST /admin/auth/totp/verify | admin/src/api/adminApiClient.ts:119 | admin-api /api/v1/admin/auth/totp/verify | source_route_match | 1 |
| FE-API-024/admin | POST /admin/auth/totp/disable | admin/src/api/adminApiClient.ts:121 | admin-api /api/v1/admin/auth/totp/disable | source_route_match | 1 |
| FE-API-025/admin | POST /admin/auth/request-action-code | admin/src/api/adminApiClient.ts:123 | admin-api /api/v1/admin/auth/request-action-code | source_route_match | 1 |
| FE-API-026/admin | GET /admin/auth/me | admin/src/api/adminApiClient.ts:125 | admin-api /api/v1/admin/auth/me | source_route_match | 1 |
| FE-API-027/admin | PATCH /admin/auth/me | admin/src/api/adminApiClient.ts:127 | admin-api /api/v1/admin/auth/me | source_route_match | 0 |
| FE-API-028/admin | GET /users/{query ? `?${query}` : ''} | admin/src/api/adminApiClient.ts:139 | admin-api /api/v1/users | source_route_match | 1 |
| FE-API-029/admin | GET /users/{userId} | admin/src/api/adminApiClient.ts:141 | admin-api /api/v1/users/PARAM | source_route_match | 5 |
| FE-API-030/admin | PATCH /users/{userId}/status | admin/src/api/adminApiClient.ts:143 | admin-api /api/v1/users/PARAM/status | source_route_match | 2 |
| FE-API-031/admin | PATCH /users/{userId}/plan | admin/src/api/adminApiClient.ts:145 | admin-api /api/v1/users/PARAM/plan | source_route_match | 0 |
| FE-API-032/admin | PATCH /users/{userId}/quota | admin/src/api/adminApiClient.ts:147 | admin-api /api/v1/users/PARAM/quota | source_route_match | 0 |
| FE-API-033/admin | POST /users/{userId}/override | admin/src/api/adminApiClient.ts:149 | admin-api /api/v1/users/PARAM/override | source_route_match | 2 |
| FE-API-034/admin | GET /admin/roles | admin/src/api/adminApiClient.ts:152 | admin-api /api/v1/admin/roles | source_route_match | 1 |
| FE-API-035/admin | POST /admin/roles | admin/src/api/adminApiClient.ts:154 | admin-api /api/v1/admin/roles | source_route_match | 1 |
| FE-API-036/admin | PATCH /admin/roles/{roleId} | admin/src/api/adminApiClient.ts:156 | admin-api /api/v1/admin/roles/PARAM | source_route_match | 0 |
| FE-API-037/admin | DELETE /admin/roles/{roleId} | admin/src/api/adminApiClient.ts:158 | admin-api /api/v1/admin/roles/PARAM | source_route_match | 1 |
| FE-API-038/admin | GET /admin/permissions | admin/src/api/adminApiClient.ts:159 | admin-api /api/v1/admin/permissions | source_route_match | 0 |
| FE-API-039/admin | GET /admin/staff | admin/src/api/adminApiClient.ts:160 | admin-api /api/v1/admin/staff | source_route_match | 1 |
| FE-API-040/admin | POST /admin/staff/invite | admin/src/api/adminApiClient.ts:162 | admin-api /api/v1/admin/staff/invite | source_route_match | 1 |
| FE-API-041/admin | PATCH /admin/staff/{staffId} | admin/src/api/adminApiClient.ts:164 | admin-api /api/v1/admin/staff/PARAM | source_route_match | 2 |
| FE-API-042/admin | DELETE /admin/staff/{staffId} | admin/src/api/adminApiClient.ts:166 | admin-api /api/v1/admin/staff/PARAM | source_route_match | 1 |
| FE-API-043/admin | GET /admin/audit-logs{query ? `?${query}` : ''} | admin/src/api/adminApiClient.ts:190 | admin-api /api/v1/admin/audit-logs | source_route_match | 2 |
| FE-API-044/admin | GET /admin/audit-logs/all | admin/src/api/adminApiClient.ts:194 | admin-api /api/v1/admin/audit-logs/all | source_route_match | 1 |
| FE-API-045/admin | GET /admin/audit-logs/{logId} | admin/src/api/adminApiClient.ts:195 | admin-api /api/v1/admin/audit-logs/PARAM | source_route_match | 1 |
| FE-API-046/admin | GET /admin/security/alerts{status ? `?status=${status}` : ''} | admin/src/api/adminApiClient.ts:198 | admin-api /api/v1/admin/security/alerts | source_route_match | 1 |
| FE-API-047/admin | PATCH /admin/security/alerts/{alertId}/resolve | admin/src/api/adminApiClient.ts:199 | admin-api /api/v1/admin/security/alerts/PARAM/resolve | source_route_match | 1 |
| FE-API-048/admin | GET /admin/security/sessions | admin/src/api/adminApiClient.ts:200 | admin-api /api/v1/admin/security/sessions | source_route_match | 1 |
| FE-API-049/admin | DELETE /admin/security/sessions/{sessionId} | admin/src/api/adminApiClient.ts:201 | admin-api /api/v1/admin/security/sessions/PARAM | source_route_match | 1 |
| FE-API-050/admin | GET /admin/security/ip-logs{limit ? `?limit=${limit}` : ''} | admin/src/api/adminApiClient.ts:202 | admin-api /api/v1/admin/security/ip-logs | source_route_match | 1 |
| FE-API-051/admin | GET /admin/security/rate-limits{limit ? `?limit=${limit}` : ''} | admin/src/api/adminApiClient.ts:203 | admin-api /api/v1/admin/security/rate-limits | source_route_match | 1 |
| FE-API-052/admin | GET /admin/security/bot-logs | admin/src/api/adminApiClient.ts:204 | admin-api /api/v1/admin/security/bot-logs | source_route_match | 1 |
| FE-API-053/admin | GET /admin/security/abuse-reports{status ? `?status=${status}` : ''} | admin/src/api/adminApiClient.ts:205 | admin-api /api/v1/admin/security/abuse-reports | source_route_match | 1 |
| FE-API-054/admin | PATCH /admin/security/abuse-reports/{reportId}/resolve | admin/src/api/adminApiClient.ts:206 | admin-api /api/v1/admin/security/abuse-reports/PARAM/resolve | source_route_match | 1 |
| FE-API-055/admin | GET /admin/security/api-keys | admin/src/api/adminApiClient.ts:207 | admin-api /api/v1/admin/security/api-keys | source_route_match | 2 |
| FE-API-056/admin | GET /admin/plans | admin/src/api/adminApiClient.ts:210 | admin-api /api/v1/admin/plans | source_route_match | 2 |
| FE-API-057/admin | POST /admin/plans | admin/src/api/adminApiClient.ts:212 | admin-api /api/v1/admin/plans | source_route_match | 1 |
| FE-API-058/admin | PATCH /admin/plans/{planId} | admin/src/api/adminApiClient.ts:214 | admin-api /api/v1/admin/plans/PARAM | source_route_match | 3 |
| FE-API-059/admin | POST /admin/plans/{planId}/archive | admin/src/api/adminApiClient.ts:216 | admin-api /api/v1/admin/plans/PARAM/archive | source_route_match | 0 |
| FE-API-060/admin | POST /admin/users/{userId}/quota-override | admin/src/api/adminApiClient.ts:218 | admin-api /api/v1/admin/users/PARAM/quota-override | source_route_match | 1 |
| FE-API-061/admin | DELETE /admin/users/{userId}/quota-override | admin/src/api/adminApiClient.ts:220 | admin-api /api/v1/admin/users/PARAM/quota-override | source_route_match | 1 |
| FE-API-062/admin | GET /admin/coupons | admin/src/api/adminApiClient.ts:221 | admin-api /api/v1/admin/coupons | source_route_match | 1 |
| FE-API-063/admin | POST /admin/coupons | admin/src/api/adminApiClient.ts:223 | admin-api /api/v1/admin/coupons | source_route_match | 1 |
| FE-API-064/admin | POST /admin/coupons/{couponId}/archive | admin/src/api/adminApiClient.ts:225 | admin-api /api/v1/admin/coupons/PARAM/archive | source_route_match | 1 |
| FE-API-065/admin | GET /admin/trials | admin/src/api/adminApiClient.ts:227 | admin-api /api/v1/admin/trials | source_route_match | 1 |
| FE-API-066/admin | POST /admin/trials | admin/src/api/adminApiClient.ts:229 | admin-api /api/v1/admin/trials | source_route_match | 1 |
| FE-API-067/admin | PATCH /admin/trials/{trialId}/extend | admin/src/api/adminApiClient.ts:231 | admin-api /api/v1/admin/trials/PARAM/extend | source_route_match | 1 |
| FE-API-068/admin | POST /admin/trials/{trialId}/end | admin/src/api/adminApiClient.ts:233 | admin-api /api/v1/admin/trials/PARAM/end | source_route_match | 1 |
| FE-API-069/admin | GET /admin/plans/performance | admin/src/api/adminApiClient.ts:234 | admin-api /api/v1/admin/plans/performance | source_route_match | 1 |
| FE-API-070/admin | GET /admin/promotions/ab-tests | admin/src/api/adminApiClient.ts:236 | admin-api /api/v1/admin/promotions/ab-tests | source_route_match | 1 |
| FE-API-071/admin | GET /admin/promotions/referrals{status ? `?status=${status}` : ''} | admin/src/api/adminApiClient.ts:237 | admin-api /api/v1/admin/promotions/referrals | source_route_match | 1 |
| FE-API-072/admin | POST /admin/promotions/referrals | admin/src/api/adminApiClient.ts:239 | admin-api /api/v1/admin/promotions/referrals | source_route_match | 1 |
| FE-API-073/admin | POST /admin/promotions/referrals/{referralId}/convert | admin/src/api/adminApiClient.ts:241 | admin-api /api/v1/admin/promotions/referrals/PARAM/convert | source_route_match | 1 |
| FE-API-074/admin | GET /admin/subscriptions{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:248 | admin-api /api/v1/admin/subscriptions | source_route_match | 1 |
| FE-API-075/admin | GET /admin/subscriptions/stats | admin/src/api/adminApiClient.ts:251 | admin-api /api/v1/admin/subscriptions/stats | source_route_match | 1 |
| FE-API-076/admin | GET /admin/invoices{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:256 | admin-api /api/v1/admin/invoices | source_route_match | 2 |
| FE-API-077/admin | GET /admin/payment/plans | admin/src/api/adminApiClient.ts:259 | admin-api /api/v1/admin/payment/plans | unresolved_or_missing | 0 |
| FE-API-078/admin | GET /admin/automation/rules | admin/src/api/adminApiClient.ts:262 | admin-api /api/v1/admin/automation/rules | source_route_match | 1 |
| FE-API-079/admin | POST /admin/automation/rules | admin/src/api/adminApiClient.ts:264 | admin-api /api/v1/admin/automation/rules | source_route_match | 1 |
| FE-API-080/admin | PATCH /admin/automation/rules/{ruleId} | admin/src/api/adminApiClient.ts:266 | admin-api /api/v1/admin/automation/rules/PARAM | source_route_match | 2 |
| FE-API-081/admin | DELETE /admin/automation/rules/{ruleId} | admin/src/api/adminApiClient.ts:268 | admin-api /api/v1/admin/automation/rules/PARAM | source_route_match | 1 |
| FE-API-082/admin | POST /admin/automation/rules/{ruleId}/dry-run | admin/src/api/adminApiClient.ts:270 | admin-api /api/v1/admin/automation/rules/PARAM/dry-run | source_route_match | 1 |
| FE-API-083/admin | POST /admin/automation/dry-run | admin/src/api/adminApiClient.ts:272 | admin-api /api/v1/admin/automation/dry-run | source_route_match | 1 |
| FE-API-084/admin | POST /admin/automation/events/emit | admin/src/api/adminApiClient.ts:274 | admin-api /api/v1/admin/automation/events/emit | source_route_match | 1 |
| FE-API-085/admin | GET /admin/automation/execution-logs | admin/src/api/adminApiClient.ts:276 | admin-api /api/v1/admin/automation/execution-logs | source_route_match | 2 |
| FE-API-086/admin | GET /admin/notifications/email-logs{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:283 | admin-api /api/v1/admin/notifications/email-logs | source_route_match | 2 |
| FE-API-087/admin | GET /admin/notifications/failed | admin/src/api/adminApiClient.ts:285 | admin-api /api/v1/admin/notifications/failed | source_route_match | 1 |
| FE-API-088/admin | GET /admin/notifications/history | admin/src/api/adminApiClient.ts:286 | admin-api /api/v1/admin/notifications/history | source_route_match | 0 |
| FE-API-089/admin | GET /admin/notifications/status | admin/src/api/adminApiClient.ts:287 | admin-api /api/v1/admin/notifications/status | source_route_match | 1 |
| FE-API-090/admin | GET /admin/notifications/announcements | admin/src/api/adminApiClient.ts:288 | admin-api /api/v1/admin/notifications/announcements | source_route_match | 2 |
| FE-API-091/admin | POST /admin/notifications/announcements | admin/src/api/adminApiClient.ts:290 | admin-api /api/v1/admin/notifications/announcements | source_route_match | 3 |
| FE-API-092/admin | PATCH /admin/notifications/announcements/{announcementId} | admin/src/api/adminApiClient.ts:292 | admin-api /api/v1/admin/notifications/announcements/PARAM | source_route_match | 1 |
| FE-API-093/admin | DELETE /admin/notifications/announcements/{announcementId} | admin/src/api/adminApiClient.ts:294 | admin-api /api/v1/admin/notifications/announcements/PARAM | source_route_match | 2 |
| FE-API-094/admin | GET /admin/notifications/templates | admin/src/api/adminApiClient.ts:295 | admin-api /api/v1/admin/notifications/templates | source_route_match | 1 |
| FE-API-095/admin | POST /admin/notifications/templates | admin/src/api/adminApiClient.ts:297 | admin-api /api/v1/admin/notifications/templates | source_route_match | 1 |
| FE-API-096/admin | PUT /admin/notifications/templates/{templateId} | admin/src/api/adminApiClient.ts:299 | admin-api /api/v1/admin/notifications/templates/PARAM | source_route_match | 1 |
| FE-API-097/admin | DELETE /admin/notifications/templates/{templateId} | admin/src/api/adminApiClient.ts:301 | admin-api /api/v1/admin/notifications/templates/PARAM | source_route_match | 1 |
| FE-API-098/admin | GET /admin/notifications/settings | admin/src/api/adminApiClient.ts:302 | admin-api /api/v1/admin/notifications/settings | source_route_match | 1 |
| FE-API-099/admin | PUT /admin/notifications/settings | admin/src/api/adminApiClient.ts:304 | admin-api /api/v1/admin/notifications/settings | source_route_match | 1 |
| FE-API-100/admin | GET /admin/infrastructure/health | admin/src/api/adminApiClient.ts:307 | admin-api /api/v1/admin/infrastructure/health | source_route_match | 1 |
| FE-API-101/admin | GET /admin/infrastructure/mcp/sessions | admin/src/api/adminApiClient.ts:308 | admin-api /api/v1/admin/infrastructure/mcp/sessions | source_route_match | 1 |
| FE-API-102/admin | GET /admin/infrastructure/mcp/templates | admin/src/api/adminApiClient.ts:309 | admin-api /api/v1/admin/infrastructure/mcp/templates | source_route_match | 1 |
| FE-API-103/admin | GET /users/{encodeURIComponent(id)}/entitlements | admin/src/api/adminApiClient.ts:312 | admin-api /api/v1/users/PARAM/entitlements | source_route_match | 2 |
| FE-API-104/admin | PUT /users/{encodeURIComponent(id)}/entitlements | admin/src/api/adminApiClient.ts:313 | admin-api /api/v1/users/PARAM/entitlements | source_route_match | 1 |
| FE-API-105/admin | DELETE /users/{encodeURIComponent(id)}/entitlements | admin/src/api/adminApiClient.ts:314 | admin-api /api/v1/users/PARAM/entitlements | source_route_match | 1 |
| FE-API-106/admin | POST /admin/templates/uploads | admin/src/api/adminApiClient.ts:315 | admin-api /api/v1/admin/templates/uploads | source_route_match | 1 |
| FE-API-107/admin | POST /admin/templates/uploads/{encodeURIComponent(id)}/approve | admin/src/api/adminApiClient.ts:316 | admin-api /api/v1/admin/templates/uploads/PARAM/approve | source_route_match | 0 |
| FE-API-108/admin | GET /admin/templates/uploads/{encodeURIComponent(id)} | admin/src/api/adminApiClient.ts:317 | admin-api /api/v1/admin/templates/uploads/PARAM | source_route_match | 1 |
| FE-API-109/admin | PATCH /admin/templates/uploads/{encodeURIComponent(id)} | admin/src/api/adminApiClient.ts:318 | admin-api /api/v1/admin/templates/uploads/PARAM | source_route_match | 1 |
| FE-API-110/admin | POST /admin/templates/uploads/{encodeURIComponent(id)}/review | admin/src/api/adminApiClient.ts:319 | admin-api /api/v1/admin/templates/uploads/PARAM/review | source_route_match | 1 |
| FE-API-111/admin | GET /admin/templates | admin/src/api/adminApiClient.ts:320 | admin-api /api/v1/admin/templates | source_route_match | 1 |
| FE-API-112/admin | POST /admin/templates | admin/src/api/adminApiClient.ts:321 | admin-api /api/v1/admin/templates | unresolved_or_missing | 0 |
| FE-API-113/admin | POST /admin/templates/{templateId}/publish | admin/src/api/adminApiClient.ts:322 | admin-api /api/v1/admin/templates/PARAM/publish | source_route_match | 1 |
| FE-API-114/admin | POST /admin/templates/{templateId}/withdraw | admin/src/api/adminApiClient.ts:323 | admin-api /api/v1/admin/templates/PARAM/withdraw | source_route_match | 1 |
| FE-API-115/admin | GET /admin/analytics/overview | admin/src/api/adminApiClient.ts:326 | admin-api /api/v1/admin/analytics/overview | source_route_match | 1 |
| FE-API-116/admin | GET /admin/analytics/revenue | admin/src/api/adminApiClient.ts:327 | admin-api /api/v1/admin/analytics/revenue | source_route_match | 2 |
| FE-API-117/admin | GET /admin/analytics/generations | admin/src/api/adminApiClient.ts:328 | admin-api /api/v1/admin/analytics/generations | source_route_match | 0 |
| FE-API-118/admin | GET /admin/analytics/generations/detailed | admin/src/api/adminApiClient.ts:329 | admin-api /api/v1/admin/analytics/generations/detailed | source_route_match | 2 |
| FE-API-119/admin | GET /admin/analytics/users | admin/src/api/adminApiClient.ts:330 | admin-api /api/v1/admin/analytics/users | source_route_match | 0 |
| FE-API-120/admin | GET /admin/analytics/traffic{qs ? `?${qs}` : ''} | admin/src/api/adminApiClient.ts:336 | admin-api /api/v1/admin/analytics/traffic | source_route_match | 2 |
| FE-API-121/admin | GET /admin/analytics/journey | admin/src/api/adminApiClient.ts:338 | admin-api /api/v1/admin/analytics/journey | source_route_match | 1 |
| FE-API-122/admin | GET /admin/analytics/button-clicks{days ? `?days=${days}` : ''} | admin/src/api/adminApiClient.ts:340 | admin-api /api/v1/admin/analytics/button-clicks | source_route_match | 1 |
| FE-API-123/admin | GET /admin/analytics/page-duration{days ? `?days=${days}` : ''} | admin/src/api/adminApiClient.ts:342 | admin-api /api/v1/admin/analytics/page-duration | source_route_match | 1 |
| FE-API-124/admin | GET /admin/analytics/posthog/config | admin/src/api/adminApiClient.ts:343 | admin-api /api/v1/admin/analytics/posthog/config | source_route_match | 1 |
| FE-API-125/admin | POST /admin/analytics/events | admin/src/api/adminApiClient.ts:345 | admin-api /api/v1/admin/analytics/events | source_route_match | 1 |
| FE-API-126/admin | GET /internal/config/{domain} | admin/src/api/adminApiClient.ts:349 | admin-api /api/v1/internal/config/PARAM | source_route_match | 0 |
| FE-API-127/admin | GET /internal/config | admin/src/api/adminApiClient.ts:351 | admin-api /api/v1/internal/config | source_route_match | 0 |
| FE-API-128/admin | GET /admin/config/{domain} | admin/src/api/adminApiClient.ts:353 | admin-api /api/v1/admin/config/PARAM | source_route_match | 4 |
| FE-API-129/admin | PUT /admin/config/{domain} | admin/src/api/adminApiClient.ts:355 | admin-api /api/v1/admin/config/PARAM | source_route_match | 4 |
| FE-API-130/admin | GET /admin/config/{domain}/history | admin/src/api/adminApiClient.ts:357 | admin-api /api/v1/admin/config/PARAM/history | source_route_match | 2 |
| FE-API-131/admin | GET /admin/gdpr/export?email={encodeURIComponent(email)} | admin/src/api/adminApiClient.ts:361 | admin-api /api/v1/admin/gdpr/export | source_route_match | 1 |
| FE-API-132/admin | POST /admin/gdpr/purge | admin/src/api/adminApiClient.ts:363 | admin-api /api/v1/admin/gdpr/purge | source_route_match | 1 |
| FE-API-133/admin | GET /admin/reports/users-csv | admin/src/api/adminApiClient.ts:367 | admin-api /api/v1/admin/reports/users-csv | source_route_match | 1 |
| FE-API-134/admin | GET /admin/support/sessions/{encodeURIComponent(sessionId)} | admin/src/api/adminApiClient.ts:371 | admin-api /api/v1/admin/support/sessions/PARAM | source_route_match | 1 |
| FE-API-135/admin | GET /admin/support/tickets{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:374 | admin-api /api/v1/admin/support/tickets | source_route_match | 1 |
| FE-API-136/admin | PATCH /admin/support/tickets/{ticketId} | admin/src/api/adminApiClient.ts:377 | admin-api /api/v1/admin/support/tickets/PARAM | source_route_match | 0 |
| FE-API-137/admin | POST /admin/support/tickets/{ticketId}/resolve | admin/src/api/adminApiClient.ts:379 | admin-api /api/v1/admin/support/tickets/PARAM/resolve | source_route_match | 1 |
| FE-API-138/admin | GET /admin/support/refunds{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:383 | admin-api /api/v1/admin/support/refunds | source_route_match | 1 |
| FE-API-139/admin | PATCH /admin/support/refunds/{refundId} | admin/src/api/adminApiClient.ts:386 | admin-api /api/v1/admin/support/refunds/PARAM | source_route_match | 1 |
| FE-API-140/admin | GET /admin/support/contact{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:390 | admin-api /api/v1/admin/support/contact | source_route_match | 1 |
| FE-API-141/admin | PATCH /admin/support/contact/{contactId} | admin/src/api/adminApiClient.ts:393 | admin-api /api/v1/admin/support/contact/PARAM | source_route_match | 1 |
| FE-API-142/admin | GET /admin/support/plan-overrides{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:397 | admin-api /api/v1/admin/support/plan-overrides | source_route_match | 1 |
| FE-API-143/admin | PATCH /admin/support/plan-overrides/{overrideId} | admin/src/api/adminApiClient.ts:400 | admin-api /api/v1/admin/support/plan-overrides/PARAM | source_route_match | 1 |
| FE-API-144/admin | POST /admin/support/plan-overrides/{overrideId}/approve | admin/src/api/adminApiClient.ts:402 | admin-api /api/v1/admin/support/plan-overrides/PARAM/approve | source_route_match | 1 |
| FE-API-145/admin | GET /admin/cost-ledger{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:407 | admin-api /api/v1/admin/cost-ledger | source_route_match | 1 |
| FE-API-146/admin | POST /admin/cost-ledger | admin/src/api/adminApiClient.ts:410 | admin-api /api/v1/admin/cost-ledger | source_route_match | 1 |
| FE-API-147/admin | DELETE /admin/cost-ledger/{entryId} | admin/src/api/adminApiClient.ts:412 | admin-api /api/v1/admin/cost-ledger/PARAM | source_route_match | 1 |
| FE-API-148/admin | GET /admin/cost-ledger/summary | admin/src/api/adminApiClient.ts:414 | admin-api /api/v1/admin/cost-ledger/summary | source_route_match | 1 |
| FE-API-149/admin | GET /admin/revenue | admin/src/api/adminApiClient.ts:418 | admin-api /api/v1/admin/revenue | source_route_match | 2 |
| FE-API-150/admin | GET /admin/failed-payments{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:429 | admin-api /api/v1/admin/failed-payments | source_route_match | 0 |
| FE-API-151/admin | GET /admin/refunds{q ? `?${q}` : ''} | admin/src/api/adminApiClient.ts:433 | admin-api /api/v1/admin/refunds | source_route_match | 0 |
| FE-API-152/admin | POST {API_BASE_URL}/admin/auth/verify-login-code | admin/src/store/adminAuthStore.ts:53 | admin-api /api/v1/admin/auth/verify-login-code | source_route_match | 2 |
| FE-API-153/admin | POST {API_BASE_URL}/admin/auth/login | admin/src/store/adminAuthStore.ts:83 | admin-api /api/v1/admin/auth/login | source_route_match | 2 |
| FE-API-154/admin | POST {API_BASE_URL}/admin/auth/forgot-password | admin/src/store/adminAuthStore.ts:139 | admin-api /api/v1/admin/auth/forgot-password | source_route_match | 1 |
| FE-API-155/admin | POST {API_BASE_URL}/admin/auth/reset-password | admin/src/store/adminAuthStore.ts:163 | admin-api /api/v1/admin/auth/reset-password | source_route_match | 1 |
| FE-API-156/admin | POST {API_BASE_URL}/admin/auth/change-password | admin/src/store/adminAuthStore.ts:181 | admin-api /api/v1/admin/auth/change-password | source_route_match | 1 |
| FE-API-157/admin | PATCH {API_BASE_URL}/admin/auth/me | admin/src/store/adminAuthStore.ts:202 | admin-api /api/v1/admin/auth/me | source_route_match | 1 |
| FE-API-158/admin | POST {API_BASE_URL}/admin/auth/logout | admin/src/store/adminAuthStore.ts:250 | admin-api /api/v1/admin/auth/logout | source_route_match | 2 |
| FE-API-159/user | POST /chat/api/chat/session | user-frontend/src/api/ai.ts:14 | chat /api/chat/session | source_route_match | 1 |
| FE-API-160/user | POST {base}/chat/api/chat/session/{id}/message | user-frontend/src/api/ai.ts:28 | chat /api/chat/session/PARAM/message | source_route_match | 1 |
| FE-API-161/user | GET /chat/api/chat/session/{id}/messages | user-frontend/src/api/ai.ts:43 | chat /api/chat/session/PARAM/messages | source_route_match | 4 |
| FE-API-162/user | POST /chat/api/chat/session/{id}/confirm | user-frontend/src/api/ai.ts:44 | chat /api/chat/session/PARAM/confirm | source_route_match | 1 |
| FE-API-163/user | POST /chat/api/chat/session/{id}/assets | user-frontend/src/api/ai.ts:47 | chat /api/chat/session/PARAM/assets | source_route_match | 1 |
| FE-API-164/user | DELETE /chat/api/chat/session/{id}/assets | user-frontend/src/api/ai.ts:52 | chat /api/chat/session/PARAM/assets | source_route_match | 1 |
| FE-API-165/user | POST /chat/api/chat/session/{id}/resolve | user-frontend/src/api/ai.ts:61 | chat /api/chat/session/PARAM/resolve | source_route_match | 1 |
| FE-API-166/user | GET /chat/api/chat/sessions | user-frontend/src/api/ai.ts:66 | chat /api/chat/sessions | source_route_match | 1 |
| FE-API-167/user | GET {base}{endpoint} | user-frontend/src/api/ai.ts:76 | None PARAM | dynamic_transport_wrapper | 0 |
| FE-API-168/user | PATCH /chat/api/chat/session/{id} | user-frontend/src/api/ai.ts:78 | chat /api/chat/session/PARAM | source_route_match | 0 |
| FE-API-169/user | PATCH /chat/api/chat/session/{id} | user-frontend/src/api/ai.ts:79 | chat /api/chat/session/PARAM | source_route_match | 0 |
| FE-API-170/user | PATCH /chat/api/chat/session/{id} | user-frontend/src/api/ai.ts:80 | chat /api/chat/session/PARAM | source_route_match | 1 |
| FE-API-171/user | POST /analytics/client-event | user-frontend/src/api/analytics.ts:16 | analytics /v1/analytics/client-event | source_route_match | 4 |
| FE-API-172/user | POST /auth/register | user-frontend/src/api/auth.ts:14 | auth /v1/auth/register | source_route_match | 2 |
| FE-API-173/user | POST /auth/login | user-frontend/src/api/auth.ts:19 | auth /v1/auth/login | source_route_match | 2 |
| FE-API-174/user | POST /auth/login/google | user-frontend/src/api/auth.ts:23 | auth /v1/auth/login/google | source_route_match | 1 |
| FE-API-175/user | POST /auth/logout | user-frontend/src/api/auth.ts:28 | auth /v1/auth/logout | source_route_match | 1 |
| FE-API-176/user | POST /auth/password/forgot | user-frontend/src/api/auth.ts:33 | auth /v1/auth/password/forgot | source_route_match | 1 |
| FE-API-177/user | POST /auth/password/reset | user-frontend/src/api/auth.ts:38 | auth /v1/auth/password/reset | source_route_match | 1 |
| FE-API-178/user | POST /auth/guest | user-frontend/src/api/auth.ts:43 | auth /v1/auth/guest | source_route_match | 2 |
| FE-API-179/user | GET /auth/me | user-frontend/src/api/auth.ts:55 | auth /v1/auth/me | source_route_match | 2 |
| FE-API-180/user | POST /auth/verify-email | user-frontend/src/api/auth.ts:73 | auth /v1/auth/verify-email | source_route_match | 1 |
| FE-API-181/user | POST /auth/verify-email/resend | user-frontend/src/api/auth.ts:78 | auth /v1/auth/verify-email/resend | source_route_match | 3 |
| FE-API-182/user | POST /auth/2fa/enable | user-frontend/src/api/auth.ts:83 | auth /v1/auth/2fa/enable | source_route_match | 1 |
| FE-API-183/user | POST /auth/2fa/verify | user-frontend/src/api/auth.ts:88 | auth /v1/auth/2fa/verify | source_route_match | 1 |
| FE-API-184/user | POST /auth/2fa/disable | user-frontend/src/api/auth.ts:93 | auth /v1/auth/2fa/disable | source_route_match | 1 |
| FE-API-185/user | POST /auth/login/2fa | user-frontend/src/api/auth.ts:98 | auth /v1/auth/login/2fa | source_route_match | 2 |
| FE-API-186/user | GET /quota/me | user-frontend/src/api/billing.ts:13 | quota /v1/quota/me | source_route_match | 1 |
| FE-API-187/user | GET {url} | user-frontend/src/api/client.ts:156 | None PARAM | dynamic_transport_wrapper | 9 |
| FE-API-188/user | GET {endpoint} | user-frontend/src/api/client.ts:202 | None PARAM | dynamic_transport_wrapper | 77 |
| FE-API-189/user | POST {endpoint} | user-frontend/src/api/client.ts:207 | None PARAM | dynamic_transport_wrapper | 9 |
| FE-API-190/user | PATCH {endpoint} | user-frontend/src/api/client.ts:212 | None PARAM | dynamic_transport_wrapper | 4 |
| FE-API-191/user | POST /documents/generate | user-frontend/src/api/documents.ts:23 | document /v1/document/generate | source_route_match | 1 |
| FE-API-192/user | PATCH /documents/{documentId}/layout | user-frontend/src/api/documents.ts:30 | document /v1/document/PARAM/layout | unresolved_or_missing | 0 |
| FE-API-193/user | PATCH /documents/{documentId}/content | user-frontend/src/api/documents.ts:35 | document /v1/document/PARAM/content | unresolved_or_missing | 0 |
| FE-API-194/user | GET /document/templates?type={documentType} | user-frontend/src/api/documents.ts:40 | document /v1/document/templates | source_route_match | 0 |
| FE-API-195/user | GET /templates?document_type={documentType} | user-frontend/src/api/documents.ts:41 | document /v1/document/templates | source_route_match | 0 |
| FE-API-196/user | GET /document/templates?type={encodeURIComponent(documentType)} | user-frontend/src/api/documents.ts:46 | document /v1/document/templates | source_route_match | 1 |
| FE-API-197/user | GET /chat/sessions | user-frontend/src/api/documents.ts:55 | chat /api/chat/sessions | source_route_match | 1 |
| FE-API-198/user | GET /chat/session/{sessionId}/messages | user-frontend/src/api/documents.ts:60 | chat /api/chat/session/PARAM/messages | source_route_match | 0 |
| FE-API-199/user | POST /document/templates/custom | user-frontend/src/api/documents.ts:86 | document /v1/document/templates/custom | source_route_match | 1 |
| FE-API-200/user | GET /document/templates/custom?type={documentType} | user-frontend/src/api/documents.ts:91 | document /v1/document/templates/custom | source_route_match | 1 |
| FE-API-201/user | GET /document/templates/custom/{id} | user-frontend/src/api/documents.ts:96 | document /v1/document/templates/custom/PARAM | source_route_match | 1 |
| FE-API-202/user | DELETE /document/templates/custom/{id} | user-frontend/src/api/documents.ts:101 | document /v1/document/templates/custom/PARAM | source_route_match | 1 |
| FE-API-203/user | PATCH /document/templates/custom/{encodeURIComponent(id)} | user-frontend/src/api/documents.ts:105 | document /v1/document/templates/custom/PARAM | source_route_match | 0 |
| FE-API-204/user | PATCH /document/templates/uploads/{encodeURIComponent(id)} | user-frontend/src/api/documents.ts:109 | document /v1/document/templates/uploads/PARAM | source_route_match | 0 |
| FE-API-205/user | GET /document/{encodeURIComponent(documentId)}/download | user-frontend/src/api/documents.ts:114 | document /v1/document/PARAM/download | source_route_match | 1 |
| FE-API-206/user | GET /documents/{encodeURIComponent(id)} | user-frontend/src/api/documents.ts:117 | document /v1/document/PARAM | source_route_match | 1 |
| FE-API-207/user | POST /document/template-preview | user-frontend/src/api/documents.ts:120 | document /v1/document/template-preview | source_route_match | 3 |
| FE-API-208/user | POST /document/templates/uploads | user-frontend/src/api/documents.ts:123 | document /v1/document/templates/uploads | source_route_match | 1 |
| FE-API-209/user | GET /payment/plans | user-frontend/src/api/payment.ts:25 | payment /v1/payment/plans | source_route_match | 1 |
| FE-API-210/user | GET /payment/methods | user-frontend/src/api/payment.ts:32 | payment /v1/payment/methods | source_route_match | 1 |
| FE-API-211/user | POST /payment/methods | user-frontend/src/api/payment.ts:35 | payment /v1/payment/methods | source_route_match | 1 |
| FE-API-212/user | DELETE /payment/methods/{encodeURIComponent(id)} | user-frontend/src/api/payment.ts:38 | payment /v1/payment/methods/PARAM | source_route_match | 1 |
| FE-API-213/user | POST /payment/methods/{encodeURIComponent(id)}/default | user-frontend/src/api/payment.ts:41 | payment /v1/payment/methods/PARAM/default | source_route_match | 1 |
| FE-API-214/user | GET /payment/subscription | user-frontend/src/api/payment.ts:44 | payment /v1/payment/subscription | source_route_match | 3 |
| FE-API-215/user | POST /payment/subscribe | user-frontend/src/api/payment.ts:47 | payment /v1/payment/subscribe | source_route_match | 2 |
| FE-API-216/user | POST /payment/cancel | user-frontend/src/api/payment.ts:50 | payment /v1/payment/cancel | source_route_match | 1 |
| FE-API-217/user | POST /payment/portal | user-frontend/src/api/payment.ts:53 | payment /v1/payment/portal | source_route_match | 2 |
| FE-API-218/user | POST /support/tickets | user-frontend/src/api/support.ts:43 | admin-api /api/v1/support/tickets | source_route_match | 1 |
| FE-API-219/user | POST /support/refunds | user-frontend/src/api/support.ts:48 | admin-api /api/v1/support/refunds | source_route_match | 1 |
| FE-API-220/user | POST /support/contact | user-frontend/src/api/support.ts:53 | admin-api /api/v1/support/contact | source_route_match | 1 |
| FE-API-221/user | POST /support/plan-override-requests | user-frontend/src/api/support.ts:58 | admin-api /api/v1/support/plan-override-requests | source_route_match | 1 |
| FE-API-222/user | GET /auth/me | user-frontend/src/api/users.ts:12 | auth /v1/auth/me | source_route_match | 2 |
| FE-API-223/user | PATCH /auth/me | user-frontend/src/api/users.ts:33 | auth /v1/auth/me | source_route_match | 1 |
| FE-API-224/user | GET /notifications/announcements | user-frontend/src/components/common/Announcements.tsx:15 | notification /notification/announcements | source_route_match | 0 |
| FE-API-225/user | POST /analytics/client-event | user-frontend/src/hooks/usePageDurationTracking.ts:56 | analytics /v1/analytics/client-event | source_route_match | 0 |
| FE-API-226/user | POST /chat/api/chat/guest-migration | user-frontend/src/store/authStore.ts:16 | chat /api/chat/guest-migration | source_route_match | 0 |
| FE-API-227/user | PUT /chat/api/chat/session/{encodeURIComponent(session)}/canvas | user-frontend/src/store/documentStore.ts:64 | chat /api/chat/session/PARAM/canvas | source_route_match | 0 |
| FE-API-228/user | GET /quota/entitlements | user-frontend/src/store/quotaStore.ts:91 | quota /v1/quota/entitlements | source_route_match | 6 |

The8dynamic wrappers are separately visible rather than counted as wired endpoints. Calls matched to routes are not automatically working; business semantics and every error/pagination/polling variant still need the feature-level matrices. Current production assets passed secret-pattern checks and both frontends lint/build; this does not prove all rendered actions work.
