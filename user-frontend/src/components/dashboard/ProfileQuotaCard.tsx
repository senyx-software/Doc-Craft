import React from 'react';
import { Crown } from 'lucide-react';
import { useQuotaStore, UNLIMITED_QUOTA } from '../../store/quotaStore';
import Stat from '../ui/Stat';

// Moved here from the old standalone /profile page — Overview's own
// StatCards already show plan/usage at a glance, but this is the same
// detailed quota breakdown ProfilePage used to show, now living where the
// rest of account settings live instead of a separate route.
const ProfileQuotaCard: React.FC = () => {
  const { quota } = useQuotaStore();
  if (!quota) return null;

  // An admin can assign UNLIMITED_QUOTA (-1) to any plan/user, not just
  // 'pro' — the assigned limit itself is the source of truth.
  const isUnlimited = quota.daily_limit === UNLIMITED_QUOTA;

  return (
    <div className="bg-appSurface border border-appBorder rounded-none p-4">
      <h3 className="text-sm font-bold text-appTextPrimary mb-4 flex items-center gap-2">
        <Crown size={16} className="text-brand-400" />
        Usage &amp; Quota
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Plan" value={quota.plan} />
        <Stat label="Window Limit" value={isUnlimited ? 'Unlimited' : quota.daily_limit} />
        <Stat label="Used This Window" value={quota.used_today} />
        <Stat label="Remaining" value={isUnlimited ? '∞' : quota.remaining} />
      </div>
    </div>
  );
};

export default ProfileQuotaCard;
