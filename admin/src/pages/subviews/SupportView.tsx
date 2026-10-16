import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import {
  MessageSquare, Search, RefreshCw, CheckCircle2, DollarSign,
  Mail, Layers, AlertCircle, Clock, Bot, X, ShieldCheck, Send, Eye, XCircle
} from 'lucide-react';
import { adminApiClient } from '../../api/adminApiClient';
import { toast } from '../../store/toastStore';

interface SupportViewProps {
  activeSubItem: string;
}

type StatusBadge = 'success' | 'warning' | 'danger' | 'secondary' | 'primary';

const statusVariant = (s: string): StatusBadge => {
  const sl = (s || '').toLowerCase();
  if (['resolved', 'approved', 'paid', 'read'].includes(sl))    return 'success';
  if (['open', 'unread', 'pending'].includes(sl))                return 'warning';
  if (['in_progress', 'reviewing'].includes(sl))                 return 'primary';
  if (['denied', 'rejected', 'cancelled', 'canceled'].includes(sl)) return 'danger';
  return 'secondary';
};

const fmtDate = (d: string | undefined) => d ? new Date(d).toLocaleString() : '—';

const SupportView: React.FC<SupportViewProps> = ({ activeSubItem }) => {
  // Data state
  const [tickets,    setTickets]    = useState<Wire.SupportItem[]>([]);
  const [refunds,    setRefunds]    = useState<Wire.SupportItem[]>([]);
  const [contacts,   setContacts]   = useState<Wire.SupportItem[]>([]);
  const [overrides,  setOverrides]  = useState<Wire.SupportItem[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);

  // Filter state
  const [searchTerm,  setSearchTerm]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal states
  const [detailItem,       setDetailItem]       = useState<Wire.SupportItem | null>(null);
  const [detailType,       setDetailType]       = useState<string>('');
  const [adminNote,        setAdminNote]        = useState('');
  const [resolveNote,      setResolveNote]      = useState('');
  const [isSaving,         setIsSaving]         = useState(false);

  const loadAll = useCommittedEvent(async () => {

    const [tRes, rRes, cRes, oRes] = await Promise.allSettled([
      adminApiClient.getSupportTickets({ limit: 200 }),
      adminApiClient.getRefundRequests({ limit: 200 }),
      adminApiClient.getContactSubmissions({ limit: 200 }),
      adminApiClient.getPlanOverrideRequests({ limit: 200 }),
    ]);
    if (tRes.status === 'fulfilled') setTickets(tRes.value?.data ?? []);
    if (rRes.status === 'fulfilled') setRefunds(rRes.value?.data ?? []);
    if (cRes.status === 'fulfilled') setContacts(cRes.value?.data ?? []);
    if (oRes.status === 'fulfilled') setOverrides(oRes.value?.data ?? []);
    setIsLoading(false);
  });

  useEffect(() => { loadAll(); }, [loadAll]);

  // Universal filter
  const applyFilters = (list: Wire.SupportItem[], fields: Array<keyof Wire.SupportItem>) => list.filter(item => {
    const matchSearch = !searchTerm || fields.some(f =>
      String(item[f] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchStatus = !statusFilter || (item.status || '').toLowerCase() === statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });

  // Shared filter toolbar
  const renderToolbar = (title: string, count: number, statusOptions: string[]) => (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-appBorder/50 mb-5 text-left">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-appTextPrimary">{title}</h3>
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
            className="pl-8 pr-3 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary w-44"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-2 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
        >
          <option value="">All Statuses</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={isLoading}>
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>
  );

  // ─── MODAL: Ticket Detail + Resolve ──────────────────────────────────────
  const openDetail = (item: Wire.SupportItem, type: string) => {
    setDetailItem(item);
    setDetailType(type);
    setAdminNote(item.admin_notes || item.admin_reply || '');
    setResolveNote(item.resolution_notes || '');
  };

  const closeDetail = () => {
    setDetailItem(null);
    setAdminNote('');
    setResolveNote('');
  };

  const handleResolveTicket = async () => {
    if (!detailItem) return;
    setIsSaving(true);
    try {
      await adminApiClient.resolveSupportTicket(detailItem.id, resolveNote || undefined);
      await loadAll();
      closeDetail();
      toast.success('Ticket Resolved', 'The reported issue has been marked resolved.');
    } catch (err) {
      toast.error('Failed to Resolve Ticket', err);
    } finally { setIsSaving(false); }
  };

  const handleUpdateRefund = async (newStatus: string) => {
    if (!detailItem) return;
    setIsSaving(true);
    try {
      await adminApiClient.updateRefundRequest(detailItem.id, { status: newStatus, admin_notes: adminNote });
      await loadAll();
      closeDetail();
      toast.success('Refund Updated', `Request status set to ${newStatus}.`);
    } catch (err) {
      toast.error('Failed to Update Refund', err);
    } finally { setIsSaving(false); }
  };

  const handleUpdateContact = async () => {
    if (!detailItem) return;
    setIsSaving(true);
    try {
      await adminApiClient.updateContactSubmission(detailItem.id, { status: 'read', admin_reply: adminNote });
      await loadAll();
      closeDetail();
      toast.success('Reply Sent', 'Contact submission marked read and replied to.');
    } catch (err) {
      toast.error('Failed to Send Reply', err);
    } finally { setIsSaving(false); }
  };

  const handleUpdateOverride = async (newStatus: string) => {
    if (!detailItem) return;
    setIsSaving(true);
    try {
      if (newStatus === 'approved') {
        await adminApiClient.approvePlanOverride(detailItem.id);
      } else {
        await adminApiClient.updatePlanOverrideRequest(detailItem.id, { status: newStatus, admin_notes: adminNote });
      }
      await loadAll();
      closeDetail();
      toast.success('Override Request Updated', `Request ${newStatus}.`);
    } catch (err) {
      toast.error('Failed to Update Override Request', err);
    } finally { setIsSaving(false); }
  };

  // ─── SUBVIEW: User Reported Issues ───────────────────────────────────────
  if (activeSubItem === 'sup_reported') {
    const filtered = applyFilters(tickets, ['user_email', 'subject', 'message', 'id', 'category']);

    return (
      <div className="space-y-6 text-left">
        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Tickets',   value: tickets.length,                                 icon: MessageSquare, tone: 'purple' as const },
            { label: 'Open',            value: tickets.filter(t => t.status === 'open').length, icon: Clock,         tone: 'amber' as const },
            { label: 'In Progress',     value: tickets.filter(t => t.status === 'in_progress').length, icon: AlertCircle, tone: 'blue' as const },
            { label: 'Resolved',        value: tickets.filter(t => t.status === 'resolved').length,    icon: CheckCircle2, tone: 'emerald' as const },
          ].map(({ label, value, icon, tone }) => (
            <StatCard key={label} label={label} value={value} icon={icon} tone={tone} />
          ))}
        </div>

        <Card>
          {renderToolbar('User Reported Issues', filtered.length, ['open', 'in_progress', 'resolved', 'closed'])}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Ticket ID</th>
                  <th className="pb-3 font-bold">Email</th>
                  <th className="pb-3 font-bold">Subject</th>
                  <th className="pb-3 font-bold">Category</th>
                  <th className="pb-3 font-bold">Priority</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold">Submitted</th>
                  <th className="pb-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-appTextSecondary font-mono text-[11px]">
                    {isLoading ? 'Loading tickets from database…' : 'No support tickets found.'}
                  </td></tr>
                ) : filtered.map(t => (
                  <tr key={t.id} className="hover:bg-appBg/20 transition-colors">
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">{t.id}</td>
                    <td className="py-3 font-bold text-appTextPrimary">{t.user_email}</td>
                    <td className="py-3 text-appTextSecondary max-w-[180px] truncate" title={t.subject}>{t.subject}</td>
                    <td className="py-3 text-purple-500 capitalize">{t.category || '—'}</td>
                    <td className="py-3">
                      <Badge variant={t.priority === 'high' ? 'danger' : t.priority === 'low' ? 'secondary' : 'warning'}>
                        {(t.priority || 'medium').toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3"><Badge variant={statusVariant(t.status)}>{(t.status || '').toUpperCase()}</Badge></td>
                    <td className="py-3 text-appTextSecondary text-[10px]">{fmtDate(t.created_at)}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {t.session_id && (
                          <Button variant="outline" size="sm" onClick={() => openDetail(t, 'ticket_inspect')}>
                            <Bot size={11} /> Inspect
                          </Button>
                        )}
                        {t.status !== 'resolved' && (
                          <Button variant="success" size="sm" onClick={() => openDetail(t, 'ticket')}>
                            <CheckCircle2 size={11} /> Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Resolve Ticket Modal */}
        {detailItem && (detailType === 'ticket' || detailType === 'ticket_inspect') && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-appSurface border border-appBorder rounded-md shadow-2xl max-w-lg w-full p-6 space-y-4 text-left animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-appBorder">
                <div className="flex items-center gap-2">
                  {detailType === 'ticket_inspect' ? <Bot size={16} className="text-purple-500" /> : <CheckCircle2 size={16} className="text-appSuccess" />}
                  <h3 className="text-xs font-black text-appTextPrimary uppercase tracking-wider">
                    {detailType === 'ticket_inspect' ? `MCP Chat Session: ${detailItem.session_id}` : `Resolve Ticket: ${detailItem.id}`}
                  </h3>
                </div>
                <button onClick={closeDetail} className="text-appTextSecondary hover:text-appTextPrimary"><X size={16} /></button>
              </div>

              <div className="space-y-2 text-xs text-appTextSecondary">
                <p><span className="font-bold text-appTextPrimary">User:</span> {detailItem.user_email}</p>
                <p><span className="font-bold text-appTextPrimary">Subject:</span> {detailItem.subject}</p>
                <p className="leading-relaxed"><span className="font-bold text-appTextPrimary">Message:</span> {detailItem.message}</p>
              </div>

              {detailType === 'ticket' && (
                <>
                  <div>
                    <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Resolution Notes</label>
                    <textarea
                      value={resolveNote}
                      onChange={e => setResolveNote(e.target.value)}
                      rows={3}
                      placeholder="Describe how the issue was resolved…"
                      className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-appBorder">
                    <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={closeDetail}><X size={12} /> Cancel</Button>
                    <Button variant="success" size="sm" onClick={handleResolveTicket} disabled={isSaving}>
                      <ShieldCheck size={12} /> {isSaving ? 'Saving…' : 'Mark Resolved'}
                    </Button>
                  </div>
                </>
              )}

              {detailType === 'ticket_inspect' && (
                <div className="rounded-md bg-appBg border border-appBorder p-4">
                  <p className="text-[10px] text-appTextSecondary font-mono italic">
                    Session ID: <span className="text-purple-500 font-bold">{detailItem.session_id}</span>
                  </p>
                  <p className="text-[10px] text-appTextSecondary mt-1">Connect to the MCP Chat session inspector to view real-time tool invocations.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── SUBVIEW: Refund Requests ─────────────────────────────────────────────
  if (activeSubItem === 'sup_refunds') {
    const filtered = applyFilters(refunds, ['user_email', 'id', 'reason', 'gateway']);

    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Requests', value: refunds.length,                                   icon: DollarSign,  tone: 'blue' as const   },
            { label: 'Pending',        value: refunds.filter(r => r.status === 'pending').length, icon: Clock,       tone: 'amber' as const },
            { label: 'Approved',       value: refunds.filter(r => r.status === 'approved').length, icon: CheckCircle2, tone: 'emerald' as const },
            { label: 'Denied',         value: refunds.filter(r => r.status === 'denied').length,   icon: X,           tone: 'rose' as const    },
          ].map(({ label, value, icon, tone }) => (
            <StatCard key={label} label={label} value={value} icon={icon} tone={tone} />
          ))}
        </div>

        <Card>
          {renderToolbar('Refund Requests', filtered.length, ['pending', 'approved', 'denied', 'processing'])}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Request ID</th>
                  <th className="pb-3 font-bold">User Email</th>
                  <th className="pb-3 font-bold">Amount</th>
                  <th className="pb-3 font-bold">Gateway</th>
                  <th className="pb-3 font-bold">Reason</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold">Submitted</th>
                  <th className="pb-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-appTextSecondary font-mono text-[11px]">
                    {isLoading ? 'Loading refund requests…' : 'No refund requests found.'}
                  </td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="hover:bg-appBg/20 transition-colors">
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">{r.id}</td>
                    <td className="py-3 font-bold text-appTextPrimary">{r.user_email}</td>
                    <td className="py-3 font-mono font-bold text-appTextPrimary">
                      {r.amount != null ? `$${Number(r.amount).toFixed(2)}` : '—'} <span className="text-appTextSecondary text-[10px]">{r.currency || 'USD'}</span>
                    </td>
                    <td className="py-3 capitalize text-appTextSecondary">{r.gateway || '—'}</td>
                    <td className="py-3 text-appTextSecondary max-w-[160px] truncate" title={r.reason}>{r.reason}</td>
                    <td className="py-3"><Badge variant={statusVariant(r.status)}>{(r.status || '').toUpperCase()}</Badge></td>
                    <td className="py-3 text-appTextSecondary text-[10px]">{fmtDate(r.created_at)}</td>
                    <td className="py-3 text-right">
                      {r.status === 'pending' && (
                        <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => openDetail(r, 'refund')}>
                          <Eye size={12} /> Review
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Refund Detail Modal */}
        {detailItem && detailType === 'refund' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-appSurface border border-appBorder rounded-md shadow-2xl max-w-lg w-full p-6 space-y-4 text-left animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-appBorder">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-blue-500" />
                  <h3 className="text-xs font-black text-appTextPrimary uppercase tracking-wider">Review Refund Request</h3>
                </div>
                <button onClick={closeDetail}><X size={16} className="text-appTextSecondary" /></button>
              </div>
              <div className="space-y-2 text-xs text-appTextSecondary">
                <p><span className="font-bold text-appTextPrimary">ID:</span> {detailItem.id}</p>
                <p><span className="font-bold text-appTextPrimary">User:</span> {detailItem.user_email}</p>
                <p><span className="font-bold text-appTextPrimary">Amount:</span> ${Number(detailItem.amount || 0).toFixed(2)} {detailItem.currency}</p>
                <p><span className="font-bold text-appTextPrimary">Gateway:</span> {detailItem.gateway || '—'}</p>
                <p className="leading-relaxed"><span className="font-bold text-appTextPrimary">Reason:</span> {detailItem.reason}</p>
              </div>
              <div>
                <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Admin Notes</label>
                <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} placeholder="Internal notes…"
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-appBorder">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={closeDetail}><X size={12} /> Cancel</Button>
                <Button variant="danger" size="sm" className="flex items-center gap-1.5" onClick={() => handleUpdateRefund('denied')} disabled={isSaving}><XCircle size={12} /> Deny</Button>
                <Button variant="success" size="sm" onClick={() => handleUpdateRefund('approved')} disabled={isSaving}>
                  <CheckCircle2 size={12} /> {isSaving ? 'Saving…' : 'Approve Refund'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── SUBVIEW: Contact Form Submissions ────────────────────────────────────
  if (activeSubItem === 'sup_contact') {
    const filtered = applyFilters(contacts, ['name', 'email', 'subject', 'id', 'message']);

    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Total Messages', value: contacts.length,                                    icon: Mail,        tone: 'purple' as const },
            { label: 'Unread',         value: contacts.filter(c => c.status === 'unread').length,  icon: AlertCircle, tone: 'amber' as const },
            { label: 'Replied',        value: contacts.filter(c => c.status === 'read').length,    icon: CheckCircle2, tone: 'emerald' as const  },
          ].map(({ label, value, icon, tone }) => (
            <StatCard key={label} label={label} value={value} icon={icon} tone={tone} />
          ))}
        </div>

        <Card>
          {renderToolbar('Contact Form Submissions', filtered.length, ['unread', 'read', 'replied'])}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">ID</th>
                  <th className="pb-3 font-bold">Name</th>
                  <th className="pb-3 font-bold">Email</th>
                  <th className="pb-3 font-bold">Subject</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold">Submitted</th>
                  <th className="pb-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-appTextSecondary font-mono text-[11px]">
                    {isLoading ? 'Loading contact submissions…' : 'No contact submissions found.'}
                  </td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className={`hover:bg-appBg/20 transition-colors ${c.status === 'unread' ? 'border-l-2 border-yellow-500' : ''}`}>
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">{c.id}</td>
                    <td className="py-3 font-bold text-appTextPrimary">{c.name}</td>
                    <td className="py-3 text-appTextSecondary">{c.email}</td>
                    <td className="py-3 text-appTextSecondary max-w-[180px] truncate" title={c.subject}>{c.subject}</td>
                    <td className="py-3"><Badge variant={statusVariant(c.status)}>{(c.status || '').toUpperCase()}</Badge></td>
                    <td className="py-3 text-appTextSecondary text-[10px]">{fmtDate(c.created_at)}</td>
                    <td className="py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openDetail(c, 'contact')}>
                        <Mail size={11} /> Reply
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Contact Reply Modal */}
        {detailItem && detailType === 'contact' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-appSurface border border-appBorder rounded-md shadow-2xl max-w-lg w-full p-6 space-y-4 text-left animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-appBorder">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-purple-500" />
                  <h3 className="text-xs font-black text-appTextPrimary uppercase tracking-wider">Contact Message</h3>
                </div>
                <button onClick={closeDetail}><X size={16} className="text-appTextSecondary" /></button>
              </div>
              <div className="space-y-2 text-xs text-appTextSecondary bg-appBg rounded-md p-4 border border-appBorder">
                <p><span className="font-bold text-appTextPrimary">From:</span> {detailItem.name} &lt;{detailItem.email}&gt;</p>
                <p><span className="font-bold text-appTextPrimary">Subject:</span> {detailItem.subject}</p>
                <p className="mt-2 leading-relaxed">{detailItem.message}</p>
              </div>
              <div>
                <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Admin Reply / Notes</label>
                <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
                  placeholder="Write your reply or internal notes here…"
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-appBorder">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={closeDetail}><X size={12} /> Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleUpdateContact} disabled={isSaving}>
                  <Send size={12} /> {isSaving ? 'Saving…' : 'Mark as Read & Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── SUBVIEW: Manual Plan Override Requests ───────────────────────────────
  if (activeSubItem === 'sup_overrides') {
    const filtered = applyFilters(overrides, ['user_email', 'id', 'requested_plan', 'reason', 'current_plan']);

    return (
      <div className="space-y-6 text-left">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Requests', value: overrides.length,                                    icon: Layers,      tone: 'indigo' as const  },
            { label: 'Pending Review', value: overrides.filter(o => o.status === 'pending').length,  icon: Clock,       tone: 'amber' as const  },
            { label: 'Approved',       value: overrides.filter(o => o.status === 'approved').length, icon: CheckCircle2, tone: 'emerald' as const   },
            { label: 'Denied',         value: overrides.filter(o => o.status === 'denied').length,   icon: X,           tone: 'rose' as const     },
          ].map(({ label, value, icon, tone }) => (
            <StatCard key={label} label={label} value={value} icon={icon} tone={tone} />
          ))}
        </div>

        <Card>
          {renderToolbar('Manual Plan Override Requests', filtered.length, ['pending', 'approved', 'denied', 'reviewing'])}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Request ID</th>
                  <th className="pb-3 font-bold">User Email</th>
                  <th className="pb-3 font-bold">Current Plan</th>
                  <th className="pb-3 font-bold">Requested Plan</th>
                  <th className="pb-3 font-bold">Quota Request</th>
                  <th className="pb-3 font-bold">Reason</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold">Submitted</th>
                  <th className="pb-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-appBorder/40">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-appTextSecondary font-mono text-[11px]">
                    {isLoading ? 'Loading override requests…' : 'No plan override requests found.'}
                  </td></tr>
                ) : filtered.map(o => (
                  <tr key={o.id} className="hover:bg-appBg/20 transition-colors">
                    <td className="py-3 font-mono text-[10px] text-appTextSecondary">{o.id}</td>
                    <td className="py-3 font-bold text-appTextPrimary">{o.user_email}</td>
                    <td className="py-3 text-appTextSecondary capitalize">{o.current_plan || '—'}</td>
                    <td className="py-3">
                      <Badge variant="primary">{o.requested_plan || '—'}</Badge>
                    </td>
                    <td className="py-3 font-mono text-appTextSecondary">
                      {o.requested_quota ? `${Number(o.requested_quota).toLocaleString()} docs` : '—'}
                    </td>
                    <td className="py-3 text-appTextSecondary max-w-[160px] truncate" title={o.reason}>{o.reason}</td>
                    <td className="py-3"><Badge variant={statusVariant(o.status)}>{(o.status || '').toUpperCase()}</Badge></td>
                    <td className="py-3 text-appTextSecondary text-[10px]">{fmtDate(o.created_at)}</td>
                    <td className="py-3 text-right">
                      {o.status === 'pending' && (
                        <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => openDetail(o, 'override')}>
                          <Eye size={12} /> Review
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Override Review Modal */}
        {detailItem && detailType === 'override' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-appSurface border border-appBorder rounded-md shadow-2xl max-w-lg w-full p-6 space-y-4 text-left animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-appBorder">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-indigo-500" />
                  <h3 className="text-xs font-black text-appTextPrimary uppercase tracking-wider">Review Plan Override Request</h3>
                </div>
                <button onClick={closeDetail}><X size={16} className="text-appTextSecondary" /></button>
              </div>
              <div className="space-y-2 text-xs text-appTextSecondary">
                <p><span className="font-bold text-appTextPrimary">User:</span> {detailItem.user_email}</p>
                <p><span className="font-bold text-appTextPrimary">Current Plan:</span> {detailItem.current_plan || '—'}</p>
                <p><span className="font-bold text-appTextPrimary">Requested Plan:</span> <span className="text-purple-500 font-bold">{detailItem.requested_plan}</span></p>
                {detailItem.requested_quota && (
                  <p><span className="font-bold text-appTextPrimary">Requested Quota:</span> {Number(detailItem.requested_quota).toLocaleString()} docs/month</p>
                )}
                <p className="leading-relaxed"><span className="font-bold text-appTextPrimary">Reason:</span> {detailItem.reason}</p>
              </div>
              <div>
                <label className="block text-[10px] text-appTextSecondary uppercase font-bold tracking-wider mb-1">Admin Notes</label>
                <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2}
                  placeholder="Decision notes or reason for denial…"
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-appBorder">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={closeDetail}><X size={12} /> Cancel</Button>
                <Button variant="danger" size="sm" className="flex items-center gap-1.5" onClick={() => handleUpdateOverride('denied')} disabled={isSaving}><XCircle size={12} /> Deny</Button>
                <Button variant="success" size="sm" onClick={() => handleUpdateOverride('approved')} disabled={isSaving}>
                  <ShieldCheck size={12} /> {isSaving ? 'Saving…' : 'Approve Override'}
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

export default SupportView;
