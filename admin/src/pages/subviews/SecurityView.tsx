import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import { getErrorMessage } from '../../store/toastStore';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import {
  Search, ShieldAlert, RefreshCw,
  Filter, X, Bot, AlertTriangle, UserX, Monitor, Globe,
  History, CheckCircle2, LogOut
} from 'lucide-react';
import SystemDialogModal, { type DialogType } from '../../components/ui/SystemDialogModal';
import { adminApiClient } from '../../api/adminApiClient';
import Pagination from '../../components/ui/Pagination';
import { usePagination } from '../../hooks/usePagination';
import SortableHeader from '../../components/ui/SortableHeader';
import { sortRows, useSortToggle } from '../../hooks/useSortToggle';

interface SecurityViewProps {
  activeSubItem: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditLogEntry {
  id: string;
  admin_id?: string;
  admin_email?: string;
  action: string;
  module: string;
  ip_address: string;
  user_agent?: string;
  totp_verified: boolean;
  details?: Record<string, unknown>;
  created_at: string;
}

interface AuditFilters {
  module: string;
  action: string;
  admin_email: string;
  ip_address: string;
  totp_verified: '' | 'true' | 'false';
  date_from: string;
  date_to: string;
}

const DEFAULT_FILTERS: AuditFilters = {
  module: '', action: '', admin_email: '', ip_address: '',
  totp_verified: '', date_from: '', date_to: '',
};

const LIMIT = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SkeletonRow: React.FC<{ cols: number }> = ({ cols }) => (
  <tr className="animate-pulse">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-3 pr-4">
        <div className="h-3 bg-gray-200 dark:bg-white/10 rounded-md" style={{ width: `${55 + (i * 11) % 35}%` }} />
      </td>
    ))}
  </tr>
);

