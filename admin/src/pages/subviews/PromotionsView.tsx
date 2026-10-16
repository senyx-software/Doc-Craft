import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { Trash2, Plus, Search, Gift, Tag, Clock, RefreshCw, UserPlus, CheckCircle2 } from 'lucide-react';
import { toast } from '../../store/toastStore';
import { adminApiClient } from '../../api/adminApiClient';

interface PromotionsViewProps {
  activeSubItem: string;
}

const PromotionsView: React.FC<PromotionsViewProps> = ({ activeSubItem }) => {
  // ── Coupons (real — Payment Service's own `coupons` table, the same one
  // validated at real checkout) ────────────────────────────────────────────
  const [coupons, setCoupons] = useState<Wire.Coupon[]>([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'percent' | 'fixed'>('percent');
  const [newVal, setNewVal] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [newExpiry, setNewExpiry] = useState('');

  const loadCoupons = useCommittedEvent(async () => {

    try {
      const res = await adminApiClient.getCoupons();
      setCoupons(res.data || []);
    } catch {
      setCoupons([]);
      toast.error('Failed to Load Coupons', 'Could not reach the Payment service.');
    } finally {
      setIsLoadingCoupons(false);
    }
  });

  const handleAddCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newVal || !newExpiry) {
      toast.warning('Missing Fields', 'Code, discount amount, and expiration date are required.');
      return;
    }
    try {
      await adminApiClient.createCoupon({
        code: newCode.toUpperCase(),
        discount_type: newType,
        value: parseFloat(newVal),
        expires_at: new Date(newExpiry).toISOString(),
        usage_limit: newLimit ? parseInt(newLimit) : undefined,
      });
      toast.success('Coupon Created', `${newCode.toUpperCase()} is live and redeemable at checkout.`);
      setNewCode(''); setNewVal(''); setNewLimit(''); setNewExpiry('');
      loadCoupons();
    } catch (err) {
      toast.error('Coupon Creation Failed', err);
    }
  };

  const handleArchiveCoupon = async (id: string, code: string) => {
    try {
      await adminApiClient.archiveCoupon(id);
      toast.success('Coupon Archived', `${code} can no longer be redeemed.`);
      loadCoupons();
    } catch (err) {
      toast.error('Archive Failed', err);
    }
  };

  // ── A/B Tests (real — PostHog Experiments API) ──────────────────────────
  const [abTestsState, setAbTestsState] = useState<{configured: boolean; message?: string; error?: string; experiments: Wire.Experiment[]}>({ configured: false, experiments: [] });
  const [isLoadingAbTests, setIsLoadingAbTests] = useState(true);

  const loadAbTests = useCommittedEvent(async () => {

    try {
      const res = await adminApiClient.getAbTests();
      setAbTestsState(res);
    } catch {
      setAbTestsState({ configured: false, message: 'Could not reach admin-api.', experiments: [] });
    } finally {
      setIsLoadingAbTests(false);
    }
  });

  // ── Referral Program (real — Auth Service `referrals` table) ────────────
  const [referrals, setReferrals] = useState<Wire.Referral[]>([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(true);
  const [refReferrerId, setRefReferrerId] = useState('');
  const [refReferredEmail, setRefReferredEmail] = useState('');
  const [refCode, setRefCode] = useState('');

  const loadReferrals = useCommittedEvent(async () => {

    try {
      const res = await adminApiClient.getReferrals();
      setReferrals(res.data || []);
    } catch {
      setReferrals([]);
      toast.error('Failed to Load Referrals', 'Could not reach the Auth service.');
    } finally {
      setIsLoadingReferrals(false);
    }
  });

  const handleAddReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refReferrerId || !refReferredEmail || !refCode) {
      toast.warning('Missing Fields', 'Referrer user ID, referred email, and a code are all required.');
      return;
    }
    try {
      await adminApiClient.createReferral(refReferrerId, refReferredEmail, refCode);
      toast.success('Referral Recorded', `Tracking ${refReferredEmail} as referred by ${refReferrerId}.`);
      setRefReferrerId(''); setRefReferredEmail(''); setRefCode('');
      loadReferrals();
    } catch (err) {
      toast.error('Failed to Record Referral', err);
    }
  };

  const handleConvertReferral = async (id: string) => {
    try {
      const res = await adminApiClient.convertReferral(id);
      if (res.warnings.length > 0) {
        toast.warning('Converted With Warnings', res.warnings.join(' '));
      } else {
        toast.success('Referral Converted', 'Reward quota bonus granted to the referrer.');
      }
      loadReferrals();
    } catch (err) {
      toast.error('Conversion Failed', err);
    }
  };

  // ── Trial Management (real — Payment Service Subscription table) ────────
  const [trials, setTrials] = useState<Wire.Trial[]>([]);
  const [isLoadingTrials, setIsLoadingTrials] = useState(true);
  const [trialUserId, setTrialUserId] = useState('');
  const [trialPlan, setTrialPlan] = useState('pro');
  const [trialDays, setTrialDays] = useState('14');

  const loadTrials = useCommittedEvent(async () => {

    try {
      const res = await adminApiClient.getTrials();
      setTrials(res.data || []);
    } catch {
      setTrials([]);
      toast.error('Failed to Load Trials', 'Could not reach the Payment service.');
    } finally {
      setIsLoadingTrials(false);
    }
  });

  const handleStartTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trialUserId || !trialPlan || !trialDays) return;
    try {
      await adminApiClient.startTrial(trialUserId, trialPlan, parseInt(trialDays));
      toast.success('Trial Started', `${trialUserId} now has ${trialPlan} access for ${trialDays} days.`);
      setTrialUserId('');
      loadTrials();
    } catch (err) {
      toast.error('Failed to Start Trial', err);
    }
  };

  const handleExtendTrial = async (id: string) => {
    try {
      await adminApiClient.extendTrial(id, 7);
      toast.success('Trial Extended', 'Trial period extended by 7 days.');
      loadTrials();
    } catch (err) {
      toast.error('Extend Failed', err);
    }
  };

  const handleEndTrial = async (id: string) => {
    try {
      await adminApiClient.endTrial(id);
      toast.success('Trial Ended', 'Trial subscription cancelled.');
      loadTrials();
    } catch (err) {
      toast.error('End Trial Failed', err);
    }
  };

  useEffect(() => {
    if (activeSubItem === 'promo_coupons' || activeSubItem === 'promo_active') loadCoupons();
    if (activeSubItem === 'promo_ab_tests') loadAbTests();
    if (activeSubItem === 'promo_referrals') loadReferrals();
    if (activeSubItem === 'promo_trials') loadTrials();
  }, [activeSubItem, loadAbTests, loadCoupons, loadReferrals, loadTrials]);

  // Search / filter (coupons + referrals share this toolbar shape)
  const [searchTerm, setSearchTerm] = useState('');

  const renderFilterToolbar = (titleText: string, badgeCount: number, onReload?: () => void, isLoading?: boolean) => (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200/60 dark:border-white/10 mb-4 text-left">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
          <Gift size={16} className="text-purple-600 dark:text-purple-400" />
          {titleText}
        </h3>
        <Badge variant="primary">{badgeCount}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="input-field pl-8 !py-1 w-40"
          />
        </div>
        {onReload && (
          <Button variant="outline" size="sm" onClick={onReload} disabled={isLoading}>
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Reload
          </Button>
        )}
      </div>
    </div>
  );

  // ── Coupon Codes / Active Promotions ─────────────────────────────────────
  if (activeSubItem === 'promo_coupons' || activeSubItem === 'promo_active') {
    const filteredCoupons = coupons.filter((c) =>
      c.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
        <Card className="lg:col-span-2">
          {renderFilterToolbar('Active Discount Coupons', filteredCoupons.length, loadCoupons, isLoadingCoupons)}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Coupon Code</th>
                  <th className="pb-3 font-bold">Discount Value</th>
                  <th className="pb-3 font-bold">Usage</th>
                  <th className="pb-3 font-bold">Expires</th>
                  <th className="pb-3 text-right font-bold">Archive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {filteredCoupons.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">{isLoadingCoupons ? 'Loading coupons…' : 'No coupons match your search.'}</td></tr>
                ) : (
                  filteredCoupons.map((c) => (
                    <tr key={c.id} className="hover:bg-purple-500/5 transition-colors">
                      <td className="py-3 font-mono font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                        <Tag size={12} /> {c.code}
                      </td>
                      <td className="py-3 text-gray-900 dark:text-white font-bold">
                        {c.discount_type === 'percent' ? `${c.value}%` : `$${c.value.toFixed(2)} USD`}
                      </td>
                      <td className="py-3 text-gray-500 dark:text-gray-400 font-medium">
                        {c.usage_count} / {c.usage_limit ?? '∞'} used
                      </td>
                      <td className="py-3 text-gray-500 dark:text-gray-400 font-semibold">
                        <Badge variant={c.is_expired ? 'danger' : 'success'}>
                          {new Date(c.expires_at).toLocaleDateString()}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <button onClick={() => handleArchiveCoupon(c.id, c.code)} className="p-1 text-gray-400 hover:text-rose-500 transition-colors" title="Archive Coupon">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Create Discount Coupon
          </h3>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-4">
            Writes directly to the Payment Service's coupon table — the same one validated at real checkout.
          </p>
          <form onSubmit={handleAddCoupon} className="space-y-4">
            <Input label="Promo Code" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. DISCOUNT30" required />
            <div className="text-left">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Discount Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'percent' | 'fixed')}
                className="w-full px-4 py-2.5 text-xs bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
              >
                <option value="percent">Percentage Discount (%)</option>
                <option value="fixed">Fixed Amount ($ USD)</option>
              </select>
            </div>
            <Input label="Discount Amount" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="e.g. 30" type="number" required />
            <Input label="Max Redemptions (optional)" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} placeholder="e.g. 500" type="number" />
            <Input label="Expiration Date" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} type="date" required />
            <Button type="submit" variant="violet" className="w-full">
              <Plus size={14} /> Create Coupon
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // ── A/B Tests ─────────────────────────────────────────────────────────────
  if (activeSubItem === 'promo_ab_tests') {
    return (
      <Card className="text-left">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
            A/B Test Campaigns (PostHog Experiments)
          </h3>
          <Button variant="outline" size="sm" onClick={loadAbTests} disabled={isLoadingAbTests}>
            <RefreshCw size={12} className={isLoadingAbTests ? 'animate-spin' : ''} /> Reload
          </Button>
        </div>

        {!abTestsState.configured ? (
          <div className="text-center py-10 text-xs text-gray-500 dark:text-gray-400">
            <p className="font-bold mb-1">PostHog Experiments not configured</p>
            <p>{abTestsState.message || 'Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in admin-api to pull real experiments.'}</p>
          </div>
        ) : abTestsState.error ? (
          <div className="text-center py-10 text-xs text-rose-500">{abTestsState.error}</div>
        ) : abTestsState.experiments.length === 0 ? (
          <div className="text-center py-10 text-xs text-gray-500 dark:text-gray-400">No experiments found in PostHog.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Experiment Name</th>
                  <th className="pb-3 font-bold">Feature Flag Key</th>
                  <th className="pb-3 font-bold">Variants</th>
                  <th className="pb-3 text-right font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {abTestsState.experiments.map((test) => (
                  <tr key={test.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-bold text-gray-900 dark:text-white">{test.name}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400 font-mono">{test.feature_flag_key}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400">{(test.variants || []).join(' / ') || '—'}</td>
                    <td className="py-3 text-right">
                      <Badge variant={test.status === 'Running' ? 'success' : test.status === 'Completed' ? 'primary' : 'warning'}>{test.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    );
  }

  // ── Referral Program ──────────────────────────────────────────────────────
  if (activeSubItem === 'promo_referrals') {
    const filteredReferrals = referrals.filter((r) =>
      (r.referrerUserId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.referredEmail || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
        <Card className="lg:col-span-2">
          {renderFilterToolbar('Customer Referrals & Rewards', filteredReferrals.length, loadReferrals, isLoadingReferrals)}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Referrer</th>
                  <th className="pb-3 font-bold">Referred Email</th>
                  <th className="pb-3 font-bold">Code</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {filteredReferrals.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">{isLoadingReferrals ? 'Loading referrals…' : 'No referrals recorded yet.'}</td></tr>
                ) : (
                  filteredReferrals.map((r) => (
                    <tr key={r.id} className="hover:bg-purple-500/5 transition-colors">
                      <td className="py-3 text-gray-900 dark:text-white font-bold font-mono">{r.referrerUserId}</td>
                      <td className="py-3 text-gray-900 dark:text-white font-bold">{r.referredEmail}</td>
                      <td className="py-3 text-gray-500 dark:text-gray-400 font-mono">{r.code}</td>
                      <td className="py-3">
                        <Badge variant={r.status === 'converted' ? 'success' : 'warning'}>{r.status}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        {r.status !== 'converted' && (
                          <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => handleConvertReferral(r.id)}>
                            <CheckCircle2 size={12} /> Mark Converted
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Record a Referral
          </h3>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            Signup-time attribution isn't automated yet — this is how an admin logs a verified referral so it can
            be tracked and rewarded. Converting grants the referrer a real 20-document quota bonus for 30 days.
          </p>
          <form onSubmit={handleAddReferral} className="space-y-4">
            <Input label="Referrer User ID" value={refReferrerId} onChange={(e) => setRefReferrerId(e.target.value)} placeholder="e.g. usr_abc123" required />
            <Input label="Referred Email" value={refReferredEmail} onChange={(e) => setRefReferredEmail(e.target.value)} placeholder="new-signup@example.com" type="email" required />
            <Input label="Referral Code" value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="e.g. NISAL10" required />
            <Button type="submit" variant="violet" className="w-full">
              <UserPlus size={14} /> Record Referral
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // ── Trial Management ──────────────────────────────────────────────────────
  if (activeSubItem === 'promo_trials') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
        <Card className="lg:col-span-2">
          {renderFilterToolbar('Trial Period Managers & Extensions', trials.length, loadTrials, isLoadingTrials)}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">User</th>
                  <th className="pb-3 font-bold">Plan</th>
                  <th className="pb-3 font-bold">Started</th>
                  <th className="pb-3 font-bold">Expires</th>
                  <th className="pb-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {trials.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">{isLoadingTrials ? 'Loading trials…' : 'No active trials.'}</td></tr>
                ) : (
                  trials.map((t) => (
                    <tr key={t.id} className="hover:bg-purple-500/5 transition-colors">
                      <td className="py-3 text-gray-900 dark:text-white font-bold font-mono">{t.user_id}</td>
                      <td className="py-3 text-gray-500 dark:text-gray-400 font-semibold uppercase">{t.plan}</td>
                      <td className="py-3 text-gray-500 dark:text-gray-400">{new Date(t.started_at || '').toLocaleDateString()}</td>
                      <td className="py-3">
                        <Badge variant={t.is_expired ? 'danger' : 'success'}>{new Date(t.expires_at || '').toLocaleDateString()}</Badge>
                      </td>
                      <td className="py-3 text-right space-x-1.5">
                        <Button variant="outline" size="sm" className="flex items-center gap-1.5 inline-flex" onClick={() => handleExtendTrial(t.id)}>
                          <Clock size={12} /> +7 Days
                        </Button>
                        <Button variant="outline" size="sm" className="inline-flex" onClick={() => handleEndTrial(t.id)}>
                          End
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Start a Trial
          </h3>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            Grants real Pro/Enterprise access immediately via the Payment Service. There is no scheduled job to
            auto-expire a trial yet — an expired trial is flagged for you to End manually.
          </p>
          <form onSubmit={handleStartTrial} className="space-y-4">
            <Input label="User ID" value={trialUserId} onChange={(e) => setTrialUserId(e.target.value)} placeholder="e.g. usr_abc123" required />
            <div className="text-left">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">Plan</label>
              <select
                value={trialPlan}
                onChange={(e) => setTrialPlan(e.target.value)}
                className="w-full px-4 py-2.5 text-xs bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
              >
                <option value="pro">Pro</option>
                <option value="max">Max</option>
              </select>
            </div>
            <Input label="Duration (Days)" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} type="number" required />
            <Button type="submit" variant="violet" className="w-full">
              <Plus size={14} /> Start Trial
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return null;
};

export default PromotionsView;
