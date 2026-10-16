import EntitlementControls from '../components/EntitlementControls';
import type * as Wire from '../api/adminApiTypes';
import { getErrorMessage } from '../store/toastStore';
import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Globe, FileText, Mail, Calendar, ShieldCheck, Ban, Award,
  Flame, Clock, TrendingUp,  Save
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip
} from 'recharts';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SystemDialogModal, { type DialogType } from '../components/ui/SystemDialogModal';
import { adminApiClient } from '../api/adminApiClient';

interface UserDetailPageProps {
  userId: string;
  onBack: () => void;
}

const AVATAR_TONES = [
  'bg-purple-500/15 text-purple-600 dark:text-purple-300',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
];

const statusBadgeVariant = (status?: string): 'success' | 'warning' | 'danger' | 'secondary' => {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  if (status === 'banned') return 'danger';
  return 'secondary';
};

const UserDetailPage: React.FC<UserDetailPageProps> = ({ userId, onBack }) => {
  const [user, setUser] = useState<Wire.Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [overridePlan, setOverridePlan] = useState('pro');
  const [overrideStatus, setOverrideStatus] = useState<'active' | 'suspended' | 'banned'>('active');
  const [overrideQuota, setOverrideQuota] = useState('');

  const [dialogState, setDialogState] = useState<{ isOpen: boolean; title?: string; message: string; type?: DialogType }>({
    isOpen: false,
    message: '',
  });

  const showSystemDialog = (message: string, title?: string, type: DialogType = 'info') => {
    setDialogState({ isOpen: true, title, message, type });
  };

  useEffect(() => {
    let cancelled = false;
    adminApiClient
      .getUserDetail(userId)
      .then((detail) => {
        if (cancelled || !detail) return;
        setUser(detail);
        setOverrideStatus(detail.status || 'active');
        setOverridePlan(detail.plan || 'pro');
        setOverrideQuota(String(detail.quota ?? ''));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const res = await adminApiClient.applyUserOverride(user.id, {
        plan: overridePlan,
        daily_limit: parseInt(overrideQuota, 10),
        status: overrideStatus,
      });
      setUser(await adminApiClient.getUserDetail(user.id));
      showSystemDialog(
        res?.message || `Override applied — Plan: ${overridePlan.toUpperCase()}, Limit: ${overrideQuota}/window, Status: ${overrideStatus.toUpperCase()}`,
        'Override Saved',
        'success'
      );
    } catch (err) {
      showSystemDialog(`Error calling override API: ${getErrorMessage(err) || 'Failed to update user'}`, 'API Connection Warning', 'warning');
    }
  };

  const handleToggleStatus = async () => {
    if (!user) return;
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      await adminApiClient.updateUserStatus(user.id, nextStatus);
      setUser(await adminApiClient.getUserDetail(user.id));
      setOverrideStatus(nextStatus);
      showSystemDialog(`Account status updated to "${nextStatus.toUpperCase()}".`, 'Status Updated', 'success');
    } catch (err) {
      showSystemDialog(`Failed to update status: ${getErrorMessage(err) || 'Server unavailable'}`, 'Status Update Error', 'error');
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        {isLoading ? 'Loading account…' : 'Account could not be loaded. Return to Users and retry.'}
      </div>
    );
  }

  const displayName = user.fullName || user.name || 'User';
  const displayEmail = user.email || 'N/A';
  const joinDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—';
  const quotaLimit = user.quota ?? '—';
  const initials = displayName.trim().split(/\s+/).map((n: string) => n[0] || '').join('').toUpperCase().slice(0, 2) || 'U';
  const avatarTone = AVATAR_TONES[displayName.charCodeAt(0) % AVATAR_TONES.length];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Users
      </button>

      {/* Profile header */}
      <Card className="flex flex-col md:flex-row md:items-center gap-5">
        <span className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0 ${avatarTone}`}>
          {initials}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">{displayName}</h1>
            <Badge variant={user.plan === 'pro' ? 'primary' : 'secondary'}>{(user.plan || 'free').toUpperCase()}</Badge>
            <Badge variant={statusBadgeVariant(user.status)}>
              {(user.status || 'active').charAt(0).toUpperCase() + (user.status || 'active').slice(1)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><Mail size={13} /> {displayEmail}</span>
            <span className="flex items-center gap-1.5"><Calendar size={13} /> Joined {joinDate}</span>
            <span className="flex items-center gap-1.5"><Globe size={13} /> {user.authProvider ? `Signed up via ${user.authProvider}` : 'Email account'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleToggleStatus}>
            {user.status === 'active' ? <><Ban size={13} /> Suspend</> : <><ShieldCheck size={13} /> Reinstate</>}
          </Button>
        </div>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Documents Generated</span>
            <span className="p-2 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400"><FileText size={16} /></span>
          </div>
          <span className="text-2xl font-extrabold text-gray-900 dark:text-white mt-3">{user.generatedDocs ?? '—'}</span>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quota Used This Window</span>
            <span className="p-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><TrendingUp size={16} /></span>
          </div>
          <span className="text-2xl font-extrabold text-gray-900 dark:text-white mt-3">{user.quota_used ?? '—'} / {quotaLimit === -1 ? 'Unlimited' : quotaLimit}</span>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Allowance Window</span>
            <span className="p-2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"><Flame size={16} /></span>
          </div>
          <span className="text-2xl font-extrabold text-gray-900 dark:text-white mt-3">{user.entitlements?.quota_policy.window_hours ?? '—'} hours</span>
        </Card>
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Login</span>
            <span className="p-2 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"><Clock size={16} /></span>
          </div>
          <span className="text-2xl font-extrabold text-gray-900 dark:text-white mt-3">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Usage trend */}
        <Card className="lg:col-span-2 h-[300px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4">
            Document Generations — Last 7 Days
          </h3>
          <div className="flex-1 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[]}>
                <defs>
                  <linearGradient id="userUsageGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7367F0" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#7367F0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#97959E" fontSize={10} />
                <YAxis stroke="#97959E" fontSize={10} allowDecimals={false} />
                <ChartTooltip />
                <Area type="monotone" dataKey="docs" stroke="#7367F0" strokeWidth={2} fillOpacity={1} fill="url(#userUsageGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="h-[300px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-3">
            Recent Activity
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3">
            <p>Per-user activity history is not available.</p>          </div>
        </Card>
      </div>

      {/* Manual override */}
      <Card>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
          <Award size={14} className="text-purple-600 dark:text-purple-400" /> Manual Plan & Access Override
        </h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-5">
          Directly change this account's plan, quota, or access status.
        </p>
        <form onSubmit={handleApplyOverride} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Account Status
            </label>
            <select
              value={overrideStatus}
              onChange={(e) => setOverrideStatus(e.target.value === 'banned' ? 'banned' : e.target.value === 'suspended' ? 'suspended' : 'active')}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-md focus:outline-none focus:border-purple-500"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Plan
            </label>
            <select
              value={overridePlan}
              onChange={(e) => setOverridePlan(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-md focus:outline-none focus:border-purple-500"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <Input
            label="Daily Limit"
            value={overrideQuota}
            onChange={(e) => setOverrideQuota(e.target.value)}
            type="number"
            required
          />
          <Button type="submit" variant="primary" className="h-[38px] flex items-center gap-1.5">
            <Save size={13} /> Save Override
          </Button>
        </form>
      </Card>

      <EntitlementControls userId={userId} onSaved={()=>{void adminApiClient.getUserDetail(userId).then(setUser);}}/>
      <SystemDialogModal
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        onConfirm={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
        onClose={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default function AccountDetail(props: UserDetailPageProps) { return <UserDetailPage key={props.userId} {...props} />; }
