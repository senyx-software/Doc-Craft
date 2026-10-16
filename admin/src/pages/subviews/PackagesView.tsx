import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import { ProviderAllowanceNotice } from '../../components/infrastructure/ProviderLimitsInfo';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { ToggleLeft, ToggleRight, Briefcase, Zap, UserCheck, RefreshCw, Edit2, X, Save, Plus } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, Legend } from 'recharts';
import { adminApiClient } from '../../api/adminApiClient';
import { toast } from '../../store/toastStore';

interface PackagesViewProps {
  activeSubItem: string;
}

// Sentinel quota value meaning "no daily/monthly cap" — mirrors
// UNLIMITED_QUOTA in the admin-api and Quota Service backends.
const UNLIMITED_QUOTA = -1;

// Discrete stops for the quota slider, 1 through Unlimited (the last stop).
// A raw <input type="range"> can't represent "unlimited" as a numeric max,
// so the slider drives an index into this scale instead of the quota value
// directly — the value shown/saved is QUOTA_STEPS[index].
const QUOTA_STEPS = [1, 3, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, UNLIMITED_QUOTA];

function quotaToStepIndex(value: number): number {
  const exact = QUOTA_STEPS.indexOf(value);
  if (exact !== -1) return exact;
  // A value that isn't one of the curated stops (e.g. a legacy/custom
  // number) snaps to the nearest stop at or below it.
  let nearest = 0;
  for (let i = 0; i < QUOTA_STEPS.length - 1; i++) {
    if (QUOTA_STEPS[i] <= value) nearest = i;
  }
  return nearest;
}

function formatQuota(value: number): string {
  return value === UNLIMITED_QUOTA ? 'Unlimited' : value.toLocaleString();
}

const QuotaSlider: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => {
  const stepIndex = quotaToStepIndex(value);
  const isUnlimited = value === UNLIMITED_QUOTA;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{label}</label>
        <span className={`text-xs font-extrabold ${isUnlimited ? 'text-emerald-500' : 'text-gray-900 dark:text-white'}`}>
          {formatQuota(value)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={QUOTA_STEPS.length - 1}
        step={1}
        value={stepIndex}
        onChange={(e) => onChange(QUOTA_STEPS[parseInt(e.target.value, 10)])}
        className="w-full accent-purple-600 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
        <span>1</span>
        <span>Unlimited</span>
      </div>
    </div>
  );
};

