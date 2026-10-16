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
  DollarSign, Plus, Trash2, X, Save,
  TrendingDown, PieChart as PieIcon, Layers
} from 'lucide-react';
import {
  ResponsiveContainer, Tooltip as ChartTooltip, Cell, PieChart, Pie
} from 'recharts';
import { adminApiClient } from '../../api/adminApiClient';
import { toast, getErrorMessage } from '../../store/toastStore';

interface CostLedgerViewProps {
  activeSubItem?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  infra: '#00BAD1',
  ai_api: '#7367F0',
  saas: '#FF4C51',
  support: '#28C76F',
  marketing: '#FF9F43',
  other: '#97959E',
};

const CATEGORY_LABELS: Record<string, string> = {
  infra: 'Infrastructure / Cloud',
  ai_api: 'AI API Services',
  saas: 'SaaS Software Tools',
  support: 'Support & Ops',
  marketing: 'Marketing & Ads',
  other: 'Other Expenses',
};

const CostLedgerView: React.FC<CostLedgerViewProps> = () => {
  const [entries, setEntries] = useState<Wire.CostEntry[]>([]);
  const [, setSummary] = useState<Wire.CostSummary[]>([]);
  const [revenueData, setRevenueData] = useState<{mrr: number; total_revenue_paid: number}>({ mrr: 0, total_revenue_paid: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [periodFilter, setPeriodFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [, setTotpCode] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const { sort, toggleSort } = useSortToggle<'category' | 'month' | 'amount'>();

  const currentMonth = new Date().toISOString().substring(0, 7);

  const [form, setForm] = useState({
    category: 'infra',
    description: '',
    amount_usd: '',
    period_month: currentMonth,
    currency: 'USD',
    vendor: '',
    invoice_ref: '',
  });

  const fetchData = useCommittedEvent(async () => {

    try {
      const [costRes, summaryRes, revRes] = await Promise.all([
        adminApiClient.getCostLedger({ period_month: periodFilter || undefined, category: categoryFilter || undefined }),
        adminApiClient.getCostSummary(),
        adminApiClient.getRevenueSummary().catch(() => ({ mrr: 0, total_revenue_paid: 0 })),
      ]);

      setEntries(costRes && Array.isArray(costRes.data) ? costRes.data : []);
      setSummary(summaryRes && Array.isArray(summaryRes.data) ? summaryRes.data : []);
      setRevenueData(revRes || { mrr: 0, total_revenue_paid: 0 });
    } catch (err) {
      console.warn('[CostLedgerView] Error loading data:', getErrorMessage(err));
      setEntries([]);
      setSummary([]);
      setRevenueData({ mrr: 0, total_revenue_paid: 0 });
      toast.error('Failed to Load Cost Ledger', 'Could not reach the admin API for financial data.');
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    fetchData();
  }, [periodFilter, categoryFilter, fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!form.description || !form.amount_usd || !form.period_month) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    const amt = parseFloat(form.amount_usd);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      await adminApiClient.createCostEntry({
        category: form.category,
        description: form.description,
        amount_usd: amt,
        period_month: form.period_month,
        currency: form.currency,
        vendor: form.vendor || undefined,
        invoice_ref: form.invoice_ref || undefined,
      });

      setIsModalOpen(false);
      setForm({
        category: 'infra',
        description: '',
        amount_usd: '',
        period_month: currentMonth,
        currency: 'USD',
        vendor: '',
        invoice_ref: '',
      });
      setTotpCode('');
      fetchData();
      toast.success('Expense Logged', `${form.description} added to the cost ledger.`);
    } catch (err) {
      setErrorMsg(getErrorMessage(err, 'Failed to create cost entry'));
      toast.error('Expense Not Saved', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense record?')) return;
    try {
      await adminApiClient.deleteCostEntry(id);
      fetchData();
      toast.success('Expense Deleted', 'The cost ledger entry has been removed.');
    } catch (err) {
      toast.error('Delete Failed', err);
    }
  };

  // Calculations
  const totalExpenseUSD = entries.reduce((acc, curr) => acc + (curr.amount_usd || 0), 0);
  const mrr = Number(revenueData.mrr || 0);
  const grossMarginUSD = mrr - totalExpenseUSD;
  const grossMarginPct = mrr > 0 ? ((grossMarginUSD / mrr) * 100).toFixed(1) : '0';

  // Category Pie Data
  const categoryTotals: Record<string, number> = {};
  entries.forEach((e) => {
    const cat = e.category || 'other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount_usd || 0);
  });
  const pieData = Object.entries(categoryTotals).map(([cat, val]) => ({
    name: CATEGORY_LABELS[cat] || cat,
    value: val,
    color: CATEGORY_COLORS[cat] || '#97959E',
  }));

  const getEntrySortValue = (row: Wire.CostEntry, key: string) => {
    if (key === 'category') return CATEGORY_LABELS[row.category] || row.category || '';
    if (key === 'month') return row.period_month || '';
    if (key === 'amount') return Number(row.amount_usd) || 0;
    return '';
  };
  const sortedEntries = sortRows(entries, sort, getEntrySortValue);
  const entryPagination = usePagination(sortedEntries, 8);

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Total Logged Expenses"
          value={`$${totalExpenseUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          tone="cyan"
          trend={<span className="text-appTextSecondary">All categories</span>}
        />
        <StatCard
          label="Monthly Recurring Revenue (MRR)"
          value={`$${mrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon={TrendingDown}
          tone="emerald"
          trend={<span className="text-emerald-500 font-semibold">Active Subscriptions</span>}
        />
        <StatCard
          label="Calculated Gross Margin"
          value={`${grossMarginPct}%`}
          icon={PieIcon}
          tone="purple"
          trend={
            <span className={Number(grossMarginPct) > 70 ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>
              {Number(grossMarginPct) > 70 ? 'Optimal Infrastructure' : 'High Overhead'}
            </span>
          }
        />
        <StatCard
          label="Net Operating Margin"
          value={`$${grossMarginUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon={Layers}
          tone="amber"
          trend={<span className="text-appTextSecondary">MRR - Operating Costs</span>}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Table (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-appBorder/50 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary">
                  Cost Ledger Registry
                </h3>
                <Badge variant="primary">{entries.length}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  className="px-2 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
                />

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-2 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
                >
                  <option value="">All Categories</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>

                <Button size="sm" variant="primary" onClick={() => setIsModalOpen(true)}>
                  <Plus size={12} className="mr-1" /> Add Expense
                </Button>
              </div>
            </div>

            {loading ? (
              <p className="text-xs text-appTextSecondary animate-pulse py-8 text-center">
                Loading financial ledger...
              </p>
            ) : entries.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-xs text-appTextSecondary">No cost entries logged for this period.</p>
                <Button size="sm" variant="outline" className="mt-3 flex items-center gap-1.5" onClick={() => setIsModalOpen(true)}>
                  <Plus size={13} /> Add First Expense
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                      <SortableHeader label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
                      <th className="pb-3 font-bold">Description / Vendor</th>
                      <SortableHeader label="Month" sortKey="month" sort={sort} onSort={toggleSort} />
                      <SortableHeader label="Amount (USD)" sortKey="amount" sort={sort} onSort={toggleSort} align="right" />
                      <th className="pb-3 text-center font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-appBorder/40">
                    {entryPagination.paged.map((item) => (
                      <tr key={item.id} className="hover:bg-appBg/10 transition-colors">
                        <td className="py-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                            style={{ backgroundColor: CATEGORY_COLORS[item.category] || '#97959E' }}
                          >
                            {CATEGORY_LABELS[item.category] || item.category}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="font-bold text-appTextPrimary">{item.description}</div>
                          <div className="text-[10px] text-appTextSecondary font-mono">
                            {item.vendor ? `Vendor: ${item.vendor}` : ''}{' '}
                            {item.invoice_ref ? `| Ref: ${item.invoice_ref}` : ''}
                          </div>
                        </td>
                        <td className="py-3 text-appTextSecondary font-mono">{item.period_month}</td>
                        <td className="py-3 text-right font-black font-mono text-appTextPrimary">
                          ${Number(item.amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-appTextSecondary hover:text-appError p-1 transition-colors"
                            title="Delete Entry"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  page={entryPagination.page}
                  totalPages={entryPagination.totalPages}
                  totalItems={entryPagination.totalItems}
                  pageSize={entryPagination.pageSize}
                  onChange={entryPagination.setPage}
                />
              </div>
            )}
          </Card>
        </div>

        {/* Right Breakdown Sidebar */}
        <div className="space-y-6">
          <Card className="h-[320px] flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-4">
              Expense Distribution
            </h3>
            {pieData.length === 0 ? (
              <p className="text-xs text-appTextSecondary text-center my-auto">No expenses recorded.</p>
            ) : (
              <div className="flex-1 w-full min-h-0 text-xs">
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-3">
              Cost Allocation Strategy
            </h3>
            <p className="text-xs text-appTextSecondary leading-relaxed">
              Log all third-party expenditures (AWS, Vercel, Supabase, OpenAI, SendGrid) to maintain zero-hardcoded accuracy for Gross Margin reporting.
            </p>
          </Card>
        </div>
      </div>

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-appCard border border-appBorder rounded-md max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-2 border-b border-appBorder">
              <h3 className="text-sm font-bold text-appTextPrimary uppercase tracking-wider">
                Log Operational Expense
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-appTextSecondary hover:text-appTextPrimary">
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-md">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Production EC2 & S3 Monthly Bill"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                    Amount (USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={form.amount_usd}
                    onChange={(e) => setForm({ ...form, amount_usd: e.target.value })}
                    className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                    Billing Period (YYYY-MM) *
                  </label>
                  <input
                    type="month"
                    required
                    value={form.period_month}
                    onChange={(e) => setForm({ ...form, period_month: e.target.value })}
                    className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                    Vendor (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Amazon Web Services"
                    value={form.vendor}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                    Invoice / Receipt Ref (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-081"
                    value={form.invoice_ref}
                    onChange={(e) => setForm({ ...form, invoice_ref: e.target.value })}
                    className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-appBorder">
                <Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setIsModalOpen(false)}>
                  <X size={13} /> Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={submitting} className="flex items-center gap-1.5">
                  <Save size={13} /> {submitting ? 'Saving...' : 'Save Expense Record'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CostLedgerView;
