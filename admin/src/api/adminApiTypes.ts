/** Wire contracts owned by admin-api; arbitrary event/config payloads remain unknown. */
export interface MessageResult { message?: string; status?: string }
export interface AdminIdentity { id: string; admin_id: string; name: string; email: string; role_name: string; is_super_admin: boolean; permissions: string[]; totp_enabled: boolean }
export interface LoginResult extends MessageResult { access_token?: string; admin_id?: string; verification_code_hint?: string }
export interface Customer {
  quota_used?:number|null; lastLoginAt?:string|null; entitlements?:import('../../../shared/entitlements.mjs').Entitlements;
  id: string; email: string; fullName: string; name?: string; plan: string;
  status: 'active' | 'suspended' | 'banned'; isGuest: boolean; createdAt: string;
  sessionToken?: string; ip?: string; location?: string; device?: string; generatedDocs?: number; state?: string; quota?: number; authProvider?: string; activity?: string; lastActive?: string;
  status_reason?: string; status_changed_by?: string; status_is_automatic?: boolean;
}
export interface Permission { id: string; module: string; action: string; description?: string }
export interface Role { id: string; name: string; description?: string; is_custom: boolean; is_system_role?: boolean; permissions: Array<string | Permission>; assigned_staff_count?: number }
export interface Staff { id: string; email: string; name?: string; role_id: string; role_name?: string; status: string; totp_enabled?: boolean; invite_email_sent?: boolean; created_at?: string }
export interface AuditLog { id: string; admin_id?: string; admin_email?: string; action: string; module: string; ip_address: string; user_agent?: string; totp_verified: boolean; details?: Record<string, unknown>; created_at: string }
export interface Plan {
  id: string; name: string; code: string; description?: string | null;
  price_usd_monthly: number; price_usd_yearly: number;
  price_lkr_monthly?: number | null; price_lkr_yearly?: number | null;
  billing_currency: 'USD' | 'LKR'; billing_interval: 'monthly' | 'yearly' | 'both';
  monthly_quota: number; payhere_plan_id?: string | null; paddle_price_id?: string | null;
  paddle_price_yearly_id?: string | null; status: 'active' | 'draft' | 'archived';
  feature_flags: Record<string, unknown>; created_at?: string; updated_at?: string;
}
export type PlanInput = Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'status' | 'billing_interval' | 'feature_flags'> & Partial<Pick<Plan, 'status' | 'billing_interval' | 'feature_flags'>>;
export interface Announcement { id: string; title: string; message: string; severity: string; is_active: boolean; created_at: string; updated_at?: string; target_audience?: string }
export interface NotificationTemplate { id: string; name: string; subject: string; body_html: string; channel: string; is_active: boolean; type?: string; created_at?: string }
export interface NotificationSettings {
  email_provider?: 'resend' | 'disabled'; sender_email: string; sender_name: string; rate_limit_per_minute: number; email_notifications_enabled: boolean; in_app_notifications_enabled: boolean; max_retries?: number; sms_notifications_enabled?: boolean; marketing_enabled?: boolean; webhook_url?: string; branding_logo_url?: string; branding_primary_color?: string; branding_footer_text?: string }
