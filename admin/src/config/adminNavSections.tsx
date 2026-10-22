import React from 'react';
import {
  Layout,
  Users,
  CreditCard,
  DollarSign,
  Sparkles,
  Activity,
  ShieldAlert,
  Gift,
  Briefcase,
  Bell,
  FileText,
  Database,
  HelpCircle,
  Settings,
} from 'lucide-react';

export interface AdminNavItem {
  label: string;
  id: string;
}

export interface AdminNavSection {
  title: string;
  icon: React.ReactNode;
  items: AdminNavItem[];
  // Sidebar divider label rendered above this section when it differs from
  // the previous section's category — groups sections by what an admin is
  // actually trying to do, not just alphabetically or by build order.
  category?: string;
}

// Shared by AdminSidebar (full navigation tree) and AdminTopbar (global
// search + app-launcher dropdown), so both stay in sync with one list of
// admin sections instead of two copies drifting apart.
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    title: 'Home',
    icon: <Layout size={14} />,
    category: 'Overview',
    items: [{ label: 'Dashboard', id: 'home_dashboard' }]
  },
  {
    title: 'Users',
    icon: <Users size={14} />,
    category: 'Customers & Revenue',
    items: [
      { label: 'All Users', id: 'users_all' },
      { label: 'Active Users', id: 'users_active' },
      { label: 'Suspended / Banned Users', id: 'users_suspended' },
      { label: 'Guest Sessions', id: 'users_guest' },
      { label: 'User Details & Manual Override', id: 'users_details' }
    ]
  },
  {
    title: 'Subscriptions',
    icon: <CreditCard size={14} />,
    items: [
      { label: 'All Subscriptions', id: 'subs_all' },
      { label: 'Active Plans', id: 'subs_active' },
      { label: 'Cancelled Plans', id: 'subs_cancelled' },
      { label: 'Failed Payments', id: 'subs_failed' },
      { label: 'Refunds', id: 'subs_refunds' },
      { label: 'Plan Overview (Free / Pro / Enterprise)', id: 'subs_plan_overview' }
    ]
  },
  {
    title: 'Revenue',
    icon: <DollarSign size={14} />,
    items: [
      { label: 'MRR & ARR', id: 'rev_mrr_arr' },
      { label: 'Revenue by Plan', id: 'rev_by_plan' },
      { label: 'Cost Ledger & Expenses', id: 'rev_cost_ledger' },
      { label: 'Churn Rate', id: 'rev_churn' },
      { label: 'LTV per User', id: 'rev_ltv' },
      { label: 'Transaction History', id: 'rev_transactions' },
      { label: 'Payout Summary', id: 'rev_payouts' }
    ]
  },
  {
    title: 'Promotions',
    icon: <Gift size={14} />,
    items: [
      { label: 'Coupon Codes', id: 'promo_coupons' },
      { label: 'Active Promotions', id: 'promo_active' },
      { label: 'A/B Tests', id: 'promo_ab_tests' },
      { label: 'Referral Program', id: 'promo_referrals' },
      { label: 'Trial Management', id: 'promo_trials' }
    ]
  },
  {
    title: 'Packages',
    icon: <Briefcase size={14} />,
    items: [
      { label: 'Current Plans', id: 'pack_current' },
      { label: 'Create New Plan', id: 'pack_create' },
      { label: 'Feature Flags per Plan', id: 'pack_flags' },
      { label: 'AI Model Routing per Plan', id: 'pack_ai_models' },
      { label: 'Plan Performance', id: 'pack_performance' }
    ]
  },
  {
    title: 'AI Management',
    icon: <Sparkles size={14} />,
    category: 'Product & Content',
    items: [
      {label:'Providers',id:'ai_providers'},
      {label:'Model Registry',id:'ai_models'},
      {label:'Plan Assignments',id:'ai_assignments'},
      {label:'Routing Policies',id:'ai_routing'},
      {label:'API Credentials',id:'ai_credentials'},
      {label:'Local Inference',id:'ai_local'},
      {label:'Usage & Costs',id:'ai_usage'},
      {label:'Health & Monitoring',id:'ai_health'},
      {label:'Audit Logs',id:'ai_audit'},
    ]
  },
  {
    title: 'Generations',
    icon: <Sparkles size={14} />,
    category: 'Product & Content',
    items: [
      { label: 'Total Generations', id: 'gen_total' },
      { label: 'Generations by Document Type', id: 'gen_by_type' },
      { label: 'Generations by User', id: 'gen_by_user' },
      { label: 'Failed Generations', id: 'gen_failed' },
      { label: 'Free Tier Usage', id: 'gen_free_tier' },
      { label: 'Pro Tier Usage', id: 'gen_pro_tier' },
      { label: 'Drop-off Points in Chat Flow', id: 'gen_drop_offs' }
    ]
  },
  {
    title: 'Documents',
    icon: <FileText size={14} />,
    items: [
      { label: 'All Generated Documents', id: 'doc_all' },
      { label: 'Most Used Templates', id: 'doc_templates' },
      { label: 'Custom Template Approvals', id: 'doc_version_registry' },
      { label: 'Document Type Breakdown', id: 'doc_breakdown' },
      { label: 'Shared Document Links', id: 'doc_links' }
    ]
  },
  {
    title: 'Analytics',
    icon: <Activity size={14} />,
    items: [
      { label: 'Traffic Overview', id: 'an_traffic' },
      { label: 'Users by Location', id: 'an_location' },
      { label: 'Users by Device', id: 'an_device' },
      { label: 'Page Visit Duration', id: 'an_duration' },
      { label: 'Button Click Tracking', id: 'an_clicks' },
      { label: 'Subscribe Page Funnel', id: 'an_funnel' },
      { label: 'Conversion Rate', id: 'an_conversion' },
      { label: 'Signup to Subscribe Journey', id: 'an_journey' }
    ]
  },
  {
    title: 'Security',
    icon: <ShieldAlert size={14} />,
    category: 'Operations',
    items: [
      { label: 'IP Address Logs', id: 'sec_ip_logs' },
      { label: 'Suspicious Activity', id: 'sec_suspicious' },
      { label: 'Rate Limit Violations', id: 'sec_rate_limits' },
      { label: 'Bot Detection Logs', id: 'sec_bot_logs' },
      { label: 'Account Abuse Reports', id: 'sec_abuse_reports' },
      { label: 'Audit Logs', id: 'sec_audit' },
      { label: 'Session Management', id: 'sec_sessions' }
    ]
  },
  {
    title: 'Support',
    icon: <HelpCircle size={14} />,
    items: [
      { label: 'User Reported Issues', id: 'sup_reported' },
      { label: 'Refund Requests', id: 'sup_refunds' },
      { label: 'Contact Form Submissions', id: 'sup_contact' },
      { label: 'Manual Plan Override Requests', id: 'sup_overrides' }
    ]
  },
  {
    title: 'Notifications & Automation',
    icon: <Bell size={14} />,
    items: [
      { label: 'Automation Rules & Engine', id: 'not_automation' },
      { label: 'Automation Execution Logs', id: 'not_execution_logs' },
      { label: 'Emit Domain Events', id: 'not_emit_events' },
      { label: 'Email Logs', id: 'not_email_logs' },
      { label: 'System Announcements', id: 'not_system' },
      { label: 'Notification Templates', id: 'not_templates' }
    ]
  },
  {
    title: 'Infrastructure',
    icon: <Database size={14} />,
    items: [
      { label: 'Uptime Monitor', id: 'inf_uptime' },
      { label: 'Chat MCP Server Integration', id: 'inf_mcp_chat' },
      { label: 'Error Logs (Sentry)', id: 'inf_sentry' },
      { label: 'API Usage & Limits', id: 'inf_api_usage' },
      { label: 'Database Health', id: 'inf_db_health' },
      { label: 'Deployment History', id: 'inf_deployments' },
      { label: 'Staging vs Production Status', id: 'inf_staging_prod' }
    ]
  },
  {
    title: 'Settings',
    icon: <Settings size={14} />,
    category: 'System',
    items: [
      { label: 'Dynamic Config Engine', id: 'set_dynamic_config' },
      { label: 'Admin Profile', id: 'set_profile' },
      { label: 'Admin User Management', id: 'set_admin_users' },
      { label: '2FA Settings', id: 'set_2fa' },
      { label: 'API Keys & Integrations', id: 'set_api_keys' },
      { label: 'Billing Configuration', id: 'set_billing' },
      { label: 'GDPR & Data Management', id: 'set_gdpr' },
      { label: 'Export Data (CSV)', id: 'set_export_csv' },
      { label: 'System Preferences', id: 'set_preferences' }
    ]
  }
];
