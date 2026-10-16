import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Crown, Clock } from 'lucide-react';
import { useQuotaStore } from '../../store/quotaStore';

const UpgradeModal: React.FC = () => {
  const { showUpgradeModal, setShowUpgradeModal } = useQuotaStore();

  const navigate = useNavigate();
  if (!showUpgradeModal) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
        onClick={() => setShowUpgradeModal(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="upgrade-modal">
        <div className="glass-card max-w-md w-full p-6 animate-slide-up relative">
          {/* Close */}
          <button
            onClick={() => setShowUpgradeModal(false)}
            className="absolute top-4 right-4 p-1 text-appTextSecondary hover:text-appTextPrimary transition-colors"
            id="modal-close"
          >
            <X size={18} />
          </button>

          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent-amber-500 to-accent-amber-600 flex items-center justify-center shadow-lg">
            <Crown size={28} className="text-white" />
          </div>

          {/* Content */}
          <h3 className="text-xl font-bold text-appTextPrimary text-center mb-2">
            You've reached your allowance limit
          </h3>
          <p className="text-sm text-appTextSecondary text-center mb-6">
            Your shared allowance covers AI provider requests and server PDF generations. View the current plans for prices and limits.
          </p>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => { setShowUpgradeModal(false); navigate('/pricing'); }}
              id="modal-upgrade"
              className="w-full py-3 px-6 bg-gradient-to-r from-accent-amber-500 to-accent-amber-600 text-white font-semibold
                         rounded-xl hover:from-accent-amber-400 hover:to-accent-amber-500 transition-all shadow-lg
                         shadow-3 hover:-translate-y-0.5 disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                <Crown size={16} />
                View current plans
              </div>
            </button>
            <button
              onClick={() => setShowUpgradeModal(false)}
              id="modal-remind-later"
              className="btn-secondary w-full py-3 px-6 font-medium"
            >
              <div className="flex items-center justify-center gap-2">
                <Clock size={14} />
                Close
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default UpgradeModal;
