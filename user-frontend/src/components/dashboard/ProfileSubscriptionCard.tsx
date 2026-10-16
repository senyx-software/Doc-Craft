import React from 'react';
import { CreditCard } from 'lucide-react';
import { useQuotaStore } from '../../store/quotaStore';
import Stat from '../ui/Stat';
import Button from '../ui/Button';

// Moved here from the old standalone /profile page, same reasoning as
// ProfileQuotaCard — Overview's "Membership & Subscription" panel only
// links out to Billing; this shows the actual current status/renewal date
// inline, and opens the billing portal directly.
const ProfileSubscriptionCard: React.FC = () => {
  const { subscription, openPortal } = useQuotaStore();
  if (!subscription) return null;

  return (
    <div className="bg-appSurface border border-appBorder rounded-none p-4">
      <h3 className="text-sm font-bold text-appTextPrimary mb-4 flex items-center gap-2">
        <CreditCard size={16} className="text-brand-400" />
        Subscription
      </h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Stat
          label="Status"
          value={subscription.status}
          valueClassName={subscription.status === 'active' ? 'text-success' : 'text-warning'}
        />
        <Stat label="Renews" value={new Date(subscription.current_period_end).toLocaleDateString()} />
      </div>
      <Button variant="secondary" size="sm" onClick={openPortal} id="manage-subscription">
        Manage Subscription
      </Button>
    </div>
  );
};

export default ProfileSubscriptionCard;
