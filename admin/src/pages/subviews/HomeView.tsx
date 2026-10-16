import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import { getErrorMessage } from '../../store/toastStore';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import {
  Users, DollarSign, Sparkles,
  Server, Send, Trash2,
  Bell, TrendingUp, Activity, RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip as ChartTooltip
} from 'recharts';
import { adminApiClient } from '../../api/adminApiClient';

import SystemDialogModal, { type DialogType } from '../../components/ui/SystemDialogModal';

interface HomeViewProps {
  activeSubItem: string;
}

const EMPTY_TELEMETRY = { activeCustomers: 0, mrrUSD: 0, mrrGrowthPct: 0, docGenerations: 0, renderSuccessPct: 0, grossMarginPct: 0 };

const HomeView: React.FC<HomeViewProps> = ({ activeSubItem }) => {
  const [telemetry, setTelemetry] = useState(EMPTY_TELEMETRY);

  const [mrrData, setMrrData] = useState<Array<{ month: string; mrr: number }>>([]);

  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(true);

  // System Theme Dialog Modal state
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: DialogType;
  }>({
    isOpen: false,
    message: '',
  });

  const showSystemDialog = (message: string, title?: string, type: DialogType = 'info') => {
    setDialogState({ isOpen: true, title, message, type });
  };

  const loadTelemetryFromApi = useCommittedEvent(async () => {

    try {
      const [overview, revenue] = await Promise.allSettled([
        adminApiClient.getAnalyticsOverview(),
        adminApiClient.getRevenueAnalytics()
      ]);

      if (overview.status === 'fulfilled' && overview.value) {
        const data = overview.value;
        const activeCustomers = data.active_customers ?? data.total_users ?? 0;
        // Zero is a valid measurement for a new installation.
        if (overview.status === 'fulfilled') {
          setTelemetry({
            activeCustomers,
            mrrUSD: data.mrr ?? 0,
            mrrGrowthPct: data.mrr_growth_pct ?? 0,
            docGenerations: data.total_generations ?? 0,
            renderSuccessPct: data.render_success_pct ?? 100,
            grossMarginPct: data.gross_margin_pct ?? 0,
          });
        }
      }

      if (revenue.status === 'fulfilled' && revenue.value) {
        if (Array.isArray(revenue.value.trajectory) && revenue.value.trajectory.length > 0) {
          setMrrData(revenue.value.trajectory);
        } else if (revenue.value.by_plan) {
          const chartData = Object.entries(revenue.value.by_plan).map(([plan, val]) => ({
            month: plan.toUpperCase(),
            mrr: Number(val) || 0
          }));
          setMrrData(chartData);
        }
      }
    } catch (err) {
      console.warn('Telemetry API loading warning:', err);
    } finally {
      setIsLoadingTelemetry(false);
    }
  });



  const [announcements, setAnnouncements] = useState<Wire.Announcement[]>([]);

  const loadAnnouncementsFromApi = useCommittedEvent(async () => {
    try {
      const data = await adminApiClient.getAnnouncements();
      if (Array.isArray(data)) {
        setAnnouncements(data);
      }
    } catch (err) {
      console.warn('Announcements API fetch warning:', err);
    }
  });

  const [newAnnouncementText, setNewAnnouncementText] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [, setIsLoadingLogs] = useState(true);

  const loadLiveTelemetryLogs = useCommittedEvent(async () => {
    try {
      const [auditRes, notifyRes, autoRes] = await Promise.allSettled([
        adminApiClient.getAuditLogs({ limit: 10 }),
        adminApiClient.getNotificationEmailLogs(),
        adminApiClient.getAutomationExecutionLogs()
      ]);

      const formattedLogs: { ts: string; log: string }[] = [];

      // 1. Audit Logs
      if (auditRes.status === 'fulfilled' && auditRes.value) {
        const items = Array.isArray(auditRes.value.items) ? auditRes.value.items : (Array.isArray(auditRes.value) ? auditRes.value : []);
        items.forEach((item) => {
          const rawTs = item.created_at || item.date || new Date().toISOString();
          const timePart = rawTs.includes('T') ? rawTs.split('T')[1].substring(0, 8) : String(rawTs).substring(11, 19);
          const mod = (item.module || 'SYS').toUpperCase();
          const user = item.admin_email || item.admin_id || 'System';
          formattedLogs.push({
            ts: rawTs,
            log: `[${mod} ${timePart}] ${item.action} by ${user} (${item.ip_address || '127.0.0.1'})`
          });
        });
      }

      // 2. Notification Email Logs
      if (notifyRes.status === 'fulfilled' && Array.isArray(notifyRes.value)) {
        notifyRes.value.slice(0, 10).forEach((item) => {
          const rawTs = item.timestamp || item.createdAt || new Date().toISOString();
          const timePart = rawTs.includes('T') ? rawTs.split('T')[1].substring(0, 8) : String(rawTs).substring(11, 19);
          const channel = (item.gateway || 'NOTIFY').toUpperCase();
          const statusTag = item.status === 'failed' ? ' ❌ FAILED' : ' ✓ SENT';
          formattedLogs.push({
            ts: rawTs,
            log: `[${channel} ${timePart}] ${item.type?.toUpperCase() || 'EMAIL'} → ${item.recipient || 'user'}${statusTag}`
          });
        });
      }

      // 3. Automation Execution Logs
      if (autoRes.status === 'fulfilled' && Array.isArray(autoRes.value)) {
        autoRes.value.slice(0, 10).forEach((item) => {
          const rawTs = item.created_at || new Date().toISOString();
          const timePart = rawTs.includes('T') ? rawTs.split('T')[1].substring(0, 8) : String(rawTs).substring(11, 19);
          const statusTag = item.status === 'success' ? ' ✓ OK' : ` ❌ ${item.status || 'ERR'}`;
          formattedLogs.push({
            ts: rawTs,
            log: `[AUTO ${timePart}] Event '${item.trigger_event}' rule ${item.rule_id || ''}${statusTag}`
          });
        });
      }

      // Sort descending by timestamp
      formattedLogs.sort((a, b) => (b.ts > a.ts ? 1 : -1));

      if (formattedLogs.length > 0) {
        setLogs(formattedLogs.slice(0, 15).map(f => f.log));
      } else {
        setLogs([`[SYSTEM ${new Date().toLocaleTimeString()}] Telemetry streaming active - No recent events recorded.`]);
      }
    } catch (err) {
      console.warn('Live telemetry logs fetch warning:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  });
useEffect(() => {
    loadTelemetryFromApi();
    loadAnnouncementsFromApi();
  }, [loadAnnouncementsFromApi, loadTelemetryFromApi]);

  useEffect(() => {
    loadLiveTelemetryLogs();
    const interval = setInterval(loadLiveTelemetryLogs, 8000);
    return () => clearInterval(interval);
  }, [loadLiveTelemetryLogs]);

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnouncementText.trim()) return;

    try {
      await adminApiClient.createAnnouncement(newAnnouncementText, newAnnouncementText, 'info');
      setNewAnnouncementText('');
      await loadAnnouncementsFromApi();
      showSystemDialog('System announcement published live to User Frontend header banner!', 'Announcement Published', 'success');
    } catch (err) {
      showSystemDialog(`Failed to post announcement: ${getErrorMessage(err)}`, 'API Error', 'error');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await adminApiClient.deleteAnnouncement(id);
      setAnnouncements(rows => rows.filter(row => row.id !== id));
    } catch (error) {
      showSystemDialog(getErrorMessage(error), 'Delete Failed', 'error');
    }
  };

  if (activeSubItem === 'home_dashboard' || activeSubItem === 'dash_kpis') {
    return (
      <div className="space-y-6 text-left">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Active Customers"
            value={telemetry.activeCustomers.toLocaleString()}
            icon={Users}
            tone="purple"
            trend={
              <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
                <TrendingUp size={12} /> {telemetry.mrrGrowthPct >= 0 ? `+${telemetry.mrrGrowthPct}%` : `${telemetry.mrrGrowthPct}%`} vs last month
              </span>
            }
          />
          <StatCard
            label="Monthly Recurring (MRR)"
            value={`$${telemetry.mrrUSD.toLocaleString()}`}
            icon={DollarSign}
            tone="emerald"
            trend={
              <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold">
                <TrendingUp size={12} /> {telemetry.mrrGrowthPct >= 0 ? `+${telemetry.mrrGrowthPct}%` : `${telemetry.mrrGrowthPct}%`} MRR growth
              </span>
            }
          />
          <StatCard
            label="PDF Generations"
            value={telemetry.docGenerations.toLocaleString()}
            icon={Sparkles}
            tone="blue"
            trend={<span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">{telemetry.renderSuccessPct}% render success</span>}
          />
          <StatCard
            label="Gross Margin"
            value={`${telemetry.grossMarginPct}%`}
            icon={Activity}
            tone="indigo"
            trend={
              <span className="text-[10px] text-emerald-500 font-bold">
                {telemetry.grossMarginPct > 80 ? 'Optimal' : telemetry.grossMarginPct > 50 ? 'Healthy' : 'Suboptimal'} infra margin
              </span>
            }
          />
        </div>

        {/* Charts & Console Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 h-[340px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                MRR Growth Trajectory ($ USD)
              </h3>
              <Button variant="outline" size="sm" onClick={loadTelemetryFromApi} disabled={isLoadingTelemetry}>
                <RefreshCw size={12} className={isLoadingTelemetry ? 'animate-spin' : ''} /> Refresh Telemetry
              </Button>
            </div>
            <div className="flex-1 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mrrData}>
                  <defs>
                    <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7367F0" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#7367F0" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#97959E" fontSize={10} />
                  <YAxis stroke="#97959E" fontSize={10} />
                  <ChartTooltip />
                  <Area type="monotone" dataKey="mrr" stroke="#7367F0" strokeWidth={2} fillOpacity={1} fill="url(#mrrGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Console */}
          <Card className="flex flex-col h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200/60 dark:border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-purple-600 dark:text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Live Telemetry Console</h3>
              </div>
              <Badge variant="success">Streaming</Badge>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[10px] bg-neutral-950 p-3 rounded-md border border-neutral-800 text-emerald-400">
              {logs.map((log, i) => (
                <div key={i} className="leading-relaxed border-b border-neutral-900/60 pb-1">{log}</div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (activeSubItem === 'home_announcements' || activeSubItem === 'not_broadcast') {
    return (
      <div className="space-y-6 text-left">
        <Card className="max-w-xl mx-auto">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Bell size={16} className="text-purple-600 dark:text-purple-400" />
            Publish System Announcement Banner
          </h3>
          <form onSubmit={handlePostAnnouncement} className="space-y-4">
            <Input
              label="Announcement Content"
              value={newAnnouncementText}
              onChange={(e) => setNewAnnouncementText(e.target.value)}
              placeholder="e.g. Scheduled maintenance on Sunday at 02:00 UTC."
              required
            />
            <Button type="submit" variant="violet" className="w-full flex items-center justify-center gap-2">
              <Send size={14} /> Publish Announcement Banner
            </Button>
          </form>
        </Card>

        <Card className="max-w-xl mx-auto">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Active System Banners
          </h3>
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="p-3 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{a.title || a.message || a.message}</p>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">Published: {a.created_at || a.created_at}</span>
                </div>
                <button onClick={() => handleDeleteAnnouncement(a.id)} className="text-gray-400 hover:text-rose-500 transition-colors p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <SystemDialogModal
          isOpen={dialogState.isOpen}
          title={dialogState.title}
          message={dialogState.message}
          type={dialogState.type}
          onClose={() => setDialogState(prev => ({ ...prev, isOpen: false }))}
        />
      </div>
    );
  }

  return null;
};

export default HomeView;