const formatTs = (ts: string) => {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(ts).substring(0, 19).replace('T', ' ');
  }
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SecurityView: React.FC<SecurityViewProps> = ({ activeSubItem }) => {

  // ─── Dialog State ──────────────────────────────────────────────────────────
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean; title?: string; message: string;
    type?: DialogType; confirmText?: string; onConfirm?: () => void;
  }>({ isOpen: false, message: '' });

  const showSystemDialog = (
    message: string, title?: string, type: DialogType = 'info',
    confirmText?: string, onConfirm?: () => void,
  ) => setDialogState({ isOpen: true, title, message, type, confirmText, onConfirm });

  // ─── Global State & Search ─────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');

  // Sort state per table — hooks stay unconditional (called every render)
  // even though only one table's data is visible at a time, since the early
  // `if (activeSubItem === ...)` returns below happen after all hooks run.
  const { sort: ipSort, toggleSort: toggleIpSort } = useSortToggle<'ip' | 'user' | 'action' | 'timestamp'>();
  const { sort: rateSort, toggleSort: toggleRateSort } = useSortToggle<'ip' | 'user' | 'action' | 'timestamp'>();
  const { sort: botSort, toggleSort: toggleBotSort } = useSortToggle<'ip' | 'agent' | 'reason' | 'risk' | 'timestamp'>();
  const { sort: abuseSort, toggleSort: toggleAbuseSort } = useSortToggle<'reporter' | 'target' | 'reason' | 'severity'>();
  const { sort: sessionSort, toggleSort: toggleSessionSort } = useSortToggle<'user' | 'ip' | 'device' | 'status'>();

  // ─── 1. Security Alerts State ──────────────────────────────────────────────
  const [alerts, setAlerts] = useState<Wire.SecurityAlert[]>([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true);

  const loadAlerts = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getSecurityAlerts();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Alerts API fetch failed:', err);
      setAlerts([]);
    } finally {
      setIsLoadingAlerts(false);
    }
  });

  const handleResolveAlert = async (id: string) => {
    try {
      await adminApiClient.resolveSecurityAlert(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'Resolved' } : a));
      showSystemDialog(`Security alert #${id} marked as resolved in database.`, 'Security Alert Updated', 'success');
    } catch (err) {
      showSystemDialog(`Failed to resolve alert: ${getErrorMessage(err)}`, 'API Error', 'error');
    }
  };

  // ─── 2. Active Sessions State ──────────────────────────────────────────────
  const [sessions, setSessions] = useState<Wire.SecuritySession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const loadSessions = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getActiveSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Sessions API fetch failed:', err);
      setSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  });

  const handleTerminateSession = (id: string) => {
    showSystemDialog(
      `Are you sure you want to terminate session ${id}? JWT token will be revoked in database.`,
      'Confirm Session Termination', 'warning', 'Terminate',
      async () => {
        try {
          await adminApiClient.terminateSession(id);
          setSessions(prev => prev.filter(s => s.id !== id));
          showSystemDialog(`User session ${id} terminated and revoked in database.`, 'Session Terminated', 'success');
        } catch (err) {
          showSystemDialog(`Failed to terminate session: ${getErrorMessage(err)}`, 'API Error', 'error');
        }
      }
    );
  };

  // ─── 3. IP Access Logs State ───────────────────────────────────────────────
  const [ipLogs, setIpLogs] = useState<Wire.IpLog[]>([]);
  const [isLoadingIpLogs, setIsLoadingIpLogs] = useState(true);

  const loadIpLogs = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getIpLogs();
      setIpLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('IP logs API fetch failed:', err);
      setIpLogs([]);
    } finally {
      setIsLoadingIpLogs(false);
    }
  });

  // ─── 4. Rate Limit Violations State ────────────────────────────────────────
  const [rateLimitLogs, setRateLimitLogs] = useState<Wire.RateLimitLog[]>([]);
  const [isLoadingRateLimits, setIsLoadingRateLimits] = useState(true);

  const loadRateLimitLogs = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getRateLimitLogs();
      setRateLimitLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Rate limit logs API fetch failed:', err);
      setRateLimitLogs([]);
    } finally {
      setIsLoadingRateLimits(false);
    }
  });

  // ─── 5. Bot Detection Logs State ───────────────────────────────────────────
  const [botLogs, setBotLogs] = useState<Wire.BotLog[]>([]);
  const [isLoadingBotLogs, setIsLoadingBotLogs] = useState(true);

  const loadBotLogs = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getBotDetectionLogs();
      setBotLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Bot logs API fetch failed:', err);
      setBotLogs([]);
    } finally {
      setIsLoadingBotLogs(false);
    }
  });

  // ─── 6. Account Abuse Reports State ───────────────────────────────────────
  const [abuseReports, setAbuseReports] = useState<Wire.AbuseReport[]>([]);
  const [isLoadingAbuse, setIsLoadingAbuse] = useState(true);

  const loadAbuseReports = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getAbuseReports();
      setAbuseReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Abuse reports API fetch failed:', err);
      setAbuseReports([]);
    } finally {
      setIsLoadingAbuse(false);
    }
  });

  const handleResolveAbuseReport = async (id: string) => {
    try {
      await adminApiClient.resolveAbuseReport(id);
      setAbuseReports(prev => prev.map(a => a.id === id ? { ...a, status: 'Resolved' } : a));
      showSystemDialog(`Abuse report #${id} marked as resolved in database.`, 'Abuse Report Resolved', 'success');
    } catch (err) {
      showSystemDialog(`Failed to resolve report: ${getErrorMessage(err)}`, 'API Error', 'error');
    }
  };

  // ─── 7. Audit Logs Live State ──────────────────────────────────────────────
  const [auditLogs, setAuditLogs]   = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(true);
  const [errorAudit, setErrorAudit] = useState<string | null>(null);
  const [isFetchingAll, setIsFetchingAll] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<AuditLogEntry | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<AuditFilters>(DEFAULT_FILTERS);

  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadAuditLogs = useCommittedEvent(async (pageNum: number = 1, appliedFilters: AuditFilters = filters) => {



    try {
      const params: Record<string, unknown> = { page: pageNum, limit: LIMIT };
      if (appliedFilters.module)                      params.module       = appliedFilters.module;
      if (appliedFilters.action)                      params.action       = appliedFilters.action;
      if (appliedFilters.admin_email)                 params.admin_email  = appliedFilters.admin_email;
      if (appliedFilters.ip_address)                  params.ip_address   = appliedFilters.ip_address;
      if (appliedFilters.totp_verified !== '')        params.totp_verified = appliedFilters.totp_verified === 'true';
      if (appliedFilters.date_from)                   params.date_from    = appliedFilters.date_from;
      if (appliedFilters.date_to)                     params.date_to      = appliedFilters.date_to;

      const res = await adminApiClient.getAuditLogs(params);
setIsFetchingAll(false);
setErrorAudit(null);
      setAuditLogs(Array.isArray(res?.items) ? res.items : []);
      setTotalCount(res?.total ?? 0);
      setTotalPages(res?.total_pages ?? 1);
      setPage(pageNum);
    } catch (err) {
      setErrorAudit(getErrorMessage(err) || 'Failed to load audit logs');
    } finally {
      setIsLoadingAudit(false);
    }
  });

  const handleFetchAllAudit = async () => {
    setIsLoadingAudit(true);
    setIsFetchingAll(true);
    setErrorAudit(null);
    try {
      const data = await adminApiClient.getAllAuditLogs();
      const items: AuditLogEntry[] = Array.isArray(data) ? data : [];
      setAuditLogs(items);
      setTotalCount(items.length);
      setTotalPages(1);
      setPage(1);
    } catch (err) {
      setErrorAudit(getErrorMessage(err) || 'Failed to fetch complete audit history');
      setIsFetchingAll(false);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleInspectAudit = async (logId: string) => {
    setSelectedDetail(auditLogs.find(a => a.id === logId) || null);
    setIsLoadingDetail(true);
    try {
      const detail = await adminApiClient.getAuditLogDetail(logId);
      setSelectedDetail(detail);
    } catch {
      // Keep local
    } finally {
      setIsLoadingDetail(false);
    }
  };





  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  // ─── Load Subview Data on Navigation ───────────────────────────────────────
  useEffect(() => {
    if (activeSubItem === 'sec_audit') loadAuditLogs(1, filters);
    else if (activeSubItem === 'sec_ip_logs') loadIpLogs();
    else if (activeSubItem === 'sec_rate_limits') loadRateLimitLogs();
    else if (activeSubItem === 'sec_bot_logs' || activeSubItem === 'sec_bot_detection') loadBotLogs();
    else if (activeSubItem === 'sec_abuse_reports' || activeSubItem === 'sec_abuse') loadAbuseReports();
    else if (activeSubItem === 'sec_sessions') loadSessions();
    else loadAlerts(); // default view (sec_suspicious / sec_alerts / home)
  }, [activeSubItem, filters, loadAbuseReports, loadAlerts, loadAuditLogs, loadBotLogs, loadIpLogs, loadRateLimitLogs, loadSessions]);

  // ─── Filter Toolbar Component ─────────────────────────────────────────────
  const renderFilterToolbar = (title: string, count: number, onRefresh?: () => void, refreshing?: boolean) => (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200/60 dark:border-white/10 mb-4 text-left">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldAlert size={16} className="text-purple-600 dark:text-purple-400" />
          {title}
        </h3>
        <Badge variant="primary">{count}</Badge>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {activeSubItem === 'sec_audit' && (
          <>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-md border transition-colors
                ${activeFilterCount > 0
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-purple-400'
                }`}
            >
              <Filter size={11} />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>

            <Button
              variant={isFetchingAll ? 'violet' : 'outline'}
              size="sm"
              onClick={handleFetchAllAudit}
              disabled={isLoadingAudit}
              className="text-[11px] font-bold flex items-center gap-1"
            >
              <History size={12} /> Fetch All History
            </Button>
          </>
        )}

        {onRefresh && (
          <Button
            variant="outline" size="sm"
            onClick={() => { setIsFetchingAll(false); onRefresh(); }}
            disabled={refreshing}
            className="flex items-center gap-1"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </Button>
        )}

        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search records..."
            className="input-field pl-8 !py-1 w-40"
          />
        </div>
      </div>
    </div>
  );

  // Filtered + sorted + paginated data for every plain table below, computed
  // unconditionally (not inside the `if (activeSubItem === ...)` branches)
  // so the sort/pagination hooks obey the rules-of-hooks regardless of which
  // branch ends up rendering this pass.
  const filteredIpLogsList = ipLogs.filter(log =>
    (log.ip_address || log.ip || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.user_email || log.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.action || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const sortedIpLogs = sortRows(filteredIpLogsList, ipSort, (row, key) => {
    if (key === 'ip') return row.ip_address || row.ip || '';
    if (key === 'user') return row.user_email || row.user || '';
    if (key === 'action') return row.action || '';
    if (key === 'timestamp') return row.created_at || row.date || '';
    return '';
  });
  const ipPagination = usePagination(sortedIpLogs, 8);

  const filteredRateLogsList = rateLimitLogs.filter(log =>
    (log.ip_address || log.ip || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.user_email || log.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.action || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const sortedRateLogs = sortRows(filteredRateLogsList, rateSort, (row, key) => {
    if (key === 'ip') return row.ip_address || row.ip || '';
    if (key === 'user') return row.user_email || row.user || '';
    if (key === 'action') return row.action || '';
    if (key === 'timestamp') return row.created_at || row.date || '';
    return '';
  });
  const ratePagination = usePagination(sortedRateLogs, 8);

  const filteredBotLogsList = botLogs.filter(b =>
    (b.ip_address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.user_agent || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const sortedBotLogs = sortRows(filteredBotLogsList, botSort, (row, key) => {
    if (key === 'ip') return row.ip_address || '';
    if (key === 'agent') return row.user_agent || '';
    if (key === 'reason') return row.reason || '';
    if (key === 'risk') return row.risk_score || 0;
    if (key === 'timestamp') return row.created_at || '';
    return '';
  });
  const botPagination = usePagination(sortedBotLogs, 8);

  const filteredAbuseList = abuseReports.filter(rep =>
    (rep.reporter_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (rep.target_user_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (rep.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const sortedAbuse = sortRows(filteredAbuseList, abuseSort, (row, key) => {
    if (key === 'reporter') return row.reporter_email || '';
    if (key === 'target') return row.target_user_email || '';
    if (key === 'reason') return row.reason || '';
    if (key === 'severity') return row.severity || '';
    return '';
  });
  const abusePagination = usePagination(sortedAbuse, 8);

  const filteredSessionsList = sessions.filter(s =>
    (s.user_email || s.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.ip_address || s.ip || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.device_agent || s.device || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const sortedSessions = sortRows(filteredSessionsList, sessionSort, (row, key) => {
    if (key === 'user') return row.user_email || row.user || '';
    if (key === 'ip') return row.ip_address || row.ip || '';
    if (key === 'device') return row.device_agent || row.device || '';
    if (key === 'status') return row.last_active || '';
    return '';
  });
  const sessionPagination = usePagination(sortedSessions, 8);

  // ══════════════════════════════════════════════════════════════════════════
  // 1. IP Access Logs (GET /api/v1/admin/security/ip-logs)
  // ══════════════════════════════════════════════════════════════════════════
  if (activeSubItem === 'sec_ip_logs') {
    return (
      <Card className="text-left">
        {renderFilterToolbar('IP Access & Gateway Logs (GET /security/ip-logs)', sortedIpLogs.length, loadIpLogs, isLoadingIpLogs)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                <SortableHeader label="IP Address" sortKey="ip" sort={ipSort} onSort={toggleIpSort} />
                <SortableHeader label="User Account" sortKey="user" sort={ipSort} onSort={toggleIpSort} />
                <SortableHeader label="Action Event" sortKey="action" sort={ipSort} onSort={toggleIpSort} />
                <th className="pb-3 font-bold">User Agent</th>
                <SortableHeader label="Timestamp" sortKey="timestamp" sort={ipSort} onSort={toggleIpSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
              {isLoadingIpLogs
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                : ipPagination.paged.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Globe size={13} className="text-purple-500" /> {log.ip_address || log.ip}
                    </td>
                    <td className="py-3 font-medium text-gray-900 dark:text-white">{log.user_email || log.user}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400 font-mono">{log.action}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400 font-medium truncate max-w-[200px]">{log.user_agent || log.agent}</td>
                    <td className="py-3 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatTs(log.created_at || log.date || '')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={ipPagination.page} totalPages={ipPagination.totalPages} totalItems={ipPagination.totalItems} pageSize={ipPagination.pageSize} onChange={ipPagination.setPage} />
        </div>
      </Card>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Rate Limit Violations (GET /api/v1/admin/security/rate-limits)
  // ══════════════════════════════════════════════════════════════════════════
  if (activeSubItem === 'sec_rate_limits') {
    return (
      <Card className="text-left">
        {renderFilterToolbar('Rate Limit & WAF Violations (GET /security/rate-limits)', sortedRateLogs.length, loadRateLimitLogs, isLoadingRateLimits)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                <SortableHeader label="Blocked IP Address" sortKey="ip" sort={rateSort} onSort={toggleRateSort} />
                <SortableHeader label="Target User" sortKey="user" sort={rateSort} onSort={toggleRateSort} />
                <SortableHeader label="Violation Event" sortKey="action" sort={rateSort} onSort={toggleRateSort} />
                <th className="pb-3 font-bold">WAF Engine</th>
                <SortableHeader label="Timestamp" sortKey="timestamp" sort={rateSort} onSort={toggleRateSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
              {isLoadingRateLimits
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                : ratePagination.paged.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-rose-500/5 transition-colors">
                    <td className="py-3 font-mono font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle size={13} /> {log.ip_address || log.ip}
                    </td>
                    <td className="py-3 font-medium text-gray-900 dark:text-white">{log.user_email || log.user}</td>
                    <td className="py-3 text-gray-900 dark:text-white font-mono">{log.action}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400 font-medium">{log.user_agent || log.agent || 'Gateway Firewall'}</td>
                    <td className="py-3 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatTs(log.created_at || log.date || '')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={ratePagination.page} totalPages={ratePagination.totalPages} totalItems={ratePagination.totalItems} pageSize={ratePagination.pageSize} onChange={ratePagination.setPage} />
        </div>
      </Card>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Bot Detection Logs (GET /api/v1/admin/security/bot-logs)
  // ══════════════════════════════════════════════════════════════════════════
  if (activeSubItem === 'sec_bot_logs' || activeSubItem === 'sec_bot_detection') {
    return (
      <Card className="text-left">
        {renderFilterToolbar('Bot & Scraper Detection Logs (GET /security/bot-logs)', sortedBotLogs.length, loadBotLogs, isLoadingBotLogs)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                <SortableHeader label="IP Address" sortKey="ip" sort={botSort} onSort={toggleBotSort} />
                <th className="pb-3 font-bold">Detected User-Agent</th>
                <SortableHeader label="Detection Reason" sortKey="reason" sort={botSort} onSort={toggleBotSort} />
                <SortableHeader label="Risk Score" sortKey="risk" sort={botSort} onSort={toggleBotSort} />
                <th className="pb-3 font-bold">Status</th>
                <SortableHeader label="Timestamp" sortKey="timestamp" sort={botSort} onSort={toggleBotSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
              {isLoadingBotLogs
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                : botPagination.paged.map((bot) => (
                  <tr key={bot.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Bot size={14} className="text-purple-500" /> {bot.ip_address}
                    </td>
                    <td className="py-3 font-mono text-gray-500 truncate max-w-[180px]">{bot.user_agent}</td>
                    <td className="py-3 font-medium text-gray-900 dark:text-white">{bot.reason}</td>
                    <td className="py-3 font-mono font-bold text-amber-500">{(bot.risk_score * 100).toFixed(0)}%</td>
                    <td className="py-3">
                      <Badge variant={bot.status === 'Blocked' ? 'danger' : 'warning'}>{bot.status}</Badge>
                    </td>
                    <td className="py-3 text-right text-gray-500 whitespace-nowrap">{formatTs(bot.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={botPagination.page} totalPages={botPagination.totalPages} totalItems={botPagination.totalItems} pageSize={botPagination.pageSize} onChange={botPagination.setPage} />
        </div>
      </Card>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Account Abuse Reports (GET /api/v1/admin/security/abuse-reports)
  // ══════════════════════════════════════════════════════════════════════════
  if (activeSubItem === 'sec_abuse_reports' || activeSubItem === 'sec_abuse') {
    return (
      <Card className="text-left">
        {renderFilterToolbar('Account Abuse Reports (GET /security/abuse-reports)', sortedAbuse.length, loadAbuseReports, isLoadingAbuse)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Report ID</th>
                <SortableHeader label="Target Account" sortKey="target" sort={abuseSort} onSort={toggleAbuseSort} />
                <SortableHeader label="Abuse Reason / Description" sortKey="reason" sort={abuseSort} onSort={toggleAbuseSort} />
                <SortableHeader label="Reporter" sortKey="reporter" sort={abuseSort} onSort={toggleAbuseSort} />
                <SortableHeader label="Severity" sortKey="severity" sort={abuseSort} onSort={toggleAbuseSort} />
                <th className="pb-3 font-bold">Status</th>
                <th className="pb-3 text-right font-bold">Resolve Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
              {isLoadingAbuse
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                : abusePagination.paged.map((rep) => (
                  <tr key={rep.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono font-bold text-purple-600 dark:text-purple-400">{rep.id}</td>
                    <td className="py-3 font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <UserX size={13} className="text-rose-500" /> {rep.target_user_email}
                    </td>
                    <td className="py-3 text-gray-700 dark:text-gray-300 font-medium">{rep.reason}</td>
                    <td className="py-3 text-gray-500 text-[11px]">{rep.reporter_email}</td>
                    <td className="py-3">
                      <Badge variant={rep.severity === 'high' ? 'danger' : 'warning'}>{rep.severity.toUpperCase()}</Badge>
                    </td>
                    <td className="py-3">
                      <Badge variant={rep.status === 'Resolved' ? 'success' : 'secondary'}>{rep.status}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      {rep.status !== 'Resolved' && (
                        <Button variant="outline" size="sm" onClick={() => handleResolveAbuseReport(rep.id)} className="text-[10px] flex items-center gap-1">
                          <CheckCircle2 size={11} /> Mark Resolved
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={abusePagination.page} totalPages={abusePagination.totalPages} totalItems={abusePagination.totalItems} pageSize={abusePagination.pageSize} onChange={abusePagination.setPage} />
        </div>
      </Card>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Active Sessions (GET /api/v1/admin/security/sessions)
  // ══════════════════════════════════════════════════════════════════════════
  if (activeSubItem === 'sec_sessions') {
    return (
      <Card className="text-left">
        {renderFilterToolbar('Active Customer Sessions (GET /security/sessions)', sortedSessions.length, loadSessions, isLoadingSessions)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Session ID</th>
                <SortableHeader label="Account Email" sortKey="user" sort={sessionSort} onSort={toggleSessionSort} />
                <SortableHeader label="IP Address" sortKey="ip" sort={sessionSort} onSort={toggleSessionSort} />
                <SortableHeader label="Device & User Agent" sortKey="device" sort={sessionSort} onSort={toggleSessionSort} />
                <SortableHeader label="Activity Status" sortKey="status" sort={sessionSort} onSort={toggleSessionSort} />
                <th className="pb-3 text-right font-bold">Revoke Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
              {isLoadingSessions
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                : sessionPagination.paged.map((sess) => (
                  <tr key={sess.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono text-purple-600 dark:text-purple-400 font-bold">{sess.id}</td>
                    <td className="py-3 text-gray-900 dark:text-white font-bold">{sess.user_email || sess.user}</td>
                    <td className="py-3 font-mono text-gray-500 dark:text-gray-400">{sess.ip_address || sess.ip}</td>
                    <td className="py-3 text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
                      <Monitor size={13} /> {sess.device_agent || sess.device}
                    </td>
                    <td className="py-3">
                      <Badge variant={sess.last_active === 'Active now' ? 'success' : 'secondary'}>
                        {sess.last_active}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="danger"
                        className="!py-0.5 !px-2 text-[10px] flex items-center gap-1"
                        onClick={() => handleTerminateSession(sess.id)}
                      >
                        <LogOut size={10} /> Kill JWT
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={sessionPagination.page} totalPages={sessionPagination.totalPages} totalItems={sessionPagination.totalItems} pageSize={sessionPagination.pageSize} onChange={sessionPagination.setPage} />
        </div>
      </Card>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Audit Logs View (GET /api/v1/admin/audit-logs)
  // ══════════════════════════════════════════════════════════════════════════
  if (activeSubItem === 'sec_audit') {
    const filteredAudit = auditLogs.filter(a =>
      (a.admin_email  || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.admin_id     || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.action       || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.module       || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.ip_address   || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.id           || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="space-y-4 text-left">
        <Card className="">
          {renderFilterToolbar(
            isFetchingAll
              ? 'Complete Audit History — GET /api/v1/admin/audit-logs/all'
              : 'Immutable Security Audit Trail — GET /api/v1/admin/audit-logs',
            isFetchingAll ? filteredAudit.length : totalCount,
            () => loadAuditLogs(page),
            isLoadingAudit,
          )}

          {errorAudit && <p role="alert" className="py-3 text-rose-500">{errorAudit}</p>}
          {showFilters && (
            <form className="grid grid-cols-2 gap-3 p-3" onSubmit={event => {
              event.preventDefault(); setFilters(pendingFilters); setShowFilters(false);
            }}>
              {(['module', 'action', 'admin_email', 'ip_address', 'date_from', 'date_to'] as const).map(field => (
                <label key={field} className="text-xs">
                  {field.replaceAll('_', ' ')}
                  <input className="block w-full border rounded p-2 bg-transparent" type={field.startsWith('date_') ? 'date' : 'text'} value={pendingFilters[field]} onChange={event => setPendingFilters(value => ({ ...value, [field]: event.target.value }))} />
                </label>
              ))}
              <label className="text-xs">2FA verified
                <select className="block border p-2 bg-transparent" value={pendingFilters.totp_verified} onChange={event => setPendingFilters(value => ({ ...value, totp_verified: event.target.value as AuditFilters['totp_verified'] }))}>
                  <option value="">Any</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </label>
              <div className="flex gap-2"><Button type="submit">Apply filters</Button><Button type="button" onClick={() => { setPendingFilters(DEFAULT_FILTERS); setFilters(DEFAULT_FILTERS); setShowFilters(false); }}>Clear filters</Button></div>
            </form>
          )}
          {isLoadingDetail && <p role="status" className="p-3">Loading audit detail…</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Log ID</th>
                  <th className="pb-3 font-bold">Administrator</th>
                  <th className="pb-3 font-bold">Module</th>
                  <th className="pb-3 font-bold">Action Event</th>
                  <th className="pb-3 font-bold">2FA</th>
                  <th className="pb-3 font-bold">IP Address</th>
                  <th className="pb-3 font-bold">Timestamp</th>
                  <th className="pb-3 text-right font-bold">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {isLoadingAudit
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
                  : filteredAudit.map(item => (
                    <tr key={item.id} className="hover:bg-purple-500/5 transition-colors">
                      <td className="py-3 font-mono text-purple-600 dark:text-purple-400 font-bold text-[11px]">{item.id}</td>
                      <td className="py-3 text-gray-900 dark:text-white font-medium text-[11px]">
                        {item.admin_email || item.admin_id || <span className="text-gray-400 italic">System</span>}
                      </td>
                      <td className="py-3"><Badge variant="primary">{item.module || 'system'}</Badge></td>
                      <td className="py-3 text-gray-900 dark:text-white font-mono">{item.action}</td>
                      <td className="py-3">
                        <Badge variant={item.totp_verified ? 'success' : 'secondary'}>
                          {item.totp_verified ? '2FA ✓' : 'Std'}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-gray-500 text-[11px]">{item.ip_address || '—'}</td>
                      <td className="py-3 text-gray-500 dark:text-gray-400 text-[11px] whitespace-nowrap">{formatTs(item.created_at)}</td>
                      <td className="py-3 text-right">
                        <button
                          disabled={isLoadingDetail}
                          onClick={() => handleInspectAudit(item.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 rounded-md transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>

        {!isFetchingAll && <Pagination page={page} totalPages={totalPages} totalItems={totalCount} pageSize={LIMIT} onChange={next => { void loadAuditLogs(next); }} />}

        {selectedDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <Card className="max-w-2xl w-full p-6 space-y-4 border-gray-200 dark:border-white/10 shadow-2xl relative">
              <div className="pb-3 border-b border-gray-200/60 dark:border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert size={16} className="text-purple-600 dark:text-purple-400" /> Audit Log Record Detail
                </h3>
                <button onClick={() => setSelectedDetail(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={16} /></button>
              </div>
              <pre className="p-3 bg-neutral-900 text-emerald-400 text-xs font-mono rounded-md max-h-60 overflow-y-auto">
                {JSON.stringify(selectedDetail, null, 2)}
              </pre>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setSelectedDetail(null)}><X size={12} /> Close</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. Suspicious Activity / Security Alerts Registry (default view)
  // ══════════════════════════════════════════════════════════════════════════
  const filteredAlerts = alerts.filter(alert =>
    (alert.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (alert.details || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (alert.severity || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4 text-left">
      {renderFilterToolbar('Suspicious Activity Registry (GET /security/alerts)', filteredAlerts.length, loadAlerts, isLoadingAlerts)}

      {isLoadingAlerts ? (
        <Card className="p-6 text-center text-gray-400 animate-pulse">Loading security alerts from database...</Card>
      ) : filteredAlerts.length === 0 ? (
        <Card className="p-6 text-center text-gray-400">No active security alerts found in database.</Card>
      ) : (
        filteredAlerts.map(alert => (
          <Card key={alert.id} className="flex items-start justify-between border-l-4 border-l-amber-500">
            <div className="space-y-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-900 dark:text-white">{alert.title}</span>
                <Badge variant={alert.severity === 'high' ? 'danger' : 'warning'}>{alert.severity.toUpperCase()}</Badge>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{alert.details}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={alert.status === 'Resolved' ? 'success' : 'secondary'}>{alert.status}</Badge>
              {alert.status === 'Pending' && (
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => handleResolveAlert(alert.id)}>
                  <CheckCircle2 size={12} /> Resolve Alert
                </Button>
              )}
            </div>
          </Card>
        ))
      )}

      <SystemDialogModal
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        confirmText={dialogState.confirmText}
        onConfirm={dialogState.onConfirm}
        onClose={() => setDialogState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default SecurityView;
