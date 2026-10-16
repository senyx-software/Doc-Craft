import React, { useEffect, useState } from 'react';
import { User, Mail, Globe, Loader2, Save, RefreshCw } from 'lucide-react';
import { useQuotaStore } from '../../store/quotaStore';
import { useAuthStore } from '../../store/authStore';
import * as usersApi from '../../api/users';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

interface ProfileIdentityCardProps {
  // 'card' (default) is ProfilePage's own rounded/pill design system.
  // 'flat' matches the dashboard Overview page's sharp-cornered, bordered
  // panel style instead, so the two don't visually clash when shown
  // together on Overview.
  variant?: 'card' | 'flat';
}

// Extracted from ProfilePage so the exact same editable identity card (and
// its Save/Refresh behavior) can be reused inside the dashboard Overview
// page without duplicating the fetch/save logic in two places.
const ProfileIdentityCard: React.FC<ProfileIdentityCardProps> = ({ variant = 'card' }) => {
  const isFlat = variant === 'flat';
  const { user, setUser } = useAuthStore();
  const {entitlements,fetchQuota}=useQuotaStore();
  useEffect(()=>{void fetchQuota();},[fetchQuota]);

  const [fullName, setFullName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Colombo');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setIsLoadingProfile(true);
      try {
        const freshUser = await usersApi.getProfile();
        if (!cancelled) {
          setUser({ ...freshUser });
          setFullName(freshUser.full_name || '');
          setTimezone(freshUser.timezone || 'Asia/Colombo');
        }
      } catch {
        if (!cancelled && user) {
          setFullName(user.full_name || '');
          setTimezone(user.timezone || 'Asia/Colombo');
        }
      } finally {
        if (!cancelled) setIsLoadingProfile(false);
      }
    }

    loadProfile();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      const updated = await usersApi.updateProfile({ full_name: fullName, timezone });
      setUser({ ...user!, full_name: updated.full_name, timezone: updated.timezone });
      setSaveMessage('Profile updated successfully.');
    } catch {
      setSaveMessage('Failed to update profile. Please try again.');
    }
    setIsSaving(false);
    setTimeout(() => setSaveMessage(''), 4000);
  };

  const displayName = fullName || user?.full_name || '';
  const displayEmail = user?.email || '';
  const avatarLetter = (displayName[0] || displayEmail[0] || 'U').toUpperCase();

  const avatarShape = isFlat ? 'rounded-none' : 'rounded-2xl';
  const headingClass = isFlat
    ? 'text-sm font-bold text-appTextPrimary'
    : 'text-heading-h5 font-bold text-appTextPrimary';
  const emailClass = isFlat ? 'text-xs text-appTextSecondary' : 'text-body-sm text-appTextSecondary';
  const labelClass = isFlat
    ? 'flex items-center gap-1.5 text-xs font-semibold text-appTextSecondary mb-1.5'
    : 'field-label flex items-center gap-1.5';
  const inputClass = isFlat
    ? 'w-full px-3 py-2 bg-appBg border border-appBorder rounded-none text-sm text-appTextPrimary placeholder:text-appTextSecondary focus:outline-none focus:border-appPrimary transition-colors'
    : 'input-field';

  const content = (
    <>
      <div className={`flex items-center gap-4 ${isFlat ? 'mb-4' : 'mb-6'}`}>
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="Avatar" className={`w-14 h-14 ${avatarShape} border-2 border-appBorder`} />
        ) : (
          <div className={`w-14 h-14 ${avatarShape} bg-gradient-to-br from-brand-500 to-accent-purple-500 flex items-center justify-center text-white text-lg font-bold ${isFlat ? '' : 'shadow-md'}`}>
            {isLoadingProfile ? <Loader2 size={22} className="animate-spin opacity-60" /> : avatarLetter}
          </div>
        )}
        <div>
          {isLoadingProfile ? (
            <div className="h-5 w-32 rounded bg-appBorder/60 animate-pulse mb-2" />
          ) : (
            <h2 className={headingClass}>
              {displayName || <span className="text-appTextSecondary italic">No name set</span>}
            </h2>
          )}
          {isLoadingProfile ? (
            <div className="h-3.5 w-48 rounded bg-appBorder/40 animate-pulse mb-1" />
          ) : (
            <p className={emailClass}>{displayEmail}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={['pro','max'].includes(entitlements?.plan || '') ? 'pro' : 'free'} className={isFlat ? 'text-[10px]' : 'text-body-xs'}>
              {entitlements?.plan.toUpperCase() || '—'}
            </Badge>
            <span className={`${isFlat ? 'text-[10px]' : 'text-body-xs'} text-appTextSecondary/70 capitalize`}>
              via {user?.auth_provider || 'email'}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="profile-name" className={labelClass}>
            <User size={12} /> Full Name
          </label>
          {isLoadingProfile ? (
            <div className={`${isFlat ? 'h-9' : 'input-field h-10'} animate-pulse bg-appBorder/30`} />
          ) : (
            <input
              id="profile-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="Your full name"
              disabled={isSaving}
            />
          )}
        </div>

        <div>
          <label htmlFor="profile-email" className={labelClass}>
            <Mail size={12} /> Email
          </label>
          <input
            id="profile-email"
            type="email"
            value={displayEmail}
            disabled
            className={`${inputClass} opacity-60 cursor-not-allowed`}
          />
        </div>

        <div>
          <label htmlFor="profile-timezone" className={labelClass}>
            <Globe size={12} /> Timezone
          </label>
          {isLoadingProfile ? (
            <div className={`${isFlat ? 'h-9' : 'input-field h-10'} animate-pulse bg-appBorder/30`} />
          ) : (
            <select
              id="profile-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputClass}
              disabled={isSaving}
            >
              <option value="Asia/Colombo">Asia/Colombo (UTC+5:30)</option>
              <option value="Asia/Kolkata">Asia/Kolkata (UTC+5:30)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (UTC-5)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
              <option value="Europe/London">Europe/London (UTC+0)</option>
              <option value="Europe/Paris">Europe/Paris (UTC+1)</option>
              <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
              <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
              <option value="Australia/Sydney">Australia/Sydney (UTC+11)</option>
            </select>
          )}
        </div>

        {saveMessage && (
          <p className={`text-xs font-medium ${saveMessage.includes('Failed') ? 'text-danger' : 'text-success'}`}>
            {saveMessage}
          </p>
        )}

        <div className="flex gap-3">
          {isFlat ? (
            <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving || isLoadingProfile} id="profile-save">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </Button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving || isLoadingProfile}
              className="btn-primary"
              id="profile-save"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Changes
            </button>
          )}

          {(() => {
            const doRefresh = async () => {
              setIsLoadingProfile(true);
              try {
                const fresh = await usersApi.getProfile();
                setUser({ ...fresh });
                setFullName(fresh.full_name || '');
                setTimezone(fresh.timezone || 'Asia/Colombo');
                setSaveMessage('Profile refreshed.');
              } catch {
                setSaveMessage('Failed to refresh.');
              } finally {
                setIsLoadingProfile(false);
                setTimeout(() => setSaveMessage(''), 3000);
              }
            };
            return isFlat ? (
              <Button variant="secondary" size="sm" onClick={doRefresh} disabled={isLoadingProfile || isSaving} id="profile-refresh" title="Refresh from database">
                <RefreshCw size={14} className={isLoadingProfile ? 'animate-spin' : ''} />
              </Button>
            ) : (
              <button
                onClick={doRefresh}
                disabled={isLoadingProfile || isSaving}
                className="btn-secondary"
                id="profile-refresh"
                title="Refresh from database"
              >
                <RefreshCw size={14} className={isLoadingProfile ? 'animate-spin' : ''} />
              </button>
            );
          })()}
        </div>
      </div>
    </>
  );

  return isFlat ? (
    <div className="bg-appSurface border border-appBorder rounded-none p-4">{content}</div>
  ) : (
    <Card className="p-6">{content}</Card>
  );
};

export default ProfileIdentityCard;
