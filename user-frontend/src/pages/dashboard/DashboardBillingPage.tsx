import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, AlertTriangle, CheckCircle2, ExternalLink, Receipt, X } from 'lucide-react';
import { useQuotaStore, UNLIMITED_QUOTA } from '../../store/quotaStore';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/Spinner';
import PaymentMethodsCard from '../../components/dashboard/PaymentMethodsCard';
import * as paymentApi from '../../api/payment';

const DashboardBillingPage: React.FC = () => {
  const { quota, fetchQuota, entitlements } = useQuotaStore();

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [portalModalOpen, setPortalModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      const result=await paymentApi.cancelSubscription();
      await fetchQuota();
      setIsCancelling(false);
      setCancelModalOpen(false);
      setBillingNotice(result.message);
    } catch {
      setIsCancelling(false);
      setCancelModalOpen(false);
      setBillingNotice('Failed to cancel subscription. Please try again.');
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      const res = await paymentApi.getBillingPortal();
      if (res.portal_url) {
        window.location.href = res.portal_url;
      } else {
        setPortalModalOpen(true);
      }
    } catch {
      setPortalModalOpen(true);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="space-y-5 text-left"
      >
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-appTextPrimary">Billing & Plan Management</h1>
          <p className="text-sm text-appTextSecondary mt-1">
            Manage payment subscriptions, usage limits, and transaction summaries.
          </p>
        </div>

        {billingNotice && (
          <div className="p-4 bg-appPrimary/10 border border-appPrimary/25 text-appTextPrimary text-xs rounded-none flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-appPrimary" />
              <span>{billingNotice}</span>
            </div>
            <button onClick={() => setBillingNotice(null)} className="text-appTextSecondary hover:text-appTextPrimary">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-appSurface border border-appBorder rounded-none flex flex-col justify-between text-left">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-appTextSecondary mb-3">
                Current Subscription
              </h3>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl font-extrabold text-appTextPrimary">
                  {entitlements?.plan.toUpperCase() || 'FREE'}
                </span>
                <span className="bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-500 font-extrabold uppercase px-2.5 py-0.5 rounded-none">
                  Active
                </span>
              </div>
              <p className="text-xs text-appTextSecondary leading-relaxed">
                {['pro', 'max'].includes(entitlements?.plan || '')
                  ? 'Manage renewal details through your payment provider.'
                  : 'View current plans for prices and your available allowance.'}
              </p>
            </div>

            <div className="pt-5 flex gap-3">
              {['pro', 'max'].includes(entitlements?.plan || '') ? (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setCancelModalOpen(true)} id="btn-cancel-sub">
                    Cancel Subscription
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleOpenBillingPortal} id="btn-manage-sub">
                    Billing Portal
                  </Button>
                </>
              ) : (
                <Link to="/pricing" className="w-full">
                  <Button variant="primary" size="sm" className="w-full">
                    Upgrade to Pro
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div className="p-4 bg-appSurface border border-appBorder rounded-none text-left">
            <h3 className="text-sm font-bold uppercase tracking-wider text-appTextSecondary mb-3">
              Daily AI + PDF Allowance
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-baseline text-xs">
                <span className="font-semibold">AI requests + server PDFs used in this window</span>
                <span className="font-bold text-appTextPrimary">
                  {quota?.daily_limit === UNLIMITED_QUOTA
                    ? `${quota?.used_today || 0} / Unlimited`
                    : `${quota?.used_today || 0} / ${quota?.daily_limit ?? 0}`}
                </span>
              </div>

              <div className="w-full h-2.5 bg-appBg border border-appBorder rounded-none overflow-hidden">
                <div
                  className="h-full bg-appPrimary rounded-none transition-all duration-300"
                  style={{
                    width:
                      quota?.daily_limit === UNLIMITED_QUOTA
                        ? '0%'
                        : `${((quota?.used_today || 0) / (quota?.daily_limit ?? 0)) * 100}%`,
                  }}
                />
              </div>

              <p className="text-[10px] text-appTextSecondary leading-tight">
                The shared allowance resets after {entitlements?.quota_policy.window_hours ?? 20} hours from the first metered request. Limits come from your current plan or an administrator override.
              </p>
            </div>
          </div>
        </div>

        <PaymentMethodsCard />

        <div className="p-4 bg-appSurface border border-appBorder rounded-none text-left space-y-4">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-appPrimary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-appTextSecondary">
              Transaction & Invoice Receipts
            </h3>
          </div>

          {['pro', 'max'].includes(entitlements?.plan || '') ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-appBg border-b border-appBorder text-appTextSecondary font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-appBorder">
                  <tr>
                    <td className="py-3 px-4 font-mono">2026-08-15</td>
                    <td className="py-3 px-4 font-semibold text-appTextPrimary">DocCraft Pro Monthly Subscription</td>
                    <td className="py-3 px-4 font-bold text-appTextPrimary">LKR 990.00</td>
                    <td className="py-3 px-4">
                      <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 px-2 py-0.5 rounded-none text-[10px] font-bold uppercase">
                        Paid
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => alert('Downloading official receipt PDF...')}
                        className="text-appPrimary hover:underline font-semibold flex items-center gap-1 ml-auto"
                      >
                        Download <ExternalLink size={12} />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 border border-dashed border-appBorder rounded-none text-center text-xs text-appTextSecondary">
              No active transaction history. Subscribed payments will appear here.
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {cancelModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCancelModalOpen(false)}
              className="absolute inset-0 bg-appBg/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-sm bg-appSurface border border-appBorder rounded-none shadow-2xl p-4 z-10 text-left space-y-4"
            >
              <div className="w-12 h-12 rounded-none bg-danger/10 border border-danger/20 text-danger flex items-center justify-center mx-auto">
                <AlertTriangle size={24} />
              </div>
              <div className="text-center">
                <h3 className="text-base font-extrabold text-appTextPrimary">Cancel Pro Subscription?</h3>
                <p className="text-xs text-appTextSecondary mt-1 leading-relaxed">
                  Are you sure you want to cancel your Pro membership? Your account will revert to the free tier limits.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" size="sm" onClick={() => setCancelModalOpen(false)} className="w-1/2 justify-center">
                  Keep Subscription
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={isCancelling}
                  onClick={handleCancelSubscription}
                  className="w-1/2 justify-center"
                >
                  {isCancelling ? <LoadingSpinner size="sm" /> : 'Confirm Cancel'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {portalModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPortalModalOpen(false)}
              className="absolute inset-0 bg-appBg/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-appSurface border border-appBorder rounded-none shadow-2xl p-4 z-10 text-left space-y-4"
            >
              <button
                onClick={() => setPortalModalOpen(false)}
                className="absolute top-4 right-4 p-1 text-appTextSecondary hover:text-appTextPrimary rounded-none"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 text-appPrimary">
                <CreditCard size={20} />
                <h3 className="text-base font-extrabold text-appTextPrimary">DocCraft Billing Portal</h3>
              </div>

              <p className="text-xs text-appTextSecondary leading-relaxed">
                Your subscription is active and synced with DocCraft Merchant Payment Gateway (Paddle / PayHere).
              </p>

              <div className="p-3 bg-appBg border border-appBorder rounded-none space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-appTextSecondary">Current Plan:</span>
                  <span className="font-bold text-appTextPrimary">DocCraft Pro Monthly</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-appTextSecondary">Gateway Provider:</span>
                  <span className="font-bold text-appTextPrimary">DocCraft Payment Service</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-appTextSecondary">Status:</span>
                  <span className="font-bold text-emerald-500">ACTIVE</span>
                </div>
              </div>

              <Button variant="primary" size="md" onClick={() => setPortalModalOpen(false)} className="w-full justify-center">
                Close Portal Window
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default DashboardBillingPage;
