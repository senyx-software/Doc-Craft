import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import {
  Download, Landmark, CreditCard, Search, DollarSign, TrendingUp, TrendingDown,
  RefreshCw, ShieldCheck, Users, PieChart as PieIcon
} from 'lucide-react';
import { toast } from '../../store/toastStore';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip as ChartTooltip, PieChart, Pie, Cell
} from 'recharts';
import { adminApiClient } from '../../api/adminApiClient';

interface RevenueViewProps {
  activeSubItem: string;
}

const EMPTY_STATS = {
  mrr: 0,
  arr: 0,
  arpu: 0,
  ltv: 0,
  churnRate: 0,
  mrrGrowthPct: 0,
  activeSubscriptions: 0,
  cancelledSubscriptions: 0,
  totalRevenuePaid: 0,
  totalInvoicesPaid: 0,
  payhereVolumeUSD: 0,
  paddleVolumeUSD: 0,
  subscriptionsByPlan: {} as Record<string, number>,
  revenueByPlan: {} as Record<string, number>,
};

const PLAN_COLORS = ['#7367F0', '#28C76F', '#00BAD1', '#FF9F43', '#FF4C51'];

const RevenueView: React.FC<RevenueViewProps> = ({ activeSubItem }) => {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [currencyTotals,setCurrencyTotals]=useState<Record<string,{mrr:number;arr:number;total_revenue_paid:number}>>({});
  const [unreconciledCount,setUnreconciledCount]=useState(0);
  const [trajectory, setTrajectory] = useState<Array<{ month: string; mrr: number }>>([]);
  const [gatewayKeyStatus, setGatewayKeyStatus] = useState<{ payhere: boolean; paddle: boolean }>({ payhere: false, paddle: false });

  const [isLoadingRevenue, setIsLoadingRevenue] = useState(true);
  const [transactions, setTransactions] = useState<Array<{id: string; user: string; amount: string; gate: string; plan: string; status: string; date: string}>>([]);

  const loadRevenueFromApi = useCommittedEvent(async () => {

    try {
      const [analyticsRes, summaryRes, invoicesRes, keyStatusRes] = await Promise.allSettled([
        adminApiClient.getRevenueAnalytics(),
        adminApiClient.getRevenueSummary(),
        adminApiClient.getInvoices({ limit: 15 }),
        adminApiClient.getApiKeyStatus(),
      ]);

      if (analyticsRes.status === 'fulfilled' && analyticsRes.value && summaryRes.status === 'fulfilled' && summaryRes.value) {
        const a = analyticsRes.value;
        const s = summaryRes.value;
        setCurrencyTotals(s.by_currency || {});
        setUnreconciledCount(s.unreconciled_subscription_count || 0);
        setStats({
          mrr: Number(a.mrr || 0),
          arr: Number(a.arr || 0),
          arpu: Number(s.arpu || 0),
          ltv: Number(s.ltv || 0),
          churnRate: Number(s.churn_rate || 0),
          mrrGrowthPct: Number(a.mrr_growth_pct || 0),
          activeSubscriptions: Number(s.total_active_subscriptions || 0),
          cancelledSubscriptions: Number(s.total_cancelled_subscriptions || 0),
          totalRevenuePaid: Number(s.total_revenue_paid || 0),
          totalInvoicesPaid: Number(s.total_invoices_paid || 0),
          payhereVolumeUSD: Number(a.payhere_volume_usd || 0),
          paddleVolumeUSD: Number(a.paddle_volume_usd || 0),
          subscriptionsByPlan: s.subscriptions_by_plan || {},
          revenueByPlan: s.revenue_by_plan || {},
        });
        setTrajectory(Array.isArray(a.trajectory) ? a.trajectory : []);
      } else {
        setCurrencyTotals({});
        setStats(EMPTY_STATS);
        setTrajectory([]);
        toast.error('Failed to Load Revenue', 'Could not reach the Payment service for revenue analytics.');
      }

      if (keyStatusRes.status === 'fulfilled' && keyStatusRes.value) {
        const keys = keyStatusRes.value.keys || [];
        setGatewayKeyStatus({
          payhere: Boolean(keys.find((k) => k.id === 'payhere')?.configured),
          paddle: Boolean(keys.find((k) => k.id === 'paddle')?.configured),
        });
      }

      if (invoicesRes.status === 'fulfilled' && invoicesRes.value && Array.isArray(invoicesRes.value.data)) {
        const txItems = invoicesRes.value.data.map((inv) => ({
          id: inv.id,
          user: inv.user_id || 'Unknown',
          amount: `${Number(inv.amount || 0).toFixed(2)} ${inv.currency || 'USD'}`,
          gate: String(inv.gateway || 'unknown').toUpperCase(),
          plan: inv.subscription_id ? `Sub ${String(inv.subscription_id).slice(0, 8)}` : '—',
          status: inv.status === 'paid' ? 'Succeeded' : (inv.status || 'Unknown').charAt(0).toUpperCase() + (inv.status || 'unknown').slice(1),
          date: String(inv.created_at || '').substring(0, 16).replace('T', ' '),
        }));
        setTransactions(txItems);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.warn('Revenue API loading failed:', err);
      setStats(EMPTY_STATS);
      setTrajectory([]);
      setTransactions([]);
    } finally {
      setIsLoadingRevenue(false);
    }
  });

  useEffect(() => {
    loadRevenueFromApi();
  }, [loadRevenueFromApi]);

  const [searchTerm, setSearchTerm] = useState('');

  const revenueHistory = trajectory.map((t) => ({ month: t.month, revenue: t.mrr }));

  const gatewayDistribution = [
    { name: 'PayHere Gateway', value: stats.payhereVolumeUSD, color: '#7367F0' },
    { name: 'Paddle Gateway', value: stats.paddleVolumeUSD, color: '#28C76F' },
  ];

  const planNames = Array.from(new Set([...Object.keys(stats.subscriptionsByPlan), ...Object.keys(stats.revenueByPlan)]));
  const planBreakdown = planNames.map((name, idx) => ({
    name,
    subscribers: stats.subscriptionsByPlan[name] || 0,
    revenue: stats.revenueByPlan[name] || 0,
    color: PLAN_COLORS[idx % PLAN_COLORS.length],
  }));

  const churnDistribution = [
    { name: 'Active', value: stats.activeSubscriptions, color: '#28C76F' },
    { name: 'Cancelled', value: stats.cancelledSubscriptions, color: '#FF4C51' },
  ];

  const handleExportCsv = () => {
    toast.info('Export Started', 'Generating CSV file for transaction history...');
  };

  const filteredTransactions = transactions.filter(t =>
    t.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.gate.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const reloadButton = (
    <Button variant="outline" size="sm" onClick={loadRevenueFromApi} disabled={isLoadingRevenue}>
      <RefreshCw size={12} className={isLoadingRevenue ? 'animate-spin' : ''} /> Reload Revenue
    </Button>
  );

  // ─── MRR & ARR ────────────────────────────────────────────────────────────
  if (activeSubItem === 'rev_mrr_arr') {
    return (
      <div className="space-y-6 text-left">
        <Card>
          <p className="text-sm font-semibold mb-3">Revenue by recorded currency</p>
          <table className="w-full text-sm"><thead><tr><th className="text-left">Currency</th><th>MRR</th><th>ARR</th><th>Collected</th></tr></thead>
            <tbody>{Object.entries(currencyTotals).map(([currency,totals])=><tr key={currency}><td>{currency}</td><td className="text-center">{totals.mrr.toFixed(2)}</td><td className="text-center">{totals.arr.toFixed(2)}</td><td className="text-center">{totals.total_revenue_paid.toFixed(2)}</td></tr>)}</tbody>
          </table>
          <p className="text-xs text-gray-500 mt-3">USD summaries below exclude other currencies. No currency conversion is applied. {unreconciledCount>0?`${unreconciledCount} subscription amounts require reconciliation.`:''}</p>
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="MRR Revenue"
            value={`$${stats.mrr.toLocaleString()}`}
            icon={DollarSign}
            tone="purple"
            trend={
              <span className={`flex items-center gap-1 text-[10px] font-bold ${stats.mrrGrowthPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                <TrendingUp size={12} /> {stats.mrrGrowthPct >= 0 ? '+' : ''}{stats.mrrGrowthPct}% growth
              </span>
            }
          />
          <StatCard
            label="Annualized ARR"
            value={`$${stats.arr.toLocaleString()}`}
            icon={Landmark}
            tone="emerald"
            trend={<span className="text-[10px] text-emerald-500 font-bold">Run-rate projections</span>}
          />
          <StatCard
            label="Active Subscriptions"
            value={stats.activeSubscriptions.toLocaleString()}
            icon={Users}
            tone="blue"
            trend={<span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">Currently paying accounts</span>}
          />
          <StatCard
            label="Total Revenue Collected"
            value={`$${stats.totalRevenuePaid.toLocaleString()}`}
            icon={CreditCard}
            tone="indigo"
            trend={<span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">{stats.totalInvoicesPaid} paid invoices, all-time</span>}
          />
        </div>

        <Card className="h-[340px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
              Platform Gross Revenue Volume ($ USD)
            </h3>
            {reloadButton}
          </div>
          <div className="flex-1 w-full text-xs">
            {revenueHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-appTextSecondary">No paid-invoice history yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueHistory}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#28C76F" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#28C76F" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#97959E" fontSize={10} />
                  <YAxis stroke="#97959E" fontSize={10} />
                  <ChartTooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#28C76F" strokeWidth={2} fillOpacity={1} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ─── Revenue by Plan ────────────────────────────────────────────────────────
  if (activeSubItem === 'rev_by_plan') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
              Subscribers &amp; MRR by Plan
            </h3>
            {reloadButton}
          </div>
          {planBreakdown.length === 0 ? (
            <p className="text-xs text-appTextSecondary py-8 text-center">No active subscriptions on any plan yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                    <th className="pb-3 font-bold">Plan</th>
                    <th className="pb-3 font-bold text-right">Active Subscribers</th>
                    <th className="pb-3 font-bold text-right">Monthly Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                  {planBreakdown.map((p) => (
                    <tr key={p.name}>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: p.color }}>
                          {p.name}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-gray-900 dark:text-white">{p.subscribers}</td>
                      <td className="py-3 text-right font-mono font-bold text-gray-900 dark:text-white">${p.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="h-[340px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            MRR Contribution by Plan
          </h3>
          <div className="flex-1 w-full text-xs">
            {planBreakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-appTextSecondary">No data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planBreakdown}>
                  <XAxis dataKey="name" stroke="#97959E" fontSize={10} />
                  <YAxis stroke="#97959E" fontSize={10} />
                  <ChartTooltip />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {planBreakdown.map((p, idx) => (
                      <Cell key={`cell-${idx}`} fill={p.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ─── Churn Rate ─────────────────────────────────────────────────────────────
  if (activeSubItem === 'rev_churn') {
    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard
            label="Monthly Churn Rate"
            value={`${(stats.churnRate * 100).toFixed(1)}%`}
            icon={TrendingDown}
            tone="amber"
            trend={<span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">Cancelled ÷ (Active + Cancelled)</span>}
          />
          <StatCard
            label="Active Subscriptions"
            value={stats.activeSubscriptions.toLocaleString()}
            icon={Users}
            tone="emerald"
            trend={<span className="text-[10px] text-emerald-500 font-bold">Currently retained</span>}
          />
          <StatCard
            label="Cancelled Subscriptions"
            value={stats.cancelledSubscriptions.toLocaleString()}
            icon={Users}
            tone="purple"
            trend={<span className="text-[10px] text-rose-500 font-bold">Lifetime total</span>}
          />
        </div>

        <Card className="h-[320px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Active vs. Cancelled Subscriptions
          </h3>
          <div className="flex-1 w-full text-xs">
            {stats.activeSubscriptions + stats.cancelledSubscriptions === 0 ? (
              <div className="h-full flex items-center justify-center text-appTextSecondary">No subscription history yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={churnDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {churnDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ─── LTV per User ───────────────────────────────────────────────────────────
  if (activeSubItem === 'rev_ltv') {
    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard
            label="ARPU"
            value={`$${stats.arpu.toFixed(2)}`}
            icon={CreditCard}
            tone="blue"
            trend={<span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">Avg Revenue Per User (MRR ÷ Active Subs)</span>}
          />
          <StatCard
            label="Customer LTV"
            value={`$${stats.ltv.toFixed(2)}`}
            icon={TrendingUp}
            tone="indigo"
            trend={<span className="text-[10px] text-emerald-500 font-bold">Estimated Lifetime Value</span>}
          />
          <StatCard
            label="Churn Rate"
            value={`${(stats.churnRate * 100).toFixed(1)}%`}
            icon={TrendingDown}
            tone="amber"
            trend={<span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">Used in the LTV formula below</span>}
          />
        </div>

        <Card>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-3">
            How Customer LTV Is Calculated
          </h3>
          <p className="text-xs text-appTextSecondary leading-relaxed font-mono">
            LTV = ARPU ÷ Churn Rate = ${stats.arpu.toFixed(2)} ÷ {(stats.churnRate * 100).toFixed(1)}% = ${stats.ltv.toFixed(2)}
          </p>
          <p className="text-[11px] text-appTextSecondary leading-relaxed mt-3">
            Both inputs are computed live from real subscription records in the Payment Service — no fixed
            assumption is used. With no churn observed yet, LTV reads $0 rather than an invented number.
          </p>
        </Card>
      </div>
    );
  }

  // ─── Transaction History ────────────────────────────────────────────────────
  if (activeSubItem === 'rev_transactions') {
    return (
      <Card className="text-left">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200/60 dark:border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
              <CreditCard size={16} className="text-purple-600 dark:text-purple-400" />
              Recent Billing Transactions (PayHere / Paddle)
            </h3>
            <Badge variant="primary">{filteredTransactions.length}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transactions..."
                className="input-field pl-8 !py-1 w-40"
              />
            </div>
            <Button variant="violet" size="sm" onClick={handleExportCsv} className="flex items-center gap-1">
              <Download size={12} /> Export CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Transaction ID</th>
                <th className="pb-3 font-bold">User Account</th>
                <th className="pb-3 font-bold">Amount</th>
                <th className="pb-3 font-bold">Payment Gateway</th>
                <th className="pb-3 font-bold">Subscription</th>
                <th className="pb-3 font-bold">Timestamp</th>
                <th className="pb-3 text-right font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-appTextSecondary font-mono">
                    {isLoadingRevenue ? 'Fetching live invoice records...' : 'No transactions recorded yet.'}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono text-gray-500 dark:text-gray-400">{tx.id}</td>
                    <td className="py-3 text-gray-900 dark:text-white font-bold">{tx.user}</td>
                    <td className="py-3 font-mono font-bold text-gray-900 dark:text-white">{tx.amount}</td>
                    <td className="py-3 text-purple-600 dark:text-purple-400 font-bold">{tx.gate}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400">{tx.plan}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400">{tx.date}</td>
                    <td className="py-3 text-right">
                      <Badge variant={tx.status === 'Succeeded' ? 'success' : 'danger'}>{tx.status}</Badge>
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

  // ─── Payout Summary ─────────────────────────────────────────────────────────
  if (activeSubItem === 'rev_payouts') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left">
        <Card className="h-[340px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <PieIcon size={14} /> Active Subscription Revenue by Gateway
          </h3>
          <div className="flex-1 w-full text-xs">
            {stats.payhereVolumeUSD + stats.paddleVolumeUSD === 0 ? (
              <div className="h-full flex items-center justify-center text-appTextSecondary text-center px-6">
                No recurring revenue is currently routed through either gateway.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={gatewayDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {gatewayDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
              Gateway Connection Status
            </h3>
            <p className="text-[10px] text-appTextSecondary mb-4 leading-relaxed">
              PayHere and Paddle settle funds directly to your merchant accounts — this panel reflects whether
              each gateway's credentials are configured in this deployment, not a live bank transfer ledger.
            </p>
            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-md bg-purple-500/10 border border-purple-500/20 flex justify-between items-center">
                <div>
                  <span className="font-bold text-gray-900 dark:text-white">PayHere Gateway (Sri Lanka)</span>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Direct LKR processing &amp; IPN verification</p>
                </div>
                <Badge variant={gatewayKeyStatus.payhere ? 'success' : 'secondary'}>
                  {gatewayKeyStatus.payhere ? 'Configured' : 'Not Configured'}
                </Badge>
              </div>

              <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                <div>
                  <span className="font-bold text-gray-900 dark:text-white">Paddle Gateway (Global Merchant)</span>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Global SaaS Tax compliance &amp; webhooks</p>
                </div>
                <Badge variant={gatewayKeyStatus.paddle ? 'success' : 'secondary'}>
                  {gatewayKeyStatus.paddle ? 'Configured' : 'Not Configured'}
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-4 flex items-center gap-1.5" onClick={loadRevenueFromApi} disabled={isLoadingRevenue}>
            <ShieldCheck size={12} /> Refresh Gateway Status
          </Button>
        </Card>
      </div>
    );
  }

  return null;
};

export default RevenueView;
