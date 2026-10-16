import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import {
  Sliders, History, Save, RefreshCw, CheckCircle2, AlertTriangle, Code2, RotateCcw, Lock
} from 'lucide-react';
import { adminApiClient } from '../../api/adminApiClient';
import { toast, getErrorMessage } from '../../store/toastStore';

interface ConfigViewProps {
  activeSubItem?: string;
}

const CONFIG_DOMAINS = [
  { id: 'plans', label: 'Subscription Plans & Quotas', desc: 'Read-only snapshot — managed from the Plans & Billing page' },
  { id: 'feature_flags', label: 'Feature Flags Matrix', desc: 'Global and plan-level feature toggles (watermark removal, custom fonts, etc.)' },
  { id: 'branding', label: 'App Branding & Assets', desc: 'Company details, logo URLs, custom CSS overrides, and email signatures' },
  { id: 'settings', label: 'Gateway & Payment Settings', desc: 'Per-role API rate limits (Gateway) and which payment gateways are enabled (Payment Service)' },
  { id: 'ai_model_routing', label: 'AI Provider & Model Access', desc: 'Select provider: groq or claude. Configure plan model ceilings. Credentials are supplied securely by the operator.' },
  { id: 'mcp_tools', label: 'Chat Assistant MCP Tool Config', desc: 'Model parameters, system prompts, tool permissions, and temperature settings' },
];

function getDomainDefault(domain: string) {
    switch (domain) {
      case 'plans':
        return {
          guest: { name: 'Guest Preview', monthly_quota: 1, price_usd_monthly: 0.0, is_active: true },
          free: { name: 'Free Tier', monthly_quota: 3, price_usd_monthly: 0.0, is_active: true },
          pro: { name: 'Pro Professional', monthly_quota: 300, price_usd_monthly: 29.0, is_active: true },
          max: { name: 'Max', monthly_quota: 25, price_usd_monthly: 199.0, is_active: true },
        };
      case 'feature_flags':
        return {
          watermark_removal: { type: 'boolean', default: false, plan_matrix: { free: false, pro: true, max: true } },
          custom_font_upload: { type: 'boolean', default: false, plan_matrix: { free: false, pro: true, max: true } },
          priority_pdf_rendering: { type: 'boolean', default: false, plan_matrix: { free: false, pro: false, max: true } },
        };
      case 'branding':
        return {
          company_name: 'DocCraft',
          logo_url: 'https://cdn.doccraft.app/assets/logo.svg',
          primary_color: '#3b82f6',
          support_email: 'support@doccraft.app',
        };
      case 'settings':
        return {
          default_payment_provider: 'auto',
          allow_paddle: true,
          allow_payhere: true,
          allow_firebase: false,
          document_storage_provider: 'local',
          rate_limits: { auth: 10, admin: 200, user: 100, public: 20 },
        };
      case 'ai_model_routing':
        return { provider: 'groq', free: {max_model:'claude-haiku-4-5'}, pro: {max_model:'claude-sonnet-4-5'}, max: {max_model:'claude-sonnet-4-5'} };
      case 'mcp_tools':
        return {
          model: 'gemini-3.6-flash',
          temperature: 0.2,
          max_tokens: 4096,
          allowed_tools: ['generate_pdf', 'edit_template', 'suggest_edits'],
        };
      default:
        return {};
    }
  }

