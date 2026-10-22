import type * as Wire from './adminApiTypes';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { useTotpPromptStore } from '../store/totpPromptStore';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://localhost:3018/api/v1';
const MAX_TOTP_ATTEMPTS = 5;

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = useAdminAuthStore.getState().token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  let data = await response.json().catch(() => ({}));

  // Sensitive admin actions (ban a user, override a plan, create/edit a plan,
  // ...) require a fresh TOTP code. Prompt for it via TotpPromptModal and
  // retry the exact same request rather than failing the action outright —
  // a wrong/expired code just re-prompts (the retried request comes back
  // with the same TOTP_REQUIRED error) instead of losing whatever the admin
  // was doing.
  let totpAttempts = 0;
  while (response.status === 403 && data.code === 'TOTP_REQUIRED' && totpAttempts < MAX_TOTP_ATTEMPTS) {
    // Surface the backend's actual reason on a retry (e.g. "2FA isn't set up
    // for this account yet" vs. "wrong code") instead of always showing a
    // generic retry message — the former is actionable guidance the admin
    // needs, the latter would just hide it behind a misleading "wrong code".
    const priorErrorMessage = totpAttempts > 0 ? (data.message || 'Incorrect or expired code. Please try again.') : null;
    totpAttempts += 1;
    const code = await useTotpPromptStore.getState().requestCode(priorErrorMessage);
    headers['X-Admin-2FA'] = code;
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    data = await response.json().catch(() => ({}));
  }

  if (response.status === 401) {
    useAdminAuthStore.getState().logout();
    throw new Error('Your session token has expired or is invalid. Please log in again.');
  }

  if (!response.ok) {
    const detail=typeof data.detail==='string'?data.detail:typeof data.detail?.message==='string'?data.detail.message:Array.isArray(data.detail)?data.detail.map((item:{message?:string;msg?:string})=>item.message||item.msg).filter(Boolean).join('; '):undefined;
    throw new Error(data.message || detail || `API request failed with status ${response.status}`);
  }

  return data as T;
}

/**
 * downloadFile — for endpoints that return a real file body (CSV/JSON export)
 * rather than a JSON envelope. Reads the filename off Content-Disposition so
 * the saved file matches what the backend actually named it, and triggers a
 * real browser save via a temporary <a download> — no fabricated success
 * toast standing in for an actual file.
 */
