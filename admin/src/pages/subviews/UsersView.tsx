import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import type * as Wire from '../../api/adminApiTypes';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import { usePagination } from '../../hooks/usePagination';
import SortableHeader from '../../components/ui/SortableHeader';
import { sortRows, useSortToggle } from '../../hooks/useSortToggle';
import {
  Search, ShieldCheck, Ban, ArrowUpRight,
  RotateCcw, ShieldAlert, Award, Eye
} from 'lucide-react';
import { adminApiClient } from '../../api/adminApiClient';
import { toast, getErrorMessage } from '../../store/toastStore';

import SystemDialogModal, { type DialogType } from '../../components/ui/SystemDialogModal';

interface UsersViewProps {
  activeSubItem: string;
}

// Cycles a small set of Vuexy-style avatar tints, keyed off the first letter
// of the name so a given user always lands on the same color.
const AVATAR_TONES = [
  'bg-purple-500/15 text-purple-600 dark:text-purple-300',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
];

const getInitials = (name: string) =>
  name.trim().split(/\s+/).map((n) => n[0] || '').join('').toUpperCase().slice(0, 2) || 'U';

const getAvatarTone = (name: string) => AVATAR_TONES[name.charCodeAt(0) % AVATAR_TONES.length];

const statusBadgeVariant = (status?: string): 'success' | 'warning' | 'danger' | 'secondary' => {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  if (status === 'banned') return 'danger';
  return 'secondary';
};