const ConfigView: React.FC<ConfigViewProps> = ({ activeSubItem }) => {
  const [selectedDomain, setSelectedDomain] = useState<string>(activeSubItem && CONFIG_DOMAINS.some(d => d.id === activeSubItem) ? activeSubItem : 'plans');
  const isReadOnlyDomain = selectedDomain === 'plans';
  const [configData, setConfigData] = useState<unknown>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [version, setVersion] = useState<number>(1);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [history, setHistory] = useState<Wire.ConfigHistory[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadDomainConfig = useCommittedEvent(async (domain: string) => {


    try {
      const [res, histRes] = await Promise.all([
        adminApiClient.getAdminDomainConfig(domain).catch(() => null),
        adminApiClient.getDomainConfigHistory(domain).catch(() => []),
      ]);
setStatusMsg(null);

      if (res && res.data) {
        setConfigData(res.data);
        setJsonText(JSON.stringify(res.data, null, 2));
        setVersion(res.version || 1);
        setUpdatedAt(res.updated_at || '');
      } else if (res) {
        setConfigData(res);
        setJsonText(JSON.stringify(res, null, 2));
        setVersion(res.version || 1);
        setUpdatedAt(res.updated_at || '');
      } else {
        // Default fallback template if domain doesn't exist yet
        const defaultPayload = getDomainDefault(domain);
        setConfigData(defaultPayload);
        setJsonText(JSON.stringify(defaultPayload, null, 2));
      }

      if (Array.isArray(histRes)) {
        setHistory(histRes);
      }
    } catch (err) {
      console.warn(`[ConfigView] Error loading domain '${domain}':`, getErrorMessage(err));
      setStatusMsg({ type: 'error', text: `Failed to load domain config: ${getErrorMessage(err)}` });
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    loadDomainConfig(selectedDomain);
  }, [loadDomainConfig, selectedDomain]);

  const handleSave = async () => {
    setStatusMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setStatusMsg({ type: 'error', text: `Invalid JSON payload: ${getErrorMessage(err)}` });
      return;
    }

    setSaving(true);
    try {
      const updated = await adminApiClient.updateAdminDomainConfig(selectedDomain, parsed);
      setStatusMsg({
        type: 'success',
        text: `Configuration for '${selectedDomain}' updated successfully to version ${updated.version || version + 1}. Redis cache updated and invalidation broadcast to microservices.`
      });
      toast.success('Config Saved', `'${selectedDomain}' updated to version ${updated.version || version + 1}.`);
      if (updated.version) setVersion(updated.version);
      if (updated.updated_at) setUpdatedAt(updated.updated_at);
      // Refresh history
      const hist = await adminApiClient.getDomainConfigHistory(selectedDomain).catch(() => []);
      if (Array.isArray(hist)) setHistory(hist);
    } catch (err) {
      setStatusMsg({ type: 'error', text: getErrorMessage(err) || 'Failed to save configuration' });
      toast.error('Config Save Failed', err);
    } finally {
      setSaving(false);
    }
  };



  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <Card className="bg-gradient-to-r from-appCard to-appCard/80 border-appBorder">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sliders size={18} className="text-appPrimary" />
              <h2 className="text-sm font-black text-appTextPrimary uppercase tracking-wider">
                Central Dynamic Configuration Engine
              </h2>
              <Badge variant="primary">v{version}</Badge>
            </div>
            <p className="text-xs text-appTextSecondary mt-1">
              Admin-owned configurations. Mutations update PostgreSQL &amp; Redis, and broadcast instant Pub/Sub invalidation to all microservices (Gateway, Auth, Quota, Payment, Chat).
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-appTextSecondary">Pub/Sub Channel: <code className="font-mono text-appPrimary">config_invalidation</code></span>
          </div>
        </div>
      </Card>

      {/* Domain Selection Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {CONFIG_DOMAINS.map((domain) => (
          <button
            key={domain.id}
            onClick={() => setSelectedDomain(domain.id)}
            className={`p-3 rounded-md border text-left transition-all flex flex-col justify-between ${
              selectedDomain === domain.id
                ? 'bg-appPrimary/10 border-appPrimary text-appTextPrimary shadow-md'
                : 'bg-appCard border-appBorder text-appTextSecondary hover:border-appBorder/80 hover:text-appTextPrimary'
            }`}
          >
            <div>
              <span className="text-xs font-bold block">{domain.label}</span>
              <span className="text-[10px] text-appTextSecondary mt-1 line-clamp-2">{domain.desc}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-md bg-appBg border border-appBorder">
                {domain.id}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Domain Editor & History Section */}
      <Card>
        {/* Sub Header & Tab Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-appBorder mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
              <Code2 size={14} className="text-appPrimary" />
              Domain: <span className="font-mono text-appPrimary">{selectedDomain}</span>
            </h3>
            {updatedAt && (
              <span className="text-[10px] text-appTextSecondary font-mono mt-0.5 block">
                Last modified: {new Date(updatedAt).toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-appBg p-0.5 border border-appBorder rounded-md">
              <button
                onClick={() => setActiveTab('editor')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'editor' ? 'bg-appPrimary text-white font-bold' : 'text-appTextSecondary hover:text-appTextPrimary'
                }`}
              >
                Config Payload
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                  activeTab === 'history' ? 'bg-appPrimary text-white font-bold' : 'text-appTextSecondary hover:text-appTextPrimary'
                }`}
              >
                <History size={12} /> Audit History ({history.length})
              </button>
            </div>

            <Button size="sm" variant="outline" onClick={() => loadDomainConfig(selectedDomain)}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </div>

        {/* Status Notification */}
        {statusMsg && (
          <div
            className={`p-3 mb-4 rounded-md border text-xs flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {statusMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Tab 1: Editor */}
        {activeTab === 'editor' && (
          <div className="space-y-4">
            {isReadOnlyDomain && (
              <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs flex items-start gap-2">
                <Lock size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  This is a live, read-only snapshot of the real plans table. Quota, pricing, and feature-flag
                  edits here would never reach the Quota Service — use the <strong>Plans &amp; Billing</strong> page
                  instead, which writes to Postgres and the Redis keys the Quota Service actually reads.
                </span>
              </div>
            )}
            <div className="relative">
              <textarea
                value={jsonText}
                onChange={(e) => !isReadOnlyDomain && setJsonText(e.target.value)}
                readOnly={isReadOnlyDomain}
                rows={16}
                spellCheck={false}
                className={`w-full p-4 bg-appBg font-mono text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary leading-relaxed ${isReadOnlyDomain ? 'opacity-70 cursor-not-allowed' : ''}`}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-appBorder">
              <span className="text-[11px] text-appTextSecondary">
                {isReadOnlyDomain
                  ? 'Refresh to pull the latest snapshot after changing plans on the Plans & Billing page.'
                  : 'Saving will trigger 3-Tier invalidation across Redis and memory caches in under 1 sec.'}
              </span>

              {!isReadOnlyDomain && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1.5"
                    onClick={() => setJsonText(JSON.stringify(configData, null, 2))}
                  >
                    <RotateCcw size={12} /> Reset Changes
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
                    <Save size={12} className="mr-1.5" />
                    {saving ? 'Broadcasting Update...' : 'Save & Publish Config'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: History Audit Log */}
        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? (
              <p className="text-xs text-appTextSecondary text-center py-8">
                No previous version history recorded for domain '{selectedDomain}'.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                      <th className="pb-3 font-bold">Version</th>
                      <th className="pb-3 font-bold">Admin ID</th>
                      <th className="pb-3 font-bold">Timestamp</th>
                      <th className="pb-3 font-bold">Changes Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-appBorder/40">
                    {history.map((item, idx) => (
                      <tr key={idx} className="hover:bg-appBg/10 transition-colors">
                        <td className="py-3 font-mono font-bold text-appPrimary">v{item.version}</td>
                        <td className="py-3 font-mono text-appTextPrimary">{item.admin_id || 'System'}</td>
                        <td className="py-3 text-appTextSecondary font-mono">
                          {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-3 text-appTextSecondary font-mono text-[11px] max-w-xs truncate">
                          {JSON.stringify(item.data || {})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ConfigView;
