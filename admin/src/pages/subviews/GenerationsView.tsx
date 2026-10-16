import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { FileWarning, Search } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis,
  Tooltip as ChartTooltip, Legend
} from 'recharts';
import { adminApiClient } from '../../api/adminApiClient';
import { toast } from '../../store/toastStore';

interface GenerationsViewProps {
  activeSubItem: string;
}

// ── Real today/yesterday using current local date ──────────────────────────
const todayISO   = new Date().toISOString().substring(0, 10);
const ydDate     = new Date(Date.now() - 86_400_000);
const yesterdayISO = ydDate.toISOString().substring(0, 10);
const todayLabel     = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const yesterdayLabel = ydDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

const GenerationsView: React.FC<GenerationsViewProps> = ({ activeSubItem }) => {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [startDate, setStartDate]   = useState('');
  const [endDate,   setEndDate]     = useState('');

  // ── Live data state — real, including a genuine empty/zero state ─────────
  const [docTypeStats,      setDocTypeStats]      = useState<Wire.GenerationAnalytics['by_type']>([]);
  const [monthlyGens,       setMonthlyGens]       = useState<Wire.GenerationAnalytics['monthly_trend']>([]);
  const [topUsers,          setTopUsers]          = useState<Wire.GenerationAnalytics['top_users']>([]);
  const [failedGenerations, setFailedGenerations] = useState<Wire.GenerationAnalytics['failed_generations']>([]);
  const [dropOffPoints,     setDropOffPoints]     = useState<Wire.GenerationAnalytics['drop_off_points']>([]);
  const [freeTierTotal,     setFreeTierTotal]     = useState<number>(0);
  const [proTierTotal,      setProTierTotal]      = useState<number>(0);
  const [loading,           setLoading]           = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await adminApiClient.getDetailedGenerationsAnalytics();
        setDocTypeStats(Array.isArray(data?.by_type) ? data.by_type : []);
        setMonthlyGens(Array.isArray(data?.monthly_trend) ? data.monthly_trend : []);
        setTopUsers(Array.isArray(data?.top_users) ? data.top_users : []);
        setFailedGenerations(Array.isArray(data?.failed_generations) ? data.failed_generations : []);
        setDropOffPoints(Array.isArray(data?.drop_off_points) ? data.drop_off_points : []);
        setFreeTierTotal(typeof data?.free_tier_total === 'number' ? data.free_tier_total : 0);
        setProTierTotal(typeof data?.pro_tier_total === 'number' ? data.pro_tier_total : 0);
      } catch (err) {
        console.warn('[GenerationsView] load error:', err);
        toast.error('Failed to Load Generation Analytics', 'Could not reach the admin API.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Date matcher (uses real today/yesterday) ──────────────────────────────
  const matchesDate = (itemDate: string) => {
    const d = (itemDate || '').substring(0, 10);
    if (dateFilter === 'all')       return true;
    if (dateFilter === 'today')     return d === todayISO;
    if (dateFilter === 'yesterday') return d === yesterdayISO;
    if (dateFilter === 'range') {
      if (!startDate && !endDate) return true;
      if (startDate && d < startDate) return false;
      if (endDate   && d > endDate)   return false;
      return true;
    }
    return true;
  };

  // ── Shared filter toolbar ─────────────────────────────────────────────────
  const renderFilterToolbar = (title: string, count: number) => (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-appBorder/50 mb-4 text-left">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary">{title}</h3>
        <Badge variant="primary">{count}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-appTextSecondary/60" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-3 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary w-40"
          />
        </div>
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="px-2 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
        >
          <option value="all">All Time</option>
          <option value="today">Today ({todayLabel})</option>
          <option value="yesterday">Yesterday ({yesterdayLabel})</option>
          <option value="range">Custom Range</option>
        </select>
        {dateFilter === 'range' && (
          <div className="flex items-center gap-1">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-2 py-0.5 bg-appBg text-[10px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none" />
            <span className="text-[10px] text-appTextSecondary">to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-2 py-0.5 bg-appBg text-[10px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none" />
          </div>
        )}
      </div>
    </div>
  );

  // ── Loading placeholder ───────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <p className="text-xs text-appTextSecondary animate-pulse py-6 text-center">
          Loading generation analytics…
        </p>
      </Card>
    );
  }

  // ── 1. Total generations bar chart ────────────────────────────────────────
  if (activeSubItem === 'gen_total') {
    return (
      <Card className="h-[320px] flex flex-col">
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-4">
          Total Generations Trend
        </h3>
        {monthlyGens.length === 0 ? (
          <p className="text-xs text-appTextSecondary text-center my-auto">
            No generation data yet. Data will appear once users create documents.
          </p>
        ) : (
          <div className="flex-1 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyGens}>
                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={10} />
                <YAxis stroke="var(--text-secondary)" fontSize={10} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="pro"  stackId="a" fill="#7367F0" name="Pro Generations"  />
                <Bar dataKey="free" stackId="a" fill="#97959E" name="Free Generations" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    );
  }

  // ── 2. Generations by document type ──────────────────────────────────────
  if (activeSubItem === 'gen_by_type') {
    // Compute most popular type and its share from live data
    const topType   = docTypeStats[0] ?? null;
    const totalDocs = docTypeStats.reduce((s, d) => s + (d.count || 0), 0);
    const topPct    = topType && totalDocs > 0
      ? ((topType.count / totalDocs) * 100).toFixed(1)
      : '0';

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 h-[320px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-4">
            Generations Breakdown by Document Type
          </h3>
          {docTypeStats.length === 0 ? (
            <p className="text-xs text-appTextSecondary text-center my-auto">
              No documents generated yet.
            </p>
          ) : (
            <div className="flex-1 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={docTypeStats} layout="vertical">
                  <XAxis type="number" stroke="var(--text-secondary)" fontSize={10} />
                  <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={10} width={100} />
                  <ChartTooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {docTypeStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="flex flex-col justify-between h-[320px]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-4">
              Most Popular Type
            </h3>
            {topType ? (
              <>
                <p className="text-2xl font-black text-appPrimary">{topType.name}</p>
                <p className="text-xs text-appTextSecondary mt-2">
                  Accounting for approximately <span className="font-bold text-appTextPrimary">{topPct}%</span> of
                  all documents created in DocCraft.
                </p>
              </>
            ) : (
              <p className="text-xs text-appTextSecondary mt-2">No data yet.</p>
            )}
          </div>
          <div className="p-3 bg-appBg border border-appBorder rounded-md text-[10px] text-appTextSecondary">
            Total document types: <span className="font-bold text-appTextPrimary">{docTypeStats.length}</span>
          </div>
        </Card>
      </div>
    );
  }

  // ── 3. Generations by user ────────────────────────────────────────────────
  if (activeSubItem === 'gen_by_user') {
    const filtered = topUsers.filter(u => {
      const match = (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (u.id    || '').toLowerCase().includes(searchTerm.toLowerCase());
      return match && matchesDate(u.date);
    });

    return (
      <Card>
        {renderFilterToolbar('Top Power Users (Generation Count)', filtered.length)}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-appTextSecondary text-center py-6">No user generation data found.</p>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                  <th className="pb-3 font-bold">User ID</th>
                  <th className="pb-3 font-bold">Email Address</th>
                  <th className="pb-3 font-bold">Plan</th>
                  <th className="pb-3 text-right font-bold">Generations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {filtered.map((user, idx) => (
                  <tr key={user.id ?? idx} className="hover:bg-appBg/10 transition-colors">
                    <td className="py-3 font-mono text-appTextSecondary">{user.id}</td>
                    <td className="py-3 text-appTextPrimary font-bold">{user.email}</td>
                    <td className="py-3">
                      <Badge variant={user.plan === 'pro' ? 'primary' : 'info'}>
                        {(user.plan || 'free').toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 text-right font-black font-mono text-appPrimary">{user.count} docs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    );
  }

  // ── 4. Failed generations log ─────────────────────────────────────────────
  if (activeSubItem === 'gen_failed') {
    const filtered = failedGenerations.filter(f => {
      const match = (f.user  || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (f.error || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (f.id    || '').toLowerCase().includes(searchTerm.toLowerCase());
      return match && matchesDate(f.date);
    });

    return (
      <Card>
        {renderFilterToolbar('Generation Failures Registry', filtered.length)}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-appTextSecondary text-center py-6">No failures logged — all generations succeeded.</p>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                  <th className="pb-3 font-bold">Failure ID</th>
                  <th className="pb-3 font-bold">User</th>
                  <th className="pb-3 font-bold">Document Type</th>
                  <th className="pb-3 font-bold">Diagnostics Error</th>
                  <th className="pb-3 text-right font-bold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {filtered.map((fail, idx) => (
                  <tr key={fail.id ?? idx} className="hover:bg-appBg/10 transition-colors">
                    <td className="py-3 font-mono text-appTextSecondary">{fail.id}</td>
                    <td className="py-3 text-appTextPrimary font-bold">{fail.user}</td>
                    <td className="py-3 font-semibold capitalize">{fail.type}</td>
                    <td className="py-3 text-appError font-mono flex items-center gap-1">
                      <FileWarning size={12} /> {fail.error}
                    </td>
                    <td className="py-3 text-right text-appTextSecondary">{fail.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    );
  }

  // ── 5. Free tier / Pro tier stats ────────────────────────────────────────
  if (activeSubItem === 'gen_free_tier' || activeSubItem === 'gen_pro_tier') {
    const isPro  = activeSubItem === 'gen_pro_tier';
    const total  = isPro ? proTierTotal : freeTierTotal;

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex flex-col justify-between h-[150px]">
          <div>
            <span className="text-[10px] text-appTextSecondary uppercase font-bold tracking-wider">
              {isPro ? 'Pro Total Generations' : 'Free Total Generations'}
            </span>
            <p className="text-2xl font-black text-appTextPrimary mt-2">
              {total.toLocaleString()}
            </p>
          </div>
          <Badge variant="primary">{isPro ? 'Pro member usage' : 'Daily resetting counters'}</Badge>
        </Card>

        <Card className="flex flex-col justify-between h-[150px]">
          <div>
            <span className="text-[10px] text-appTextSecondary uppercase font-bold tracking-wider">
              {isPro ? 'Export Method' : 'Watermark Status'}
            </span>
            <p className="text-base font-bold text-appTextPrimary mt-2">
              {isPro ? 'Server-side Puppeteer' : 'Client-side overlay'}
            </p>
          </div>
          <Badge variant="success">Pixel accurate</Badge>
        </Card>

        <Card className="flex flex-col justify-between h-[150px]">
          <div>
            <span className="text-[10px] text-appTextSecondary uppercase font-bold tracking-wider">
              Share of All Generations
            </span>
            <p className="text-base font-bold text-appTextPrimary mt-2">
              {(freeTierTotal + proTierTotal) > 0
                ? `${(((isPro ? proTierTotal : freeTierTotal) / (freeTierTotal + proTierTotal)) * 100).toFixed(1)}%`
                : '—'}
            </p>
          </div>
          <Badge variant="info">{isPro ? 'Pro tier share' : 'Free tier share'}</Badge>
        </Card>
      </div>
    );
  }

  // ── 6. Chat funnel drop-off ───────────────────────────────────────────────
  if (activeSubItem === 'gen_drop_offs') {
    return (
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-4">
          Chat Assistant Funnel &amp; Drop-off Analysis
        </h3>
        {dropOffPoints.length === 0 ? (
          <p className="text-xs text-appTextSecondary text-center py-6">
            No funnel data yet. Data appears once generation_events are recorded.
          </p>
        ) : (
          <div className="space-y-4">
            {dropOffPoints.map((p, idx) => (
              <div key={idx} className="space-y-1.5 text-left">
                <div className="flex justify-between items-baseline text-xs">
                  <span className="font-semibold">{p.step}</span>
                  <span className="text-appTextSecondary font-bold">
                    {p.count}% active{' '}
                    <span className="text-appError font-semibold">({p.rate})</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-appBg border border-appBorder rounded-md overflow-hidden">
                  <div
                    className="h-full bg-appPrimary rounded-md transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, p.count))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return null;
};

export default GenerationsView;