const PackagesView: React.FC<PackagesViewProps> = ({ activeSubItem }) => {
  // ── Plans (real — Payment/admin-api `plans` table) ───────────────────────
  const [plans, setPlans] = useState<Wire.Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Wire.Plan | null>(null);

  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideQuota, setOverrideQuota] = useState('1000');
  const [overrideReason, setOverrideReason] = useState('');

  const [newPlan, setNewPlan] = useState({
    name: '', code: '', description: '', price_usd_monthly: '', price_usd_yearly: '', price_lkr_monthly: '', price_lkr_yearly: '', billing_currency: 'USD' as 'USD' | 'LKR', paddle_price_yearly_id: '',
    monthly_quota: '100', payhere_plan_id: '', paddle_price_id: '',
  });
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  const loadLivePlans = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getPlans();
      setPlans(Array.isArray(data) ? data : []);
    } catch {
      setPlans([]);
      toast.error('Failed to Load Plans', 'Could not reach the admin API.');
    } finally {
      setIsLoading(false);
    }
  });



  const handleGrantOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideUserId || !overrideQuota || !overrideReason) {
      toast.warning('Missing Fields', 'User ID, custom quota, and a mandatory audit reason are all required.');
      return;
    }
    try {
      await adminApiClient.grantQuotaOverride(overrideUserId, parseInt(overrideQuota), overrideReason);
      toast.success('Quota Override Granted', `${overrideQuota} usage units granted for user ${overrideUserId}. Audit record logged.`);
      setShowOverrideModal(false);
      setOverrideUserId('');
      setOverrideReason('');
    } catch (err) {
      toast.error('Quota Override Failed', err);
    }
  };

  const handleSavePlanEdit = async () => {
    if (!editingPlan) return;
    try {
      await adminApiClient.updatePlan(editingPlan.id, editingPlan);
      setEditingPlan(null);
      toast.success('Plan Saved', `${editingPlan.name} specs saved and Redis cache invalidated.`);
      loadLivePlans();
    } catch (err) {
      toast.error('Plan Save Failed', err);
    }
  };

  const [togglingPlanId, setTogglingPlanId] = useState<string | null>(null);

  const handleToggleActive = async (plan: Wire.Plan) => {
    const isCurrentlyActive = (plan.status || 'active') === 'active';
    const nextStatus = isCurrentlyActive ? 'draft' : 'active';
    setTogglingPlanId(plan.id);
    try {
      await adminApiClient.updatePlan(plan.id, { status: nextStatus });
      toast.success(
        nextStatus === 'active' ? 'Plan Activated' : 'Plan Deactivated',
        nextStatus === 'active'
          ? `${plan.name} is live again — its quota is back in Redis for the Quota Service.`
          : `${plan.name} is now inactive — its quota key was removed, so no user can generate under it until reactivated.`,
      );
      loadLivePlans();
    } catch (err) {
      toast.error('Status Change Failed', err);
    } finally {
      setTogglingPlanId(null);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlan.name || !newPlan.code || !newPlan.monthly_quota) {
      toast.warning('Missing Fields', 'Name, code, and daily quota are required.');
      return;
    }
    setIsCreatingPlan(true);
    try {
      await adminApiClient.createPlan({
        name: newPlan.name,
        code: newPlan.code.toLowerCase(),
        description: newPlan.description || undefined,
        price_usd_monthly: parseFloat(newPlan.price_usd_monthly) || 0,
        price_usd_yearly: parseFloat(newPlan.price_usd_yearly) || 0,
        billing_currency: newPlan.billing_currency,
        price_lkr_monthly: newPlan.price_lkr_monthly === '' ? null : Number(newPlan.price_lkr_monthly),
        price_lkr_yearly: newPlan.price_lkr_yearly === '' ? null : Number(newPlan.price_lkr_yearly),
        paddle_price_yearly_id: newPlan.paddle_price_yearly_id || null,
        billing_interval: 'both',
        monthly_quota: parseInt(newPlan.monthly_quota),
        payhere_plan_id: newPlan.payhere_plan_id || undefined,
        paddle_price_id: newPlan.paddle_price_id || undefined,
      });
      toast.success('Plan Created', `${newPlan.name} is live and synced to Redis.`);
      setNewPlan({ name: '', code: '', description: '', price_usd_monthly: '', price_usd_yearly: '', price_lkr_monthly: '', price_lkr_yearly: '', billing_currency: 'USD' as 'USD' | 'LKR', paddle_price_yearly_id: '', monthly_quota: '100', payhere_plan_id: '', paddle_price_id: '' });
      loadLivePlans();
    } catch (err) {
      toast.error('Plan Creation Failed', err);
    } finally {
      setIsCreatingPlan(false);
    }
  };

  // ── Feature Flags per Plan (real — Config Engine `feature_flags` domain) ─
  const [flags, setFlags] = useState<Record<string, Wire.FeatureFlag>>({});
  const [isLoadingFlags, setIsLoadingFlags] = useState(true);
  const [isSavingFlags, setIsSavingFlags] = useState(false);

  const loadFeatureFlags = useCommittedEvent(async () => {

    try {
      const res = await adminApiClient.getAdminDomainConfig<Record<string, Wire.FeatureFlag>>('feature_flags');
      setFlags(res?.data || {});
    } catch {
      setFlags({});
      toast.error('Failed to Load Feature Flags', 'Could not reach the Config Engine.');
    } finally {
      setIsLoadingFlags(false);
    }
  });

  const toggleFlag = (flagId: string, planKey: 'free' | 'pro' | 'max') => {
    setFlags((prev) => {
      const flag = prev[flagId] || { type: 'boolean', default: false, plan_matrix: {} };
      const matrix = { ...(flag.plan_matrix || {}) };
      matrix[planKey] = !matrix[planKey];
      return { ...prev, [flagId]: { ...flag, plan_matrix: matrix } };
    });
  };

  const saveFeatureFlags = async () => {
    setIsSavingFlags(true);
    try {
      await adminApiClient.updateAdminDomainConfig('feature_flags', flags);
      toast.success('Feature Flags Saved', 'Config Engine broadcast the update to all subscribed services.');
    } catch (err) {
      toast.error('Save Failed', err);
    } finally {
      setIsSavingFlags(false);
    }
  };

  // ── AI Model Routing per Plan (real — Config Engine `ai_model_routing`, ──
  // consumed live by the Chat service's model router) ─────────────────────
  const [aiRouting, setAiRouting] = useState<Record<string, { max_model?: string; groq_models?: string[] }>>({});
  const [isLoadingAiRouting, setIsLoadingAiRouting] = useState(true);
  const [isSavingAiRouting, setIsSavingAiRouting] = useState(false);

  const loadAiRouting = useCommittedEvent(async () => {

    try {
      const res = await adminApiClient.getAdminDomainConfig<Wire.ModelRouting>('ai_model_routing');
      setAiRouting(res?.data || {});
    } catch {
      setAiRouting({});
      toast.error('Failed to Load AI Routing Config', 'Could not reach the Config Engine.');
    } finally {
      setIsLoadingAiRouting(false);
    }
  });

  const setMaxModel = (planKey: string, model: string) => {
    setAiRouting((prev) => ({ ...prev, [planKey]: { ...prev[planKey], groq_models: model.split(',').map(value => value.trim()).filter(Boolean) } }));
  };

  const saveAiRouting = async () => {
    setIsSavingAiRouting(true);
    try {
      await adminApiClient.updateAdminDomainConfig('ai_model_routing', aiRouting);
      toast.success('AI Routing Updated', 'Plan model preferences saved. Provider account limits remain unchanged.');
    } catch (err) {
      toast.error('Save Failed', err);
    } finally {
      setIsSavingAiRouting(false);
    }
  };

  // ── Plan Performance (real — Auth signups x Payment conversions) ────────
  const [performanceData, setPerformanceData] = useState<Array<{ name: string; signups: number; conversions: number }>>([]);
  const [isLoadingPerformance, setIsLoadingPerformance] = useState(true);

  const loadPerformance = useCommittedEvent(async () => {

    try {
      const res = await adminApiClient.getPlanPerformance();
      setPerformanceData((res.data || []).map((p) => ({ name: p.name, signups: p.signups, conversions: p.conversions })));
    } catch {
      setPerformanceData([]);
      toast.error('Failed to Load Plan Performance', 'Could not reach the admin API.');
    } finally {
      setIsLoadingPerformance(false);
    }
  });
