import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import FontFacePicker from '../../components/ui/FontFacePicker';
import {
  Shield, AlertTriangle,
  Download, User, ShieldAlert, Lock, Plus, Trash2, ShieldCheck, Palette, Key, RefreshCw,
  Save, X, ToggleLeft, ToggleRight, ExternalLink
} from 'lucide-react';
import { useAdminAuthStore } from '../../store/adminAuthStore';
import { adminApiClient } from '../../api/adminApiClient';
import { toast, getErrorMessage } from '../../store/toastStore';

interface SettingsViewProps {
  activeSubItem: string;
}

interface CustomRole {
  id: string;
  name: string;
  description: string;
  isCustom: boolean;
  permissions: string[];
  staffCount: number;
}

const SettingsView: React.FC<SettingsViewProps> = ({ activeSubItem }) => {
  const { admin, changePasswordApi, updateProfileApi } = useAdminAuthStore();

  const [profile, setProfile] = useState({
    name: admin?.name || 'Super Admin User',
    email: admin?.email || 'admin@doccraft.app',
    role: admin?.role || 'Super Admin'
  });

  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Two-factor authentication (TOTP) enrollment — every sensitive admin
  // action (plan edits, staff changes, etc.) requires a fresh code from an
  // authenticator app, but until this section existed there was no way to
  // actually enroll one: setupTotp/verifyTotp were wired in adminApiClient
  // but never called from any UI, so an admin with 2FA not yet enabled had
  // no way to ever pass that check.
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ totp_secret: string; provisioning_uri: string; qr_code_hint: string; qr_code_url: string } | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [isStartingTotpSetup, setIsStartingTotpSetup] = useState(false);
  const [isVerifyingTotp, setIsVerifyingTotp] = useState(false);
  const [isDisablingTotp, setIsDisablingTotp] = useState(false);

  // Field names match the real Config Engine "branding" domain
  // (services/admin-api/app/repositories/config_repository.py's SEED_DOMAIN_CONFIGS).
  const [branding, setBranding] = useState({
    company_name: '',
    logo_url: '',
    accent_color: '',
    font_family: '',
    support_email: '',
  });
  const [isLoadingBranding, setIsLoadingBranding] = useState(true);
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  const loadBrandingFromApi = useCommittedEvent(async () => {

    try {
      const entry = await adminApiClient.getAdminDomainConfig('branding');
      if (entry?.data) setBranding((prev) => ({ ...prev, ...entry.data }));
    } catch (err) {
      toast.error('Failed to Load Branding', getErrorMessage(err));
    } finally {
      setIsLoadingBranding(false);
    }
  });

  const [roles, setRoles] = useState<CustomRole[]>([
    {
      id: 'role_super_admin',
      name: 'Super Admin',
      description: 'Unrestricted platform control plane access & role definition rights',
      isCustom: false,
      permissions: ['* (All Privileges)'],
      staffCount: 1,
    },
    {
      id: 'role_finance',
      name: 'Finance Admin',
      description: 'Access to billing, packages, revenue telemetry & invoice operations',
      isCustom: true,
      permissions: ['billing:view', 'billing:edit', 'revenue:view'],
      staffCount: 1,
    },
    {
      id: 'role_support',
      name: 'Support Admin',
      description: 'Customer ticket inspection & user quota adjustment privileges',
      isCustom: true,
      permissions: ['users:view', 'users:edit', 'support:view'],
      staffCount: 1,
    },
  ]);

  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  // True only once `roles` reflects the server's actual role IDs. Until
  // then `roles` still holds the illustrative fallback list above, whose
  // ids (role_finance, role_support, ...) don't match what the backend
  // really generated (role_finance_staff, role_support_staff, ...) — letting
  // staff be invited against those would 404 with a confusing
  // "Role with ID '...' not found", pointing at the wrong root cause.
  const [rolesSynced, setRolesSynced] = useState(false);

  interface StaffMember {
    admin_id: string;
    email: string;
    role: string;
    status: string;
  }
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRoleId, setNewStaffRoleId] = useState('');

  // Modal State
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [selectedPrivileges, setSelectedPrivileges] = useState<string[]>(['users:view']);

  const availablePrivileges = [
    { id: 'users:view', label: 'View Customer Accounts' },
    { id: 'users:edit', label: 'Edit Customer Profiles & Quotas' },
    { id: 'users:delete', label: 'Ban / Deactivate Accounts' },
    { id: 'plans:view', label: 'View Billing & Subscriptions' },
    { id: 'plans:edit', label: 'Manage Packages & Promotions' },
    { id: 'templates:approve', label: 'Publish Document Templates' },
    { id: 'rbac:view', label: 'View Admin Staff & Roles' },
  ];

  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; service: string; configured: boolean; last4: string | null; manage_url: string; error?: string }>>([]);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(true);

  const loadApiKeyStatus = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getApiKeyStatus();
      setApiKeys(data.keys || []);
    } catch {
      toast.error('Failed to Load', 'Could not fetch API key status from backend services.');
    } finally {
      setIsLoadingApiKeys(false);
    }
  });

  const [gdprEmail, setGdprEmail] = useState('');
  const [isGdprBusy, setIsGdprBusy] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(true);
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const loadRolesFromApi = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getRoles();
      if (Array.isArray(data) && data.length > 0) {
        const mappedRoles = data.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description || 'Admin role',
          isCustom: r.is_custom !== undefined ? r.is_custom : !r.is_system_role,
          permissions: Array.isArray(r.permissions)
            ? r.permissions.map((p) => (typeof p === 'string' ? p : p.id || (p.module && p.action ? `${p.module}:${p.action}` : p.description || String(p))))
            : [],
          staffCount: r.assigned_staff_count || 1,
        }));
        setRoles(mappedRoles);
        setRolesSynced(true);
      }
    } catch (err) {
      console.warn('Using fallback role definitions:', err);
    } finally {
      setIsLoadingRoles(false);
    }
  });

  const loadStaffFromApi = useCommittedEvent(async () => {

    try {
      const data = await adminApiClient.getStaff();
      const staffList = data.map(row => ({ ...row, admin_id: row.id, role: row.role_name || '', name: row.name || '', totp_enabled: row.totp_enabled === true }));
      setStaff(staffList);
    } catch (err) {
      console.warn('Failed to load admin staff list:', err);
      toast.error('Failed to Load Staff', getErrorMessage(err));
    } finally {
      setIsLoadingStaff(false);
    }
  });



  const handleStartTotpSetup = async () => {
    setIsStartingTotpSetup(true);
    try {
      const data = await adminApiClient.setupTotp();
      setTotpSetupData(data);
      setTotpVerifyCode('');
    } catch (err) {
      toast.error('2FA Setup Failed', getErrorMessage(err));
    } finally {
      setIsStartingTotpSetup(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingTotp(true);
    try {
      await adminApiClient.verifyTotp(totpVerifyCode);
      setTotpEnabled(true);
      setTotpSetupData(null);
      setTotpVerifyCode('');
      toast.success('2FA Enabled', 'Two-factor authentication is now active on your account.');
    } catch (err) {
      toast.error('Verification Failed', getErrorMessage(err));
    } finally {
      setIsVerifyingTotp(false);
    }
  };

  const handleDisableTotp = async () => {
    if (!confirm('Disable 2FA on this account? Sensitive actions will no longer require an authenticator code until you set it up again.')) {
      return;
    }
    setIsDisablingTotp(true);
    try {
      // The TOTP_REQUIRED retry loop in adminApiClient's apiRequest() prompts
      // for a code automatically — including the "send code via email"
      // fallback, so an account stuck showing "Enabled" with no authenticator
      // actually configured (this account's exact situation) can still get in.
      await adminApiClient.disableTotp();
      setTotpEnabled(false);
      toast.success('2FA Disabled', 'You can set it up again with a fresh QR code whenever you\'re ready.');
    } catch (err) {
      toast.error('Failed to Disable 2FA', getErrorMessage(err));
    } finally {
      setIsDisablingTotp(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    const res = await updateProfileApi(profile.name);
    setIsSavingProfile(false);
    if (res.success) {
      toast.success('Profile Saved', 'Admin profile updated.');
    } else {
      toast.error('Profile Save Failed', res.message);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBranding(true);
    try {
      await adminApiClient.updateAdminDomainConfig('branding', branding);
      toast.success('Branding Updated', 'Global branding parameters updated across platform templates.');
    } catch (err) {
      toast.error('Failed to Save Branding', getErrorMessage(err));
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'New password and confirmation password do not match.' });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Password must be at least 6 characters long.' });
      return;
    }

    setIsChangingPassword(true);
    const res = await changePasswordApi(currentPassword, newPassword);
    setIsChangingPassword(false);

    if (res.success) {
      setPasswordStatus({ type: 'success', message: res.message });
      toast.success('Password Changed', res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordStatus({ type: 'error', message: res.message });
      toast.error('Password Change Failed', res.message);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin?.isSuperAdmin) {
      toast.error('Forbidden', 'Only Super Admin can create custom roles.');
      return;
    }
    if (!newRoleName.trim()) return;

    try {
      await adminApiClient.createRole({
        name: newRoleName,
        description: newRoleDesc,
        permissions: selectedPrivileges,
      });
      toast.success('Role Created', `'${newRoleName}' is now available for staff assignment.`);
      setShowRoleModal(false);
      setNewRoleName('');
      setNewRoleDesc('');
      loadRolesFromApi();
    } catch (err) {
      // Do NOT add a fake local-only role here: its id is guessed
      // client-side and only coincidentally matches what the server would
      // generate. A fabricated role that never actually persisted can still
      // be picked in the Invite Staff dropdown, and the invite then fails
      // with a confusing "Role with ID '...' not found" — the admin sees no
      // link back to this failed creation. Surface the real error instead
      // and leave the roles list as the server's source of truth.
      toast.error('Role Not Created', getErrorMessage(err));
    }
  };

  const handleDeleteRole = async (id: string, name: string) => {
    if (!admin?.isSuperAdmin) {
      toast.error('Forbidden', 'Only Super Admin can delete custom roles.');
      return;
    }
    if (confirm(`Are you sure you want to delete role '${name}'?`)) {
      try {
        await adminApiClient.deleteRole(id);
        toast.success('Role Deleted', `'${name}' has been removed.`);
        loadRolesFromApi();
      } catch (err) {
        // Don't remove it locally either — it's still a valid, assignable
        // role on the server; hiding it here would let staff keep getting
        // invited/reassigned into a role the UI has silently pretended is gone.
        toast.error('Role Not Deleted', getErrorMessage(err));
      }
    }
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin?.isSuperAdmin) {
      toast.error('Forbidden', 'Only Super Admin can invite staff.');
      return;
    }
    if (!newStaffEmail.trim() || !newStaffRoleId) return;

    try {
      const res = await adminApiClient.inviteStaff({ email: newStaffEmail, role_id: newStaffRoleId, name: newStaffName || undefined });
      if (res?.invite_email_sent) {
        toast.success('Staff Invited', `${newStaffEmail} was created and emailed a temporary password.`);
      } else {
        toast.warning('Staff Created — Email Not Sent', `${newStaffEmail} was created, but the invite email failed to send. Check notification service logs, or share credentials with them another way.`);
      }
      setShowInviteModal(false);
      setNewStaffEmail('');
      setNewStaffName('');
      setNewStaffRoleId('');
      loadStaffFromApi();
    } catch (err) {
      toast.error('Invite Failed', getErrorMessage(err));
    }
  };

  const handleChangeStaffRole = async (staffId: string, roleId: string) => {
    try {
      await adminApiClient.updateStaff(staffId, { role_id: roleId });
      toast.success('Role Updated', 'Staff member role reassigned.');
      loadStaffFromApi();
    } catch (err) {
      toast.error('Role Change Failed', getErrorMessage(err));
    }
  };

  const handleToggleStaffStatus = async (member: StaffMember) => {
    const nextStatus = member.status === 'active' ? 'suspended' : 'active';
    if (!confirm(`${nextStatus === 'suspended' ? 'Suspend' : 'Reactivate'} ${member.email}?`)) return;
    try {
      await adminApiClient.updateStaff(member.admin_id, { status: nextStatus });
      toast.success('Status Updated', `${member.email} is now ${nextStatus}.`);
      loadStaffFromApi();
    } catch (err) {
      toast.error('Status Change Failed', getErrorMessage(err));
    }
  };

  const handleRemoveStaff = async (member: StaffMember) => {
    if (!confirm(`Remove ${member.email}? They will immediately lose admin access. This can be undone by reactivating them later.`)) return;
    try {
      await adminApiClient.removeStaff(member.admin_id);
      toast.success('Staff Removed', `${member.email} no longer has admin access.`);
      loadStaffFromApi();
    } catch (err) {
      toast.error('Remove Failed', getErrorMessage(err));
    }
  };

  const togglePrivilege = (privId: string) => {
    if (selectedPrivileges.includes(privId)) {
      setSelectedPrivileges(selectedPrivileges.filter(p => p !== privId));
    } else {
      setSelectedPrivileges([...selectedPrivileges, privId]);
    }
  };

  const handleManageKey = (manageUrl: string) => {
    window.open(manageUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGdprAction = async (action: 'export' | 'delete') => {
    if (!gdprEmail) return;

    if (action === 'delete') {
      if (!confirm(`WARNING: This will permanently anonymize account ${gdprEmail} — email, name, avatar, and credentials scrubbed, all sessions revoked. Billing/document records are kept but de-identified. This cannot be undone. Proceed?`)) {
        return;
      }
      setIsGdprBusy(true);
      try {
        const result = await adminApiClient.purgeGdprUser(gdprEmail);
        toast.success('Account Purged', `${gdprEmail} has been anonymized (now ${result.anonymized_email}) and signed out everywhere.`);
        setGdprEmail('');
      } catch (err) {
        toast.error('Purge Failed', getErrorMessage(err));
      } finally {
        setIsGdprBusy(false);
      }
    } else {
      setIsGdprBusy(true);
      try {
        await adminApiClient.exportGdprData(gdprEmail);
        toast.success('Export Downloaded', `Real data archive for ${gdprEmail} has been downloaded.`);
        setGdprEmail('');
      } catch (err) {
        toast.error('Export Failed', getErrorMessage(err));
      } finally {
        setIsGdprBusy(false);
      }
    }
  };

  const loadMaintenanceModeFromApi = useCommittedEvent(async () => {

    try {
      const entry = await adminApiClient.getAdminDomainConfig('settings');
      const data = entry?.data || entry || {};
      setIsMaintenanceMode(!!data.maintenance_mode);
    } catch (err) {
      console.warn('Failed to load maintenance mode status:', err);
    } finally {
      setIsLoadingMaintenance(false);
    }
  });
useEffect(() => {
    if (activeSubItem === 'set_admin_users') {
      loadRolesFromApi();
      loadStaffFromApi();
    }
    if (activeSubItem === 'set_api_keys') {
      loadApiKeyStatus();
    }
    if (activeSubItem === 'set_preferences') {
      loadBrandingFromApi();
    }
    if (activeSubItem === 'set_export_csv') {
      loadMaintenanceModeFromApi();
    }
    if (activeSubItem === 'set_profile' || activeSubItem === 'set_2fa') {
      adminApiClient.getMyProfile()
        .then((data) => {
          setProfile((prev) => ({
            ...prev,
            name: data.name || prev.name,
            email: data.email || prev.email,
            role: data.role_name || prev.role,
          }));
          setTotpEnabled(!!data.totp_enabled);
        })
        .catch((err) => console.warn('Failed to refresh admin profile:', err));
    }
  }, [activeSubItem, loadApiKeyStatus, loadBrandingFromApi, loadMaintenanceModeFromApi, loadRolesFromApi, loadStaffFromApi]);

  const handleToggleMaintenance = async () => {
    const nextMode = !isMaintenanceMode;
    if (!confirm(`WARNING: Toggling maintenance mode to ${nextMode ? 'ON' : 'OFF'} will affect public gateway requests. Continue?`)) {
      return;
    }
    setIsTogglingMaintenance(true);
    try {
      const entry = await adminApiClient.getAdminDomainConfig('settings');
      const currentData = entry?.data || entry || {};
      await adminApiClient.updateAdminDomainConfig('settings', { ...currentData, maintenance_mode: nextMode });
      setIsMaintenanceMode(nextMode);
      toast.success('Maintenance Mode Updated', `Gateway maintenance mode is now ${nextMode ? 'ON' : 'OFF'} — live across all gateway instances within seconds.`);
    } catch (err) {
      toast.error('Failed to Update Maintenance Mode', getErrorMessage(err));
    } finally {
      setIsTogglingMaintenance(false);
    }
  };

  const handleDownloadUsersCsv = async () => {
    setIsExportingCsv(true);
    try {
      await adminApiClient.downloadUsersCsv();
      toast.success('Export Downloaded', 'User registry CSV has been downloaded.');
    } catch (err) {
      toast.error('Export Failed', getErrorMessage(err));
    } finally {
      setIsExportingCsv(false);
    }
  };

  if (activeSubItem === 'set_profile') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
        <Card className="">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <User size={16} className="text-purple-600 dark:text-purple-400" />
            Admin Profile Settings
          </h3>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <Input
              label="Profile Name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              required
            />
            <Input
              label="Email Address"
              value={profile.email}
              type="email"
              disabled
              title="Login email can't be self-service changed here — ask another Super Admin."
            />
            <div className="text-left">
              <label className="block text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1.5">
                Role Classification
              </label>
              <div className="flex items-center gap-2">
                <Badge variant={admin?.isSuperAdmin ? 'danger' : 'primary'}>{profile.role}</Badge>
                {admin?.isSuperAdmin && <span className="text-[10px] text-emerald-500 font-bold">Unrestricted Access</span>}
              </div>
            </div>
            <Button type="submit" variant="violet" className="w-full flex items-center justify-center gap-1.5" disabled={isSavingProfile}>
              <Save size={13} /> {isSavingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </Card>

        <Card className="border-l-4 border-l-purple-600">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Lock size={16} className="text-purple-600 dark:text-purple-400" />
            Account Password Security
          </h3>

          {passwordStatus && (
            <div className={`p-2.5 rounded-md mb-4 text-xs font-medium ${
              passwordStatus.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400'
            }`}>
              {passwordStatus.message}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Enter current password"
            />
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Minimum 6 characters"
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter new password"
            />
            <Button type="submit" variant="violet" className="w-full flex items-center justify-center gap-1.5" disabled={isChangingPassword}>
              <Key size={13} /> {isChangingPassword ? 'Updating Password...' : 'Update Password'}
            </Button>
          </form>
        </Card>

        <Card className="border-l-4 border-l-purple-600">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <ShieldCheck size={16} className="text-purple-600 dark:text-purple-400" />
            Two-Factor Authentication
            <Badge variant={totpEnabled ? 'success' : 'secondary'}>{totpEnabled ? 'Enabled' : 'Not Enabled'}</Badge>
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Configure your authenticator app under Settings → 2FA Settings.
          </p>
        </Card>
      </div>
    );
  }

  if (activeSubItem === 'set_admin_users') {
    if (!admin?.isSuperAdmin) {
      return (
        <Card className="max-w-md mx-auto text-left border-l-4 border-l-rose-500">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert size={22} className="text-rose-500 shrink-0" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Access Restricted</h3>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
            Role-Based Access Control (RBAC) and Staff Management access is strictly granted to <strong>Super Admin</strong> accounts only.
          </p>
          <Badge variant="danger">Super Admin Only</Badge>
        </Card>
      );
    }

    return (
      <div className="space-y-6 text-left">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={20} className="text-emerald-500 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-gray-900 dark:text-white">Super Admin Authority: </span>
              <span className="text-gray-600 dark:text-gray-400">You have full permission to define custom roles, modify privilege matrices, and assign access control via Admin API.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadRolesFromApi} disabled={isLoadingRoles} className="flex items-center gap-1">
              <RefreshCw size={12} className={isLoadingRoles ? 'animate-spin' : ''} /> Reload Roles
            </Button>
            <Button variant="violet" size="sm" onClick={() => setShowRoleModal(true)} className="flex items-center gap-1">
              <Plus size={14} /> Define New Custom Role
            </Button>
          </div>
        </div>

        <Card className="">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200/60 dark:border-white/10">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                Admin Staff Accounts
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Who has admin access, and which role each account is assigned</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">{staff.length} Staff</Badge>
              <Button variant="outline" size="sm" onClick={loadStaffFromApi} disabled={isLoadingStaff} className="flex items-center gap-1">
                <RefreshCw size={12} className={isLoadingStaff ? 'animate-spin' : ''} />
              </Button>
              <Button variant="violet" size="sm" onClick={() => setShowInviteModal(true)} className="flex items-center gap-1">
                <Plus size={14} /> Invite Staff
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Email</th>
                  <th className="pb-3 font-bold">Role</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 text-right font-bold">Super Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-400 text-[11px]">
                      {isLoadingStaff ? 'Loading staff…' : 'No admin staff accounts found.'}
                    </td>
                  </tr>
                ) : (
                  staff.map((s) => {
                    const isSelf = s.admin_id === admin?.id;
                    return (
                      <tr key={s.admin_id} className="hover:bg-purple-500/5 transition-colors">
                        <td className="py-3 text-gray-900 dark:text-white font-bold">
                          {s.email}
                          {isSelf && <span className="ml-1.5 text-[9px] text-gray-400 font-mono">(you)</span>}
                        </td>
                        <td className="py-3">
                          <select
                            value={roles.find((r) => r.name === s.role)?.id || ''}
                            onChange={(e) => handleChangeStaffRole(s.admin_id, e.target.value)}
                            disabled={isSelf || !rolesSynced}
                            title={!rolesSynced ? "Couldn't load real roles from the Admin API — reassignment disabled." : undefined}
                            className="text-[11px] bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md px-2 py-1 text-gray-800 dark:text-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {!roles.some((r) => r.name === s.role) && <option value="">{s.role}</option>}
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3">
                          <Badge variant={s.status === 'active' ? 'success' : s.status === 'suspended' ? 'warning' : 'danger'}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          {isSelf ? (
                            <span className="text-[10px] text-gray-400 italic">Manage from another account</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="!py-0.5 !px-2 text-[10px]"
                                onClick={() => handleToggleStaffStatus(s)}
                              >
                                {s.status === 'active' ? 'Suspend' : 'Reactivate'}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                className="!py-0.5 !px-2 text-[10px]"
                                onClick={() => handleRemoveStaff(s)}
                              >
                                <Trash2 size={10} className="mr-1 inline" /> Remove
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200/60 dark:border-white/10">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                Administrator Roles & Privilege Registry
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Granular Role-Based Access Control (RBAC) Matrix</p>
            </div>
            <Badge variant="primary">{roles.length} Active Roles</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Role Name</th>
                  <th className="pb-3 font-bold">Role Description</th>
                  <th className="pb-3 font-bold">Assigned Privileges</th>
                  <th className="pb-3 font-bold">Staff Count</th>
                  <th className="pb-3 text-right font-bold">Super Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {roles.map((r) => (
                  <tr key={r.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-3 text-gray-900 dark:text-white font-bold flex items-center gap-2">
                      <Shield size={14} className={!r.isCustom ? 'text-rose-500' : 'text-purple-600 dark:text-purple-400'} />
                      {r.name}
                      {!r.isCustom && <span className="text-[9px] text-gray-400 font-mono">(System)</span>}
                    </td>
                    <td className="py-3 text-gray-600 dark:text-gray-400 text-[11px] max-w-xs">{r.description}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {(r.permissions || []).map((p, idx: number) => {
                          const label = p;
                          return (
                            <span key={idx} className="text-[10px] bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-800 dark:text-gray-200 font-mono px-2 py-0.5 rounded-md">
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 font-bold text-gray-900 dark:text-white">{r.staffCount}</td>
                    <td className="py-3 text-right">
                      {r.isCustom && admin?.isSuperAdmin ? (
                        <Button
                          variant="danger"
                          size="sm"
                          className="!py-0.5 !px-2 text-[10px]"
                          onClick={() => handleDeleteRole(r.id, r.name)}
                        >
                          <Trash2 size={10} className="mr-1 inline" /> Delete
                        </Button>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">
                          {!r.isCustom ? 'Protected System Role' : 'Super Admin Restricted'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {showRoleModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-lg w-full p-6 text-left border-gray-200 dark:border-white/10 shadow-2xl relative">
              <div className="flex items-center justify-between mb-4 border-b border-gray-200/60 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Define New Custom Role & Privileges</h3>
                </div>
                <button
                  onClick={() => setShowRoleModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateRole} className="space-y-4">
                <Input
                  label="Role Name"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  required
                  placeholder="e.g. Content Manager"
                />
                <Input
                  label="Description"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Brief summary of role responsibilities"
                />

                <div>
                  <label className="block text-[10px] text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wider mb-2">
                    Assign Role Privileges / Permissions
                  </label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {availablePrivileges.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                          selectedPrivileges.includes(p.id)
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-300 font-bold'
                            : 'bg-gray-100/50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                        }`}
                        onClick={() => togglePrivilege(p.id)}
                      >
                        <span className="font-mono text-[11px]">{p.id}</span>
                        <span className="text-[11px]">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200/60 dark:border-white/10">
                  <Button type="button" variant="outline" className="flex items-center gap-1.5" onClick={() => setShowRoleModal(false)}>
                    <X size={12} /> Cancel
                  </Button>
                  <Button type="submit" variant="violet" className="flex items-center gap-1.5">
                    <Plus size={12} /> Save & Define Role
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {showInviteModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-6 text-left border-gray-200 dark:border-white/10 shadow-2xl relative">
              <div className="flex items-center justify-between mb-4 border-b border-gray-200/60 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <User size={18} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Invite Admin Staff</h3>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleInviteStaff} className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  required
                  placeholder="new.admin@doccraft.app"
                />
                <Input
                  label="Full Name (optional)"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. Jordan Lee"
                />
                <div>
                  <label className="block text-[10px] text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wider mb-1.5">
                    Assign Role
                  </label>
                  <select
                    value={newStaffRoleId}
                    onChange={(e) => setNewStaffRoleId(e.target.value)}
                    required
                    disabled={!rolesSynced}
                    className="w-full text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md px-3 py-2 text-gray-800 dark:text-gray-200 disabled:opacity-50"
                  >
                    <option value="" disabled>Select a role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {!rolesSynced && (
                    <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">
                      Couldn't load real roles from the Admin API — invites are disabled until this reloads to avoid assigning a role that doesn't actually exist on the server.
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  They'll be created with a temporary password and must reset it (and set up 2FA) on first login.
                </p>
                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200/60 dark:border-white/10">
                  <Button type="button" variant="outline" className="flex items-center gap-1.5" onClick={() => setShowInviteModal(false)}>
                    <X size={12} /> Cancel
                  </Button>
                  <Button type="submit" variant="violet" className="flex items-center gap-1.5" disabled={!rolesSynced}>
                    <Plus size={12} /> Send Invite
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    );
  }

  if (activeSubItem === 'set_preferences') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 text-left">
        <Card className="">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Palette size={16} className="text-purple-600 dark:text-purple-400" />
            Global Branding & Theme Customization
          </h3>
          {isLoadingBranding ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Loading current branding config…</p>
          ) : (
            <form onSubmit={handleSaveBranding} className="space-y-4">
              <Input
                label="Application Name"
                value={branding.company_name}
                onChange={(e) => setBranding({ ...branding, company_name: e.target.value })}
                required
              />
              <Input
                label="Brand Logo URL"
                value={branding.logo_url}
                onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Primary Brand Color (Hex)"
                  value={branding.accent_color}
                  onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
                  required
                />
                <FontFacePicker
                  label="Primary Font Family"
                  value={branding.font_family}
                  onChange={(family) => setBranding({ ...branding, font_family: family })}
                />
              </div>
              <Input
                label="Support Email"
                type="email"
                value={branding.support_email}
                onChange={(e) => setBranding({ ...branding, support_email: e.target.value })}
                required
              />
              <Button type="submit" variant="violet" className="w-full flex items-center justify-center gap-1.5" disabled={isSavingBranding}>
                <Save size={13} /> {isSavingBranding ? 'Publishing...' : 'Publish Branding Changes'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    );
  }

  if (activeSubItem === 'set_2fa') {
    return (
      <Card className="max-w-md mx-auto text-left border-l-4 border-l-purple-600">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ShieldCheck size={18} className="text-purple-600 dark:text-purple-400" />
          Two-Factor Authentication
          <Badge variant={totpEnabled ? 'success' : 'secondary'}>{totpEnabled ? 'Enabled' : 'Not Enabled'}</Badge>
        </h3>

        {totpEnabled && !totpSetupData && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              2FA is active on this account. Sensitive actions (plan edits, staff changes, quota overrides, ...)
              require a fresh 6-digit code from your authenticator app.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 !text-rose-600 !border-rose-300 hover:!bg-rose-50 dark:!text-rose-400 dark:!border-rose-500/30 dark:hover:!bg-rose-500/10"
              onClick={handleDisableTotp}
              disabled={isDisablingTotp}
            >
              {isDisablingTotp ? 'Disabling...' : 'Disable 2FA'}
            </Button>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Don't have this account's authenticator app anymore? You'll be prompted for a code — choose
              "send code via email" if you can't produce one, then set 2FA up again with a fresh QR code.
            </p>
          </div>
        )}

        {!totpEnabled && !totpSetupData && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              2FA is not set up yet — sensitive actions will block until it is. There's no email code for this;
              it comes from an authenticator app (Google Authenticator, Authy, 1Password, ...).
            </p>
            <Button
              variant="violet"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={handleStartTotpSetup}
              disabled={isStartingTotpSetup}
            >
              <ShieldCheck size={13} /> {isStartingTotpSetup ? 'Starting...' : 'Set Up 2FA'}
            </Button>
          </div>
        )}

        {totpSetupData && (
          <div className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Scan the QR code below with your authenticator app, or add it manually using the
              secret key.
            </p>
            {totpSetupData.qr_code_url && (
              <div className="flex justify-center p-4 bg-white rounded-md border border-gray-200 dark:border-white/10">
                <img src={totpSetupData.qr_code_url} alt="2FA QR Code" className="w-44 h-44 object-contain" />
              </div>
            )}
            <div className="p-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md">
              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                Can't scan? Enter secret key manually
              </p>
              <p className="font-mono text-sm font-bold text-gray-900 dark:text-white break-all select-all">
                {totpSetupData.totp_secret}
              </p>
            </div>

            <form onSubmit={handleVerifyTotp} className="space-y-3 pt-2 border-t border-gray-100 dark:border-white/5">
              <Input
                label="Enter the 6-digit code from your app to confirm"
                value={totpVerifyCode}
                onChange={(e) => setTotpVerifyCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
              <div className="flex items-center gap-2">
                <Button type="submit" variant="violet" size="sm" disabled={isVerifyingTotp || totpVerifyCode.length !== 6}>
                  {isVerifyingTotp ? 'Verifying...' : 'Verify & Enable 2FA'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setTotpSetupData(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}
      </Card>
    );
  }

  if (activeSubItem === 'set_api_keys' || activeSubItem === 'set_billing') {
    return (
      <Card className="">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Key size={16} className="text-purple-600 dark:text-purple-400" />
          Integrated Third-Party API Credentials
        </h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
          Each secret lives only in its owning service's environment. This page shows a live configuration
          status and a last-4-character preview only — the real value is never sent to or stored by the admin panel.
        </p>
        {isLoadingApiKeys ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">Checking key status across services…</p>
        ) : (
          <div className="overflow-x-auto text-left">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-bold">Integration API Target</th>
                  <th className="pb-3 font-bold">Last 4 Characters</th>
                  <th className="pb-3 font-bold">Connection Status</th>
                  <th className="pb-3 text-right font-bold">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/40 dark:divide-white/5">
                {apiKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-4 text-gray-900 dark:text-white font-bold">{k.name}</td>
                    <td className="py-4 font-mono text-gray-500 dark:text-gray-400 font-bold">
                      {k.last4 ? `••••${k.last4}` : '—'}
                    </td>
                    <td className="py-4">
                      {k.error ? (
                        <Badge variant="danger">{k.error}</Badge>
                      ) : (
                        <Badge variant={k.configured ? 'success' : 'danger'}>
                          {k.configured ? 'Configured' : 'Not Configured'}
                        </Badge>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      <Button variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => handleManageKey(k.manage_url)}>
                        <ExternalLink size={12} /> Manage on Vendor
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    );
  }

  if (activeSubItem === 'set_gdpr') {
    return (
      <Card className="max-w-md mx-auto text-left ">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <ShieldAlert size={18} className="text-amber-500" />
          GDPR & Data Compliance Management
        </h3>
        <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
          Search customer account to download a real JSON export archive, or anonymize the account (email, name, and credentials scrubbed; sessions revoked) under standard Right to be Forgotten regulations. Billing and document records are kept but de-identified.
        </p>
        <div className="space-y-4">
          <Input
            label="Customer Email Address"
            value={gdprEmail}
            onChange={(e) => setGdprEmail(e.target.value)}
            placeholder="e.g. client@domain.com"
          />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="flex items-center gap-1.5" onClick={() => handleGdprAction('export')} disabled={!gdprEmail || isGdprBusy}>
              <Download size={13} /> {isGdprBusy ? 'Working…' : 'Export Data Archive'}
            </Button>
            <Button variant="danger" className="flex items-center gap-1.5" onClick={() => handleGdprAction('delete')} disabled={!gdprEmail || isGdprBusy}>
              <Trash2 size={13} /> {isGdprBusy ? 'Working…' : 'Purge User Data'}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (activeSubItem === 'set_export_csv') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="text-left flex flex-col justify-between h-[200px] ">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Download size={16} className="text-purple-600 dark:text-purple-400" /> Export Administrative Reports
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Export the real user registry (account, plan, status, subscription) directly as a flat CSV spreadsheet file.
            </p>
          </div>
          <Button variant="violet" className="w-full flex items-center justify-center gap-1.5" onClick={handleDownloadUsersCsv} disabled={isExportingCsv}>
            <Download size={13} /> {isExportingCsv ? 'Generating…' : 'Download Full Database Export'}
          </Button>
        </Card>

        <Card className="text-left flex flex-col justify-between h-[200px] border-l-4 border-l-amber-500">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              Gateway Maintenance Mode
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Activate global maintenance. Real end-user requests get a 503 retry response from the Gateway; admin routes stay reachable.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-900 dark:text-white">
              Status: {isLoadingMaintenance ? 'Loading…' : isMaintenanceMode ? 'Maintenance ON' : 'Online'}
            </span>
            <Button
              variant={isMaintenanceMode ? 'success' : 'danger'}
              size="sm"
              className="flex items-center gap-1.5"
              onClick={handleToggleMaintenance}
              disabled={isLoadingMaintenance || isTogglingMaintenance}
            >
              {isMaintenanceMode ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {isTogglingMaintenance ? 'Updating…' : 'Toggle Mode'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
};

export default SettingsView;
