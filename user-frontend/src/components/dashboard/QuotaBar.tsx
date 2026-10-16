import React from 'react';
import { Zap } from 'lucide-react';
import { useQuotaStore, UNLIMITED_QUOTA } from '../../store/quotaStore';

const QuotaBar: React.FC = () => {
  const { quota } = useQuotaStore();

  if (!quota) return null;

  // An admin can assign UNLIMITED_QUOTA (-1) to any plan/user, not just 'pro'
  // — the assigned limit itself is the source of truth, not the plan name.
  const isUnlimited = quota.daily_limit === UNLIMITED_QUOTA;
  const percent = !isUnlimited && quota.daily_limit > 0 ? (quota.used_today / quota.daily_limit) * 100 : 0;
  const isLow = !isUnlimited && quota.remaining <= 1;
  const isExhausted = !isUnlimited && quota.remaining <= 0;

  return (
    <div className={`px-4 py-2 border-t border-surface-300/50 ${isExhausted ? 'bg-red-500/5' : ''}`} id="quota-bar">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Zap size={12} className={isLow ? 'text-amber-400' : 'text-surface-400'} />
          <span className="text-xs text-surface-400">
            AI + PDF: {isUnlimited ? 'Unlimited' : `${quota.remaining} of ${quota.daily_limit} remaining`}
          </span>
        </div>
        {!isUnlimited && (
          <span className="text-[10px] text-surface-500">
            Resets {new Date(quota.resets_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {!isUnlimited && (
        <div className="w-full h-1 bg-surface-500 rounded-none overflow-hidden">
          <div
            className={`h-full rounded-none transition-all duration-500 ${
              isExhausted
                ? 'bg-red-500'
                : isLow
                  ? 'bg-amber-500'
                  : 'bg-brand-500'
            }`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default QuotaBar;
