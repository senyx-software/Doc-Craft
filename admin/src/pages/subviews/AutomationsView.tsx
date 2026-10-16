import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import { getErrorMessage } from '../../store/toastStore';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import {
  Zap,
  Plus,
  Play,
  Trash2,
  RefreshCw,
  Radio,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  SkipForward,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Info,
  Terminal,
} from 'lucide-react';
import { adminApiClient } from '../../api/adminApiClient';
import SystemDialogModal, { type DialogType } from '../../components/ui/SystemDialogModal';

interface AutomationsViewProps {
  activeSubItem: string;
}

// ─── Type definitions ──────────────────────────────────────────────────────

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

interface ActionRow {
  action_type: string;
  target: string;
  payload: string; // JSON string
}

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  trigger_event: string;
  conditions: ConditionRow[];
  actions: ActionRow[];
  status: 'active' | 'disabled';
  retry_limit: number;
  created_at?: string;
  updated_at?: string;
  rawRule?: Wire.AutomationRule;
}

interface ExecutionLog {
  id: string;
  rule_id: string;
  rule_name: string;
  trigger_event: string;
  status: 'success' | 'failed' | 'retrying' | 'dead_letter';
  conditions_passed: boolean;
  retry_count: number;
  error_message?: string;
  created_at: string;
  action_results?: Record<string, unknown>[];
  payload?: Record<string, unknown>;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TRIGGER_EVENTS = [
  'quota.warning',
  'quota.exhausted',
  'payment.failed',
  'payment.succeeded',
  'user.registered',
  'user.suspended',
  'subscription.activated',
  'subscription.cancelled',
  'subscription.past_due',
  'document.generated',
];

const OPERATORS = [
  { value: 'equals', label: '= equals' },
  { value: 'not_equals', label: '≠ not equals' },
  { value: 'greater_than', label: '> greater than' },
  { value: 'less_than', label: '< less than' },
  { value: 'greater_than_or_equal', label: '≥ greater than or equal' },
  { value: 'less_than_or_equal', label: '≤ less than or equal' },
  { value: 'contains', label: '∋ contains' },
  { value: 'in', label: 'in (list)' },
];

const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email' },
  { value: 'grant_quota_override', label: 'Grant Quota Override' },
  { value: 'block_ip', label: 'Block IP Address' },
  { value: 'webhook', label: 'POST Webhook' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function statusBadgeVariant(s: string): 'success' | 'danger' | 'warning' | 'secondary' {
  if (s === 'success') return 'success';
  if (s === 'dead_letter' || s === 'failed') return 'danger';
  if (s === 'retrying') return 'warning';
  return 'secondary';
}

function statusLabel(s: string): string {
  if (s === 'dead_letter') return 'Dead Letter';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseConditionsFromRaw(raw: Wire.AutomationCondition[]): ConditionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({ field: c.field || '', operator: c.operator || 'equals', value: String(c.value ?? '') }));
}

function parseActionsFromRaw(raw: Wire.AutomationAction[]): ActionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => ({
    action_type: a.action_type || 'send_email',
    target: a.target || '',
    payload: JSON.stringify(a.payload || {}, null, 2),
  }));
}