export interface NotificationLog { id: string; email?: string; recipient?: string; to?: string; type: string; status: string; subject?: string; created_at: string; createdAt?: string; gateway?: string; timestamp?: string; error?: string; error_message?: string; payload?: unknown; sent_at?: string; retry_count?: number }
export interface NotificationStatus { total_notifications: number; sent_count: number; failed_count: number; delivery_rate_percentage: number }
export interface Template { id: string; name: string; type: string; version: string; status: string; lastUpdated?: string; created_at?:string; author?: string; html_content: string; owner_id?: string; visibility?: 'private'|'public'; digest?: string }
export interface UploadedTemplateDetail { id:string; name:string; created_at?:string; owner_id:string; visibility:'private'|'public'; digest:string; preview_html:string; source:{html:string;assets:Record<string,string>} }
export interface Subscription { id: string; user_id: string; userId?: string; plan_name: string; planName?: string; plan?: string; gateway: string; status: string; amount?: number|null; currency?: string|null; billing_cycle?:string|null; current_period_start?: string; current_period_end?: string; created_at?: string; createdAt?: string; cancel_at_period_end?: boolean; gateway_subscription_id?: string }
export interface Invoice { id: string; user_id: string; subscription_id?: string; amount: number; currency: string; gateway: string; status: string; created_at: string; gateway_invoice_id?: string; invoice_url?: string }
export interface AutomationCondition { field: string; operator: string; value: unknown }
export interface AutomationAction { action_type: string; target?: string | null; payload: Record<string, unknown> }
export interface AutomationRule { id: string; name: string; description?: string; trigger_event: string; conditions: AutomationCondition[]; actions: AutomationAction[]; status: 'active' | 'disabled'; retry_limit: number; created_at: string; updated_at: string }
export interface AutomationExecution { id: string; rule_id: string; rule_name: string; trigger_event: string; payload: Record<string, unknown>; conditions_passed: boolean; status: 'success' | 'failed' | 'retrying' | 'dead_letter'; retry_count: number; error_message?: string; created_at: string; action_results: Record<string, unknown>[] }
export interface AutomationPreview { rule_id: string; rule_name: string; trigger_event: string; payload: Record<string, unknown>; conditions_evaluated: number; conditions_passed: boolean; condition_details: Record<string, unknown>[]; action_previews: Record<string, unknown>[] }
export interface CostEntry { id: string; category: string; description: string; amount_usd: number; currency: string; period_month: string; vendor?: string; invoice_ref?: string; created_at?: string }
export interface CostSummary { category: string; total: number; total_usd?: number; period_month?: string }
export interface ConfigEnvelope<T = Record<string, unknown>> { data: T; version: number; updated_at?: string }
export interface ConfigHistory { admin_id?: string; id: string; version: number; config_data?: unknown; data?: unknown; changed_by?: string; created_at: string; updated_at?: string }
export interface FeatureFlag { type?: string; default?: boolean; description?: string; plan_matrix?: Record<string, boolean> }
export type ModelRouting = Record<string, { max_model?: string; groq_models?: string[] }>;
export interface SecurityAlert { title?: string; details?: string; id: string; type: string; severity: string; status: string; message: string; created_at: string; user_id?: string; ip_address?: string }
export interface SecuritySession { user_email?: string; user?: string; ip?: string; device_agent?: string; id: string; user_id: string; ip_address: string; device?: string; status: string; created_at: string; last_active?: string; email?: string }
export interface IpLog { ip?: string; user_email?: string; user?: string; date?: string; user_agent?: string; agent?: string; id: string; ip_address: string; user_id?: string; action: string; created_at: string; timestamp?: string }
export interface RateLimitLog extends IpLog { identifier?: string; group_name?: string; path?: string; limit_val?: number }
export interface BotLog { id: string; ip_address: string; user_agent: string; reason: string; risk_score: number; status: string; created_at: string }
export interface AbuseReport { target_user_email?: string; reporter_email?: string; id: string; reporter_id: string; target_user_id: string; reason: string; severity: string; status: string; created_at: string }
export interface SupportItem { admin_reply?: string; user_email?: string; gateway?: string; requested_quota?: number; id: string; status: string; user_id?: string; email?: string; subject?: string; message?: string; category?: string; description?: string; priority?: string; created_at?: string; updated_at?: string; assigned_to?: string; resolution_notes?: string; admin_notes?: string; amount?: number; currency?: string; reason?: string; name?: string; plan?: string; requested_plan?: string; current_plan?: string; subscription_id?: string; invoice_id?: string; session_id?: string }
export interface Coupon { id: string; code: string; discount_type: 'percent' | 'fixed'; value: number; expires_at: string; is_expired?: boolean; usage_limit?: number; usage_count?: number; status: string; created_at?: string }
export interface Trial { started_at?: string; expires_at?: string; is_expired?: boolean; id: string; user_id: string; plan: string; status: string; starts_at?: string; ends_at?: string; created_at?: string }
export interface Referral { id: string; referrerUserId?: string; referredEmail?: string; referrer_user_id?: string; referred_email?: string; code: string; status: string; createdAt?: string; created_at?: string; convertedAt?: string }
export interface Experiment { id: number; name: string; description?: string; start_date?: string; end_date?: string; status?: string; feature_flag_key?: string; variants?: string[] }
export interface Overview { active_customers: number; total_users: number; mrr: number; mrr_growth_pct: number; total_generations: number; render_success_pct: number; gross_margin_pct: number }
export interface Revenue { mrr: number; arr: number; arpu: number; ltv: number; mrr_growth_pct: number; by_plan: Record<string, number>; trajectory: Array<{ month: string; mrr: number }>; payhere_volume_usd: number; paddle_volume_usd: number }
export interface Generation { id: string; user: string; type: string; template: string; status: string; date: string; error?: string; reason?: string }
export interface GenerationAnalytics { by_type: Array<{ name: string; color?: string; count: number; free?: number; pro?: number }>; monthly_trend: Array<{ month: string; free: number; pro: number }>; top_users: Array<{ user: string; id: string; email: string; date: string; user_id?: string; count: number; plan?: string }>; failed_generations: Generation[]; drop_off_points: Array<{ stage: string; step?: string; rate?: string; count: number; percentage?: number }>; recent_generations: Generation[]; free_tier_total: number; pro_tier_total: number }
export interface PosthogConfig { status: string; posthog_host: string; api_key_configured: boolean; api_key_masked?: string; query_api_configured: boolean; telemetry_sync: string; monthly_tracked_sessions: number; analytics_service_url: string }
export interface ConversionStats { registration_to_activation?: string; activation_to_power?: string; overall_paid_conversion?: string; total_signups?: number; activated_users?: number; conversion_rate?: string; signup_to_paid_pct?: string; guest_to_signup_pct?: string }
export interface TrafficAnalytics { sources: Array<{ name: string; value: number; color: string }>; devices: Array<{ device: string; value: number; color: string }>; geographic: Array<{ country: string; visitors: number | string; share: string; status: string }>; funnel: Array<{ step: string; count: number; percentage?: string }>; conversion_stats: ConversionStats; channel_conversion: Array<{ name: string; total: number; activated: number; conversion_pct: string }>; sessions_in_range: number }
export interface JourneyAnalytics { stages: Array<{ name: string; count: number; conversion_pct: number; avg_duration_seconds: number }> }
export interface ClickAnalytics { configured: boolean; events: Array<{ event: string; count: number; description?: string }> }
export interface DurationAnalytics { configured: boolean; pages: Array<{ route: string; avg_duration_seconds: number; bounce_rate_pct?: number; bounce_pct?: number }> }
export interface McpResources { error?: string; sessions?: Array<{id: string; user_email: string | null; document_type: string | null; status: string; updated_at: string; message_count: number}>; templates?: Array<{id: string; name: string; document_type: string | null; is_premium: boolean; sessions_using: number}>; resources?: Array<{ uri: string; name?: string; title?: string; description?: string; mimeType?: string }>; configured?: boolean; message?: string }
export interface InfrastructureHealth { services?: Array<{ name: string; status: 'Online' | 'Degraded' | 'Offline'; port: number | null; uptime_pct: number | null; url?: string; latency_ms: number | null }>; status?: string }
