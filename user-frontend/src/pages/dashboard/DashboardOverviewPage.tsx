import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, FileCheck, FileOutput, CreditCard, ArrowUpRight } from 'lucide-react';
import { useQuotaStore, UNLIMITED_QUOTA } from '../../store/quotaStore';
import { useUserDocuments } from '../../hooks/useUserDocuments';
import { startNewDocument } from '../../utils/dashboardActions';
import Button from '../../components/ui/Button';
import StatCard from '../../components/dashboard/StatCard';
import DocumentsTable from '../../components/dashboard/DocumentsTable';
import ProfileQuotaCard from '../../components/dashboard/ProfileQuotaCard';

const DashboardOverviewPage: React.FC = () => {
  const { quota, fetchQuota, entitlements } = useQuotaStore();
  const { documents, error } = useUserDocuments();
  const navigate = useNavigate();
  const completedCount = documents.length;

  useEffect(() => {
    fetchQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-5 text-left"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-appTextPrimary">Dashboard</h1>
        <p className="text-sm text-appTextSecondary mt-1">
          Your account at a glance — documents, usage, and plan status.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Completed Documents"
          value={completedCount}
          tone="success"
          icon={<FileCheck size={20} className="text-emerald-500" />}
        />
        <StatCard
          label="Allowance Used"
          value={
            !quota
              ? '—'
              : quota.daily_limit === UNLIMITED_QUOTA
                ? `${quota.used_today} / Unlimited`
                : `${quota.used_today} / ${quota.daily_limit}`
          }
          tone="primary"
          icon={<FileOutput size={20} className="text-appPrimary" />}
        />
        <StatCard
          label="Current Plan"
          value={entitlements?.plan.toUpperCase() || '—'}
          tone="accent"
          icon={<CreditCard size={20} className="text-accent-amber-400" />}
        />
      </div>

      <ProfileQuotaCard />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-appSurface border border-appBorder rounded-none text-left space-y-4">
          <div className="flex items-center gap-2 text-appPrimary">
            <Plus size={20} />
            <h3 className="text-base font-extrabold text-appTextPrimary">Create New Business Document</h3>
          </div>
          <p className="text-xs text-appTextSecondary leading-relaxed">
            Launch the AI-assisted Document Builder to generate Invoices, Quotations, Receipts, or Purchase Orders.
          </p>
          <Button variant="primary" size="md" onClick={startNewDocument} className="w-full justify-center">
            Start Building Now
            <ArrowUpRight size={16} />
          </Button>
        </div>

        <div className="p-4 bg-appSurface border border-appBorder rounded-none text-left space-y-4">
          <div className="flex items-center gap-2 text-accent-amber-400">
            <CreditCard size={20} />
            <h3 className="text-base font-extrabold text-appTextPrimary">Membership & Subscription</h3>
          </div>
          <p className="text-xs text-appTextSecondary leading-relaxed">
            Compare current plan benefits and the shared AI request and server PDF allowance in your billing settings.
          </p>
          <Link to="/dashboard/billing" className="block">
            <Button variant="secondary" size="md" className="w-full justify-center">
              Manage Billing & Subscription
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-4 bg-appSurface border border-appBorder rounded-none text-left space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-appTextSecondary">
            Recent Generated Documents
          </h3>
          <Link to="/dashboard/document-history" className="text-xs text-appPrimary font-semibold hover:underline">
            View All
          </Link>
        </div>
        {error && <p role="alert">{error}</p>}
        <DocumentsTable documents={documents.slice(0, 5)} variant="compact" onReopen={doc => navigate(`/builder?sessionId=${encodeURIComponent(doc.id)}`)} />
      </div>
    </motion.div>
  );
};

export default DashboardOverviewPage;
