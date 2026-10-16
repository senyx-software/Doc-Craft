import React from 'react';
import type { SpellCorrection } from '../../types';
import { AlertTriangle, Check, X } from 'lucide-react';

interface SpellCorrectionBannerProps {
  correction: SpellCorrection;
  onAccept: () => void;
  onReject: () => void;
  isLoading?: boolean;
}

const SpellCorrectionBanner: React.FC<SpellCorrectionBannerProps> = ({
  correction,
  onAccept,
  onReject,
  isLoading = false,
}) => {
  return (
    <div className="mx-2 my-2 p-3 bg-accent-amber-500/10 border border-accent-amber-500/30 rounded-xl animate-slide-up" id="spell-correction-banner">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="text-accent-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-accent-amber-600 font-medium mb-1">Spelling suggestion</p>
          <p className="text-xs text-appTextSecondary">
            Did you mean <span className="font-semibold text-appTextPrimary">"{correction.suggested}"</span> instead
            of <span className="line-through text-appTextSecondary/70">"{correction.original}"</span>?
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={onAccept}
              disabled={isLoading}
              id="spell-accept"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-green-500 text-white text-xs font-medium rounded-full hover:bg-accent-green-600 transition-colors disabled:opacity-50"
            >
              <Check size={12} />
              Accept
            </button>
            <button
              onClick={onReject}
              disabled={isLoading}
              id="spell-reject"
              className="btn-secondary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <X size={12} />
              Keep Original
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpellCorrectionBanner;
