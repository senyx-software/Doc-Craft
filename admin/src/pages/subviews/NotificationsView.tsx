import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import { getErrorMessage } from '../../store/toastStore';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import {
  Plus,
  Trash2,
  RefreshCw,
  Mail,
  Bell,
  FileText,
  Server,
  Edit2,
  Save,
  ToggleLeft,
  X,
  Send
} from 'lucide-react';
import { adminApiClient } from '../../api/adminApiClient';
import SystemDialogModal, { type DialogType } from '../../components/ui/SystemDialogModal';

interface NotificationsViewProps {
  activeSubItem: string;
}

const NotificationsView: React.FC<NotificationsViewProps> = ({ activeSubItem }) => {
  // Note: 'not_automation' / 'not_execution_logs' / 'not_emit_events' are
  // intercepted by DashboardPage and routed to AutomationsView instead — this
  // component only ever actually renders for 'not_email_logs' / 'not_system'
  // / 'not_templates'. There used to be a full second, dead copy of the
  // automation rules/execution-logs/emit-event UI here (unreachable, with its
  // own DEMO_ fallback data) — removed rather than left to rot out of sync
  // with the real AutomationsView.
  const [emailLogs, setEmailLogs] = useState<Wire.NotificationLog[]>([]);
  const [announcements, setAnnouncements] = useState<Wire.Announcement[]>([]);
  const [templates, setTemplates] = useState<Wire.NotificationTemplate[]>([]);
  const [serverSettings, setServerSettings] = useState<Wire.NotificationSettings>({
    email_provider: 'resend',
    sender_email: 'notifications@doccraft.app',
    sender_name: 'DocCraft Platform',
    rate_limit_per_minute: 100,
    email_notifications_enabled: true,
    in_app_notifications_enabled: true,
  });
  const [statusOverview, setStatusOverview] = useState<Wire.NotificationStatus>({
    total_notifications: 0,
    sent_count: 0,
    failed_count: 0,
    delivery_rate_percentage: 100,
  });

  const [emailStatusFilter, setEmailStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [emailCategoryFilter, setEmailCategoryFilter] = useState<string>('all');
  const [selectedLogPayload, setSelectedLogPayload] = useState<Wire.NotificationLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create Template Modal state
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplSubject, setNewTplSubject] = useState('');
  const [newTplBody, setNewTplBody] = useState('<div style="font-family: sans-serif;"><p>Hello {{full_name}},</p></div>');
  const [newTplChannel, setNewTplChannel] = useState('email');
  const [newTplType, setNewTplType] = useState('');

  // System Dialog State
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

  // Rendered at the bottom of every reachable subview's return block below —
  // each subview returns early, so there's no single shared JSX tail to hang
  // this off of.
  const systemDialog = (
    <SystemDialogModal
      isOpen={dialogState.isOpen}
      title={dialogState.title}
      message={dialogState.message}
      type={dialogState.type}
      onClose={() => setDialogState(prev => ({ ...prev, isOpen: false }))}
    />
  );

  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [ancTitle, setAncTitle] = useState('');
  const [ancMessage, setAncMessage] = useState('');
  const [ancSeverity, setAncSeverity] = useState('info');

  const [editingTemplate, setEditingTemplate] = useState<Wire.NotificationTemplate | null>(null);

  const loadAllNotificationData = useCommittedEvent(async () => {

    try {
      const emailParams: NonNullable<Parameters<typeof adminApiClient.getNotificationEmailLogs>[0]> = {};
      if (emailStatusFilter !== 'all') emailParams.status = emailStatusFilter;
      if (emailCategoryFilter !== 'all') emailParams.type = emailCategoryFilter;

      const [emailsData, ancData, tplData, settingsData, overviewData] = await Promise.allSettled([
        adminApiClient.getNotificationEmailLogs(Object.keys(emailParams).length > 0 ? emailParams : undefined),
        adminApiClient.getAnnouncements(),
        adminApiClient.getNotificationTemplates(),
        adminApiClient.getNotificationServerSettings(),
        adminApiClient.getNotificationStatusOverview()
      ]);

      if (emailsData.status === 'fulfilled' && Array.isArray(emailsData.value)) {
        setEmailLogs(emailsData.value.map((e) => ({
          ...e,
          status: (e.status === 'sent' || e.status === 'Delivered') ? 'Delivered' : 'Failed'
        })));
      }

      if (ancData.status === 'fulfilled' && Array.isArray(ancData.value)) {
        setAnnouncements(ancData.value);
      }

      if (tplData.status === 'fulfilled' && Array.isArray(tplData.value)) {
        setTemplates(tplData.value);
      }

      if (settingsData.status === 'fulfilled' && settingsData.value) {
        setServerSettings(settingsData.value);
      }

      if (overviewData.status === 'fulfilled' && overviewData.value) {
        setStatusOverview(overviewData.value);
      }
    } catch (err) {
      console.warn('API sync notification error:', err);
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    loadAllNotificationData();
  }, [activeSubItem, emailStatusFilter, emailCategoryFilter, loadAllNotificationData]);

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ancTitle || !ancMessage) return;

    try {
      const res = await adminApiClient.createAnnouncement(ancTitle, ancMessage, ancSeverity);
      showSystemDialog(res.message || 'System announcement published to all active dashboards!', 'Announcement Published', 'success');
      setShowAnnouncementModal(false);
      setAncTitle('');
      setAncMessage('');
      loadAllNotificationData();
    } catch (err) {
      showSystemDialog(getErrorMessage(err) || 'Failed to publish announcement.', 'Error', 'error');
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    try {
      await adminApiClient.updateNotificationTemplate(editingTemplate.id, {
        subject: editingTemplate.subject,
        body_html: editingTemplate.body_html,
        is_active: editingTemplate.is_active
      });
      showSystemDialog(`Notification template '${editingTemplate.name}' updated!`, 'Template Saved', 'success');
      setEditingTemplate(null);
      loadAllNotificationData();
    } catch (err) {
      showSystemDialog(getErrorMessage(err) || 'Failed to save template.', 'Error', 'error');
    }
  };

  const handleSaveServerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApiClient.updateNotificationServerSettings(serverSettings);
      showSystemDialog('Notification server settings updated & synced with backend cluster!', 'Settings Saved', 'success');
    } catch (err) {
      showSystemDialog(getErrorMessage(err) || 'Failed to save server settings.', 'Error', 'error');
    }
  };

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    try {
      await adminApiClient.deleteNotificationTemplate(templateId);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      showSystemDialog(`Template '${templateName}' deleted.`, 'Template Deleted', 'info');
    } catch (err) {
      showSystemDialog(getErrorMessage(err) || 'Failed to delete template.', 'Error', 'error');
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplName || !newTplSubject) return;
    try {
      await adminApiClient.createNotificationTemplate({
        name: newTplName,
        subject: newTplSubject,
        body_html: newTplBody,
        channel: newTplChannel,
        is_active: true,
        type: newTplType || undefined,
      });
      showSystemDialog(`Template '${newTplName}' created!`, 'Template Created', 'success');
      setShowCreateTemplateModal(false);
      setNewTplName('');
      setNewTplSubject('');
      setNewTplBody('<div style="font-family: sans-serif;"><p>Hello {{full_name}},</p></div>');
      setNewTplType('');
      loadAllNotificationData();
    } catch (err) {
      showSystemDialog(getErrorMessage(err) || 'Failed to create template.', 'Error', 'error');
    }
  };

  const handleToggleAnnouncement = async (ancId: string, currentActive: boolean) => {
    try {
      await adminApiClient.updateAnnouncement(ancId, { is_active: !currentActive });
      setAnnouncements(prev => prev.map(a => a.id === ancId ? { ...a, is_active: !currentActive } : a));
      showSystemDialog(`Announcement ${!currentActive ? 'activated' : 'deactivated'}.`, 'Announcement Updated', 'info');
    } catch (err) {
      showSystemDialog(getErrorMessage(err) || 'Failed to update announcement.', 'Error', 'error');
    }
  };

  const handleDeleteAnnouncement = async (ancId: string) => {
    try {
      await adminApiClient.deleteAnnouncement(ancId);
      setAnnouncements(prev => prev.filter(a => a.id !== ancId));
      showSystemDialog('Announcement removed.', 'Deleted', 'info');
    } catch (err) {
      showSystemDialog(getErrorMessage(err) || 'Failed to delete announcement.', 'Error', 'error');
    }
  };

  // ── 1. Subview: Email Logs ────────────────────────────────────────────────
  if (activeSubItem === 'not_email_logs') {
    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-l-appPrimary">
            <p className="text-[10px] uppercase font-bold tracking-wider text-appTextSecondary">Total Notifications</p>
            <p className="text-2xl font-black text-appTextPrimary mt-1">{statusOverview.total_notifications}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-emerald-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Total Sent / Delivered</p>
            <p className="text-2xl font-black text-emerald-500 mt-1">{statusOverview.sent_count}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-rose-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Failed Delivery Count</p>
            <p className="text-2xl font-black text-rose-500 mt-1">{statusOverview.failed_count}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-purple-500">
            <p className="text-[10px] uppercase font-bold tracking-wider text-purple-400">Delivery Success Rate</p>
            <p className="text-2xl font-black text-purple-400 mt-1">{statusOverview.delivery_rate_percentage}%</p>
          </Card>
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-appBorder">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                <Mail size={16} className="text-appPrimary" />
                Transactional Email &amp; Delivery Logs
              </h3>
              <p className="text-[10px] text-appTextSecondary">Live email dispatch logs and status tracking.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={emailCategoryFilter}
                onChange={e => setEmailCategoryFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none"
              >
                <option value="all">All Categories</option>
                <option value="verify_email">Verification OTP (verify_email)</option>
                <option value="password_reset">Password Reset (password_reset)</option>
                <option value="welcome">Welcome Email (welcome)</option>
                <option value="quota_alert">Quota Warning (quota_alert)</option>
                <option value="invoice_ready">Invoice Ready (invoice_ready)</option>
                <option value="payment_failed">Payment Failed (payment_failed)</option>
                <option value="payment_receipt">Payment Receipt (payment_receipt)</option>
              </select>

              <div className="flex bg-appBg p-1 rounded-md border border-appBorder">
                <button
                  onClick={() => setEmailStatusFilter('all')}
                  className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all ${emailStatusFilter === 'all' ? 'bg-appPrimary text-white' : 'text-appTextSecondary'}`}
                >
                  All Statuses
                </button>
                <button
                  onClick={() => setEmailStatusFilter('sent')}
                  className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all ${emailStatusFilter === 'sent' ? 'bg-emerald-600 text-white' : 'text-appTextSecondary'}`}
                >
                  Sent Only
                </button>
                <button
                  onClick={() => setEmailStatusFilter('failed')}
                  className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all ${emailStatusFilter === 'failed' ? 'bg-rose-600 text-white' : 'text-appTextSecondary'}`}
                >
                  Failed Only
                </button>
              </div>

              <Button variant="outline" size="sm" onClick={loadAllNotificationData} disabled={isLoading} className="flex items-center gap-1">
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh Logs
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {emailLogs.length === 0 ? (
              <p className="text-xs text-appTextSecondary text-center py-8">No transactional email logs matching filter.</p>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                    <th className="pb-3 font-bold">Email ID</th>
                    <th className="pb-3 font-bold">Recipient Account</th>
                    <th className="pb-3 font-bold">Subject Line</th>
                    <th className="pb-3 font-bold">Gateway</th>
                    <th className="pb-3 font-bold">Timestamp</th>
                    <th className="pb-3 text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-appBorder/40">
                  {emailLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLogPayload(log)}
                      className="hover:bg-appBg/20 cursor-pointer transition-colors"
                      title="Click to view payload data"
                    >
                      <td className="py-3 font-mono text-appTextSecondary">{log.id}</td>
                      <td className="py-3 text-appTextPrimary font-bold">{log.recipient}</td>
                      <td className="py-3 text-appTextSecondary font-medium">
                        <div>{log.subject}</div>
                        <span className="font-mono text-[10px] text-appPrimary">{log.type}</span>
                      </td>
                      <td className="py-3 text-appTextSecondary">{log.gateway}</td>
                      <td className="py-3 text-appTextSecondary">{log.timestamp}</td>
                      <td className="py-3 text-right">
                        <Badge variant={log.status === 'Delivered' || log.status === 'sent' ? 'success' : 'danger'}>
                          {log.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Selected Log Payload Modal */}
        {selectedLogPayload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <Card className="max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="pb-3 border-b border-appBorder flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-appTextPrimary">Notification Event Details</h3>
                  <p className="text-xs text-appTextSecondary font-mono">{selectedLogPayload.id}</p>
                </div>
                <button onClick={() => setSelectedLogPayload(null)} className="text-appTextSecondary hover:text-appTextPrimary"><X size={16} /></button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 p-3 bg-appBg rounded-md border border-appBorder">
                  <div>
                    <span className="text-[10px] text-appTextSecondary block font-semibold uppercase">Recipient</span>
                    <span className="font-bold text-appTextPrimary">{selectedLogPayload.recipient}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-appTextSecondary block font-semibold uppercase">Event Category</span>
                    <span className="font-mono text-appPrimary font-bold">{selectedLogPayload.type}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-appTextSecondary block font-semibold uppercase">Status</span>
                    <Badge variant={selectedLogPayload.status === 'Delivered' || selectedLogPayload.status === 'sent' ? 'success' : 'danger'}>
                      {selectedLogPayload.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[10px] text-appTextSecondary block font-semibold uppercase">Dispatch Timestamp</span>
                    <span className="text-appTextSecondary">{selectedLogPayload.timestamp}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Payload Data JSON</label>
                  <pre className="p-3 bg-appBg font-mono text-xs text-emerald-400 rounded-md border border-appBorder overflow-x-auto max-h-60">
                    {JSON.stringify(selectedLogPayload.payload || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="pt-3 flex justify-end border-t border-appBorder">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setSelectedLogPayload(null)}><X size={12} /> Close</Button>
              </div>
            </Card>
          </div>
        )}
        {systemDialog}
      </div>
    );
  }

  // ── 2. Subview: System Announcements ─────────────────────────────────────
  if (activeSubItem === 'not_system') {
    return (
      <div className="space-y-6 text-left">
        <Card>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-appBorder">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                <Bell size={16} className="text-appPrimary" />
                System Announcements
              </h3>
              <p className="text-[10px] text-appTextSecondary">Broadcast platform announcements to all customer dashboards.</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowAnnouncementModal(true)} className="flex items-center gap-1">
              <Plus size={12} /> Broadcast Announcement
            </Button>
          </div>

          <div className="space-y-3">
            {announcements.length === 0 ? (
              <p className="text-xs text-appTextSecondary text-center py-6">No announcements created yet.</p>
            ) : announcements.map((anc) => (
              <div key={anc.id} className="p-4 rounded-md bg-appBg border border-appBorder flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-appTextPrimary">{anc.title}</span>
                    <Badge variant={anc.severity === 'info' ? 'primary' : anc.severity === 'warning' ? 'warning' : 'danger'}>{anc.severity}</Badge>
                    <Badge variant={anc.is_active ? 'success' : 'secondary'}>{anc.is_active ? 'Active' : 'Inactive'}</Badge>
                    {anc.target_audience && <Badge variant="secondary">{anc.target_audience}</Badge>}
                  </div>
                  <p className="text-xs text-appTextSecondary">{anc.message}</p>
                  <p className="text-[10px] text-appTextSecondary font-mono mt-1">Published: {anc.created_at}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleAnnouncement(anc.id, anc.is_active)}
                    title={anc.is_active ? 'Deactivate' : 'Activate'}
                    className="p-1.5 rounded-md hover:bg-appBg border border-transparent hover:border-appBorder text-appTextSecondary hover:text-amber-400 transition-colors"
                  >
                    <ToggleLeft size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteAnnouncement(anc.id)}
                    title="Delete Announcement"
                    className="p-1.5 rounded-md hover:bg-appBg border border-transparent hover:border-appBorder text-appTextSecondary hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {showAnnouncementModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <Card className="max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="pb-3 border-b border-appBorder flex items-center justify-between">
                <h3 className="text-sm font-bold text-appTextPrimary">Broadcast System Announcement</h3>
                <button onClick={() => setShowAnnouncementModal(false)} className="text-appTextSecondary hover:text-appTextPrimary"><X size={16} /></button>
              </div>

              <form onSubmit={handlePublishAnnouncement} className="space-y-3 text-xs">
                <Input label="Announcement Title" value={ancTitle} onChange={e => setAncTitle(e.target.value)} required placeholder="e.g. Scheduled Maintenance" />
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Severity Level</label>
                  <select value={ancSeverity} onChange={e => setAncSeverity(e.target.value)} className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none">
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Message Content</label>
                  <textarea value={ancMessage} onChange={e => setAncMessage(e.target.value)} required rows={4} className="w-full p-3 text-xs bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none" />
                </div>
                <div className="pt-3 flex justify-end gap-2 border-t border-appBorder">
                  <Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setShowAnnouncementModal(false)}><X size={12} /> Cancel</Button>
                  <Button type="submit" variant="primary" size="sm" className="flex items-center gap-1.5"><Send size={12} /> Publish Broadcast</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
        {systemDialog}
      </div>
    );
  }

  // ── 3. Subview: Notification Templates ──────────────────────────────────
  if (activeSubItem === 'not_templates') {
    return (
      <div className="space-y-6 text-left">
        <Card>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-appBorder">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                <FileText size={16} className="text-appPrimary" />
                Notification &amp; Email Templates
              </h3>
              <p className="text-[10px] text-appTextSecondary">Configure email templates and HTML body layouts. Changes sync to Notification Service within 30s.</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowCreateTemplateModal(true)} className="flex items-center gap-1">
              <Plus size={12} /> New Template
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Template ID</th>
                  <th className="pb-3 font-bold">Template Name</th>
                  <th className="pb-3 font-bold">Default Subject</th>
                  <th className="pb-3 font-bold">Channel</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {templates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-appBg/10 transition-colors">
                    <td className="py-3 font-mono text-appTextSecondary">{tpl.id}</td>
                    <td className="py-3 text-appTextPrimary font-bold">{tpl.name}</td>
                    <td className="py-3 text-appTextSecondary">{tpl.subject}</td>
                    <td className="py-3 font-mono text-appPrimary uppercase font-bold">{tpl.channel}</td>
                    <td className="py-3">
                      <Badge variant={tpl.is_active ? 'success' : 'secondary'}>{tpl.is_active ? 'Active' : 'Disabled'}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditingTemplate(tpl)} className="p-1 text-appPrimary hover:underline flex items-center gap-1 font-bold">
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                          className="p-1 text-appTextSecondary hover:text-rose-500 transition-colors"
                          title="Delete Template"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Server Settings Card */}
        <Card>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-appBorder">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary flex items-center gap-2">
                <Server size={16} className="text-appPrimary" />
                Notification Server Settings
              </h3>
              <p className="text-[10px] text-appTextSecondary">Configure sender identity, real send-rate throttling, and delivery-status webhook.</p>
            </div>
          </div>

          <form onSubmit={handleSaveServerSettings} className="space-y-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1">Email provider
                <select aria-label="Email provider" value={serverSettings.email_provider || 'resend'} onChange={e=>setServerSettings({...serverSettings,email_provider:e.target.value as 'resend'|'disabled'})} className="w-full bg-appSurface border border-appBorder rounded p-2">
                  <option value="resend">Resend</option><option value="disabled">Disabled (queued sends retry)</option>
                </select>
              </label>
              <Input label="Sender Email" value={serverSettings.sender_email || ''} onChange={e => setServerSettings({ ...serverSettings, sender_email: e.target.value })} />
              <Input label="Sender Name" value={serverSettings.sender_name || ''} onChange={e => setServerSettings({ ...serverSettings, sender_name: e.target.value })} />
              <div>
                <Input label="Rate Limit (emails/min)" type="number" value={serverSettings.rate_limit_per_minute || 100} onChange={e => setServerSettings({ ...serverSettings, rate_limit_per_minute: parseInt(e.target.value) })} />
                <p className="mt-1 text-[9px] text-appTextSecondary">Enforced by the email worker via a Redis sliding window — over-limit sends are delayed, not dropped.</p>
              </div>
              <div>
                <Input label="Status Webhook URL" value={serverSettings.webhook_url || ''} onChange={e => setServerSettings({ ...serverSettings, webhook_url: e.target.value })} />
                <p className="mt-1 text-[9px] text-appTextSecondary">Requires registering this service's /notification/webhooks/resend-status endpoint in Resend's dashboard — this field only controls where events get relayed to once Resend calls it.</p>
              </div>
            </div>

            <div className="pt-3 flex justify-end border-t border-appBorder">
              <Button type="submit" variant="primary" size="sm" className="flex items-center gap-1.5">
                <Save size={14} /> Save Server Settings
              </Button>
            </div>
          </form>
        </Card>

        {editingTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <Card className="max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="pb-3 border-b border-appBorder flex items-center justify-between">
                <h3 className="text-sm font-bold text-appTextPrimary">Edit Template: {editingTemplate.name}</h3>
                <button onClick={() => setEditingTemplate(null)} className="text-appTextSecondary hover:text-appTextPrimary"><X size={16} /></button>
              </div>

              <form onSubmit={handleSaveTemplate} className="space-y-3 text-xs">
                <Input label="Subject Line" value={editingTemplate.subject} onChange={e => setEditingTemplate({ ...editingTemplate, subject: e.target.value })} required />
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">HTML Body (Handlebars supported)</label>
                  <textarea value={editingTemplate.body_html} onChange={e => setEditingTemplate({ ...editingTemplate, body_html: e.target.value })} rows={7} className="w-full p-3 font-mono text-xs bg-appBg text-emerald-400 rounded-md border border-appBorder focus:border-appPrimary focus:outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="tpl_active" checked={editingTemplate.is_active} onChange={e => setEditingTemplate({ ...editingTemplate, is_active: e.target.checked })} />
                  <label htmlFor="tpl_active" className="text-xs text-appTextPrimary font-semibold">Enable Template</label>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-appBorder">
                  <Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setEditingTemplate(null)}><X size={12} /> Cancel</Button>
                  <Button type="submit" variant="primary" size="sm" className="flex items-center gap-1.5"><Save size={12} /> Save Template</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Create Template Modal */}
        {showCreateTemplateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-left">
            <Card className="max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="pb-3 border-b border-appBorder flex items-center justify-between">
                <h3 className="text-sm font-bold text-appTextPrimary">Create Notification Template</h3>
                <button onClick={() => setShowCreateTemplateModal(false)} className="text-appTextSecondary hover:text-appTextPrimary"><X size={16} /></button>
              </div>

              <form onSubmit={handleCreateTemplate} className="space-y-3 text-xs">
                <Input label="Template Name *" value={newTplName} onChange={e => setNewTplName(e.target.value)} required placeholder="e.g. Subscription Renewal Email" />
                <Input label="Email Subject *" value={newTplSubject} onChange={e => setNewTplSubject(e.target.value)} required placeholder="e.g. Your DocCraft subscription renews on {{date}}" />
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Channel</label>
                  <select value={newTplChannel} onChange={e => setNewTplChannel(e.target.value)} className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none">
                    <option value="email">email</option>
                    <option value="in_app">in_app</option>
                    <option value="sms">sms</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">Event Type</label>
                  <select value={newTplType} onChange={e => setNewTplType(e.target.value)} className="w-full px-3 py-1.5 bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:border-appPrimary focus:outline-none">
                    <option value="">— Custom (not auto-sent) —</option>
                    <option value="welcome">welcome</option>
                    <option value="verify_email">verify_email</option>
                    <option value="password_reset">password_reset</option>
                    <option value="document_ready">document_ready</option>
                    <option value="invoice_ready">invoice_ready</option>
                    <option value="quota_alert">quota_alert</option>
                    <option value="renewal">renewal</option>
                    <option value="payment_receipt">payment_receipt</option>
                    <option value="payment_failed">payment_failed</option>
                    <option value="cancellation">cancellation</option>
                  </select>
                  <p className="text-[10px] text-appTextSecondary mt-1">
                    Binding to an event type replaces the system's default email for that event. Leave as Custom to just save a draft.
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-appTextSecondary mb-1">HTML Body (Handlebars supported)</label>
                  <textarea value={newTplBody} onChange={e => setNewTplBody(e.target.value)} rows={6} className="w-full p-3 font-mono text-xs bg-appBg text-emerald-400 rounded-md border border-appBorder focus:border-appPrimary focus:outline-none" />
                </div>
                <div className="pt-3 flex justify-end gap-2 border-t border-appBorder">
                  <Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setShowCreateTemplateModal(false)}><X size={12} /> Cancel</Button>
                  <Button type="submit" variant="primary" size="sm"><Plus size={12} className="mr-1" /> Create Template</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
        {systemDialog}
      </div>
    );
  }

  // Every reachable subItem is handled by an early return above.
  return null;
};

export default NotificationsView;
