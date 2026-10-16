import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageSquare, DollarSign, Mail, Layers, Send, Loader2, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/ui/Button';
import * as supportApi from '../../api/support';

const DashboardSupportPage: React.FC = () => {
  const { user } = useAuthStore();

  const [supportSubTab, setSupportSubTab] = useState<'ticket' | 'refund' | 'contact' | 'override'>('ticket');
  const [supportFormNotice, setSupportFormNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);

  const [tktSubject, setTktSubject] = useState('');
  const [tktCategory, setTktCategory] = useState('general');
  const [tktPriority, setTktPriority] = useState('medium');
  const [tktMessage, setTktMessage] = useState('');

  const [rfndReason, setRfndReason] = useState('');
  const [rfndAmount, setRfndAmount] = useState('');
  const [rfndGateway, setRfndGateway] = useState('paddle');

  const [ctctName, setCtctName] = useState('');
  const [ctctSubject, setCtctSubject] = useState('');
  const [ctctMessage, setCtctMessage] = useState('');

  const [ovrPlan, setOvrPlan] = useState('pro');
  const [ovrReason, setOvrReason] = useState('');
  const [ovrQuota, setOvrQuota] = useState('500');

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tktSubject.trim() || !tktMessage.trim()) return;
    setIsSubmittingSupport(true);
    setSupportFormNotice(null);
    try {
      await supportApi.submitSupportTicket({
        user_email: user?.email || 'user@example.com',
        subject: tktSubject,
        category: tktCategory,
        priority: tktPriority,
        message: tktMessage,
        user_id: user?.user_id,
      });
      setSupportFormNotice({ text: 'Support ticket submitted successfully! Our team will review it shortly.', type: 'success' });
      setTktSubject('');
      setTktMessage('');
    } catch (err) {
      setSupportFormNotice({ text: (err instanceof Error ? err.message : '') || 'Failed to submit ticket. Please try again.', type: 'error' });
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfndReason.trim()) return;
    setIsSubmittingSupport(true);
    setSupportFormNotice(null);
    try {
      await supportApi.submitRefundRequest({
        user_email: user?.email || 'user@example.com',
        reason: rfndReason,
        amount: rfndAmount ? parseFloat(rfndAmount) : undefined,
        gateway: rfndGateway,
        user_id: user?.user_id,
      });
      setSupportFormNotice({ text: 'Refund request submitted! Admin will inspect your payment transaction.', type: 'success' });
      setRfndReason('');
      setRfndAmount('');
    } catch (err) {
      setSupportFormNotice({ text: (err instanceof Error ? err.message : '') || 'Failed to submit refund request.', type: 'error' });
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctctSubject.trim() || !ctctMessage.trim()) return;
    setIsSubmittingSupport(true);
    setSupportFormNotice(null);
    try {
      await supportApi.submitContactForm({
        name: ctctName || user?.email?.split('@')[0] || 'Valued User',
        email: user?.email || 'user@example.com',
        subject: ctctSubject,
        message: ctctMessage,
        user_id: user?.user_id,
      });
      setSupportFormNotice({ text: 'Contact submission received! Thank you for reaching out.', type: 'success' });
      setCtctSubject('');
      setCtctMessage('');
    } catch (err) {
      setSupportFormNotice({ text: (err instanceof Error ? err.message : '') || 'Failed to send message.', type: 'error' });
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovrReason.trim()) return;
    setIsSubmittingSupport(true);
    setSupportFormNotice(null);
    try {
      await supportApi.submitPlanOverrideRequest({
        user_email: user?.email || 'user@example.com',
        requested_plan: ovrPlan,
        reason: ovrReason,
        requested_quota: ovrQuota ? parseInt(ovrQuota) : undefined,
        current_plan: user?.plan || 'free',
        user_id: user?.user_id,
      });
      setSupportFormNotice({ text: 'Custom plan override request submitted to Admin Team!', type: 'success' });
      setOvrReason('');
    } catch (err) {
      setSupportFormNotice({ text: (err instanceof Error ? err.message : '') || 'Failed to submit override request.', type: 'error' });
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-5 text-left"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-appTextPrimary">Help &amp; Support Center</h1>
        <p className="text-sm text-appTextSecondary mt-1">
          Submit technical issues, request billing refunds, reach customer support, or request custom plan overrides.
        </p>
      </div>

      {supportFormNotice && (
        <div
          className={`p-4 rounded-none text-xs font-medium border flex items-center justify-between ${
            supportFormNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
              : 'bg-red-500/10 border-red-500/25 text-red-500'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{supportFormNotice.text}</span>
          </div>
          <button onClick={() => setSupportFormNotice(null)} className="hover:opacity-75">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { id: 'ticket', label: 'Report Issue', icon: MessageSquare },
          { id: 'refund', label: 'Request Refund', icon: DollarSign },
          { id: 'contact', label: 'Contact Support', icon: Mail },
          { id: 'override', label: 'Custom Plan Request', icon: Layers },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { if (id === 'ticket' || id === 'refund' || id === 'contact' || id === 'override') setSupportSubTab(id); setSupportFormNotice(null); }}
            className={`p-4 rounded-none border text-left flex flex-col justify-between gap-3 transition-all ${
              supportSubTab === id
                ? 'bg-appPrimary/10 border-appPrimary text-appPrimary'
                : 'bg-appSurface border-appBorder text-appTextSecondary hover:border-appTextSecondary/40'
            }`}
          >
            <Icon size={20} />
            <span className="text-xs font-bold">{label}</span>
          </button>
        ))}
      </div>

      {supportSubTab === 'ticket' && (
        <div className="p-4 bg-appSurface border border-appBorder rounded-none space-y-4">
          <div className="flex items-center gap-2 text-appPrimary pb-2 border-b border-appBorder">
            <MessageSquare size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-appTextPrimary">
              Submit Technical Issue / Support Ticket
            </h3>
          </div>
          <form onSubmit={handleTicketSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-appTextSecondary mb-1">Category</label>
                <select
                  value={tktCategory}
                  onChange={e => setTktCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
                >
                  <option value="general">General Support</option>
                  <option value="technical">Technical Bug / AI Builder</option>
                  <option value="billing">Billing &amp; Subscription</option>
                  <option value="export">PDF Export / Watermark</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-appTextSecondary mb-1">Priority</label>
                <select
                  value={tktPriority}
                  onChange={e => setTktPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-appTextSecondary mb-1">Subject</label>
              <input
                type="text"
                value={tktSubject}
                onChange={e => setTktSubject(e.target.value)}
                placeholder="Brief summary of the issue..."
                required
                className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-appTextSecondary mb-1">Detailed Description</label>
              <textarea
                value={tktMessage}
                onChange={e => setTktMessage(e.target.value)}
                rows={4}
                placeholder="Describe the steps to reproduce or details of your request..."
                required
                className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary resize-none"
              />
            </div>
            <Button variant="primary" size="md" type="submit" disabled={isSubmittingSupport} className="flex items-center gap-2">
              {isSubmittingSupport ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Submit Ticket
            </Button>
          </form>
        </div>
      )}

      {supportSubTab === 'refund' && (
        <div className="p-4 bg-appSurface border border-appBorder rounded-none space-y-4">
          <div className="flex items-center gap-2 text-emerald-500 pb-2 border-b border-appBorder">
            <DollarSign size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-appTextPrimary">
              Submit Payment Refund Request
            </h3>
          </div>
          <form onSubmit={handleRefundSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-appTextSecondary mb-1">Payment Gateway</label>
                <select
                  value={rfndGateway}
                  onChange={e => setRfndGateway(e.target.value)}
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
                >
                  <option value="paddle">Paddle Gateway</option>
                  <option value="payhere">PayHere Gateway</option>
                  <option value="stripe">Stripe Gateway</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-appTextSecondary mb-1">Amount (USD / LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={rfndAmount}
                  onChange={e => setRfndAmount(e.target.value)}
                  placeholder="e.g. 9.99"
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-appTextSecondary mb-1">Reason for Refund</label>
              <textarea
                value={rfndReason}
                onChange={e => setRfndReason(e.target.value)}
                rows={3}
                placeholder="Explain why you are requesting a refund for your subscription..."
                required
                className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary resize-none"
              />
            </div>
            <Button variant="primary" size="md" type="submit" disabled={isSubmittingSupport} className="flex items-center gap-2">
              {isSubmittingSupport ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Submit Refund Request
            </Button>
          </form>
        </div>
      )}

      {supportSubTab === 'contact' && (
        <div className="p-4 bg-appSurface border border-appBorder rounded-none space-y-4">
          <div className="flex items-center gap-2 text-purple-500 pb-2 border-b border-appBorder">
            <Mail size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-appTextPrimary">
              Send Message to Support Team
            </h3>
          </div>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-appTextSecondary mb-1">Your Name</label>
              <input
                type="text"
                value={ctctName}
                onChange={e => setCtctName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-appTextSecondary mb-1">Subject</label>
              <input
                type="text"
                value={ctctSubject}
                onChange={e => setCtctSubject(e.target.value)}
                placeholder="Message subject..."
                required
                className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-appTextSecondary mb-1">Message</label>
              <textarea
                value={ctctMessage}
                onChange={e => setCtctMessage(e.target.value)}
                rows={4}
                placeholder="Type your message here..."
                required
                className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary resize-none"
              />
            </div>
            <Button variant="primary" size="md" type="submit" disabled={isSubmittingSupport} className="flex items-center gap-2">
              {isSubmittingSupport ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Send Message
            </Button>
          </form>
        </div>
      )}

      {supportSubTab === 'override' && (
        <div className="p-4 bg-appSurface border border-appBorder rounded-none space-y-4">
          <div className="flex items-center gap-2 text-indigo-500 pb-2 border-b border-appBorder">
            <Layers size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-appTextPrimary">
              Request Manual Plan Upgrade / Quota Override
            </h3>
          </div>
          <form onSubmit={handleOverrideSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-appTextSecondary mb-1">Requested Plan</label>
                <select
                  value={ovrPlan}
                  onChange={e => setOvrPlan(e.target.value)}
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
                >
                  <option value="pro">Pro Membership Plan</option>
                  <option value="max">Max Plan</option>
                  <option value="unlimited">Unlimited VIP Tier</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-appTextSecondary mb-1">Desired Daily Quota (Docs)</label>
                <input
                  type="number"
                  value={ovrQuota}
                  onChange={e => setOvrQuota(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-appTextSecondary mb-1">Business Justification / Reason</label>
              <textarea
                value={ovrReason}
                onChange={e => setOvrReason(e.target.value)}
                rows={3}
                placeholder="Explain why you require custom quota or plan override..."
                required
                className="w-full px-3 py-2 bg-appBg text-xs text-appTextPrimary border border-appBorder rounded-none focus:outline-none focus:border-appPrimary resize-none"
              />
            </div>
            <Button variant="primary" size="md" type="submit" disabled={isSubmittingSupport} className="flex items-center gap-2">
              {isSubmittingSupport ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Submit Override Request
            </Button>
          </form>
        </div>
      )}
    </motion.div>
  );
};

export default DashboardSupportPage;