async function downloadFile(endpoint: string): Promise<void> {
  const token = useAdminAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.detail || `Download failed with status ${response.status}`);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : 'download';

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const adminApiClient = {
  ai: {
    snapshot:()=>apiRequest<import('./aiTypes').AISnapshot>('/admin/ai'),
    provider:(expected_version:number,item:import('./aiTypes').AIProvider)=>apiRequest('/admin/ai/providers',{method:'POST',body:JSON.stringify({expected_version,item})}),
    model:(expected_version:number,item:import('./aiTypes').AIModel)=>apiRequest('/admin/ai/models',{method:'POST',body:JSON.stringify({expected_version,item})}),
    remove:(resource:'providers'|'models',id:string,version:number)=>apiRequest(`/admin/ai/${resource}/${encodeURIComponent(id)}?expected_version=${version}`,{method:'DELETE'}),
    assignments:(expected_version:number,plans:Record<string,import('./aiTypes').AIPlanPolicy>)=>apiRequest('/admin/ai/assignments',{method:'PUT',body:JSON.stringify({expected_version,plans})}),
    routing:(expected_version:number,routing:Partial<import('./aiTypes').AIConfiguration>)=>apiRequest('/admin/ai/routing',{method:'PUT',body:JSON.stringify({expected_version,routing})}),
    credential:(id:string,secret:string)=>apiRequest(`/admin/ai/providers/${encodeURIComponent(id)}/credential`,{method:'PUT',body:JSON.stringify({secret})}),
    revoke:(id:string)=>apiRequest(`/admin/ai/providers/${encodeURIComponent(id)}/credential`,{method:'DELETE'}),
    test:(id:string)=>apiRequest<{healthy:boolean;code:string}>(`/admin/ai/models/${encodeURIComponent(id)}/test`,{method:'POST'}),
    usage:()=>apiRequest<import('./aiTypes').AIUsage>('/admin/ai/usage'),
    history:()=>apiRequest<Array<{version:number;created_at:string;changed_by_admin_id:string}>>('/admin/ai/history'),
    rollback:(expected_version:number,version:number)=>apiRequest('/admin/ai/rollback',{method:'POST',body:JSON.stringify({expected_version,version})}),
    audit:(page:number)=>apiRequest<{items:Array<{id:string;admin_email:string;action:string;details_json:string;created_at:string}>;page:number;total:number}>('/admin/ai/audit?page='+page),
  },
  // --- 1. Admin Auth ---
  login: (email: string, password_hash: string) =>
    apiRequest<Wire.LoginResult>('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password: password_hash }) }),
  verifyLoginCode: (email: string, verification_code: string) =>
    apiRequest<Wire.LoginResult & Partial<Wire.AdminIdentity>>('/admin/auth/verify-login-code', { method: 'POST', body: JSON.stringify({ email, verification_code }) }),
  forgotPassword: (email: string) =>
    apiRequest<Wire.LoginResult>('/admin/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (email: string, verification_code: string, new_password_hash: string) =>
    apiRequest<Wire.MessageResult>('/admin/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, verification_code, new_password: new_password_hash }) }),
  changePassword: (current_password: string, new_password: string) =>
    apiRequest<Wire.MessageResult>('/admin/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
  setupTotp: () =>
    apiRequest<{totp_secret: string; provisioning_uri: string; qr_code_hint: string; qr_code_url: string}>('/admin/auth/totp/setup', { method: 'POST' }),
  verifyTotp: (totp_code: string) =>
    apiRequest<Wire.MessageResult>('/admin/auth/totp/verify', { method: 'POST', body: JSON.stringify({ totp_code }) }),
  disableTotp: () =>
    apiRequest<Wire.MessageResult>('/admin/auth/totp/disable', { method: 'POST' }),
  requestActionCode: () =>
    apiRequest<Wire.MessageResult>('/admin/auth/request-action-code', { method: 'POST' }),
  getMyProfile: () =>
    apiRequest<Wire.AdminIdentity>('/admin/auth/me'),
  updateMyProfile: (name: string) =>
    apiRequest<Wire.AdminIdentity>('/admin/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }),

  listUsers: (params?: { page?: number; limit?: number; search?: string; status?: string; plan?: string; isGuest?: boolean }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          cleanParams[key] = String(val);
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    return apiRequest<{data: Wire.Customer[]; items?: Wire.Customer[]; total: number}>(`/users/${query ? `?${query}` : ''}`);
  },
  getUserDetail: (userId: string) => apiRequest<Wire.Customer>(`/users/${userId}`),
  updateUserStatus: (userId: string, status: string) =>
    apiRequest<Wire.MessageResult>(`/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateUserPlan: (userId: string, plan: string) =>
    apiRequest<Wire.MessageResult>(`/users/${userId}/plan`, { method: 'PATCH', body: JSON.stringify({ plan }) }),
  updateUserQuota: (userId: string, daily_limit: number) =>
    apiRequest<Wire.MessageResult>(`/users/${userId}/quota`, { method: 'PATCH', body: JSON.stringify({ daily_limit }) }),
  applyUserOverride: (userId: string, overrideData: { plan?: string; daily_limit?: number; status?: string }) =>
    apiRequest<Wire.MessageResult>(`/users/${userId}/override`, { method: 'POST', body: JSON.stringify(overrideData) }),

  // --- 3. RBAC & Staff Management ---
  getRoles: () => apiRequest<Wire.Role[]>('/admin/roles'),
  createRole: (roleData: { name: string; description?: string; permissions: string[] }) =>
    apiRequest<Wire.Role>('/admin/roles', { method: 'POST', body: JSON.stringify(roleData) }),
  updateRole: (roleId: string, roleData: { name?: string; description?: string; permissions?: string[] }) =>
    apiRequest<Wire.Role>(`/admin/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(roleData) }),
  deleteRole: (roleId: string) =>
    apiRequest<unknown>(`/admin/roles/${roleId}`, { method: 'DELETE' }),
  getPermissions: () => apiRequest<Wire.Permission[]>('/admin/permissions'),
  getStaff: () => apiRequest<Wire.Staff[]>('/admin/staff'),
  inviteStaff: (staffData: { email: string; role_id: string; name?: string }) =>
    apiRequest<Wire.Staff>('/admin/staff/invite', { method: 'POST', body: JSON.stringify(staffData) }),
  updateStaff: (staffId: string, updates: { role_id?: string; status?: 'active' | 'suspended' | 'disabled'; force_totp_reenrollment?: boolean }) =>
    apiRequest<Wire.Staff>(`/admin/staff/${staffId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  removeStaff: (staffId: string) =>
    apiRequest<unknown>(`/admin/staff/${staffId}`, { method: 'DELETE' }),

  // --- 3. Audit & Security Logs ---
  getAuditLogs: (params?: {
    admin_id?: string;
    admin_email?: string;
    module?: string;
    action?: string;
    ip_address?: string;
    totp_verified?: boolean;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          cleanParams[key] = String(val);
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    return apiRequest<{items: Wire.AuditLog[]; total: number; page: number; limit: number; total_pages: number}>(
      `/admin/audit-logs${query ? `?${query}` : ''}`
    );
  },
  getAllAuditLogs: () => apiRequest<Wire.AuditLog[]>('/admin/audit-logs/all'),
  getAuditLogDetail: (logId: string) => apiRequest<Wire.AuditLog>(`/admin/audit-logs/${logId}`),

  // Security Management API
  getSecurityAlerts: (status?: string) => apiRequest<Wire.SecurityAlert[]>(`/admin/security/alerts${status ? `?status=${status}` : ''}`),
  resolveSecurityAlert: (alertId: string) => apiRequest<unknown>(`/admin/security/alerts/${alertId}/resolve`, { method: 'PATCH' }),
  getActiveSessions: () => apiRequest<Wire.SecuritySession[]>('/admin/security/sessions'),
  terminateSession: (sessionId: string) => apiRequest<unknown>(`/admin/security/sessions/${sessionId}`, { method: 'DELETE' }),
  getIpLogs: (limit?: number) => apiRequest<Wire.IpLog[]>(`/admin/security/ip-logs${limit ? `?limit=${limit}` : ''}`),
  getRateLimitLogs: (limit?: number) => apiRequest<Wire.RateLimitLog[]>(`/admin/security/rate-limits${limit ? `?limit=${limit}` : ''}`),
  getBotDetectionLogs: () => apiRequest<Wire.BotLog[]>('/admin/security/bot-logs'),
  getAbuseReports: (status?: string) => apiRequest<Wire.AbuseReport[]>(`/admin/security/abuse-reports${status ? `?status=${status}` : ''}`),
  resolveAbuseReport: (reportId: string) => apiRequest<unknown>(`/admin/security/abuse-reports/${reportId}/resolve`, { method: 'PATCH' }),
  getApiKeyStatus: () => apiRequest<{ keys: Array<{ id: string; name: string; service: string; configured: boolean; last4: string | null; manage_url: string; error?: string }> }>('/admin/security/api-keys'),

  // --- 4. Plans & Billing Management ---
  getPlans: () => apiRequest<Wire.Plan[]>('/admin/plans'),
  createPlan: (planData: Partial<Wire.PlanInput>) =>
    apiRequest<Wire.Plan>('/admin/plans', { method: 'POST', body: JSON.stringify(planData) }),
  updatePlan: (planId: string, planData: Partial<Wire.PlanInput>) =>
    apiRequest<Wire.Plan>(`/admin/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(planData) }),
  archivePlan: (planId: string) =>
    apiRequest<unknown>(`/admin/plans/${planId}/archive`, { method: 'POST' }),
  grantQuotaOverride: (userId: string, customQuota: number, reason: string) =>
    apiRequest<unknown>(`/admin/users/${userId}/quota-override`, { method: 'POST', body: JSON.stringify({ custom_quota: customQuota, reason }) }),
  removeQuotaOverride: (userId: string) =>
    apiRequest<unknown>(`/admin/users/${userId}/quota-override`, { method: 'DELETE' }),
  getCoupons: () => apiRequest<{data: Wire.Coupon[]}>('/admin/coupons'),
  createCoupon: (couponData: { code: string; discount_type: 'percent' | 'fixed'; value: number; expires_at: string; usage_limit?: number }) =>
    apiRequest<{ data: unknown }>('/admin/coupons', { method: 'POST', body: JSON.stringify(couponData) }),
  archiveCoupon: (couponId: string) =>
    apiRequest<{ data: unknown }>(`/admin/coupons/${couponId}/archive`, { method: 'POST' }),

  getTrials: () => apiRequest<{data: Wire.Trial[]}>('/admin/trials'),
  startTrial: (userId: string, plan: string, days: number) =>
    apiRequest<{ data: unknown }>('/admin/trials', { method: 'POST', body: JSON.stringify({ user_id: userId, plan, days }) }),
  extendTrial: (trialId: string, days: number) =>
    apiRequest<{ data: unknown }>(`/admin/trials/${trialId}/extend`, { method: 'PATCH', body: JSON.stringify({ days }) }),
  endTrial: (trialId: string) =>
    apiRequest<{ data: unknown }>(`/admin/trials/${trialId}/end`, { method: 'POST' }),
  getPlanPerformance: () => apiRequest<{ data: Array<{ code: string; name: string; signups: number; conversions: number }> }>('/admin/plans/performance'),

  getAbTests: () => apiRequest<{configured: boolean; message?: string; error?: string; experiments: Wire.Experiment[]}>('/admin/promotions/ab-tests'),
  getReferrals: (status?: string) => apiRequest<{data: Wire.Referral[]}>(`/admin/promotions/referrals${status ? `?status=${status}` : ''}`),
  createReferral: (referrerUserId: string, referredEmail: string, code: string) =>
    apiRequest<{ data: unknown }>('/admin/promotions/referrals', { method: 'POST', body: JSON.stringify({ referrer_user_id: referrerUserId, referred_email: referredEmail, code }) }),
  convertReferral: (referralId: string) =>
    apiRequest<{referral: Wire.Referral; warnings: string[]}>(`/admin/promotions/referrals/${referralId}/convert`, { method: 'POST' }),

  // --- 5. Subscriptions & Billing (live from Payment Service Prisma DB) ---
  getSubscriptions: (params?: { status?: string; limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiRequest<{status: string; data: Wire.Subscription[]; total: number}>(`/admin/subscriptions${q ? `?${q}` : ''}`);
  },
  getSubscriptionStats: () =>
    apiRequest<{ status: string; total: number; active: number; cancelled: number; past_due: number; trialing?: number }>('/admin/subscriptions/stats'),
  getInvoices: (params?: { status?: string; limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiRequest<{status: string; data: Wire.Invoice[]; total: number}>(`/admin/invoices${q ? `?${q}` : ''}`);
  },

  // --- 5. Automation & Workflow Engine ---
  getAutomationRules: () => apiRequest<Wire.AutomationRule[]>('/admin/automation/rules'),
  createAutomationRule: (ruleData: unknown) =>
    apiRequest<Wire.AutomationRule>('/admin/automation/rules', { method: 'POST', body: JSON.stringify(ruleData) }),
  updateAutomationRule: (ruleId: string, ruleData: unknown) =>
    apiRequest<Wire.AutomationRule>(`/admin/automation/rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify(ruleData) }),
  deleteAutomationRule: (ruleId: string) =>
    apiRequest<unknown>(`/admin/automation/rules/${ruleId}`, { method: 'DELETE' }),
  dryRunAutomationRule: (ruleId: string, testPayload: unknown) =>
    apiRequest<Wire.AutomationPreview>(`/admin/automation/rules/${ruleId}/dry-run`, { method: 'POST', body: JSON.stringify({ payload: testPayload }) }),
  dryRunAutomation: (testPayload: unknown) =>
    apiRequest<Wire.AutomationPreview[]>('/admin/automation/dry-run', { method: 'POST', body: JSON.stringify({ payload: testPayload }) }),
  emitDomainEvent: (trigger_event: string, payload: unknown) =>
    apiRequest<Wire.AutomationExecution[]>('/admin/automation/events/emit', { method: 'POST', body: JSON.stringify({ trigger_event, payload }) }),
  getAutomationExecutionLogs: () =>
    apiRequest<Wire.AutomationExecution[]>('/admin/automation/execution-logs'),

  // --- Notifications & Server Settings ---
  getNotificationEmailLogs: (params?: { status?: string; type?: string; limit?: number }) => {
    const q = params ? new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiRequest<Wire.NotificationLog[]>(`/admin/notifications/email-logs${q ? `?${q}` : ''}`);
  },
  getFailedNotifications: () => apiRequest<Wire.NotificationLog[]>('/admin/notifications/failed'),
  getNotificationHistory: () => apiRequest<Wire.NotificationLog[]>('/admin/notifications/history'),
  getNotificationStatusOverview: () => apiRequest<Wire.NotificationStatus>('/admin/notifications/status'),
  getAnnouncements: () => apiRequest<Wire.Announcement[]>('/admin/notifications/announcements'),
  createAnnouncement: (title: string, message: string, severity?: string) =>
    apiRequest<Wire.Announcement>('/admin/notifications/announcements', { method: 'POST', body: JSON.stringify({ title, message, severity }) }),
  updateAnnouncement: (announcementId: string, updates: { title?: string; message?: string; severity?: string; is_active?: boolean }) =>
    apiRequest<Wire.Announcement>(`/admin/notifications/announcements/${announcementId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteAnnouncement: (announcementId: string) =>
    apiRequest<unknown>(`/admin/notifications/announcements/${announcementId}`, { method: 'DELETE' }),
  getNotificationTemplates: () => apiRequest<Wire.NotificationTemplate[]>('/admin/notifications/templates'),
  createNotificationTemplate: (templateData: { name: string; subject: string; body_html: string; channel?: string; is_active?: boolean; type?: string }) =>
    apiRequest<Wire.NotificationTemplate>('/admin/notifications/templates', { method: 'POST', body: JSON.stringify(templateData) }),
  updateNotificationTemplate: (templateId: string, templateData: unknown) =>
    apiRequest<Wire.NotificationTemplate>(`/admin/notifications/templates/${templateId}`, { method: 'PUT', body: JSON.stringify(templateData) }),
  deleteNotificationTemplate: (templateId: string) =>
    apiRequest<unknown>(`/admin/notifications/templates/${templateId}`, { method: 'DELETE' }),
  getNotificationServerSettings: () => apiRequest<Wire.NotificationSettings>('/admin/notifications/settings'),
  updateNotificationServerSettings: (settingsData: unknown) =>
    apiRequest<Wire.NotificationSettings>('/admin/notifications/settings', { method: 'PUT', body: JSON.stringify(settingsData) }),

  // --- Infrastructure Health ---
  getInfrastructureHealth: () => apiRequest<Wire.InfrastructureHealth>('/admin/infrastructure/health'),
  getMcpChatSessions: () => apiRequest<Wire.McpResources>('/admin/infrastructure/mcp/sessions'),
  getMcpTemplates: () => apiRequest<Wire.McpResources>('/admin/infrastructure/mcp/templates'),

  // --- Document Templates Engine ---
  getEntitlements: (id:string)=>apiRequest<{entitlements:import('../../../shared/entitlements.mjs').Entitlements;override:unknown}>(`/users/${encodeURIComponent(id)}/entitlements`),
  saveEntitlements: (id:string,payload:unknown)=>apiRequest(`/users/${encodeURIComponent(id)}/entitlements`,{method:'PUT',body:JSON.stringify(payload)}),
  deleteEntitlements: (id:string)=>apiRequest(`/users/${encodeURIComponent(id)}/entitlements`,{method:'DELETE'}),
  uploadTemplate: (payload:unknown)=>apiRequest('/admin/templates/uploads',{method:'POST',body:JSON.stringify(payload)}),
  approveTemplate: (id:string)=>apiRequest(`/admin/templates/uploads/${encodeURIComponent(id)}/approve`,{method:'POST'}),
  inspectUploadedTemplate: (id:string)=>apiRequest<Wire.UploadedTemplateDetail>(`/admin/templates/uploads/${encodeURIComponent(id)}`),
  renameUploadedTemplate: (id:string,name:string)=>apiRequest<Pick<Wire.UploadedTemplateDetail,'id'|'name'|'created_at'>>(`/admin/templates/uploads/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({name})}),
  reviewUploadedTemplate: (id:string,payload:{decision:'approve'|'reject';visibility:'private'|'public';digest:string;notes:string})=>apiRequest(`/admin/templates/uploads/${encodeURIComponent(id)}/review`,{method:'POST',body:JSON.stringify(payload)}),
  getTemplates: () => apiRequest<Wire.Template[]>('/admin/templates'),
  publishTemplate: (templateId: string) => apiRequest<unknown>(`/admin/templates/${templateId}/publish`, { method: 'POST' }),
  withdrawTemplate: (templateId: string) => apiRequest<unknown>(`/admin/templates/${templateId}/withdraw`, { method: 'POST' }),

  // --- 6. Admin Analytics & PostHog ---
  getAnalyticsOverview: () => apiRequest<Wire.Overview>('/admin/analytics/overview'),
  getRevenueAnalytics: () => apiRequest<Wire.Revenue>('/admin/analytics/revenue'),
  getGenerationsAnalytics: () => apiRequest<unknown>('/admin/analytics/generations'),
  getDetailedGenerationsAnalytics: () => apiRequest<Wire.GenerationAnalytics>('/admin/analytics/generations/detailed'),
  getUsersAnalytics: () => apiRequest<unknown>('/admin/analytics/users'),
  getTrafficAnalytics: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    const qs = params.toString();
    return apiRequest<Wire.TrafficAnalytics>(`/admin/analytics/traffic${qs ? `?${qs}` : ''}`);
  },
  getJourneyAnalytics: () => apiRequest<Wire.JourneyAnalytics>('/admin/analytics/journey'),
  getButtonClickAnalytics: (days?: number) =>
    apiRequest<Wire.ClickAnalytics>(`/admin/analytics/button-clicks${days ? `?days=${days}` : ''}`),
  getPageDurationAnalytics: (days?: number) =>
    apiRequest<Wire.DurationAnalytics>(`/admin/analytics/page-duration${days ? `?days=${days}` : ''}`),
  getPosthogConfig: () => apiRequest<Wire.PosthogConfig>('/admin/analytics/posthog/config'),
  trackPosthogEvent: (event_name: string, properties?: unknown) =>
    apiRequest<Wire.MessageResult>('/admin/analytics/events', { method: 'POST', body: JSON.stringify({ event_name, properties }) }),

  // --- 7. Dynamic Config Engine ---
  getInternalDomainConfig: (domain: string) =>
    apiRequest<unknown>(`/internal/config/${domain}`),
  getInternalAllConfigs: () =>
    apiRequest<unknown>('/internal/config'),
  getAdminDomainConfig: <T = Record<string, unknown>>(domain: string) =>
    apiRequest<Wire.ConfigEnvelope<T>>(`/admin/config/${domain}`),
  updateAdminDomainConfig: (domain: string, config_data: unknown) =>
    apiRequest<Wire.ConfigEnvelope>(`/admin/config/${domain}`, { method: 'PUT', body: JSON.stringify(config_data) }),
  getDomainConfigHistory: (domain: string) =>
    apiRequest<Wire.ConfigHistory[]>(`/admin/config/${domain}/history`),

  // --- 7b. GDPR & Reports (real data, no fabricated success) ---
  exportGdprData: (email: string) =>
    downloadFile(`/admin/gdpr/export?email=${encodeURIComponent(email)}`),
  purgeGdprUser: (email: string) =>
    apiRequest<{ status: string; user_id: string; anonymized_email: string }>('/admin/gdpr/purge', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  downloadUsersCsv: () => downloadFile('/admin/reports/users-csv'),

  // --- 8. Support Management ---
  // Admin-facing
  inspectChatSession: (sessionId: string) => apiRequest<unknown>(`/admin/support/sessions/${encodeURIComponent(sessionId)}`),
  getSupportTickets: (params?: { status?: string; category?: string; limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))).toString() : '';
    return apiRequest<{status: string; data: Wire.SupportItem[]; total: number}>(`/admin/support/tickets${q ? `?${q}` : ''}`);
  },
  updateSupportTicket: (ticketId: string, updates: { status?: string; assigned_to?: string; resolution_notes?: string }) =>
    apiRequest<unknown>(`/admin/support/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  resolveSupportTicket: (ticketId: string, resolution_notes?: string) =>
    apiRequest<unknown>(`/admin/support/tickets/${ticketId}/resolve`, { method: 'POST', body: JSON.stringify({ resolution_notes }) }),

  getRefundRequests: (params?: { status?: string; limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))).toString() : '';
    return apiRequest<{status: string; data: Wire.SupportItem[]; total: number}>(`/admin/support/refunds${q ? `?${q}` : ''}`);
  },
  updateRefundRequest: (refundId: string, updates: { status?: string; admin_notes?: string }) =>
    apiRequest<unknown>(`/admin/support/refunds/${refundId}`, { method: 'PATCH', body: JSON.stringify(updates) }),

  getContactSubmissions: (params?: { status?: string; limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))).toString() : '';
    return apiRequest<{status: string; data: Wire.SupportItem[]; total: number}>(`/admin/support/contact${q ? `?${q}` : ''}`);
  },
  updateContactSubmission: (contactId: string, updates: { status?: string; admin_reply?: string }) =>
    apiRequest<unknown>(`/admin/support/contact/${contactId}`, { method: 'PATCH', body: JSON.stringify(updates) }),

  getPlanOverrideRequests: (params?: { status?: string; limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))).toString() : '';
    return apiRequest<{status: string; data: Wire.SupportItem[]; total: number}>(`/admin/support/plan-overrides${q ? `?${q}` : ''}`);
  },
  updatePlanOverrideRequest: (overrideId: string, updates: { status?: string; admin_notes?: string }) =>
    apiRequest<unknown>(`/admin/support/plan-overrides/${overrideId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  approvePlanOverride: (overrideId: string) =>
    apiRequest<unknown>(`/admin/support/plan-overrides/${overrideId}/approve`, { method: 'POST' }),

  // --- 9. Cost Ledger & Financial Analytics ---
  getCostLedger: (params?: { period_month?: string; category?: string; limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))).toString() : '';
    return apiRequest<{status: string; data: Wire.CostEntry[]; total: number}>(`/admin/cost-ledger${q ? `?${q}` : ''}`);
  },
  createCostEntry: (entryData: { category: string; description: string; amount_usd: number; period_month: string; currency?: string; vendor?: string; invoice_ref?: string }) =>
    apiRequest<{ status: string; data: unknown }>('/admin/cost-ledger', { method: 'POST', body: JSON.stringify(entryData) }),
  deleteCostEntry: (entryId: string) =>
    apiRequest<unknown>(`/admin/cost-ledger/${entryId}`, { method: 'DELETE' }),
  getCostSummary: () =>
    apiRequest<{status: string; data: Wire.CostSummary[]}>('/admin/cost-ledger/summary'),

  // Financial Analytics from Payment Service
  getRevenueSummary: () =>
    apiRequest<{
      status: string; mrr: number; arr: number; arpu: number; ltv: number; churn_rate: number;
      total_active_subscriptions: number; total_cancelled_subscriptions: number;
      total_revenue_paid: number; total_invoices_paid: number;
      revenue_by_gateway: Record<string, number>; subscriptions_by_plan: Record<string, number>;
      revenue_by_plan: Record<string, number>;
      by_currency?: Record<string,{mrr:number;arr:number;total_revenue_paid:number}>;
      unreconciled_subscription_count?: number;
    }>('/admin/revenue'),
  getFailedPayments: (params?: { limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && String(v) !== '').map(([k, v]) => [k, String(v)]))).toString() : '';
    return apiRequest<{ status: string; data: unknown[]; total: number }>(`/admin/failed-payments${q ? `?${q}` : ''}`);
  },
  getPaymentRefunds: (params?: { limit?: number; offset?: number }) => {
    const q = params ? new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && String(v) !== '').map(([k, v]) => [k, String(v)]))).toString() : '';
    return apiRequest<{ status: string; data: unknown[]; total: number; total_refunded_amount: number }>(`/admin/refunds${q ? `?${q}` : ''}`);
  },
};
