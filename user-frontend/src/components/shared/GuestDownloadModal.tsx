import React from 'react';
import { X, Download, UserPlus, LogIn } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuotaStore } from '../../store/quotaStore';
import { useChatStore } from '../../store/chatStore';

const GuestDownloadModal: React.FC = () => {
  const { showGuestDownloadModal, setShowGuestDownloadModal } = useQuotaStore();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = useChatStore((state) => state.sessionId);
  const from = sessionId
    ? { pathname: '/builder', search: `?sessionId=${encodeURIComponent(sessionId)}`, hash: location.hash }
    : location;

  if (!showGuestDownloadModal) return null;

  const handleRegister = () => {
    setShowGuestDownloadModal(false);
    navigate('/register', { state: { from } });
  };

  const handleLogin = () => {
    setShowGuestDownloadModal(false);
    navigate('/login', { state: { from } });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] animate-fade-in"
        onClick={() => setShowGuestDownloadModal(false)}
      />

      {/* Modal Box */}
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" id="guest-download-modal">
        <div className="glass-card max-w-md w-full p-6 animate-slide-up relative text-left border border-surface-300/40 shadow-2xl">
          {/* Close Button */}
          <button
            onClick={() => setShowGuestDownloadModal(false)}
            className="absolute top-4 right-4 p-1 text-surface-400 hover:text-white transition-colors"
            id="guest-download-modal-close"
          >
            <X size={18} />
          </button>

          {/* Branded Icon Header */}
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Download size={26} className="text-white" />
          </div>

          {/* Heading & Information */}
          <h3 className="text-lg font-bold text-white text-center mb-2">
            Create a Free Account to Download
          </h3>
          <p className="text-xs text-surface-400 text-center mb-6 leading-relaxed">
            Your document preview has been rendered! Guests can generate and customize live AI templates for free.
            Please create a free account or sign in to export high-resolution PDFs.
          </p>

          {/* Action CTAs */}
          <div className="space-y-3">
            <button
              onClick={handleRegister}
              id="guest-modal-register"
              className="w-full py-3 px-6 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold
                         rounded-xl hover:from-emerald-400 hover:to-teal-500 transition-all shadow-lg
                         shadow-emerald-500/20 hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              <UserPlus size={16} />
              Create Free Account & Download
            </button>

            <button
              onClick={handleLogin}
              id="guest-modal-login"
              className="w-full py-2.5 px-6 bg-surface-500 hover:bg-surface-400 text-white text-xs font-semibold
                         rounded-xl border border-surface-300/40 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn size={15} />
              Sign In to Existing Account
            </button>

            <button
              onClick={() => setShowGuestDownloadModal(false)}
              id="guest-modal-dismiss"
              className="w-full py-2 text-center text-xs text-surface-400 hover:text-white transition-colors"
            >
              Continue Editing Preview
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default GuestDownloadModal;
