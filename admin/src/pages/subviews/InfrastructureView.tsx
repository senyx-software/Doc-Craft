import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import { toast } from '../../store/toastStore';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import ProviderLimitsInfo from '../../components/infrastructure/ProviderLimitsInfo';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { AlertTriangle, Cpu, ShieldCheck, RefreshCw, Lock, MessageSquare, FileCode, Eye, Copy, Check, Terminal, X, Inbox } from 'lucide-react';
import { adminApiClient } from '../../api/adminApiClient';

interface InfrastructureViewProps {
  activeSubItem: string;
}

interface McpSession {
  id: string;
  user_email: string | null;
  document_type: string | null;
  status: string;
  updated_at: string;
  message_count: number;
}

interface McpTemplate {
  id: string;
  name: string;
  document_type: string | null;
  is_premium: boolean;
  sessions_using: number;
}

const ChatMcpInspectionSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'templates'>('sessions');
  const [selectedResource, setSelectedResource] = useState<{ uri: string; title: string; jsonContent: unknown } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState<McpSession[]>([]);
  const [templates, setTemplates] = useState<McpTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReachable, setIsReachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [sessionsRes, templatesRes] = await Promise.all([
          adminApiClient.getMcpChatSessions(),
          adminApiClient.getMcpTemplates(),
        ]);
        if (!cancelled) {
          setSessions(sessionsRes?.sessions || []);
          setTemplates(templatesRes?.templates || []);
          setIsReachable(!sessionsRes?.error && !templatesRes?.error);
        }
      } catch (err) {
        console.warn('Failed to load MCP session/template data:', err);
        if (!cancelled) setIsReachable(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleInspectSession = async (sess: McpSession) => {
    try {
      const resource = await adminApiClient.inspectChatSession(sess.id);
      setSelectedResource({ uri: `chat://sessions/${sess.id}`, title: `Chat Session Record — ${sess.id}`, jsonContent: resource });
    } catch (error) {
      toast.error('Session inspection failed', error);
    }
  };

  const handleInspectTemplate = (tpl: McpTemplate) => {
    setSelectedResource({
      uri: `chat://templates/${tpl.id}`,
      title: `Template Record — ${tpl.name}`,
      jsonContent: tpl,
    });
  };

  const copyToClipboard = () => {
    if (!selectedResource) return;
    navigator.clipboard.writeText(JSON.stringify(selectedResource.jsonContent, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 text-left">
      {/* MCP Connection Header Card */}
      <Card className="space-y-4 border-l-4 border-l-purple-500">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-gray-200/60 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <Terminal size={18} className="text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-900 dark:text-white">
                Chat Service MCP Integration Client (Model Context Protocol)
              </h3>
              {isLoading ? (
                <Badge variant="secondary">Checking…</Badge>
              ) : (
                <Badge variant={isReachable ? 'success' : 'danger'}>{isReachable ? 'Reachable' : 'Unreachable'}</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Real records from the Chat Service's own database (same shared Postgres), shown here for admin
              inspection — not fetched live over the MCP resource protocol, since the Chat Service's real MCP
              server (<code className="text-purple-600 dark:text-purple-400 font-bold font-mono">services/chat/src/services/mcp.service.ts</code>) exposes tools, not resources.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center gap-1.5">
              <Lock size={12} /> Read-Only Enforcement Active
            </div>
          </div>
        </div>

        {/* MCP Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-white/5 rounded-md border border-gray-200/60 dark:border-white/10">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">MCP Server Endpoint</span>
            <span className="font-mono font-bold text-gray-900 dark:text-white text-[11px]">chat:3016/api/mcp (SSE)</span>
          </div>
          <div className="p-3 bg-white/5 rounded-md border border-gray-200/60 dark:border-white/10">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">Protocol Version</span>
            <span className="font-mono font-bold text-purple-600 dark:text-purple-400">2024-11-05</span>
          </div>
          <div className="p-3 bg-white/5 rounded-md border border-gray-200/60 dark:border-white/10">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">Security Scope</span>
            <span className="font-mono font-bold text-emerald-500">Read-Only Guard</span>
          </div>
          <div className="p-3 bg-white/5 rounded-md border border-gray-200/60 dark:border-white/10">
            <span className="text-[10px] text-gray-400 uppercase font-bold block">Mutation Tools</span>
            <span className="font-mono font-bold text-rose-500">Disabled (Locked)</span>
          </div>
        </div>
      </Card>

      {/* Resource Tab Navigation */}
      <Card className="">
        <div className="flex items-center gap-4 pb-4 border-b border-gray-200/60 dark:border-white/10 mb-4">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'sessions'
                ? 'bg-purple-600 text-white shadow-glow'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <MessageSquare size={14} /> Session Resources (chat://session/&#123;id&#125;)
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'templates'
                ? 'bg-purple-600 text-white shadow-glow'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <FileCode size={14} /> Template Resources (chat://templates/&#123;type&#125;)
          </button>
        </div>

        {/* Sessions Inspector Table */}
        {activeTab === 'sessions' && (
          <div className="overflow-x-auto">
            {isLoading ? (
              <p className="text-xs text-gray-400 py-6 text-center">Loading real session records…</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center flex items-center justify-center gap-1.5"><Inbox size={14} /> No chat sessions recorded yet</p>
            ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Session Resource URI</th>
                  <th className="pb-3 font-bold">Client Email</th>
                  <th className="pb-3 font-bold">Doc Type</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold">Messages</th>
                  <th className="pb-3 text-right font-bold">Inspect Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono font-bold text-purple-600 dark:text-purple-400">chat://sessions/{s.id}</td>
                    <td className="py-3 font-bold text-gray-900 dark:text-white">{s.user_email || '—'}</td>
                    <td className="py-3 capitalize"><Badge variant="primary">{s.document_type || '—'}</Badge></td>
                    <td className="py-3 font-mono text-gray-600 dark:text-gray-300 font-semibold">{s.status}</td>
                    <td className="py-3 font-mono text-gray-500">{s.message_count} msgs</td>
                    <td className="py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleInspectSession(s)}
                        className="text-[11px] font-bold flex items-center gap-1 ml-auto"
                      >
                        <Eye size={12} /> Inspect Record
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        )}

        {/* Templates Inspector Table */}
        {activeTab === 'templates' && (
          <div className="overflow-x-auto">
            {isLoading ? (
              <p className="text-xs text-gray-400 py-6 text-center">Loading real template records…</p>
            ) : templates.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center flex items-center justify-center gap-1.5"><Inbox size={14} /> No templates found</p>
            ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Template Resource URI</th>
                  <th className="pb-3 font-bold">Document Name</th>
                  <th className="pb-3 font-bold">Document Type</th>
                  <th className="pb-3 font-bold">Premium</th>
                  <th className="pb-3 font-bold">Sessions Using</th>
                  <th className="pb-3 text-right font-bold">Inspect Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 font-mono font-bold text-purple-600 dark:text-purple-400">chat://templates/{t.id}</td>
                    <td className="py-3 font-bold text-gray-900 dark:text-white">{t.name}</td>
                    <td className="py-3 font-mono text-gray-500">{t.document_type || '—'}</td>
                    <td className="py-3">{t.is_premium ? <Badge variant="warning">Premium</Badge> : <Badge variant="secondary">Free</Badge>}</td>
                    <td className="py-3 font-mono font-bold text-emerald-500">{t.sessions_using}</td>
                    <td className="py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleInspectTemplate(t)}
                        className="text-[11px] font-bold flex items-center gap-1 ml-auto"
                      >
                        <Eye size={12} /> Inspect Template
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        )}
      </Card>

      {/* Resource Inspection Modal */}
      {selectedResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
          <Card className="max-w-2xl w-full p-6 space-y-4 border-gray-200 dark:border-white/10 shadow-2xl relative">
            <div className="pb-3 border-b border-gray-200/60 dark:border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Terminal size={16} className="text-purple-600 dark:text-purple-400" />
                  {selectedResource.title}
                </h3>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">{selectedResource.uri}</p>
              </div>
              <button onClick={() => setSelectedResource(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={16} /></button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-gray-500 uppercase font-bold">MCP Read-Only Resource Payload</label>
                <button
                  onClick={copyToClipboard}
                  className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-bold"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
              </div>
              <textarea
                readOnly
                value={JSON.stringify(selectedResource.jsonContent, null, 2)}
                className="w-full h-80 p-3 font-mono text-xs bg-neutral-900 text-emerald-400 rounded-md border border-neutral-800"
              />
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-gray-200/60 dark:border-white/10">
              <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                <Lock size={10} /> MCP Client Mode: Read-Only (Mutation tools disabled)
              </span>
              <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setSelectedResource(null)}><X size={12} /> Close Inspection</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

interface MicroserviceHealth {
  name: string;
  port: number | null;
  status: 'Online' | 'Degraded' | 'Offline';
  latency_ms: number | null;
  uptime_pct: number | null;
}

const InfrastructureView: React.FC<InfrastructureViewProps> = ({ activeSubItem }) => {
  const [microservices, setMicroservices] = useState<MicroserviceHealth[]>([]);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [overallStatus, setOverallStatus] = useState<'healthy' | 'degraded' | null>(null);

  const loadHealthFromApi = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getInfrastructureHealth();
      if (data && Array.isArray(data.services)) {
        setMicroservices(data.services);
        setOverallStatus(data.status === 'healthy' ? 'healthy' : 'degraded');
      }
    } catch (err) {
      console.warn('Failed to load infrastructure health:', err);
      setMicroservices([]);
      setOverallStatus(null);
    } finally {
      setIsLoadingHealth(false);
    }
  });

  const showsProviderLimits = activeSubItem === 'inf_api_usage';
  useEffect(() => {
    if (!showsProviderLimits) loadHealthFromApi();
  }, [loadHealthFromApi, showsProviderLimits]);

  if (showsProviderLimits) return <ProviderLimitsInfo />;

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
            <Cpu size={16} className="text-purple-600 dark:text-purple-400" />
            Microservices & Cluster Infrastructure Health {microservices.length > 0 ? `(${microservices.length} Services)` : ''}
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Live HTTP/DB/Redis health check, run on demand — no historical uptime data is tracked, so uptime shows as unavailable rather than a fabricated number.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadHealthFromApi} disabled={isLoadingHealth} className="flex items-center gap-1">
            <RefreshCw size={12} className={isLoadingHealth ? 'animate-spin' : ''} /> Refresh Health
          </Button>
          {overallStatus && (
            <Badge variant={overallStatus === 'healthy' ? 'success' : 'warning'}>
              {overallStatus === 'healthy' ? 'All Systems Operational' : 'Degraded'}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoadingHealth && microservices.length === 0 ? (
          <p className="text-xs text-gray-400 col-span-3 text-center py-6">Checking live service health…</p>
        ) : microservices.length === 0 ? (
          <p className="text-xs text-gray-400 col-span-3 text-center py-6">Could not reach the health check endpoint.</p>
        ) : microservices.map((svc, idx) => (
          <Card key={idx} className="flex flex-col justify-between h-[150px]">
            <div className="text-left space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900 dark:text-white">{svc.name}</span>
                <Badge variant={svc.status === 'Online' ? 'success' : svc.status === 'Degraded' ? 'warning' : 'danger'}>{svc.status}</Badge>
              </div>
              <p className="text-xs text-gray-500 font-mono">Port: {svc.port != null ? `:${svc.port}` : '—'}</p>
              <p className="text-lg font-extrabold text-purple-600 dark:text-purple-400 font-mono">{svc.latency_ms != null ? `${svc.latency_ms}ms` : '—'}</p>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 font-mono border-t border-gray-200/60 dark:border-white/10 pt-2">
              <span>Uptime: {svc.uptime_pct != null ? `${svc.uptime_pct}%` : 'not tracked'}</span>
              <span className="flex items-center gap-1">
                <ShieldCheck size={10} className={svc.status === 'Online' ? 'text-emerald-500' : 'text-rose-500'} />
                {svc.status === 'Online' ? 'Operational' : svc.status}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {activeSubItem === 'inf_mcp_chat' && (
        <ChatMcpInspectionSection />
      )}

      {activeSubItem === 'inf_sentry' && (
        <Card className="">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Sentry Microservice Exception Logs
          </h3>
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <AlertTriangle size={24} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">No Sentry integration configured</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 max-w-sm">
              None of DocCraft's services have a SENTRY_DSN configured, so there's no real exception
              feed to show. Add error tracking (e.g. self-hosted GlitchTip, or a Sentry account) and
              wire a DSN into each service to populate this page with real data.
            </p>
          </div>
        </Card>
      )}

      {activeSubItem === 'inf_deployments' && (
        <Card className="">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Production Deployment Log
          </h3>
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Inbox size={24} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">No deployment tracking configured</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 max-w-sm">
              This deployment runs via manual <code className="font-mono">docker compose up</code> — there's no
              CI/CD pipeline recording release versions, branches, or deployers. Wire up a real deployment
              log (e.g. record a row on every CI deploy) to populate this page with real data.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default InfrastructureView;