const UsersView: React.FC<UsersViewProps> = ({ activeSubItem }) => {
  const navigate = useNavigate();
  // Central Users State from backend API
  const [users, setUsers] = useState<Wire.Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Guest Sessions State
  const guestSessions = users.filter(u => u.isGuest);

  // Table sort + pagination — declared unconditionally at the top level
  // (not inside renderUserTable) since renderUserTable is only invoked on
  // some activeSubItem branches; hooks can't live in a conditionally-called
  // helper without breaking React's hook-order rules.
  const { sort, toggleSort } = useSortToggle<'name' | 'plan' | 'created' | 'quota'>();
  const getSortValue = (u: Wire.Customer, key: string) => {
    if (key === 'name') return u.fullName || u.name || u.email || '';
    if (key === 'plan') return u.plan || 'free';
    if (key === 'created') return u.createdAt || '';
    if (key === 'quota') return u.quota ?? (u.plan === 'pro' ? 50 : 3);
    return '';
  };

  // Search, Plan filter, and Date filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState<'all' | 'free' | 'pro'>('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected User & Override Form state
  const [selectedUser, setSelectedUser] = useState<Wire.Customer | null>(null);
  const [overridePlan, setOverridePlan] = useState('pro');
  const [overrideStatus, setOverrideStatus] = useState<'active' | 'suspended' | 'banned'>('active');
  const [overrideQuota, setOverrideQuota] = useState('50');

  // System Theme Dialog Modal State
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: DialogType;
  }>({
    isOpen: false,
    message: '',
  });

  const showSystemDialog = (message: string, title?: string, type: DialogType = 'info') => {
    setDialogState({ isOpen: true, title, message, type });
  };

  const loadUsersFromApi = useCommittedEvent(async () => {

    try {
      const params: NonNullable<Parameters<typeof adminApiClient.listUsers>[0]> = {};
      if (searchTerm) params.search = searchTerm;
      if (filterPlan !== 'all') params.plan = filterPlan;
      if (activeSubItem === 'users_guest') params.isGuest = true;
      if (activeSubItem === 'users_active') params.status = 'active';
      if (activeSubItem === 'users_suspended') params.status = 'suspended';

      const res = await adminApiClient.listUsers(params);
      let list: Wire.Customer[] = [];
      if (res && Array.isArray(res.data)) {
        list = res.data;
      } else if (res && Array.isArray(res.items)) {
        list = res.items;

      }
      setUsers(list);
      if (list.length > 0 && !selectedUser) {
        setSelectedUser(list[0]);
        setOverrideStatus(list[0].status || 'active');
        setOverridePlan(list[0].plan || 'pro');
      }
    } catch (err) {
      console.error('Failed to load users from API:', err);
      setUsers([]);
      toast.error('Failed to Load Users', 'Could not reach the Auth service to fetch account data.');
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    loadUsersFromApi();
  }, [activeSubItem, filterPlan, loadUsersFromApi]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsersFromApi();
  };

  const handleInspectUser = async (user: Wire.Customer) => {
    try {
      const detail = await adminApiClient.getUserDetail(user.id);
      setSelectedUser(detail || user);
      setOverrideStatus(detail?.status || user.status || 'active');
      setOverridePlan(detail?.plan || user.plan || 'pro');
    } catch {
      setSelectedUser(user);
      setOverrideStatus(user.status || 'active');
      setOverridePlan(user.plan || 'pro');
    }
  };

  const toggleStatus = async (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;
    const nextStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    try {
      await adminApiClient.updateUserStatus(id, nextStatus);
      showSystemDialog(
        `User status successfully updated to "${nextStatus.toUpperCase()}" via PATCH /api/v1/users/${id}/status.`,
        'Account Status Updated',
        'success'
      );
    } catch (err) {
      console.warn('API update status failed:', err);
      showSystemDialog(
        `Failed to update status: ${getErrorMessage(err) || 'Server unavailable'}`,
        'Status Update Error',
        'error'
      );
      return; // Backend rejected the change — don't let the UI claim it happened.
    }
    await loadUsersFromApi();
    if (selectedUser?.id === id) {
      setSelectedUser({ ...selectedUser, status: nextStatus });
      setOverrideStatus(nextStatus);
    }
  };

  const resetQuota = async (id: string) => {
    try {
      await adminApiClient.removeQuotaOverride(id);
      await loadUsersFromApi();
      showSystemDialog('The custom allowance was removed. The configured plan allowance applies.', 'Quota Override Removed', 'success');
    } catch (error) {
      showSystemDialog(getErrorMessage(error), 'Quota Update Failed', 'error');
    }
  };

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      // Dispatches POST /api/v1/users/{user_id}/override (Status, Plan, and Quota Limit)
      const res = await adminApiClient.applyUserOverride(selectedUser.id, {
        plan: overridePlan,
        daily_limit: parseInt(overrideQuota),
        status: overrideStatus
      });

      setUsers(users.map(u => {
        if (u.id === selectedUser.id) {
          return { ...u, status: overrideStatus, plan: overridePlan, quota: parseInt(overrideQuota) };
        }
        return u;
      }));

      setSelectedUser({
        ...selectedUser,
        status: overrideStatus,
        plan: overridePlan,
        quota: parseInt(overrideQuota)
      });

      showSystemDialog(
        res?.message || `Override privileges applied! (Plan: ${overridePlan.toUpperCase()}, Daily Limit: ${overrideQuota}/day, Status: ${overrideStatus.toUpperCase()})`,
        'Override Settings Saved',
        'success'
      );
    } catch (err) {
      showSystemDialog(
        `Error calling override API: ${getErrorMessage(err) || 'Failed to update user override'}`,
        'API Connection Warning',
        'warning'
      );
    }
  };

  // Reusable date matcher
  const matchesDate = (itemDate: string) => {
    if (dateFilter === 'all') return true;
    if (dateFilter === 'range') {
      if (!startDate && !endDate) return true;
      if (startDate && itemDate < startDate) return false;
      if (endDate && itemDate > endDate) return false;
      return true;
    }
    return true;
  };

  // Select list filter
  const filteredUsers = users.filter(u => {
    const nameStr = (u.fullName || u.name || '').toLowerCase();
    const emailStr = (u.email || '').toLowerCase();
    const idStr = (u.id || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = nameStr.includes(searchLower) ||
      emailStr.includes(searchLower) ||
      idStr.includes(searchLower);

    const matchesPlan = filterPlan === 'all' || u.plan === filterPlan;
    const itemDate = u.createdAt ? u.createdAt.split('T')[0] : '';
    return matchesSearch && matchesPlan && matchesDate(itemDate);
  });

  const activeUsers = filteredUsers.filter(u => u.status === 'active');
  const suspendedUsers = filteredUsers.filter(u => u.status === 'suspended');

  // Resolved once, unconditionally, so the pagination hook below always
  // runs — the users_all/active/suspended branches below just reuse it.
  const currentUserList =
    activeSubItem === 'users_active' ? activeUsers :
    activeSubItem === 'users_suspended' ? suspendedUsers :
    filteredUsers;
  const sortedUserList = sortRows(currentUserList, sort, getSortValue);
  const userPagination = usePagination(sortedUserList, 8);

  // Filter guest sessions
  const filteredGuests = guestSessions.filter(s => {
    const tokenStr = (s.sessionToken || s.id || '').toLowerCase();
    const ipStr = (s.ip || '').toLowerCase();
    const locStr = (s.location || '').toLowerCase();
    const emailStr = (s.email || s.fullName || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = tokenStr.includes(searchLower) ||
      ipStr.includes(searchLower) ||
      locStr.includes(searchLower) ||
      emailStr.includes(searchLower);
    const itemDate = s.createdAt ? s.createdAt.split('T')[0] : '';
    return matchesSearch && matchesDate(itemDate);
  });

  // Reusable horizontal filter toolbar aligned parallelly
  const renderFilterToolbar = (titleText: string, badgeCount: number) => {
    return (
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-appBorder/50 mb-4 text-left">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary">
            {titleText}
          </h3>
          <Badge variant="primary">{badgeCount}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-appTextSecondary/60" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ID, email or name..."
              className="pl-8 pr-3 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary w-44"
            />
          </form>

          {/* Plan Options */}
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value === 'pro' ? 'pro' : e.target.value === 'free' ? 'free' : 'all')}
            className="px-2 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
          >
            <option value="all">All Plans</option>
            <option value="free">Free Tier</option>
            <option value="pro">Pro Member</option>
          </select>

          {/* Date Options */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2 py-1 bg-appBg text-[11px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
          >
            <option value="all">All Time</option>
            <option value="today">Today (June 16)</option>
            <option value="yesterday">Yesterday (June 15)</option>
            <option value="range">Custom Range</option>
          </select>

          {/* Date range inputs */}
          {dateFilter === 'range' && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-0.5 bg-appBg text-[10px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none"
              />
              <span className="text-[10px] text-appTextSecondary">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-0.5 bg-appBg text-[10px] text-appTextPrimary border border-appBorder rounded-md focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Table
  const renderUserTable = (dataList: typeof users) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
            <SortableHeader label="Client Name" sortKey="name" sort={sort} onSort={toggleSort} />
            <SortableHeader label="Billing Plan" sortKey="plan" sort={sort} onSort={toggleSort} />
            <th className="pb-3 font-bold">Status</th>
            <th className="pb-3 font-bold">Recent Telemetry</th>
            <SortableHeader label="Created Date" sortKey="created" sort={sort} onSort={toggleSort} />
            <SortableHeader label="Quota Limit" sortKey="quota" sort={sort} onSort={toggleSort} />
            <th className="pb-3 font-bold text-right">Access Controls</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-appBorder/40">
          {dataList.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-6 text-center text-xs text-appTextSecondary font-mono">
                {isLoading ? 'Fetching live user records from Admin API...' : 'No matching user records found.'}
              </td>
            </tr>
          ) : (
            dataList.map((user) => {
              const displayName = user.fullName || user.name || (user.isGuest ? 'Guest User' : 'User');
              const displayEmail = user.email || 'N/A';
              const displayPlan = (user.plan || 'free').toUpperCase();
              const displayCreated = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—';
              const displayActivity = user.isGuest ? 'Guest Session' : (user.authProvider ? `Auth (${user.authProvider})` : (user.activity || 'Active User'));
              const quotaLimit = user.quota ?? (user.plan === 'pro' ? 50 : 3);

              const initials = getInitials(displayName);
              const avatarTone = getAvatarTone(displayName);

              return (
                <tr key={user.id} onClick={() => handleInspectUser(user)} className="hover:bg-appBg/10 cursor-pointer transition-colors">
                  <td className="py-3 text-left" title={user.id}>
                    <div className="flex items-center gap-2.5">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${avatarTone}`}>
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-appTextPrimary truncate">{displayName}</p>
                        <span className="text-[10px] text-appTextSecondary truncate block">{displayEmail}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <Badge variant={user.plan === 'pro' ? 'primary' : 'secondary'}>
                      {displayPlan}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <Badge variant={statusBadgeVariant(user.status)}>
                      {(user.status || 'active').charAt(0).toUpperCase() + (user.status || 'active').slice(1)}
                    </Badge>
                    {user.status_reason && (
                      <div className="mt-1 text-[10px] text-appTextSecondary max-w-[180px]" title={user.status_reason}>
                        {user.status_is_automatic ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">Auto-suspended: </span>
                        ) : (
                          <span className="font-bold">By {user.status_changed_by}: </span>
                        )}
                        <span className="truncate">{user.status_reason}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 text-appTextSecondary font-medium text-[11px]">{displayActivity}</td>
                  <td className="py-3 font-mono text-[11px] text-appTextSecondary">{displayCreated}</td>
                  <td className="py-3 font-bold font-mono text-appTextPrimary text-[11px]">{quotaLimit} / day</td>
                  <td className="py-3 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/users/${user.id}`)}
                      className="p-1 text-appTextSecondary hover:text-appPrimary transition-colors"
                      title="View Full Profile"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => resetQuota(user.id)}
                      className="p-1 text-appTextSecondary hover:text-appPrimary transition-colors"
                      title="Remove Custom Quota Override"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => toggleStatus(user.id)}
                      className={`p-1 transition-colors ${user.status === 'active' ? 'text-appTextSecondary hover:text-appError' : 'text-appTextSecondary hover:text-appSuccess'
                        }`}
                      title={user.status === 'active' ? 'Suspend Account' : 'Reinstate Account'}
                    >
                      {user.status === 'active' ? <Ban size={14} /> : <ShieldCheck size={14} />}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // Router views
  if (activeSubItem === 'users_all' || activeSubItem === 'users_search' || activeSubItem === 'users_active' || activeSubItem === 'users_suspended') {
    const title = activeSubItem === 'users_active'
      ? 'Active Users Registry'
      : activeSubItem === 'users_suspended'
        ? 'Suspended / Banned List'
        : 'All Registered Accounts';

    return (
      <Card>
        {renderFilterToolbar(title, currentUserList.length)}
        {renderUserTable(userPagination.paged)}
        <Pagination
          page={userPagination.page}
          totalPages={userPagination.totalPages}
          totalItems={userPagination.totalItems}
          pageSize={userPagination.pageSize}
          onChange={userPagination.setPage}
        />
      </Card>
    );
  }

  // Guest Sessions view
  if (activeSubItem === 'users_guest') {
    return (
      <Card>
        {renderFilterToolbar('Active Guest Sessions (Unregistered)', filteredGuests.length)}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-appBorder text-appTextSecondary uppercase tracking-wider">
                <th className="pb-3 font-bold">Session ID</th>
                <th className="pb-3 font-bold">IP Address</th>
                <th className="pb-3 font-bold">Location</th>
                <th className="pb-3 font-bold">Device Fingerprint</th>
                <th className="pb-3 font-bold">Created Date</th>
                <th className="pb-3 font-bold">Generated Docs</th>
                <th className="pb-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-appBorder/40">
              {filteredGuests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-appTextSecondary font-mono">
                    {isLoading ? 'Fetching live guest sessions...' : 'No active guest sessions found.'}
                  </td>
                </tr>
              ) : (
                filteredGuests.map((session) => {
                  const sessionId = session.sessionToken || session.id || 'N/A';
                  const ipAddress = session.ip || 'Guest User';
                  const location = session.location || (session.email || 'N/A');
                  const device = session.device || (session.authProvider ? `Auth (${session.authProvider})` : 'Web Browser');
                  const created = session.createdAt ? new Date(session.createdAt).toLocaleDateString() : '—';
                  const docsCount = session.generatedDocs ?? 0;
                  const statusState = session.state || (session.status === 'active' ? 'Active' : 'Terminated');

                  return (
                    <tr key={sessionId} className="hover:bg-appBg/10 transition-colors">
                      <td className="py-3 font-mono text-[11px] text-appTextSecondary truncate max-w-[120px]" title={sessionId}>{sessionId}</td>
                      <td className="py-3 font-mono text-[11px] text-appTextPrimary">{ipAddress}</td>
                      <td className="py-3 text-appTextSecondary font-medium text-[11px] truncate max-w-[150px]">{location}</td>
                      <td className="py-3 text-appTextSecondary text-[11px]">{device}</td>
                      <td className="py-3 font-mono text-[11px] text-appTextSecondary">{created}</td>
                      <td className="py-3 font-bold text-appTextPrimary text-[11px]">{docsCount} / 1</td>
                      <td className="py-3">
                        <Badge variant={statusState === 'Active' ? 'success' : 'secondary'}>
                          {statusState}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  // Details and Manual override view
  if (activeSubItem === 'users_details') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-4">
            Select Account to Override
          </h3>
          <div className="space-y-2">
            {users.map(u => {
              const userName = u.fullName || u.name || u.email || 'User';
              const initials = userName.split(' ').map((n: string) => n[0] || '').join('').toUpperCase().slice(0, 2);
              const userPlan = (u.plan || 'free').toUpperCase();

              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={`w-full flex items-center justify-between p-3 rounded-md border text-left transition-all ${selectedUser?.id === u.id
                      ? 'border-appPrimary bg-appPrimary/5 shadow-inner'
                      : 'border-appBorder hover:border-appTextSecondary hover:bg-appSurface/50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-appPrimary/10 flex items-center justify-center text-appPrimary font-bold text-xs">
                      {initials}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-appTextPrimary">{userName}</p>
                      <span className="text-[10px] text-appTextSecondary">{u.email || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={u.plan === 'pro' ? 'primary' : 'secondary'}>{userPlan}</Badge>
                    <ArrowUpRight size={12} className="text-appTextSecondary" />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Override Form Panel */}
        {selectedUser && (
          <Card>
            <h3 className="text-xs font-bold uppercase tracking-wider text-appTextPrimary mb-2 flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-appWarning" />
              Manual Override Settings
            </h3>
            <p className="text-[10px] text-appTextSecondary mb-6 border-b border-appBorder/50 pb-2">
              Modifying override privileges for user <span className="font-bold text-appTextPrimary">{selectedUser.fullName || selectedUser.name || selectedUser.email || 'Selected User'}</span>.
            </p>
            <form onSubmit={handleApplyOverride} className="space-y-4">
              <div className="text-left">
                <label className="block text-xs font-semibold text-appTextSecondary uppercase tracking-wider mb-1">
                  Account Status
                </label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value === 'banned' ? 'banned' : e.target.value === 'suspended' ? 'suspended' : 'active')}
                  className="w-full px-3 py-2 text-xs bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
                >
                  <option value="active">Active (Full Access)</option>
                  <option value="suspended">Suspended (Restricted)</option>
                  <option value="banned">Banned (Blocked)</option>
                </select>
              </div>

              <div className="text-left">
                <label className="block text-xs font-semibold text-appTextSecondary uppercase tracking-wider mb-1">
                  Plan Override
                </label>
                <select
                  value={overridePlan}
                  onChange={(e) => setOverridePlan(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-appBg text-appTextPrimary border border-appBorder rounded-md focus:outline-none focus:border-appPrimary"
                >
                  <option value="free">Free Tier Account</option>
                  <option value="pro">Pro Member</option>
                  <option value="custom">Custom Partner Override</option>
                </select>
              </div>

              <Input
                label="Bypass Daily Limit (Generations count)"
                value={overrideQuota}
                onChange={(e) => setOverrideQuota(e.target.value)}
                placeholder="e.g. 50"
                type="number"
                required
              />

              <Button type="submit" variant="primary" className="w-full shadow-glow">
                <Award size={12} /> Save Override Privileges
              </Button>
            </form>
          </Card>
        )}

        <SystemDialogModal
          isOpen={dialogState.isOpen}
          title={dialogState.title}
          message={dialogState.message}
          type={dialogState.type}
          onConfirm={() => setDialogState({ ...dialogState, isOpen: false })}
          onClose={() => setDialogState({ ...dialogState, isOpen: false })}
        />
      </div>
    );
  }

  return (
    <>
      <SystemDialogModal
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        onConfirm={() => setDialogState({ ...dialogState, isOpen: false })}
        onClose={() => setDialogState({ ...dialogState, isOpen: false })}
      />
    </>
  );
};

export default UsersView;
