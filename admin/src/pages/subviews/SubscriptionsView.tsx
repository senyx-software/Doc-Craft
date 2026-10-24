import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import Pagination from '../../components/ui/Pagination';
import { usePagination } from '../../hooks/usePagination';
import SortableHeader from '../../components/ui/SortableHeader';
import { sortRows, useSortToggle } from '../../hooks/useSortToggle';
import {
  ShieldAlert, CheckCircle2, Search, RefreshCw, CreditCard,
  Users, AlertCircle, FileText, Edit2, X
} from 'lucide-react';
import { adminApiClient } from '../../api/adminApiClient';
import { toast } from '../../store/toastStore';

interface SubscriptionsViewProps {
  activeSubItem: string;
}

const EMPTY_STATS = { total: 0, active: 0, cancelled: 0, past_due: 0, trialing: 0 };

const SubscriptionsView: React.FC<SubscriptionsViewProps> = ({ activeSubItem }) => {
  // Live data from Payment Service Prisma DB
  const [subscriptions, setSubscriptions] = useState<Wire.Subscription[]>([]);
  const [invoices, setInvoices] = useState<Wire.Invoice[]>([]);
  const [plans, setPlans] = useState<Wire.Plan[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, cancelled: 0, past_due: 0, trialing: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // Search and Date Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Plan editor modal state
  const [editingPlan, setEditingPlan] = useState<Wire.Plan | null>(null);

  const loadData = useCommittedEvent(async () => {

    try {
      const [subsRes, invRes, statsRes, plansRes] = await Promise.allSettled([
        adminApiClient.getSubscriptions({ limit: 200 }),
        adminApiClient.getInvoices({ limit: 200 }),
        adminApiClient.getSubscriptionStats(),
        adminApiClient.getPlans(),
      ]);

      const subsList = subsRes.status === 'fulfilled' && subsRes.value
        ? (Array.isArray(subsRes.value) ? subsRes.value : (subsRes.value.data || []))
        : [];
      setSubscriptions(subsList);

      const invList = invRes.status === 'fulfilled' && invRes.value
        ? (Array.isArray(invRes.value) ? invRes.value : (invRes.value.data || []))
        : [];
      setInvoices(invList);

      const statsValue = statsRes.status === 'fulfilled' ? statsRes.value : null;
      setStats(statsValue && statsValue.total > 0 ? {
        total:     statsValue.total     ?? 0,
        active:    statsValue.active    ?? 0,
        cancelled: statsValue.cancelled ?? 0,
        past_due:  statsValue.past_due  ?? 0,
        trialing:  statsValue.trialing ?? 0,
      } : EMPTY_STATS);

      const plansList = plansRes.status === 'fulfilled' && Array.isArray(plansRes.value) ? plansRes.value : [];
      setPlans(plansList);
    } catch (err) {
      console.warn('[SubscriptionsView] data load warning:', err);
      setSubscriptions([]);
      setInvoices([]);
      setStats(EMPTY_STATS);
      setPlans([]);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [referenceTime] = useState(Date.now);

  // Date matching helper — uses real current date
  const matchesDate = (itemDate: string) => {
    const cleanDate = (itemDate || '').substring(0, 10);
    if (dateFilter === 'all') return true;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(referenceTime - 86400000).toISOString().split('T')[0];
    if (dateFilter === 'today')     return cleanDate === today;
    if (dateFilter === 'yesterday') return cleanDate === yesterday;
    if (dateFilter === 'range') {
      if (!startDate && !endDate) return true;
      if (startDate && cleanDate < startDate) return false;
      if (endDate   && cleanDate > endDate)   return false;
      return true;
    }
    return true;
  };

  // Filtered subscription list
  const filteredSubs = subscriptions.filter(s => {
    const uid     = (s.user_id    || s.userId    || '').toLowerCase();
    const plan    = (s.plan_name  || s.planName  || s.plan || '').toLowerCase();
    const subId   = (s.id         || '').toLowerCase();
    const gateway = (s.gateway    || '').toLowerCase();
    const search  = searchTerm.toLowerCase();
    const matchesSearch = uid.includes(search) || plan.includes(search) || subId.includes(search) || gateway.includes(search);
    const dateStr = s.created_at || s.createdAt || '';
    return matchesSearch && matchesDate(String(dateStr));
  });

  const activeSubs    = filteredSubs.filter(s => s.status === 'active');
  const cancelledSubs = filteredSubs.filter(s => ['canceled', 'cancelled'].includes(s.status));


  // Resolved unconditionally so the pagination hook always runs regardless
  // of which activeSubItem branch ends up rendering.
  const { sort: subSort, toggleSort: toggleSubSort } = useSortToggle<'plan' | 'gateway' | 'amount' | 'period_start'>();
  const getSubSortValue = (s: Wire.Subscription, key: string) => {
    if (key === 'plan') return s.plan_name || s.planName || s.plan || '';
    if (key === 'gateway') return s.gateway || '';
    if (key === 'amount') return Number(s.amount) || 0;
    if (key === 'period_start') return s.current_period_start || '';
    return '';
  };
  const currentSubList =
    activeSubItem === 'subs_active' ? activeSubs :
    activeSubItem === 'subs_cancelled' ? cancelledSubs :
    filteredSubs;
  const sortedSubList = sortRows(currentSubList, subSort, getSubSortValue);
  const subPagination = usePagination(sortedSubList, 8);

  // Filtered invoice list (used for failed payments & refunds)
  const filteredInvoices = invoices.filter(inv => {
    const uid    = (inv.user_id || '').toLowerCase();
    const invId  = (inv.id || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    const matchesSearch = uid.includes(search) || invId.includes(search);
    const dateStr = inv.created_at || '';
    return matchesSearch && matchesDate(String(dateStr));
  });

  const failedInvoices = filteredInvoices.filter(inv =>
    ['uncollectible', 'void', 'failed', 'open'].includes((inv.status || '').toLowerCase())
  );

  // Reusable filter toolbar
  const renderFilterToolbar = (titleText: string, badgeCount: number) => (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-appBorder/50 mb-4 text-left">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary">
          {titleText}
        </h3>
        <Badge variant="primary">{badgeCount}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-appTextSecondary/60" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search user ID, plan, gateway..."
            className="pl-8 pr-3 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary w-48"
          />
        </div>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-2 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="range">Custom Range</option>
        </select>

        {dateFilter === 'range' && (
          <div className="flex items-center gap-1">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-0.5 bg-appBg text-[10px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none" />
            <span className="text-[10px] text-appTextSecondary">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-0.5 bg-appBg text-[10px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none" />
          </div>
        )}

        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>
  );

  // Subscription table renderer
  const renderSubTable = (dataList: Wire.Subscription[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
            <th className="pb-3 font-bold">Sub ID</th>
            <th className="pb-3 font-bold">User ID</th>
            <SortableHeader label="Plan" sortKey="plan" sort={subSort} onSort={toggleSubSort} />
            <SortableHeader label="Gateway" sortKey="gateway" sort={subSort} onSort={toggleSubSort} />
            <th className="pb-3 font-bold">Status</th>
            <SortableHeader label="Amount" sortKey="amount" sort={subSort} onSort={toggleSubSort} />
            <SortableHeader label="Period Start" sortKey="period_start" sort={subSort} onSort={toggleSubSort} />
            <th className="pb-3 font-bold">Period End</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-appBorder/40">
          {dataList.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-xs text-appTextSecondary font-mono">
                {isLoading ? 'Fetching live subscriptions from Payment Service...' : 'No subscription records found.'}
              </td>
            </tr>
          ) : (
            dataList.map((sub) => {
              const subStatus = (sub.status || 'unknown').toLowerCase();
              const badgeVariant =
                subStatus === 'active'   ? 'success'   :
                subStatus === 'canceled' || subStatus === 'cancelled' ? 'secondary' :
                subStatus === 'past_due' ? 'warning'   : 'danger';

              const periodStart = sub.current_period_start;
              const periodEnd   = sub.current_period_end;
              const fmtDate = (d: string | undefined) => d ? new Date(d).toLocaleDateString() : '—';
              const amount  = sub.amount != null ? `${Number(sub.amount).toFixed(2)} ${sub.currency || 'Currency unavailable'}` : '—';

              return (
                <tr key={sub.id} className="hover:bg-appBg/10 transition-colors">
                  <td className="py-3 font-mono text-[10px] text-appTextSecondary truncate max-w-[110px]" title={sub.id}>{sub.id}</td>
                  <td className="py-3 font-mono text-[10px] text-appTextSecondary truncate max-w-[110px]" title={sub.user_id || sub.userId}>
                    {(sub.user_id || sub.userId || '—').substring(0, 16)}…
                  </td>
                  <td className="py-3 font-bold text-appTextPrimary">{sub.plan_name || sub.planName || sub.plan || '—'}</td>
                  <td className="py-3 text-appTextSecondary capitalize">{sub.gateway || '—'}</td>
                  <td className="py-3"><Badge variant={badgeVariant}>{subStatus.toUpperCase()}</Badge></td>
                  <td className="py-3 font-mono font-bold text-appTextPrimary">{amount}{sub.billing_cycle&&<span className="block text-xs text-appTextSecondary">{sub.billing_cycle}</span>}</td>
                  <td className="py-3 text-appTextSecondary">{fmtDate(periodStart)}</td>
                  <td className="py-3 text-appTextSecondary">{fmtDate(periodEnd)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // ── Subview: All Subscriptions, Active, Cancelled ──────────────────────────
  if (activeSubItem === 'subs_all' || activeSubItem === 'subs_active' || activeSubItem === 'subs_cancelled') {
    const title =
      activeSubItem === 'subs_active'    ? 'Active Memberships'                :
      activeSubItem === 'subs_cancelled' ? 'Churned / Cancelled Subscriptions' :
      'All Customer Subscriptions';

    // KPI stat cards for overview
    const kpiCards = [
      { label: 'Total Subscriptions', value: stats.total,     icon: Users,       tone: 'blue'   as const },
      { label: 'Active',              value: stats.active,    icon: CheckCircle2, tone: 'emerald' as const },
      { label: 'Cancelled',           value: stats.cancelled, icon: AlertCircle, tone: 'gray'   as const },
      { label: 'Past Due',            value: stats.past_due,  icon: ShieldAlert, tone: 'amber'  as const },
    ];

    return (
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ label, value, icon, tone }) => (
            <StatCard key={label} label={label} value={value} icon={icon} tone={tone} />
          ))}
        </div>

        <Card>
          {renderFilterToolbar(title, currentSubList.length)}
          {renderSubTable(subPagination.paged)}
          <Pagination
            page={subPagination.page}
            totalPages={subPagination.totalPages}
            totalItems={subPagination.totalItems}
            pageSize={subPagination.pageSize}
            onChange={subPagination.setPage}
          />
        </Card>
      </div>
    );
  }

  // ── Subview: Failed Payments ───────────────────────────────────────────────
  if (activeSubItem === 'subs_failed') {
    return (
      <Card>
        {renderFilterToolbar('Failed & Overdue Invoices (Payment Gateway)', failedInvoices.length)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Invoice ID</th>
                <th className="pb-3 font-bold">User ID</th>
                <th className="pb-3 font-bold">Amount</th>
                <th className="pb-3 font-bold">Currency</th>
                <th className="pb-3 font-bold">Gateway</th>
                <th className="pb-3 font-bold">Date</th>
                <th className="pb-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-appBorder/40">
              {failedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-appTextSecondary font-mono">
                    {isLoading ? 'Fetching invoices from Payment Service...' : 'No failed payment records found.'}
                  </td>
                </tr>
              ) : (
                failedInvoices.map((inv, idx) => (
                  <tr key={inv.id || idx} className="hover:bg-appBg/10 transition-colors">
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary truncate max-w-[110px]">{inv.id}</td>
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">
                      {(inv.user_id || '—').substring(0, 16)}
                    </td>
                    <td className="py-3 font-bold font-mono text-appTextPrimary">
                      {inv.amount != null ? `${Number(inv.amount).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 text-appTextSecondary uppercase">{inv.currency || 'Currency unavailable'}</td>
                    <td className="py-3 text-purple-500 capitalize flex items-center gap-1">
                      <ShieldAlert size={12} /> {inv.gateway || '—'}
                    </td>
                    <td className="py-3 text-appTextSecondary">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3"><Badge variant="warning">{(inv.status || '').toUpperCase()}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  // ── Subview: Refunds (paid invoices reversed / void) ──────────────────────
  if (activeSubItem === 'subs_refunds') {
    const refundedInvoices = filteredInvoices.filter(inv =>
      ['void', 'refunded', 'credited'].includes((inv.status || '').toLowerCase())
    );

    return (
      <Card>
        {renderFilterToolbar('Billing Refunds & Voided Invoices', refundedInvoices.length)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Invoice ID</th>
                <th className="pb-3 font-bold">User ID</th>
                <th className="pb-3 font-bold">Gateway Invoice ID</th>
                <th className="pb-3 font-bold">Amount</th>
                <th className="pb-3 font-bold">Gateway</th>
                <th className="pb-3 font-bold">Date</th>
                <th className="pb-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-appBorder/40">
              {refundedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-appTextSecondary font-mono">
                    {isLoading ? 'Loading refund records...' : 'No refund records found.'}
                  </td>
                </tr>
              ) : (
                refundedInvoices.map((inv, idx) => (
                  <tr key={inv.id || idx} className="hover:bg-appBg/10 transition-colors">
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">{inv.id}</td>
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">
                      {(inv.user_id || '—').substring(0, 16)}
                    </td>
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">
                      {inv.gateway_invoice_id || '—'}
                    </td>
                    <td className="py-3 font-bold font-mono text-appError">
                      {inv.amount != null ? `${Number(inv.amount).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 text-appTextSecondary capitalize">{inv.gateway || '—'}</td>
                    <td className="py-3 text-appTextSecondary">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 flex items-center gap-1 text-appSuccess font-semibold">
                      <CheckCircle2 size={12} /> {(inv.status || '').toUpperCase()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  // ── Subview: Plan Overview (live from Admin DB plans table) ────────────────
  if (activeSubItem === 'subs_plan_overview') {
    const planTiers = plans.length > 0 ? plans : [];

    const handleSavePlanEdit = async () => {
      if (!editingPlan) return;
      try {
        await adminApiClient.updatePlan(editingPlan.id, {
          name:              editingPlan.name,
          price_usd_monthly: Number(editingPlan.price_usd_monthly),
          price_usd_yearly:  Number(editingPlan.price_usd_yearly),
          monthly_quota:     Number(editingPlan.monthly_quota),
          feature_flags:     editingPlan.feature_flags || {},
        });
        await loadData();
        toast.success('Plan Updated', `${editingPlan.name} pricing and quota saved.`);
        setEditingPlan(null);
      } catch (err) {
        // Keep the modal open on failure — closing it here made a failed
        // save look identical to a successful one, with zero indication an
        // admin's edits never actually persisted.
        toast.error('Plan Update Failed', err);
      }
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {planTiers.length === 0 && isLoading ? (
            <Card className="col-span-3 py-12 text-center text-xs text-appTextSecondary font-mono">
              Fetching live plan definitions from database...
            </Card>
          ) : planTiers.length === 0 ? (
            <Card className="col-span-3 py-12 text-center text-xs text-appTextSecondary font-mono">
              No plans found in database.
            </Card>
          ) : (
            planTiers.map((plan, idx) => {
              const features = plan.feature_flags || {};
              const monthlyPrice = plan.price_usd_monthly != null
                ? `$${Number(plan.price_usd_monthly).toFixed(2)} / mo`
                : 'Free';
              const quota = plan.monthly_quota ? `${plan.monthly_quota.toLocaleString()} / month` : 'Unlimited';

              return (
                <Card key={plan.id} className="flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-appBorder mb-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-appTextPrimary">{plan.name}</span>
                      <Badge variant={idx === 0 ? 'secondary' : idx === 1 ? 'primary' : 'success'}>
                        {idx === 0 ? 'Basic' : idx === 1 ? 'Popular' : 'Premium'}
                      </Badge>
                    </div>
                    <p className="text-xl font-extrabold text-appTextPrimary mb-4">{monthlyPrice}</p>
                    <ul className="text-xs text-appTextSecondary space-y-2 text-left">
                      <li>• Quota: <span className="font-semibold text-appTextPrimary">{quota}</span></li>
                      <li>• Watermark: <span className="font-semibold text-appTextPrimary">
                        {features.watermark_removal ? 'None (Clean)' : 'Yes (Watermarked)'}
                      </span></li>
                      <li>• Custom Fonts: <span className="font-semibold text-appTextPrimary">
                        {features.custom_font_upload ? 'Enabled' : 'Disabled'}
                      </span></li>
                      <li>• PayHere ID: <span className="font-mono text-[10px] text-appTextPrimary">{plan.payhere_plan_id || '—'}</span></li>
                      <li>• Paddle ID: <span className="font-mono text-[10px] text-appTextPrimary">{plan.paddle_price_id || '—'}</span></li>
                      {plan.description && (
                        <li className="text-[10px] mt-2 italic">{plan.description}</li>
                      )}
                    </ul>
                  </div>
                  <Button variant="outline" size="sm" className="w-full mt-4 flex items-center justify-center gap-1.5" onClick={() => setEditingPlan({ ...plan })}>
                    <Edit2 size={12} /> Edit Plan Rules
                  </Button>
                </Card>
              );
            })
          )}
        </div>

        {/* Inline invoices summary */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
              <FileText size={14} className="text-purple-500" />
              Recent Billing Invoices
            </h3>
            <Badge variant="primary">{invoices.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Invoice ID</th>
                  <th className="pb-3 font-bold">User ID</th>
                  <th className="pb-3 font-bold">Amount</th>
                  <th className="pb-3 font-bold">Currency</th>
                  <th className="pb-3 font-bold">Gateway</th>
                  <th className="pb-3 font-bold">Date</th>
                  <th className="pb-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {invoices.slice(0, 10).map((inv, idx) => {
                  const invStatus = (inv.status || '').toLowerCase();
                  const badgeV =
                    invStatus === 'paid'   ? 'success' :
                    invStatus === 'open'   ? 'warning' :
                    invStatus === 'void'   ? 'secondary' : 'danger';
                  return (
                    <tr key={inv.id || idx} className="hover:bg-appBg/10 transition-colors">
                      <td className="py-2 font-mono text-[10px] text-appTextSecondary truncate max-w-[100px]">{inv.id}</td>
                      <td className="py-2 font-mono text-[10px] text-appTextSecondary">
                        {(inv.user_id || '—').substring(0, 14)}
                      </td>
                      <td className="py-2 font-mono font-bold text-appTextPrimary">
                        {inv.amount != null ? `${Number(inv.amount).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 text-appTextSecondary uppercase">{inv.currency || 'Currency unavailable'}</td>
                      <td className="py-2 text-appTextSecondary capitalize">{inv.gateway || '—'}</td>
                      <td className="py-2 text-appTextSecondary">
                        {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2"><Badge variant={badgeV}>{invStatus.toUpperCase() || '—'}</Badge></td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-appTextSecondary font-mono text-[11px]">
                      {isLoading ? 'Loading invoice records...' : 'No invoices yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Plan Edit Modal */}
        {editingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <div className="bg-appSurface border border-appBorder rounded-md shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in">
              <div className="pb-3 border-b border-appBorder flex items-center justify-between">
                <h3 className="text-xs font-black text-appTextPrimary uppercase tracking-wider">
                  Edit {editingPlan.name} Rules
                </h3>
                <button onClick={() => setEditingPlan(null)} className="text-appTextSecondary hover:text-appTextPrimary text-lg font-bold leading-none">&times;</button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Plan Name</label>
                  <input type="text" value={editingPlan.name}
                    onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary" />
                </div>
                <div>
                  <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Monthly Price (USD)</label>
                  <input type="number" value={editingPlan.price_usd_monthly}
                    onChange={e => setEditingPlan({ ...editingPlan, price_usd_monthly: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary" />
                </div>
                <div>
                  <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Yearly Price (USD)</label>
                  <input type="number" value={editingPlan.price_usd_yearly}
                    onChange={e => setEditingPlan({ ...editingPlan, price_usd_yearly: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary" />
                </div>
                <div>
                  <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Daily Quota (Documents)</label>
                  <input type="number" value={editingPlan.monthly_quota}
                    onChange={e => setEditingPlan({ ...editingPlan, monthly_quota: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary" />
                </div>
              </div>

              <div className="pt-3 border-t border-appBorder flex justify-end gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setEditingPlan(null)}><X size={12} /> Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleSavePlanEdit}>
                  <CreditCard size={12} /> Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default SubscriptionsView;
