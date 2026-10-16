import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, X } from 'lucide-react';
import Button from '../ui/Button';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Transparent click-to-close catcher — no blur/dim, per design
              feedback that overlays shouldn't obscure the rest of the page. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0"
            aria-hidden="true"
          />

          {/* Centered Card Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-appSurface border border-appBorder rounded-none shadow-2xl p-6 z-10 text-center"
            id="logout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-modal-title"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full text-appTextSecondary hover:text-appTextPrimary hover:bg-appSurface transition-all"
              id="logout-modal-close"
              aria-label="Close modal"
            >
              <X size={16} />
            </button>

            {/* Warning Badge */}
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-appError/10 border border-appError/20 flex items-center justify-center text-appError shadow-sm">
              <LogOut size={22} className="ml-0.5" />
            </div>

            {/* Title & Description */}
            <h3 id="logout-modal-title" className="text-lg font-extrabold text-appTextPrimary mb-2">
              Sign Out of DocCraft?
            </h3>
            <p className="text-xs text-appTextSecondary mb-6 leading-relaxed">
              Are you sure you want to log out of your account? You will need to sign back in to access your saved documents and workspace.
            </p>

            {/* Action Buttons using UI Design Tokens */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={isLoading}
                id="logout-cancel-btn"
                className="w-full text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={onConfirm}
                disabled={isLoading}
                id="logout-confirm-btn"
                className="w-full text-xs font-semibold"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default LogoutConfirmModal;