function ruleFromApiResponse(r: Wire.AutomationRule): AutomationRule {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    trigger_event: r.trigger_event || '',
    conditions: parseConditionsFromRaw(r.conditions || []),
    actions: parseActionsFromRaw(r.actions || []),
    status: r.status,
    retry_limit: r.retry_limit ?? 3,
    created_at: r.created_at,
    updated_at: r.updated_at,
    rawRule: r,
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────

const selectClass =
  'w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded text-xs focus:border-appPrimary focus:outline-none';

const textareaClass =
  'w-full p-3 font-mono text-xs bg-appBg text-emerald-400 border border-appBorder rounded-lg focus:border-appPrimary focus:outline-none leading-relaxed';

// ─── Main Component ────────────────────────────────────────────────────────

const AutomationsView: React.FC<AutomationsViewProps> = ({ activeSubItem }) => {
  // ── State ───────────────────────────────────────────────────────────────
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Rule editor modal
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleTrigger, setRuleTrigger] = useState('quota.warning');
  const [ruleRetryLimit, setRuleRetryLimit] = useState(3);
  const [conditions, setConditions] = useState<ConditionRow[]>([{ field: 'used_quota', operator: 'greater_than_or_equal', value: '4' }]);
  const [actions, setActions] = useState<ActionRow[]>([{ action_type: 'send_email', target: 'notification_service', payload: '{}' }]);

  // Dry-run state
  const [dryRunRuleId, setDryRunRuleId] = useState('');
  const [dryRunPayload, setDryRunPayload] = useState('{\n  "event": "quota.warning",\n  "user_id": "usr_01",\n  "used_quota": 5\n}');
  const [dryRunResult, setDryRunResult] = useState<Wire.AutomationPreview | Wire.AutomationPreview[] | {error: string} | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);

  // Emit event console
  const [eventName, setEventName] = useState('quota.warning');
  const [eventPayload, setEventPayload] = useState('{\n  "user_id": "usr_99",\n  "used_quota": 5\n}');
  const [emitResult, setEmitResult] = useState<Wire.AutomationExecution[] | null>(null);
  const [isEmitting, setIsEmitting] = useState(false);

  // Log detail panel
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
  const [logRuleFilter, setLogRuleFilter] = useState<string>('all');

  // System dialog
  const [dialogState, setDialogState] = useState<{ isOpen: boolean; title?: string; message: string; type?: DialogType }>({ isOpen: false, message: '' });
  const showDialog = (message: string, title?: string, type: DialogType = 'info') =>
    setDialogState({ isOpen: true, title, message, type });

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCommittedEvent(async () => {

    try {
      const [rulesRes, logsRes] = await Promise.allSettled([
        adminApiClient.getAutomationRules(),
        adminApiClient.getAutomationExecutionLogs(),
      ]);

      if (rulesRes.status === 'fulfilled' && Array.isArray(rulesRes.value)) {
        setRules(rulesRes.value.map(ruleFromApiResponse));
      }

      if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) {
        setExecutionLogs(
          logsRes.value.map((l) => ({
            id: l.id,
            rule_id: l.rule_id,
            rule_name: l.rule_name || l.rule_id,
            trigger_event: l.trigger_event || '',
            status: l.status || 'success',
            conditions_passed: Boolean(l.conditions_passed),
            retry_count: l.retry_count || 0,
            error_message: l.error_message,
            created_at: l.created_at ? new Date(l.created_at).toLocaleString() : '—',
            action_results: l.action_results || [],
            payload: l.payload || {},
          }))
        );
      }
    } catch (err) {
      console.warn('[AutomationsView] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    loadData();
  }, [loadData, activeSubItem]);

  // ── Rule modal helpers ────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingRule(null);
    setRuleName('');
    setRuleDescription('');
    setRuleTrigger('quota.warning');
    setRuleRetryLimit(3);
    setConditions([{ field: 'used_quota', operator: 'greater_than_or_equal', value: '4' }]);
    setActions([{ action_type: 'send_email', target: 'notification_service', payload: '{}' }]);
    setShowRuleModal(true);
  };

  const openEditModal = (rule: AutomationRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRuleDescription(rule.description || '');
    setRuleTrigger(rule.trigger_event);
    setRuleRetryLimit(rule.retry_limit);
    setConditions(rule.conditions.length > 0 ? rule.conditions : [{ field: '', operator: 'equals', value: '' }]);
    setActions(rule.actions.length > 0 ? rule.actions : [{ action_type: 'send_email', target: '', payload: '{}' }]);
    setShowRuleModal(true);
  };

  const addConditionRow = () =>
    setConditions((prev) => [...prev, { field: '', operator: 'equals', value: '' }]);

  const removeConditionRow = (i: number) =>
    setConditions((prev) => prev.filter((_, idx) => idx !== i));

  const updateCondition = (i: number, key: keyof ConditionRow, val: string) =>
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));

  const addActionRow = () =>
    setActions((prev) => [...prev, { action_type: 'send_email', target: '', payload: '{}' }]);

  const removeActionRow = (i: number) =>
    setActions((prev) => prev.filter((_, idx) => idx !== i));

  const updateAction = (i: number, key: keyof ActionRow, val: string) =>
    setActions((prev) => prev.map((a, idx) => (idx === i ? { ...a, [key]: val } : a)));

  // ── Rule CRUD ────────────────────────────────────────────────────────────

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const conditionsPayload = conditions
      .filter((c) => c.field.trim())
      .map((c) => ({
        field: c.field,
        operator: c.operator,
        value: isNaN(Number(c.value)) ? c.value : Number(c.value),
      }));

    const actionsPayload = actions
      .filter((a) => a.action_type)
      .map((a) => {
        let parsedPayload = {};
        try { parsedPayload = JSON.parse(a.payload || '{}'); } catch { /* ignore */ }
        return { action_type: a.action_type, target: a.target, payload: parsedPayload };
      });

    const body = {
      name: ruleName,
      description: ruleDescription || undefined,
      trigger_event: ruleTrigger,
      conditions: conditionsPayload,
      actions: actionsPayload,
      retry_limit: ruleRetryLimit,
    };

    try {
      if (editingRule) {
        await adminApiClient.updateAutomationRule(editingRule.id, body);
        showDialog(`Rule '${ruleName}' updated successfully.`, 'Rule Updated', 'success');
      } else {
        await adminApiClient.createAutomationRule(body);
        showDialog(`Rule '${ruleName}' created and activated.`, 'Rule Created', 'success');
      }
      setShowRuleModal(false);
      loadData();
    } catch (err) {
      showDialog(getErrorMessage(err) || 'Failed to save rule.', 'Error', 'error');
    }
  };

  const handleToggleRule = async (rule: AutomationRule) => {
    const newStatus = rule.status === 'active' ? 'disabled' : 'active';
    try {
      await adminApiClient.updateAutomationRule(rule.id, { status: newStatus });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, status: newStatus } : r)));
    } catch (error) {
      showDialog(getErrorMessage(error), 'Rule Update Failed', 'error');
    }
  };

  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    try {
      await adminApiClient.deleteAutomationRule(ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      showDialog(`Rule '${ruleName}' deleted.`, 'Rule Removed', 'info');
    } catch (err) {
      showDialog(getErrorMessage(err) || 'Failed to delete rule.', 'Error', 'error');
    }
  };

  // ── Dry Run ──────────────────────────────────────────────────────────────

  const handleDryRun = async () => {
    setIsDryRunning(true);
    setDryRunResult(null);
    try {
      let parsed = {};
      try { parsed = JSON.parse(dryRunPayload); } catch { showDialog('Invalid JSON payload.', 'Parse Error', 'error'); setIsDryRunning(false); return; }

      let res: Wire.AutomationPreview | Wire.AutomationPreview[];
      if (dryRunRuleId) {
        res = await adminApiClient.dryRunAutomationRule(dryRunRuleId, parsed);
      } else {
        res = await adminApiClient.dryRunAutomation(parsed);
      }
      setDryRunResult(res);
    } catch (err) {
      setDryRunResult({ error: getErrorMessage(err) || 'Dry run failed' });
    } finally {
      setIsDryRunning(false);
    }
  };

  // ── Emit Domain Event ─────────────────────────────────────────────────────

  const handleEmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmitting(true);
    setEmitResult(null);
    try {
      let parsed = {};
      try { parsed = JSON.parse(eventPayload); } catch { showDialog('Invalid JSON payload.', 'Parse Error', 'error'); setIsEmitting(false); return; }
      const result = await adminApiClient.emitDomainEvent(eventName, parsed);
      setEmitResult(Array.isArray(result) ? result : [result]);
      showDialog(`Event '${eventName}' dispatched to automation engine.`, 'Event Emitted', 'success');
      loadData();
    } catch (err) {
      showDialog(getErrorMessage(err, 'Event dispatch failed'), 'Event Failed', 'error');
    } finally {
      setIsEmitting(false);
    }
  };

  // ── Filter logs ───────────────────────────────────────────────────────────

  const filteredLogs = executionLogs.filter((l) => {
    const statusOk = logStatusFilter === 'all' || l.status === logStatusFilter;
    const ruleOk = logRuleFilter === 'all' || l.rule_id === logRuleFilter;
    return statusOk && ruleOk;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Automation Rules & Engine
  // ─────────────────────────────────────────────────────────────────────────

  if (activeSubItem === 'not_automation') {
    return (
      <div className="space-y-6 text-left">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-appPrimary">
            <p className="text-[10px] uppercase font-bold tracking-wider text-appTextSecondary">Total Rules</p>
            <p className="text-2xl font-black text-appTextPrimary mt-1">{rules.length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-emerald-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Active Rules</p>
            <p className="text-2xl font-black text-emerald-500 mt-1">{rules.filter((r) => r.status === 'active').length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-amber-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Total Executions</p>
            <p className="text-2xl font-black text-amber-500 mt-1">{executionLogs.length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-rose-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Dead Letters</p>
            <p className="text-2xl font-black text-rose-500 mt-1">{executionLogs.filter((l) => l.status === 'dead_letter').length}</p>
          </Card>
        </div>

        {/* Rules Table */}
        <Card>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-appBorder">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                <Zap size={16} className="text-appPrimary" />
                Automation Rules Engine
              </h3>
              <p className="text-[10px] text-appTextSecondary mt-0.5">
                Define trigger → condition → action pipelines. Rules are evaluated against domain events in real-time.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading} className="flex items-center gap-1">
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
              </Button>
              <Button variant="primary" size="sm" onClick={openCreateModal} className="flex items-center gap-1">
                <Plus size={12} /> Create Rule
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {rules.length === 0 ? (
              <p className="text-xs text-appTextSecondary text-center py-8">No automation rules defined. Create your first rule above.</p>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                    <th className="pb-3 font-bold">Rule Name</th>
                    <th className="pb-3 font-bold">Trigger Event</th>
                    <th className="pb-3 font-bold">Conditions</th>
                    <th className="pb-3 font-bold">Actions</th>
                    <th className="pb-3 font-bold">Retries</th>
                    <th className="pb-3 font-bold">Status</th>
                    <th className="pb-3 font-bold text-right">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-appBorder/40">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-appBg/10 transition-colors group">
                      <td className="py-3 pr-4">
                        <p className="font-bold text-appTextPrimary">{rule.name}</p>
                        {rule.description && (
                          <p className="text-[10px] text-appTextSecondary mt-0.5 max-w-[200px] truncate">{rule.description}</p>
                        )}
                        <span className="font-mono text-[10px] text-appPrimary/70">{rule.id}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-appPrimary font-bold bg-appPrimary/5 border border-appPrimary/20 px-2 py-0.5 rounded text-[11px]">
                          {rule.trigger_event}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {rule.conditions.length === 0 ? (
                          <span className="text-appTextSecondary italic">Always</span>
                        ) : (
                          <div className="space-y-0.5">
                            {rule.conditions.map((c, i) => (
                              <div key={i} className="font-mono text-[10px] text-appTextSecondary">
                                {c.field} <span className="text-amber-400">{c.operator}</span> {c.value}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="space-y-0.5">
                          {rule.actions.map((a, i) => (
                            <div key={i} className="font-mono text-[10px] text-appTextSecondary">
                              <span className="text-emerald-400">{a.action_type}</span>
                              {a.target && <> → {a.target}</>}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 text-appTextSecondary font-mono">{rule.retry_limit}</td>
                      <td className="py-3">
                        <Badge variant={rule.status === 'active' ? 'success' : 'secondary'}>
                          {rule.status === 'active' ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(rule)}
                            className="p-1.5 rounded hover:bg-appBg border border-transparent hover:border-appBorder text-appTextSecondary hover:text-appPrimary transition-colors"
                            title="Edit Rule"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleToggleRule(rule)}
                            className={`p-1.5 rounded hover:bg-appBg border border-transparent hover:border-appBorder transition-colors ${
                              rule.status === 'active' ? 'text-emerald-500 hover:text-amber-400' : 'text-appTextSecondary hover:text-emerald-500'
                            }`}
                            title={rule.status === 'active' ? 'Disable Rule' : 'Enable Rule'}
                          >
                            {rule.status === 'active' ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id, rule.name)}
                            className="p-1.5 rounded hover:bg-appBg border border-transparent hover:border-appBorder text-appTextSecondary hover:text-rose-500 transition-colors"
                            title="Delete Rule"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Dry Run Tester */}
        <Card>
          <div className="pb-3 border-b border-appBorder mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                <Play size={16} className="text-appPrimary" />
                Dry Run — Rule Evaluation Preview
              </h3>
              <p className="text-[10px] text-appTextSecondary mt-0.5">
                Test condition evaluation and preview actions without triggering real side effects.
              </p>
            </div>
            <Badge variant="secondary">Safe — no real dispatch</Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                  Target Rule (leave blank for all matching)
                </label>
                <select value={dryRunRuleId} onChange={(e) => setDryRunRuleId(e.target.value)} className={selectClass}>
                  <option value="">— All matching active rules —</option>
                  {rules.filter((r) => r.status === 'active').map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.trigger_event})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Test Event JSON Payload</label>
                <textarea value={dryRunPayload} onChange={(e) => setDryRunPayload(e.target.value)} rows={8} className={textareaClass} />
              </div>
              <Button variant="primary" size="sm" onClick={handleDryRun} disabled={isDryRunning} className="flex items-center gap-1.5">
                <Play size={12} />
                {isDryRunning ? 'Evaluating…' : 'Run Dry-Run Evaluation'}
              </Button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-appTextSecondary mb-2">Evaluation Result</label>
              {dryRunResult ? (
                <div className="p-4 bg-appBg border border-appBorder rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto max-h-72">
                  <pre>{JSON.stringify(dryRunResult, null, 2)}</pre>
                </div>
              ) : (
                <div className="p-6 bg-appBg border border-appBorder border-dashed rounded-lg text-center text-appTextSecondary text-xs">
                  <Info size={24} className="mx-auto mb-2 opacity-40" />
                  Run a dry evaluation to preview condition checks and action dispatch plans.
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Create/Edit Rule Modal */}
        {showRuleModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl text-left">
              <div className="flex items-center justify-between pb-3 border-b border-appBorder">
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-appPrimary" />
                  <h3 className="text-sm font-bold text-appTextPrimary">
                    {editingRule ? `Edit Rule: ${editingRule.name}` : 'Create Automation Rule'}
                  </h3>
                </div>
                <button onClick={() => setShowRuleModal(false)} className="text-appTextSecondary hover:text-appTextPrimary">✕</button>
              </div>

              <form onSubmit={handleSaveRule} className="space-y-5 text-xs">
                {/* Rule Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Rule Name *</label>
                    <input
                      type="text" required value={ruleName} onChange={(e) => setRuleName(e.target.value)}
                      placeholder="e.g. Quota Warning Email"
                      className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded focus:border-appPrimary focus:outline-none text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Trigger Event *</label>
                    <select value={ruleTrigger} onChange={(e) => setRuleTrigger(e.target.value)} className={selectClass}>
                      {TRIGGER_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Description</label>
                  <input
                    type="text" value={ruleDescription} onChange={(e) => setRuleDescription(e.target.value)}
                    placeholder="Optional description for this rule"
                    className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded focus:border-appPrimary focus:outline-none text-xs"
                  />
                </div>

                {/* Conditions Builder */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-appTextSecondary uppercase tracking-wider">Conditions (ALL must pass)</label>
                    <button type="button" onClick={addConditionRow} className="flex items-center gap-1 text-appPrimary hover:text-appPrimary/80 text-[11px] font-bold">
                      <Plus size={12} /> Add Condition
                    </button>
                  </div>
                  {conditions.length === 0 && (
                    <p className="text-[11px] text-appTextSecondary italic">No conditions — rule fires on every matching event.</p>
                  )}
                  {conditions.map((cond, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-2 items-center">
                      <input
                        type="text" value={cond.field} onChange={(e) => updateCondition(i, 'field', e.target.value)}
                        placeholder="field (e.g. used_quota)"
                        className="px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded focus:border-appPrimary focus:outline-none text-xs"
                      />
                      <select value={cond.operator} onChange={(e) => updateCondition(i, 'operator', e.target.value)} className={selectClass}>
                        {OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                      </select>
                      <input
                        type="text" value={cond.value} onChange={(e) => updateCondition(i, 'value', e.target.value)}
                        placeholder="value (e.g. 4)"
                        className="px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded focus:border-appPrimary focus:outline-none text-xs"
                      />
                      <button type="button" onClick={() => removeConditionRow(i)} className="text-rose-500 hover:text-rose-400 p-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Actions Builder */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-appTextSecondary uppercase tracking-wider">Actions (executed in order)</label>
                    <button type="button" onClick={addActionRow} className="flex items-center gap-1 text-appPrimary hover:text-appPrimary/80 text-[11px] font-bold">
                      <Plus size={12} /> Add Action
                    </button>
                  </div>
                  {actions.map((action, i) => (
                    <div key={i} className="p-3 bg-appBg border border-appBorder rounded-lg mb-3 space-y-2">
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        <select value={String(action.action_type)} onChange={(e) => updateAction(i, 'action_type', e.target.value)} className={selectClass}>
                          {ACTION_TYPES.map((at) => <option key={at.value} value={at.value}>{at.label}</option>)}
                        </select>
                        <input
                          type="text" value={String(action.target ?? '')} onChange={(e) => updateAction(i, 'target', e.target.value)}
                          placeholder="target (e.g. notification_service)"
                          className="px-3 py-1.5 bg-white dark:bg-white/5 text-appTextPrimary border border-appBorder rounded focus:border-appPrimary focus:outline-none text-xs"
                        />
                        <button type="button" onClick={() => removeActionRow(i)} className="text-rose-500 hover:text-rose-400 p-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div>
                        <label className="block text-[10px] text-appTextSecondary mb-1 font-semibold">Action Payload (JSON)</label>
                        <textarea
                          value={action.payload} onChange={(e) => updateAction(i, 'payload', e.target.value)}
                          rows={3}
                          className={textareaClass}
                          placeholder='{"template": "quota_warning_email"}'
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Retry limit */}
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-2">
                    Retry Limit: <strong className="text-appTextPrimary">{ruleRetryLimit}</strong> attempts
                  </label>
                  <input
                    type="range" min={0} max={5} value={ruleRetryLimit}
                    onChange={(e) => setRuleRetryLimit(Number(e.target.value))}
                    className="w-full accent-purple-600"
                  />
                  <div className="flex justify-between text-[10px] text-appTextSecondary mt-1">
                    <span>0 (no retries)</span><span>5 (max retries)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-appBorder">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowRuleModal(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" className="flex-1">
                    {editingRule ? 'Save Changes' : 'Create Rule'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        <SystemDialogModal
          isOpen={dialogState.isOpen}
          title={dialogState.title}
          message={dialogState.message}
          type={dialogState.type}
          onClose={() => setDialogState({ isOpen: false, message: '' })}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Execution Logs
  // ─────────────────────────────────────────────────────────────────────────

  if (activeSubItem === 'not_execution_logs') {
    return (
      <div className="space-y-6 text-left">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-appPrimary">
            <p className="text-[10px] uppercase font-bold tracking-wider text-appTextSecondary">Total Runs</p>
            <p className="text-2xl font-black text-appTextPrimary mt-1">{executionLogs.length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-emerald-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Successful</p>
            <p className="text-2xl font-black text-emerald-500 mt-1">{executionLogs.filter((l) => l.status === 'success').length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-amber-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Retried</p>
            <p className="text-2xl font-black text-amber-500 mt-1">{executionLogs.filter((l) => l.retry_count > 0).length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-rose-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Dead Letters</p>
            <p className="text-2xl font-black text-rose-500 mt-1">{executionLogs.filter((l) => l.status === 'dead_letter').length}</p>
          </Card>
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-appBorder">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                <Terminal size={16} className="text-appPrimary" />
                Automation Execution Logs
              </h3>
              <p className="text-[10px] text-appTextSecondary mt-0.5">Full audit trail of every rule evaluation and action execution.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter */}
              <select value={logStatusFilter} onChange={(e) => setLogStatusFilter(e.target.value)} className="px-2.5 py-1 text-xs bg-appBg text-appTextPrimary border border-appBorder rounded focus:border-appPrimary focus:outline-none">
                <option value="all">All Statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="retrying">Retrying</option>
                <option value="dead_letter">Dead Letter</option>
              </select>
              {/* Rule filter */}
              <select value={logRuleFilter} onChange={(e) => setLogRuleFilter(e.target.value)} className="px-2.5 py-1 text-xs bg-appBg text-appTextPrimary border border-appBorder rounded focus:border-appPrimary focus:outline-none">
                <option value="all">All Rules</option>
                {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading} className="flex items-center gap-1">
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <p className="text-xs text-appTextSecondary text-center py-8">No execution logs matching filter.</p>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                    <th className="pb-3 font-bold w-4"></th>
                    <th className="pb-3 font-bold">Execution ID</th>
                    <th className="pb-3 font-bold">Rule</th>
                    <th className="pb-3 font-bold">Trigger Event</th>
                    <th className="pb-3 font-bold">Conditions</th>
                    <th className="pb-3 font-bold">Status</th>
                    <th className="pb-3 font-bold">Retries</th>
                    <th className="pb-3 text-right font-bold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-appBorder/40">
                  {filteredLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        className="hover:bg-appBg/10 transition-colors cursor-pointer"
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      >
                        <td className="py-3 text-appTextSecondary">
                          {expandedLogId === log.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </td>
                        <td className="py-3 font-mono text-appTextSecondary text-[10px]">{log.id}</td>
                        <td className="py-3">
                          <p className="font-bold text-appTextPrimary">{log.rule_name}</p>
                          <p className="font-mono text-[10px] text-appPrimary/70">{log.rule_id}</p>
                        </td>
                        <td className="py-3 font-mono text-appPrimary">{log.trigger_event}</td>
                        <td className="py-3">
                          {log.conditions_passed ? (
                            <span className="flex items-center gap-1 text-emerald-500"><CheckCircle size={12} /> Passed</span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-500"><SkipForward size={12} /> Skipped</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant={statusBadgeVariant(log.status)}>{statusLabel(log.status)}</Badge>
                        </td>
                        <td className="py-3 font-mono text-appTextSecondary">{log.retry_count}</td>
                        <td className="py-3 text-right text-appTextSecondary">{log.created_at}</td>
                      </tr>
                      {expandedLogId === log.id && (
                        <tr>
                          <td colSpan={8} className="pb-4 px-2">
                            <div className="bg-appBg border border-appBorder rounded-lg p-4 space-y-3 text-xs">
                              {log.error_message && (
                                <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400">
                                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                                  <span>{log.error_message}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p className="font-bold text-appTextSecondary uppercase tracking-wider text-[10px] mb-1">Event Payload</p>
                                  <pre className="font-mono text-emerald-400 text-[10px] overflow-x-auto max-h-32">
                                    {JSON.stringify(log.payload, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="font-bold text-appTextSecondary uppercase tracking-wider text-[10px] mb-1">Action Results</p>
                                  {(!log.action_results || log.action_results.length === 0) ? (
                                    <p className="text-appTextSecondary italic">No actions executed (conditions skipped).</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {log.action_results.map((ar, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                          {ar.status === 'success'
                                            ? <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                                            : <XCircle size={12} className="text-rose-500 shrink-0" />}
                                          <span className="font-mono text-[10px] text-appTextSecondary">
                                            {String(ar.action_type ?? '')} → {String(ar.details || ar.error || ar.preview || ar.status || '')}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <SystemDialogModal
          isOpen={dialogState.isOpen}
          title={dialogState.title}
          message={dialogState.message}
          type={dialogState.type}
          onClose={() => setDialogState({ isOpen: false, message: '' })}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Emit Domain Events
  // ─────────────────────────────────────────────────────────────────────────

  if (activeSubItem === 'not_emit_events') {
    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <div className="pb-3 border-b border-appBorder mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                  <Radio size={16} className="text-appPrimary animate-pulse" />
                  Domain Event Bus — Manual Dispatch Console
                </h3>
                <p className="text-[10px] text-appTextSecondary mt-0.5">
                  Manually dispatch domain events into the Automation Engine to test rule pipelines.
                </p>
              </div>
              <Badge variant="primary">Event Bus</Badge>
            </div>

            <form onSubmit={handleEmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">
                  Trigger Event
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                  {TRIGGER_EVENTS.slice(0, 6).map((ev) => (
                    <button
                      key={ev} type="button" onClick={() => setEventName(ev)}
                      className={`px-2.5 py-1.5 rounded text-left border font-mono text-[11px] transition-colors ${
                        eventName === ev
                          ? 'bg-appPrimary/10 border-appPrimary text-appPrimary font-bold'
                          : 'bg-appBg border-appBorder text-appTextSecondary hover:text-appTextPrimary'
                      }`}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
                <input
                  type="text" required value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary font-mono border border-appBorder rounded focus:border-appPrimary focus:outline-none text-xs"
                  placeholder="e.g. user.quota_exceeded"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Event JSON Payload</label>
                <textarea
                  value={eventPayload} onChange={(e) => setEventPayload(e.target.value)}
                  rows={7} required className={textareaClass}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-appBorder">
                <Button type="submit" variant="primary" size="sm" disabled={isEmitting} className="flex items-center gap-1.5">
                  <Radio size={12} />
                  {isEmitting ? 'Dispatching…' : 'Dispatch to Automation Engine'}
                </Button>
              </div>
            </form>

            {emitResult && (
              <div className="mt-6 pt-4 border-t border-appBorder space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary">Execution Results</h4>
                <div className="p-3 bg-appBg border border-appBorder rounded-lg font-mono text-xs overflow-x-auto">
                  <pre className="text-emerald-400">{JSON.stringify(emitResult, null, 2)}</pre>
                </div>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-3">
                Supported Domain Events
              </h3>
              <ul className="space-y-2">
                {[
                  { event: 'quota.warning', desc: 'User hits 80%+ of monthly limit.' },
                  { event: 'quota.exhausted', desc: 'User hits 100% — generation blocked.' },
                  { event: 'payment.failed', desc: 'Paddle/PayHere invoice failure.' },
                  { event: 'payment.succeeded', desc: 'Successful subscription payment.' },
                  { event: 'user.registered', desc: 'New user completed email verification.' },
                  { event: 'user.suspended', desc: 'User account suspended by admin.' },
                  { event: 'subscription.activated', desc: 'Subscription plan activated.' },
                  { event: 'subscription.cancelled', desc: 'Subscription cancelled by user or admin.' },
                ].map(({ event, desc }) => (
                  <li key={event} className="p-2 bg-appBg border border-appBorder rounded text-xs">
                    <span className="font-mono font-bold text-appPrimary block">{event}</span>
                    <span className="text-appTextSecondary">{desc}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-3">Active Rules</h3>
              {rules.filter((r) => r.status === 'active').length === 0 ? (
                <p className="text-xs text-appTextSecondary">No active rules. Create one first.</p>
              ) : (
                <ul className="space-y-1.5">
                  {rules.filter((r) => r.status === 'active').map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-bold text-appTextPrimary truncate">{r.name}</span>
                      <span className="font-mono text-appPrimary text-[10px] ml-auto shrink-0">{r.trigger_event}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <SystemDialogModal
          isOpen={dialogState.isOpen}
          title={dialogState.title}
          message={dialogState.message}
          type={dialogState.type}
          onClose={() => setDialogState({ isOpen: false, message: '' })}
        />
      </div>
    );
  }

  return null;
};

export default AutomationsView;
