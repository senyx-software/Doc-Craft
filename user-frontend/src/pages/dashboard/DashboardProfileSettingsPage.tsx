import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuotaStore } from '../../store/quotaStore';
import ProfileIdentityCard from '../../components/dashboard/ProfileIdentityCard';
import ProfileSecurityCard from '../../components/dashboard/ProfileSecurityCard';
import ProfileQuotaCard from '../../components/dashboard/ProfileQuotaCard';
import ProfileSubscriptionCard from '../../components/dashboard/ProfileSubscriptionCard';

const DashboardProfileSettingsPage: React.FC = () => {
  const { fetchQuota, fetchSubscription } = useQuotaStore();

  useEffect(() => {
    fetchQuota();
    fetchSubscription();
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
        <h1 className="text-2xl font-extrabold tracking-tight text-appTextPrimary">Profile &amp; Settings</h1>
        <p className="text-sm text-appTextSecondary mt-1">
          Manage your identity, security, and subscription details.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <ProfileIdentityCard variant="flat" />
        <div className="space-y-4">
          <ProfileSecurityCard variant="flat" />
          <ProfileQuotaCard />
          <ProfileSubscriptionCard />
        </div>
      </div>
    </motion.div>
  );
};

export default DashboardProfileSettingsPage;
