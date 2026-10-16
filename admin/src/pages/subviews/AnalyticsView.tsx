import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import { getErrorMessage } from '../../store/toastStore';
import React, { useState, useEffect, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { usePagination } from '../../hooks/usePagination';
import SortableHeader from '../../components/ui/SortableHeader';
import { sortRows, useSortToggle } from '../../hooks/useSortToggle';
import DateRangeFilter, { type DateRangeValue } from '../../components/ui/DateRangeFilter';
import {
  Globe, Clock, RefreshCw, Send, Activity, Search, MousePointerClick,
  TrendingUp, UserCheck, Zap
} from 'lucide-react';
import {
  ResponsiveContainer, Tooltip as ChartTooltip, PieChart, Pie, Cell
} from 'recharts';
import { adminApiClient } from '../../api/adminApiClient';

interface AnalyticsViewProps {
  activeSubItem: string;
}

const todayISO = () => new Date().toISOString().substring(0, 10);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().substring(0, 10);
// Matches services/analytics's own SOURCE_COLORS palette for visual consistency
// with the Traffic Overview page's channel dots.
const CHANNEL_DOT_COLORS = ['#3B82F6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ activeSubItem }) => {
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: '30d', from: daysAgoISO(30), to: todayISO() });

  // No fabricated base arrays or fake per-preset scale multiplier — the old
  // code always fetched all-time totals and then multiplied them by a
  // guessed ratio (e.g. always *0.32 for "7d") to fake the appearance of a
  // working date filter. The date range now reaches the backend for real
  // (see getTrafficAnalytics(dateRange.from, dateRange.to) below), so these
  // are real, possibly-empty, API-only arrays.
  const [trafficDataApi, setTrafficDataApi] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const trafficData = trafficDataApi;

  const [locationsApi, setLocationsApi] = useState<Array<{ country: string; visitors: string | number; share: string; status: string }>>([]);

  const [deviceDistribution, setDeviceDistribution] = useState<Array<{ device: string; value: number; color: string }>>([]);
  const [sessionsInRange, setSessionsInRange] = useState<number | null>(null);

  // No pre-seeded fake "connected" state — real values only, from
  // GET /admin/analytics/posthog/config (real .env-sourced host/key, and a
  // real status derived from which POSTHOG_* vars are actually set, not an
  // assumed live connection).
  const [posthogConfig, setPosthogConfig] = useState<Wire.PosthogConfig | null>(null);

  const [funnelStepsApi, setFunnelStepsApi] = useState<Array<{ step: string; count: number; percentage?: string }> | null>(null);
  const [conversionStatsApi, setConversionStatsApi] = useState<Wire.ConversionStats | null>(null);
  const [channelConversionApi, setChannelConversionApi] = useState<Array<{ name: string; total: number; activated: number; conversion_pct: string }> | null>(null);
  const [journeyStagesApi, setJourneyStagesApi] = useState<Array<{ name: string; count: number; conversion_pct: number; avg_duration_seconds: number }> | null>(null);

  // No fabricated fallback — an admin reading a funnel needs to trust every
  // number is real. If the API call fails, show that honestly (empty state
  // below) rather than silently substituting made-up figures.
  const funnelSteps = funnelStepsApi || [];

  const [clickLogsApi, setClickLogsApi] = useState<Array<{ event: string; count: number; desc: string }>>([]);
  const [clickLogsConfigured, setClickLogsConfigured] = useState(true);

  const [pageDurationApi, setPageDurationApi] = useState<Array<{ page: string; seconds: number; bouncePct: number }>>([]);
  const [pageDurationConfigured, setPageDurationConfigured] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [eventLogStatus, setEventLogStatus] = useState<string | null>(null);

  const rangeDays = dateRange.from
    ? Math.max(1, Math.round((new Date(dateRange.to || todayISO()).getTime() - new Date(dateRange.from).getTime()) / 86400000))
    : 30;

  const loadAnalyticsData = useCommittedEvent(async () => {

    try {
      const [trafficRes, posthogRes, clicksRes, journeyRes, pageDurationRes] = await Promise.allSettled([
        adminApiClient.getTrafficAnalytics(dateRange.from, dateRange.to),
        adminApiClient.getPosthogConfig(),
        adminApiClient.getButtonClickAnalytics(rangeDays),
        adminApiClient.getJourneyAnalytics(),
        adminApiClient.getPageDurationAnalytics(rangeDays),
      ]);

      if (trafficRes.status === 'fulfilled' && trafficRes.value) {
        if (trafficRes.value.sources) setTrafficDataApi(trafficRes.value.sources);
        if (trafficRes.value.devices) setDeviceDistribution(trafficRes.value.devices);
        if (trafficRes.value.geographic) setLocationsApi(trafficRes.value.geographic);
        if (trafficRes.value.funnel) setFunnelStepsApi(trafficRes.value.funnel);
        if (trafficRes.value.conversion_stats) setConversionStatsApi(trafficRes.value.conversion_stats);
        if (trafficRes.value.channel_conversion) setChannelConversionApi(trafficRes.value.channel_conversion);
        if (typeof trafficRes.value.sessions_in_range === 'number') setSessionsInRange(trafficRes.value.sessions_in_range);
      }

      if (journeyRes.status === 'fulfilled' && Array.isArray(journeyRes.value?.stages)) {
        setJourneyStagesApi(journeyRes.value.stages);
      }

      if (posthogRes.status === 'fulfilled' && posthogRes.value) {
        setPosthogConfig(posthogRes.value);
      }

      if (clicksRes.status === 'fulfilled' && clicksRes.value) {
        setClickLogsConfigured(clicksRes.value.configured !== false);
        const events = Array.isArray(clicksRes.value.events) ? clicksRes.value.events : [];
        setClickLogsApi(events.map((e) => ({
          event: e.event,
          count: e.count,
          desc: e.description || e.event,
        })));
      }

      if (pageDurationRes.status === 'fulfilled' && pageDurationRes.value) {
        setPageDurationConfigured(pageDurationRes.value.configured !== false);
        const pages = Array.isArray(pageDurationRes.value.pages) ? pageDurationRes.value.pages : [];
        setPageDurationApi(pages.map((p) => ({
          page: p.route,
          seconds: Math.round(p.avg_duration_seconds || 0),
          bouncePct: p.bounce_pct || 0,
        })));
      }
    } catch (err) {
      console.warn('Analytics fallback loaded:', err);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    loadAnalyticsData();
  }, [activeSubItem, rangeDays, dateRange.from, dateRange.to, loadAnalyticsData]);

  const handleTrackTestEvent = async () => {
    try {
      const res = await adminApiClient.trackPosthogEvent('btn_admin_analytics_test', {
        source: 'admin_dashboard',
        sub_item: activeSubItem,
        timestamp: new Date().toISOString()
      });
      setEventLogStatus(`Event 'btn_admin_analytics_test' queued! (${res.status || 'OK'})`);
      setTimeout(() => setEventLogStatus(null), 4000);
    } catch (err) {
      setEventLogStatus(`Failed to queue test event: ${getErrorMessage(err) || 'request failed'}`);
      setTimeout(() => setEventLogStatus(null), 4000);
    }
  };

  const fmtDuration = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  // Scales to whatever unit reads best — journey stages can be seconds
  // (first document) or days (subscription upgrade), unlike page-visit
  // durations above which are always sub-hour.
  const fmtJourneyDuration = (seconds: number): string => {
    if (seconds <= 0) return 'N/A';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hrs`;
    return `${(seconds / 86400).toFixed(1)} days`;
  };

  // Search / sort / pagination state
  const [locationSearch, setLocationSearch] = useState('');
  const [locationStatusFilter, setLocationStatusFilter] = useState('');
  const { sort: locationSort, toggleSort: toggleLocationSort } = useSortToggle<'country' | 'visitors' | 'share'>();

  const [durationSearch, setDurationSearch] = useState('');
  const { sort: durationSort, toggleSort: toggleDurationSort } = useSortToggle<'page' | 'time' | 'bounce'>();

  const [clickSearch, setClickSearch] = useState('');
  const [minClicks, setMinClicks] = useState('');
  const { sort: clickSort, toggleSort: toggleClickSort } = useSortToggle<'event' | 'count'>();

  const locationsNormalized = useMemo(() => {
    return locationsApi.map((l) => ({ ...l, visitors: typeof l.visitors === 'number' ? l.visitors : parseInt(String(l.visitors).replace(/,/g, ''), 10) || 0 }));
  }, [locationsApi]);
  const filteredLocations = locationsNormalized.filter((l) =>
    l.country.toLowerCase().includes(locationSearch.toLowerCase()) &&
    (!locationStatusFilter || l.status === locationStatusFilter)
  );
  const sortedLocations = sortRows(filteredLocations, locationSort, (row, key) => {
    if (key === 'country') return row.country;
    if (key === 'visitors') return row.visitors;
    if (key === 'share') return parseFloat(row.share) || 0;
    return '';
  });
  const locationPagination = usePagination(sortedLocations, 8);

  const filteredDuration = pageDurationApi.filter((d) => d.page.toLowerCase().includes(durationSearch.toLowerCase()));
  const sortedDuration = sortRows(filteredDuration, durationSort, (row, key) => {
    if (key === 'page') return row.page;
    if (key === 'time') return row.seconds;
    if (key === 'bounce') return row.bouncePct;
    return '';
  });
  const durationPagination = usePagination(sortedDuration, 8);

  const filteredClicks = clickLogsApi.filter((c) =>
    (c.event.toLowerCase().includes(clickSearch.toLowerCase()) || c.desc.toLowerCase().includes(clickSearch.toLowerCase())) &&
    (!minClicks || c.count >= parseInt(minClicks, 10))
  );
  const sortedClicks = sortRows(filteredClicks, clickSort, (row, key) => {
    if (key === 'event') return row.event;
    if (key === 'count') return row.count;
    return '';
  });
  const clickPagination = usePagination(sortedClicks, 8);

  // Shared toolbar
  const renderAnalyticsToolbar = (extra?: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-gray-200/60 dark:border-white/10">
      <DateRangeFilter value={dateRange} onChange={setDateRange} />
      {extra}
      <Button variant="outline" size="sm" onClick={loadAnalyticsData} disabled={isLoading} className="flex items-center gap-1 ml-auto">
        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
      </Button>
    </div>
  );

  // 1. Traffic Overview
  if (activeSubItem === 'an_traffic') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
            Acquisition Traffic & Signups (Sessions)
          </h3>
          {renderAnalyticsToolbar()}
          <div className="flex-1 w-full min-h-0 text-xs flex items-center justify-center relative" style={{ minHeight: 230 }}>
            {isLoading && trafficData.length === 0 ? (
              <p className="text-appTextSecondary">Loading real signup source data…</p>
            ) : trafficData.length === 0 ? (
              <p className="text-appTextSecondary">No signups recorded in this date range.</p>
            ) : (
            <>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={trafficData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {trafficData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 text-left text-[11px] text-appTextSecondary">
              {trafficData.map((b) => (
                <div key={b.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-md" style={{ backgroundColor: b.color }} />
                  <span>{b.name} ({b.value.toLocaleString()} users)</span>
                </div>
              ))}
            </div>
            </>
            )}
          </div>
        </Card>

        <Card className="flex flex-col justify-between h-[400px] text-left">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-1.5">
                <Activity size={14} className="text-purple-600 dark:text-purple-400" />
                PostHog Telemetry (GET /posthog/config)
              </h3>
              {posthogConfig && (
                <Badge variant={
                  posthogConfig.status === 'configured' ? 'success' :
                  posthogConfig.status === 'partially_configured' ? 'warning' : 'danger'
                }>
                  {posthogConfig.status === 'configured' ? 'Configured' :
                   posthogConfig.status === 'partially_configured' ? 'Partially Configured' : 'Not Configured'}
                </Badge>
              )}
            </div>

            {!posthogConfig ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Loading real PostHog configuration…</p>
            ) : (
              <>
                <p className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono mt-2">
                  {(posthogConfig.monthly_tracked_sessions ?? 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Real distinct users with ≥1 document — PostHog's own session count isn't queryable without
                  POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID configured.
                </p>

                <div className="mt-4 p-3 rounded-md bg-purple-500/5 border border-purple-500/10 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500">PostHog Host:</span>
                    <span className="font-mono text-gray-900 dark:text-white">{posthogConfig.posthog_host || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">API Key Masked:</span>
                    <span className="font-mono text-purple-500 font-bold">{posthogConfig.api_key_masked || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Telemetry Sync:</span>
                    <span className="font-mono text-gray-900 dark:text-white text-right max-w-[60%]">{posthogConfig.telemetry_sync}</span>
                  </div>
                </div>
              </>
            )}

            {eventLogStatus && (
              <div className="mt-2 p-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">
                {eventLogStatus}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-gray-200/60 dark:border-white/10 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAnalyticsData}
              disabled={isLoading}
              className="flex items-center gap-1 text-[11px]"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Sync
            </Button>
            <Button
              variant="violet"
              size="sm"
              onClick={handleTrackTestEvent}
              className="flex items-center gap-1 text-[11px] font-bold"
            >
              <Send size={12} /> Track Event (POST /events)
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // 2. Location breakdown
  if (activeSubItem === 'an_location') {
    return (
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
          Geographic Telemetry Distribution
        </h3>
        {renderAnalyticsToolbar(
          <>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="Search country..."
                className="pl-7 pr-3 py-1.5 text-[11px] bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 w-36"
              />
            </div>
            <select
              value={locationStatusFilter}
              onChange={(e) => setLocationStatusFilter(e.target.value)}
              className="px-2 py-1.5 text-[11px] bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">All Regions</option>
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
              <option value="International">International</option>
            </select>
          </>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                <SortableHeader label="Country / Territory" sortKey="country" sort={locationSort} onSort={toggleLocationSort} />
                <SortableHeader label="Monthly Visitors" sortKey="visitors" sort={locationSort} onSort={toggleLocationSort} />
                <SortableHeader label="Traffic Share" sortKey="share" sort={locationSort} onSort={toggleLocationSort} />
                <th className="pb-3 text-right font-bold">Region classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-appBorder/40">
              {locationPagination.paged.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-appTextSecondary">
                    {isLoading ? 'Loading real geographic data…' : 'No logins with a resolved country recorded in this date range.'}
                  </td>
                </tr>
              ) : locationPagination.paged.map((loc, idx) => (
                <tr key={idx} className="hover:bg-appBg/10 transition-colors">
                  <td className="py-3 text-appTextPrimary font-bold flex items-center gap-2">
                    <Globe size={12} className="text-appPrimary" />
                    {loc.country}
                  </td>
                  <td className="py-3 font-mono font-bold text-appTextPrimary">{loc.visitors.toLocaleString()}</td>
                  <td className="py-3 text-appTextSecondary font-medium">{loc.share}</td>
                  <td className="py-3 text-right">
                    <Badge variant={loc.status === 'Primary' ? 'success' : loc.status === 'Secondary' ? 'primary' : 'secondary'}>
                      {loc.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={locationPagination.page} totalPages={locationPagination.totalPages} totalItems={locationPagination.totalItems} pageSize={locationPagination.pageSize} onChange={locationPagination.setPage} />
        </div>
      </Card>
    );
  }

  // 3. Device distribution view
  if (activeSubItem === 'an_device') {
    return (
      <Card className="flex flex-col">
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
          Device & OS Distribution (Desktop vs Mobile Split %)
        </h3>
        {renderAnalyticsToolbar(
          <span className="text-[11px] text-appTextSecondary">
            {sessionsInRange != null ? `${sessionsInRange.toLocaleString()} real login sessions tracked in range` : 'Loading session count…'}
          </span>
        )}
        <div className="flex-1 w-full min-h-0 text-xs flex items-center justify-center relative" style={{ minHeight: 230 }}>
          {isLoading && deviceDistribution.length === 0 ? (
            <p className="text-appTextSecondary">Loading real device data…</p>
          ) : deviceDistribution.length === 0 ? (
            <p className="text-appTextSecondary">No logins with a recognized device recorded in this date range.</p>
          ) : (
          <>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={deviceDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {deviceDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 text-left text-[11px] text-appTextSecondary">
            {deviceDistribution.map((b) => (
              <div key={b.device} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-md" style={{ backgroundColor: b.color }} />
                <span>{b.device} ({b.value.toLocaleString()} logins)</span>
              </div>
            ))}
          </div>
          </>
          )}
        </div>
      </Card>
    );
  }

  // 4. Page visit duration
  if (activeSubItem === 'an_duration') {
    return (
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
          Page Visit Duration & Bounce Statistics
        </h3>
        {!pageDurationConfigured && (
          <div className="mb-4 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
            PostHog personal API key / project ID not configured — set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to enable real duration analytics.
          </div>
        )}
        {renderAnalyticsToolbar(
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={durationSearch}
              onChange={(e) => setDurationSearch(e.target.value)}
              placeholder="Search page..."
              className="pl-7 pr-3 py-1.5 text-[11px] bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 w-40"
            />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                <SortableHeader label="Platform URL Route" sortKey="page" sort={durationSort} onSort={toggleDurationSort} />
                <SortableHeader label="Average Session Duration" sortKey="time" sort={durationSort} onSort={toggleDurationSort} />
                <SortableHeader label="Bounce Rate (%)" sortKey="bounce" sort={durationSort} onSort={toggleDurationSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-appBorder/40">
              {durationPagination.paged.map((stat, idx) => (
                <tr key={idx} className="hover:bg-appBg/10 transition-colors">
                  <td className="py-3 font-bold text-appTextPrimary">{stat.page}</td>
                  <td className="py-3 font-semibold text-appPrimary flex items-center gap-1.5">
                    <Clock size={12} /> {fmtDuration(stat.seconds)}
                  </td>
                  <td className="py-3 text-right font-bold font-mono text-appTextSecondary">{stat.bouncePct}%</td>
                </tr>
              ))}
              {durationPagination.paged.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-appTextSecondary">
                    {pageDurationApi.length === 0
                      ? (pageDurationConfigured ? 'No page-visit duration data tracked in this range yet.' : 'Duration analytics unavailable — PostHog not configured.')
                      : 'No pages match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={durationPagination.page} totalPages={durationPagination.totalPages} totalItems={durationPagination.totalItems} pageSize={durationPagination.pageSize} onChange={durationPagination.setPage} />
        </div>
      </Card>
    );
  }

  // 5. Button Click logs
  if (activeSubItem === 'an_clicks') {
    return (
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
          Button Click Interaction Tracking (PostHog Events)
        </h3>
        {!clickLogsConfigured && (
          <div className="mb-4 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
            PostHog personal API key / project ID not configured — set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to enable real click analytics.
          </div>
        )}
        {renderAnalyticsToolbar(
          <>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={clickSearch}
                onChange={(e) => setClickSearch(e.target.value)}
                placeholder="Search event..."
                className="pl-7 pr-3 py-1.5 text-[11px] bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 w-40"
              />
            </div>
            <div className="relative">
              <MousePointerClick size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                min={0}
                value={minClicks}
                onChange={(e) => setMinClicks(e.target.value)}
                placeholder="Min clicks"
                className="pl-7 pr-3 py-1.5 text-[11px] bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 w-28"
              />
            </div>
          </>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                <SortableHeader label="PostHog Event Name" sortKey="event" sort={clickSort} onSort={toggleClickSort} />
                <SortableHeader label="Total Click Event Registry" sortKey="count" sort={clickSort} onSort={toggleClickSort} />
                <th className="pb-3 text-right font-bold">Interface Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-appBorder/40">
              {clickPagination.paged.map((log, idx: number) => (
                <tr key={idx} className="hover:bg-appBg/10 transition-colors">
                  <td className="py-3 font-mono text-appPrimary font-semibold">{log.event}</td>
                  <td className="py-3 font-bold text-appTextPrimary">{log.count.toLocaleString()} clicks</td>
                  <td className="py-3 text-right text-appTextSecondary">{log.desc}</td>
                </tr>
              ))}
              {clickPagination.paged.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-appTextSecondary">
                    {clickLogsApi.length === 0
                      ? (clickLogsConfigured ? 'No button clicks tracked in this range yet.' : 'Click analytics unavailable — PostHog not configured.')
                      : 'No events match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={clickPagination.page} totalPages={clickPagination.totalPages} totalItems={clickPagination.totalItems} pageSize={clickPagination.pageSize} onChange={clickPagination.setPage} />
        </div>
      </Card>
    );
  }

  // 6. User Conversion & Activation Funnel
  if (activeSubItem === 'an_funnel') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
        <Card className="lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
            User Conversion & Activation Funnel (Real Database Telemetry)
          </h3>
          {renderAnalyticsToolbar()}
          {funnelSteps.length === 0 ? (
            <p className="text-xs text-appTextSecondary py-6 text-center">
              {isLoading ? 'Loading real funnel data…' : 'No funnel data available.'}
            </p>
          ) : (
            <div className="space-y-5">
              {funnelSteps.map((step, idx) => (
                <div key={idx} className="space-y-1 text-left">
                  <div className="flex justify-between items-baseline text-xs">
                    <span className="font-semibold text-appTextPrimary">{step.step}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-appTextSecondary font-mono text-xs">{step.count.toLocaleString()} users</span>
                      <span className="text-appPrimary font-bold text-xs">{step.percentage} conversion</span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-appBg border border-appBorder rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-md transition-all duration-500"
                      style={{ width: step.percentage }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col justify-between h-auto space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-4">
              Funnel Efficiency Metrics
            </h3>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-appBg/50 border border-appBorder rounded-lg">
                <p className="text-appTextSecondary text-[11px] mb-1">Registration to First Document</p>
                <p className="text-lg font-black text-emerald-500 font-mono">
                  {conversionStatsApi?.registration_to_activation ?? '—'}
                </p>
              </div>
              <div className="p-3 bg-appBg/50 border border-appBorder rounded-lg">
                <p className="text-appTextSecondary text-[11px] mb-1">Activated to Power User (≥3 Docs)</p>
                <p className="text-lg font-black text-purple-500 font-mono">
                  {conversionStatsApi?.activation_to_power ?? '—'}
                </p>
              </div>
              <div className="p-3 bg-appBg/50 border border-appBorder rounded-lg">
                <p className="text-appTextSecondary text-[11px] mb-1">Paid Plan Conversion</p>
                <p className="text-lg font-black text-blue-500 font-mono">
                  {conversionStatsApi?.overall_paid_conversion ?? '—'}
                </p>
              </div>
            </div>
          </div>
          <Badge variant="success">Real Postgres Data</Badge>
        </Card>
      </div>
    );
  }

  // 7. Conversion Rate Breakdown
  if (activeSubItem === 'an_conversion') {
    const regToAct = conversionStatsApi?.registration_to_activation ?? '—';
    const actToPower = conversionStatsApi?.activation_to_power ?? '—';
    const paidConv = conversionStatsApi?.overall_paid_conversion ?? '—';

    return (
      <div className="space-y-6 text-left">
        <Card>
          <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
            Platform Conversion Rate Overview
          </h3>
          {renderAnalyticsToolbar()}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-appBg/50 border border-appBorder rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-appTextSecondary">Activation Rate</span>
                <UserCheck size={16} className="text-emerald-500" />
              </div>
              <p className="text-2xl font-black text-appTextPrimary font-mono">{regToAct}</p>
              <p className="text-[10px] text-appTextSecondary mt-1">Signups generating ≥1 document</p>
            </div>

            <div className="p-4 bg-appBg/50 border border-appBorder rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-appTextSecondary">Retention Rate</span>
                <TrendingUp size={16} className="text-purple-500" />
              </div>
              <p className="text-2xl font-black text-appTextPrimary font-mono">{actToPower}</p>
              <p className="text-[10px] text-appTextSecondary mt-1">Active users making ≥3 documents</p>
            </div>

            <div className="p-4 bg-appBg/50 border border-appBorder rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-appTextSecondary">Pro Conversion Rate</span>
                <Zap size={16} className="text-amber-500" />
              </div>
              <p className="text-2xl font-black text-appTextPrimary font-mono">{paidConv}</p>
              <p className="text-[10px] text-appTextSecondary mt-1">Registered users on Pro tier</p>
            </div>
          </div>

          <div className="border-t border-appBorder pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-3">
              Conversion Breakdown by Acquisition Channel
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                    <th className="pb-3 font-bold">Acquisition Channel</th>
                    <th className="pb-3 font-bold">Total Accounts</th>
                    <th className="pb-3 font-bold">Activated Users</th>
                    <th className="pb-3 font-bold text-right">Conversion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-appBorder/40">
                  {(channelConversionApi || []).map((channel, i) => (
                    <tr key={i} className="hover:bg-appBg/10 transition-colors">
                      <td className="py-3 font-bold text-appTextPrimary flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHANNEL_DOT_COLORS[i % CHANNEL_DOT_COLORS.length] }} />
                        {channel.name}
                      </td>
                      <td className="py-3 font-mono font-semibold text-appTextPrimary">{channel.total.toLocaleString()}</td>
                      <td className="py-3 font-mono text-appTextSecondary">{channel.activated.toLocaleString()}</td>
                      <td className="py-3 text-right font-bold font-mono text-emerald-500">{channel.conversion_pct}</td>
                    </tr>
                  ))}
                  {(!channelConversionApi || channelConversionApi.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-appTextSecondary">
                        {isLoading ? 'Loading real channel data…' : 'No channel conversion data available.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 8. Signup to Subscribe Journey Timeline
  if (activeSubItem === 'an_journey') {
    // Real stages only — computed from users/documents/subscriptions
    // (GET /admin/analytics/journey). There is no "guest session before
    // signup" stage here: nothing anywhere records when an anonymous
    // visitor's session started, so an average for it would be invented.
    const firstDocStage = journeyStagesApi?.find((s) => s.name === 'Registration to First Document') || null;
    const upgradeStage = journeyStagesApi?.find((s) => s.name === 'Registration to Subscription Upgrade') || null;
    const hasJourneyData = journeyStagesApi !== null;

    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-1">
              Signup-to-Activation User Journey Timeline
            </h3>
            {renderAnalyticsToolbar()}

            {!hasJourneyData ? (
              <p className="text-xs text-appTextSecondary text-center py-8">{isLoading ? 'Loading…' : 'No journey data available.'}</p>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-brand-500/30">
                <div className="relative flex gap-4 items-start">
                  <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-[10px] font-bold shadow-md">
                    1
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-appTextPrimary">Stage 1: Registration to First Document</h4>
                    <p className="text-[11px] text-appTextSecondary mt-0.5">
                      From account creation to generating their first document.
                    </p>
                    <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-mono font-semibold bg-brand-500/10 text-brand-400 rounded">
                      {firstDocStage ? `${firstDocStage.count} users · ${firstDocStage.conversion_pct}% · avg ${fmtJourneyDuration(firstDocStage.avg_duration_seconds)}` : 'No data yet'}
                    </span>
                  </div>
                </div>

                <div className="relative flex gap-4 items-start">
                  <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shadow-md">
                    2
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-appTextPrimary">Stage 2: Registration to Subscription Upgrade</h4>
                    <p className="text-[11px] text-appTextSecondary mt-0.5">
                      From account creation to upgrading to a paid plan.
                    </p>
                    <span className="inline-block mt-2 px-2 py-0.5 text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 rounded">
                      {upgradeStage ? `${upgradeStage.count} users · ${upgradeStage.conversion_pct}% · avg ${fmtJourneyDuration(upgradeStage.avg_duration_seconds)}` : 'No data yet'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-3">
                Lifecycle Summary
              </h3>
              <div className="space-y-4 text-xs">
                <div>
                  <p className="text-appTextSecondary text-[11px]">Avg Time to First Generation</p>
                  <p className="text-xl font-black text-brand-400 font-mono">
                    {firstDocStage ? fmtJourneyDuration(firstDocStage.avg_duration_seconds) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-appTextSecondary text-[11px]">Avg Time to Subscription Upgrade</p>
                  <p className="text-xl font-black text-emerald-400 font-mono">
                    {upgradeStage ? fmtJourneyDuration(upgradeStage.avg_duration_seconds) : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-appBorder">
              <Badge variant={hasJourneyData ? 'success' : 'secondary'}>{hasJourneyData ? 'Real Postgres Data' : 'Loading'}</Badge>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Default fallback view if unknown subitem
  return (
    <Card>
      <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-2">
        Analytics Dashboard Overview
      </h3>
      {renderAnalyticsToolbar()}
      <p className="text-xs text-appTextSecondary">Select a subview from the sidebar to inspect specific analytics telemetry.</p>
    </Card>
  );
};

export default AnalyticsView;