useEffect(() => {
    if (activeSubItem === 'pack_current' || activeSubItem === 'pack_create' || activeSubItem === 'subs_plan_overview' || activeSubItem === 'pack_performance') {
      loadLivePlans();
    }
    if (activeSubItem === 'pack_flags') loadFeatureFlags();
    if (activeSubItem === 'pack_ai_models') loadAiRouting();
    if (activeSubItem === 'pack_performance') loadPerformance();
  }, [activeSubItem, loadAiRouting, loadFeatureFlags, loadLivePlans, loadPerformance]);

  // ── Current Plans / Create New Plan ──────────────────────────────────────
  if (activeSubItem === 'pack_current' || activeSubItem === 'subs_plan_overview') {
    return (
      <div className="space-y-6 text-left">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
              <Briefcase size={16} className="text-purple-600 dark:text-purple-400" />
              Active Subscription Plans & Gateway Mapping
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Synced with the Payment Service `plans` table & Redis invalidation bus.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadLivePlans} disabled={isLoading} className="flex items-center gap-1">
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Reload Plans
            </Button>
            <Button variant="violet" size="sm" onClick={() => setShowOverrideModal(true)} className="flex items-center gap-1.5">
              <UserCheck size={14} /> Grant Custom Quota Override
            </Button>
          </div>
        </div>

        <ProviderAllowanceNotice />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.length === 0 ? (
            <p className="text-xs text-appTextSecondary col-span-3 text-center py-8">
              {isLoading ? 'Loading plans…' : 'No plans found.'}
            </p>
          ) : (
            plans.map((p) => (
              <Card key={p.id} className="flex flex-col justify-between min-h-[260px]">
                <div className="text-left space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200/60 dark:border-white/10">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">{p.name}</span>
                    <Badge variant={p.code === 'pro' ? 'primary' : p.code === 'max' ? 'success' : 'secondary'}>
                      {(p.code || p.id).toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xl font-extrabold text-gray-900 dark:text-white">{p.billing_currency || 'USD'} {p.billing_currency === 'LKR' ? p.price_lkr_monthly ?? 'Unconfigured' : p.price_usd_monthly} / mo</p>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 font-medium">
                    <li>• Daily Quota: <span className="font-bold text-gray-900 dark:text-white">{p.monthly_quota === UNLIMITED_QUOTA ? 'Unlimited' : `${(p.monthly_quota || 0).toLocaleString()} usage units`}</span></li>
                    <li>• PayHere ID: <span className="font-mono text-[10px] bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded-md">{p.payhere_plan_id || '—'}</span></li>
                    <li>• Paddle Price ID: <span className="font-mono text-[10px] bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded-md">{p.paddle_price_id || '—'}</span></li>
                  </ul>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 dark:border-white/10">
                    <span className={`text-xs font-bold uppercase ${(p.status || 'active') === 'active' ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {p.status || 'active'}
                    </span>
                    <button
                      onClick={() => handleToggleActive(p)}
                      disabled={togglingPlanId === p.id}
                      title={(p.status || 'active') === 'active' ? 'Deactivate plan' : 'Activate plan'}
                      className="p-0.5 hover:scale-110 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {(p.status || 'active') === 'active' ? (
                        <ToggleRight size={26} className="text-emerald-500" />
                      ) : (
                        <ToggleLeft size={26} className="text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-4 flex items-center justify-center gap-1.5" onClick={() => setEditingPlan(p)}>
                  <Edit2 size={12} /> Configure Plan Specs
                </Button>
              </Card>
            ))
          )}
        </div>

        {editingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 rounded-md shadow-2xl max-w-md max-h-[90vh] overflow-y-auto w-full p-6 space-y-4 animate-fade-in">
              <div className="pb-3 border-b border-gray-200/60 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Edit Package Properties: {editingPlan.name}
                </h3>
                <button onClick={() => setEditingPlan(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-lg font-bold leading-none">&times;</button>
              </div>
              <div className="space-y-3">
                <Input label="Plan Name" value={editingPlan.name} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} />
                <Input label="Price USD Monthly" type="number" value={editingPlan.price_usd_monthly} onChange={e => setEditingPlan({ ...editingPlan, price_usd_monthly: parseFloat(e.target.value) || 0 })} />
                <Input label="Price USD Yearly" type="number" min="0" step="0.01" value={editingPlan.price_usd_yearly} onChange={e => setEditingPlan({ ...editingPlan, price_usd_yearly: Number(e.target.value) })} />
                <label className="block text-sm">Billing currency
                  <select aria-label="Billing currency" value={editingPlan.billing_currency || 'USD'} onChange={e => setEditingPlan({ ...editingPlan, billing_currency: e.target.value === 'LKR' ? 'LKR' : 'USD' })} className="block w-full p-2 bg-transparent border rounded">
                    <option value="USD">USD — Paddle</option><option value="LKR">LKR — PayHere</option>
                  </select>
                </label>
                <Input label="Price LKR Monthly" type="number" min="0" step="0.01" value={editingPlan.price_lkr_monthly ?? ''} onChange={e => setEditingPlan({ ...editingPlan, price_lkr_monthly: e.target.value === '' ? null : Number(e.target.value) })} />
                <Input label="Price LKR Yearly" type="number" min="0" step="0.01" value={editingPlan.price_lkr_yearly ?? ''} onChange={e => setEditingPlan({ ...editingPlan, price_lkr_yearly: e.target.value === '' ? null : Number(e.target.value) })} />
                <Input label="Paddle Yearly Price ID" value={editingPlan.paddle_price_yearly_id || ''} onChange={e => setEditingPlan({ ...editingPlan, paddle_price_yearly_id: e.target.value })} />
                <QuotaSlider
                  label="AI + server PDF allowance"
                  value={editingPlan.monthly_quota}
                  onChange={(v) => setEditingPlan({ ...editingPlan, monthly_quota: v })}
                />
                <Input label="Allowance window (hours from first request)" type="number" min="1" max="720" value={Number(editingPlan.feature_flags?.quota_window_hours ?? 20)} onChange={e=>setEditingPlan({...editingPlan,feature_flags:{...editingPlan.feature_flags,quota_window_hours:Number(e.target.value)}})} />
                <Input label="PayHere Plan ID" value={editingPlan.payhere_plan_id || ''} onChange={e => setEditingPlan({ ...editingPlan, payhere_plan_id: e.target.value })} />
                <Input label="Paddle Price ID" value={editingPlan.paddle_price_id || ''} onChange={e => setEditingPlan({ ...editingPlan, paddle_price_id: e.target.value })} />
              </div>
              <div className="pt-3 border-t border-gray-200/60 dark:border-white/10 flex justify-end gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setEditingPlan(null)}><X size={12} /> Cancel</Button>
                <Button variant="violet" size="sm" className="flex items-center gap-1.5" onClick={handleSavePlanEdit}><Save size={12} /> Save Plan Specs</Button>
              </div>
            </div>
          </div>
        )}

        {showOverrideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <Card className="max-w-md w-full p-6 space-y-4 border-gray-200 dark:border-white/10 shadow-2xl relative">
              <div className="pb-3 border-b border-gray-200/60 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck size={18} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Grant Custom User Quota Override</h3>
                </div>
                <button onClick={() => setShowOverrideModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">✕</button>
              </div>
              <form onSubmit={handleGrantOverride} className="space-y-4">
                <Input label="Target User ID or Email" value={overrideUserId} onChange={e => setOverrideUserId(e.target.value)} placeholder="e.g. usr-2401 or client@company.com" required />
                <QuotaSlider
                  label="Custom AI + server PDF allowance"
                  value={parseInt(overrideQuota, 10) || 1}
                  onChange={(v) => setOverrideQuota(String(v))}
                />
                <Input label="Mandatory Audit Log Justification Reason" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="e.g. Enterprise VIP trial extension approved by Support" required />
                <div className="pt-2 flex justify-end gap-2 border-t border-gray-200/60 dark:border-white/10">
                  <Button type="button" variant="outline" className="flex items-center gap-1.5" onClick={() => setShowOverrideModal(false)}><X size={12} /> Cancel</Button>
                  <Button type="submit" variant="violet" className="flex items-center gap-1.5"><UserCheck size={12} /> Grant Override</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    );
  }

  if (activeSubItem === 'pack_create') {
    return (
      <Card className="max-w-2xl mx-auto text-left">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Plus size={16} className="text-purple-600 dark:text-purple-400" /> Create New Plan
        </h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-4">
          Writes directly to the real `plans` table and syncs Redis so Quota/Gateway/Payment pick it up immediately.
        </p>
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Plan Name *" value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="e.g. Startup Tier" required />
            <Input label="Plan Code *" value={newPlan.code} onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value })} placeholder="e.g. startup" required />
          </div>
          <Input label="Description" value={newPlan.description} onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })} placeholder="Optional short description" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Price / Month (USD)" type="number" value={newPlan.price_usd_monthly} onChange={(e) => setNewPlan({ ...newPlan, price_usd_monthly: e.target.value })} placeholder="49.00" />
            <Input label="Price / Year (USD)" type="number" value={newPlan.price_usd_yearly} onChange={(e) => setNewPlan({ ...newPlan, price_usd_yearly: e.target.value })} placeholder="490.00" />
            <label className="block text-sm">Billing currency
              <select aria-label="New plan billing currency" value={newPlan.billing_currency} onChange={e => setNewPlan({ ...newPlan, billing_currency: e.target.value === 'LKR' ? 'LKR' : 'USD' })} className="block w-full p-2 bg-transparent border rounded">
                <option value="USD">USD — Paddle</option><option value="LKR">LKR — PayHere</option>
              </select>
            </label>
            <Input label="Price / Month (LKR)" type="number" min="0" step="0.01" value={newPlan.price_lkr_monthly} onChange={e => setNewPlan({ ...newPlan, price_lkr_monthly: e.target.value })} />
            <Input label="Price / Year (LKR)" type="number" min="0" step="0.01" value={newPlan.price_lkr_yearly} onChange={e => setNewPlan({ ...newPlan, price_lkr_yearly: e.target.value })} />
            <Input label="Paddle Yearly Price ID" value={newPlan.paddle_price_yearly_id} onChange={e => setNewPlan({ ...newPlan, paddle_price_yearly_id: e.target.value })} />
          </div>
          <QuotaSlider
            label="Daily AI + PDF allowance *"
            value={parseInt(newPlan.monthly_quota, 10) || 100}
            onChange={(v) => setNewPlan({ ...newPlan, monthly_quota: String(v) })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="PayHere Plan ID" value={newPlan.payhere_plan_id} onChange={(e) => setNewPlan({ ...newPlan, payhere_plan_id: e.target.value })} placeholder="PH-STARTUP-01" />
            <Input label="Paddle Price ID" value={newPlan.paddle_price_id} onChange={(e) => setNewPlan({ ...newPlan, paddle_price_id: e.target.value })} placeholder="pri_startup_monthly" />
          </div>
          <Button type="submit" variant="violet" className="w-full" disabled={isCreatingPlan}>
            <Plus size={14} /> {isCreatingPlan ? 'Creating…' : 'Create Plan'}
          </Button>
        </form>
      </Card>
    );
  }

  // ── Feature Flags per Plan ────────────────────────────────────────────────
  if (activeSubItem === 'pack_flags') {
    const flagIds = Object.keys(flags);
    return (
      <Card className="text-left">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
            <Zap size={16} className="text-purple-600 dark:text-purple-400" /> Plan-Level Feature Flags Matrix
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadFeatureFlags} disabled={isLoadingFlags}>
              <RefreshCw size={12} className={isLoadingFlags ? 'animate-spin' : ''} /> Reload
            </Button>
            <Button variant="violet" size="sm" onClick={saveFeatureFlags} disabled={isSavingFlags}>
              <Save size={12} /> {isSavingFlags ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-4">
          Backed by the Config Engine's `feature_flags` domain — changes broadcast to subscribed services via Redis pub/sub.
        </p>
        {flagIds.length === 0 ? (
          <p className="text-xs text-appTextSecondary text-center py-8">{isLoadingFlags ? 'Loading…' : 'No feature flags configured.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Feature Flag Identifier</th>
                  <th className="pb-3 text-center font-bold">Free Tier</th>
                  <th className="pb-3 text-center font-bold">Pro Tier</th>
                  <th className="pb-3 text-center font-bold">Max Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {flagIds.map((flagId) => {
                  const flag = flags[flagId];
                  const matrix = flag.plan_matrix || {};
                  return (
                    <tr key={flagId} className="hover:bg-purple-500/5 transition-colors">
                      <td className="py-4">
                        <p className="font-bold text-gray-900 dark:text-white">{flagId.replace(/_/g, ' ')}</p>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{flagId}</span>
                      </td>
                      {(['free', 'pro', 'max'] as const).map((planKey) => (
                        <td key={planKey} className="py-4 text-center">
                          <button onClick={() => toggleFlag(flagId, planKey)} className="p-1 hover:scale-110 transition-transform">
                            {matrix[planKey] ? (
                              <ToggleRight size={24} className="text-emerald-500 mx-auto" />
                            ) : (
                              <ToggleLeft size={24} className="text-gray-400 mx-auto" />
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    );
  }

  // ── AI Model Routing per Plan ─────────────────────────────────────────────
  if (activeSubItem === 'pack_ai_models') {
    return (
      <div className="space-y-6 text-left">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200/60 dark:border-white/10">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
              <Zap size={18} className="text-purple-600 dark:text-purple-400" /> AI Model Routing (per Plan)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Active Groq requests and fallback use this allowlist. Unconfigured plans use the service model list; an empty list disables provider calls. Changes reach Chat within five seconds. Provider account limits apply separately.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAiRouting} disabled={isLoadingAiRouting}>
              <RefreshCw size={12} className={isLoadingAiRouting ? 'animate-spin' : ''} /> Reload
            </Button>
            <Button variant="violet" size="sm" onClick={saveAiRouting} disabled={isSavingAiRouting}>
              <Save size={12} /> {isSavingAiRouting ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>

        <ProviderAllowanceNotice />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(['free', 'pro', 'max'] as const).map((planKey) => (
            <Card key={planKey} className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200/60 dark:border-white/10">
                <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">{planKey} Tier</h4>
                <Badge variant={planKey === 'free' ? 'secondary' : planKey === 'pro' ? 'primary' : 'success'}>{planKey.toUpperCase()}</Badge>
              </div>
              <div className="text-xs">
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Allowed Groq models (comma separated)</label>
                <input
                  value={aiRouting[planKey]?.groq_models?.join(', ') ?? ''}
                  placeholder="Use Config Editor to clear the policy and restore service defaults"
                  onChange={(e) => setMaxModel(planKey, e.target.value)}
                  className="input-field w-full text-xs font-mono !py-1.5"
                />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Plan Performance ──────────────────────────────────────────────────────
  if (activeSubItem === 'pack_performance') {
    return (
      <Card className="h-[340px] flex flex-col text-left">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
            Customer Plan Performance (Signups vs. Active Paid Conversions)
          </h3>
          <Button variant="outline" size="sm" onClick={loadPerformance} disabled={isLoadingPerformance}>
            <RefreshCw size={12} className={isLoadingPerformance ? 'animate-spin' : ''} /> Reload
          </Button>
        </div>
        <div className="flex-1 w-full text-xs">
          {performanceData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-appTextSecondary">
              {isLoadingPerformance ? 'Loading…' : 'No plan data available.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData}>
                <XAxis dataKey="name" stroke="#97959E" fontSize={10} />
                <YAxis stroke="#97959E" fontSize={10} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="signups" fill="#7367F0" name="Total Signups" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversions" fill="#28C76F" name="Active Paid Subscribers" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    );
  }

  return null;
};

export default PackagesView;
