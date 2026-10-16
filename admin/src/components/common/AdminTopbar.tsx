import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import { getErrorMessage } from '../../store/toastStore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Sun,
  Moon,
  Maximize,
  Minimize,
  Grid2x2Plus,
  Languages,
  Check,
  Bell,
  ShieldCheck,
  LogOut,
  Settings,
  UserRound,
  History,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Users,
  CreditCard,
  DollarSign,
  Sparkles,
  ShieldAlert,
  HelpCircle,
  FileText,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { useAdminAuthStore } from '../../store/adminAuthStore';
import { useThemeStore } from '../../store/themeStore';
import { adminApiClient } from '../../api/adminApiClient';
import { ADMIN_NAV_SECTIONS } from '../../config/adminNavSections';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import SystemDialogModal, { type DialogType } from '../ui/SystemDialogModal';
import logoForLightMode from '../../assets/images/logo-left1.png';
import logoForDarkMode from '../../assets/images/logo-left.png';

interface FailedNotification {
  id: string;
  recipient: string;
  subject: string;
  type: string;
  status: string;
  timestamp: string;
}

interface AdminTopbarProps {
  onSelect: (id: string) => void;
}

const APP_LAUNCHER_ITEMS = [
  { id: 'users_all', label: 'Users', icon: <Users size={18} />, tone: 'text-blue-500 bg-blue-500/10' },
  { id: 'subs_all', label: 'Subscriptions', icon: <CreditCard size={18} />, tone: 'text-purple-500 bg-purple-500/10' },
  { id: 'rev_mrr_arr', label: 'Revenue', icon: <DollarSign size={18} />, tone: 'text-emerald-500 bg-emerald-500/10' },
  { id: 'gen_total', label: 'Generations', icon: <Sparkles size={18} />, tone: 'text-amber-500 bg-amber-500/10' },
  { id: 'sec_ip_logs', label: 'Security', icon: <ShieldAlert size={18} />, tone: 'text-rose-500 bg-rose-500/10' },
  { id: 'sup_reported', label: 'Support', icon: <HelpCircle size={18} />, tone: 'text-cyan-500 bg-cyan-500/10' },
  { id: 'doc_all', label: 'Documents', icon: <FileText size={18} />, tone: 'text-indigo-500 bg-indigo-500/10' },
  { id: 'set_dynamic_config', label: 'Settings', icon: <Settings size={18} />, tone: 'text-gray-500 bg-gray-500/10' },
];

type OpenMenu = 'language' | 'apps' | 'notifications' | 'profile' | null;

// 38-40px circular, transparent by default with a soft hover fill — matches
// the Vuexy topbar's btn-icon.rounded-pill treatment (measured border-radius: 800px).
const iconButtonClass =
  'w-10 h-10 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-purple-600 dark:hover:text-purple-400 transition-colors relative shrink-0';

const AdminTopbar: React.FC<AdminTopbarProps> = ({ onSelect }) => {
  const { admin, logout } = useAdminAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [notifications, setNotifications] = useState<FailedNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState(false);

  // Compose announcement — quick-create shortcut from the bell dropdown,
  // reusing the same /admin/notifications/announcements endpoint HomeView
  // already posts to.
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [composeSeverity, setComposeSeverity] = useState('info');
  const [isComposing, setIsComposing] = useState(false);
  const [dialogState, setDialogState] = useState<{ isOpen: boolean; title?: string; message: string; type?: DialogType }>({
    isOpen: false,
    message: '',
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);

  const openSearch = useCommittedEvent(() => { setSearchQuery(''); setSearchOpen(true); });

  // Flattened once — search matches against the same section/item tree the
  // sidebar renders, so results always point at a real, navigable page.
  const flatNavItems = useMemo(
    () =>
      ADMIN_NAV_SECTIONS.flatMap((section) =>
        section.items.map((item) => ({ ...item, sectionTitle: section.title, sectionIcon: section.icon }))
      ),
    []
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return flatNavItems
      .filter((item) => item.label.toLowerCase().includes(q) || item.sectionTitle.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, flatNavItems]);

  const fetchFailedNotifications = useCommittedEvent(async () => {


    try {
      const data = await adminApiClient.getFailedNotifications();
setNotifError(false);
      setNotifications(data.map(row => ({ ...row, recipient: row.recipient || row.email || '', subject: row.subject || '', timestamp: row.timestamp || row.created_at })));
    } catch {
      setNotifError(true);
    } finally {
      setNotifLoading(false);
    }
  });

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTitle.trim() || !composeMessage.trim()) return;
    setIsComposing(true);
    try {
      await adminApiClient.createAnnouncement(composeTitle, composeMessage, composeSeverity);
      setShowComposeModal(false);
      setComposeTitle('');
      setComposeMessage('');
      setComposeSeverity('info');
      setDialogState({
        isOpen: true,
        title: 'Announcement Published',
        message: 'System announcement published live to the User Frontend header banner.',
        type: 'success',
      });
    } catch (err) {
      setDialogState({
        isOpen: true,
        title: 'Publish Failed',
        message: getErrorMessage(err) || 'Failed to publish announcement.',
        type: 'error',
      });
    } finally {
      setIsComposing(false);
    }
  };

  useEffect(() => {
    fetchFailedNotifications();
    // Short enough to feel like a live feed rather than something that only
    // updates when the admin happens to click the bell.
    const interval = setInterval(fetchFailedNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchFailedNotifications]);

  // Cmd/Ctrl+K opens the search palette; Escape closes whatever is open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch]);

  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  // Click-away closes the search dropdown, matching the other topbar
  // dropdowns instead of relying on a full-screen modal backdrop.
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Outside-click closes whichever dropdown is open, but a click on a
  // different trigger inside the cluster switches directly to it instead of
  // needing a first click to close and a second to open.
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (clusterRef.current && !clusterRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const goTo = (id: string) => {
    onSelect(id);
    setOpenMenu(null);
    setSearchOpen(false);
  };

  return (
    <header className="h-14 shrink-0 z-20 relative flex items-center gap-2 px-4 sm:px-6 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
      {/* Brand */}
      <div className="flex items-center gap-2 shrink-0">
        <img
          src={theme === 'dark' ? logoForDarkMode : logoForLightMode}
          alt="DocCraft Logo"
          className="w-7 h-7 object-contain shrink-0"
        />
        <span className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider hidden sm:inline">
          DocCraft <span className="text-purple-600 dark:text-purple-400 font-extrabold lowercase">admin</span>
        </span>
      </div>

      <div className="flex-1" />

      {/* Search — a real bordered input; results drop down directly beneath
          it at the exact same width, anchored like the other topbar
          dropdowns (no full-page backdrop/blur). */}
      <div ref={searchWrapRef} className="absolute left-1/2 -translate-x-1/2 w-full max-w-sm">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => openSearch()}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              openSearch();
            }}
            placeholder="Search users, tickets, logs..."
            className="w-full pl-9 pr-16 py-2 text-sm bg-white dark:bg-neutral-900 text-gray-900 dark:text-white placeholder:text-gray-400 border-[0.5px] border-gray-300 dark:border-white/20 rounded-md focus:outline-none focus:border-purple-500 transition-colors"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 border-[0.5px] border-gray-300 dark:border-white/20 text-[10px] font-semibold text-gray-400 dark:text-gray-500">
            Ctrl K
          </kbd>
        </div>

        {searchOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-neutral-900 border-[0.5px] border-gray-300 dark:border-white/20 rounded-md shadow-xl z-50 overflow-hidden">
            <div className="max-h-80 overflow-y-auto py-1.5">
              {!searchQuery.trim() ? (
                <>
                  <p className="px-4 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-600">
                    Quick Links
                  </p>
                  {APP_LAUNCHER_ITEMS.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => goTo(app.id)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-purple-500/5 dark:hover:bg-purple-400/10 transition-colors"
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${app.tone}`}>
                        {app.icon}
                      </span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">{app.label}</span>
                    </button>
                  ))}
                </>
              ) : searchResults.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  No matches for &ldquo;{searchQuery}&rdquo;
                </p>
              ) : (
                searchResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => goTo(item.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-purple-500/5 dark:hover:bg-purple-400/10 transition-colors"
                  >
                    <span className="text-purple-600 dark:text-purple-400 shrink-0">{item.sectionIcon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {item.label}
                      </span>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400">{item.sectionTitle}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right-side icon cluster */}
      <div ref={clusterRef} className="flex items-center gap-0.5">
        {/* Language */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
            className={iconButtonClass}
            title="Language"
            aria-label="Language"
          >
            <Languages size={19} />
          </button>
          {openMenu === 'language' && (
            <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 rounded-md shadow-xl z-50 p-1.5">
              <button
                onClick={() => setOpenMenu(null)}
                className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-semibold rounded-md text-purple-600 dark:text-purple-400 bg-purple-500/10"
              >
                English
                <Check size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} className={iconButtonClass} title="Toggle fullscreen" aria-label="Toggle fullscreen">
          {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
        </button>

        {/* Theme */}
        <button onClick={toggleTheme} className={iconButtonClass} title="Toggle light / dark theme" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        {/* App launcher */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'apps' ? null : 'apps')}
            className={iconButtonClass}
            title="Quick launch"
            aria-label="Quick launch"
          >
            <Grid2x2Plus size={19} />
          </button>
          {openMenu === 'apps' && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 rounded-md shadow-xl z-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 mb-2">
                Quick Launch
              </p>
              <div className="grid grid-cols-4 gap-2">
                {APP_LAUNCHER_ITEMS.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => goTo(app.id)}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center ${app.tone}`}>{app.icon}</span>
                    <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">
                      {app.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notifications — live failed-delivery feed from the Notification Service */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
            className={iconButtonClass}
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={19} />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 border border-white dark:border-neutral-900 text-white text-[9px] font-bold leading-none">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>
          {openMenu === 'notifications' && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 rounded-md shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 dark:border-white/10">
                <p className="text-xs font-bold text-gray-900 dark:text-white">Failed Deliveries</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setOpenMenu(null);
                      setShowComposeModal(true);
                    }}
                    className="text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    title="New Announcement"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={fetchFailedNotifications}
                    className="text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw size={13} className={notifLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {notifLoading && notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">Loading alerts...</p>
                ) : notifError ? (
                  <div className="px-4 py-6 text-center">
                    <AlertTriangle size={18} className="mx-auto text-amber-500 mb-1.5" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">Unable to reach Notification Service.</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <CheckCircle2 size={18} className="mx-auto text-emerald-500 mb-1.5" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">All notifications delivering normally.</p>
                  </div>
                ) : (
                  notifications.slice(0, 6).map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-100 dark:border-white/5 last:border-0"
                    >
                      <span className="mt-0.5 text-rose-500 shrink-0">
                        <AlertTriangle size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{n.subject}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                          to {n.recipient} &middot; {n.timestamp || 'just now'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => goTo('not_email_logs')}
                className="w-full py-2.5 text-center text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/5 dark:hover:bg-purple-400/10 border-t border-gray-200/60 dark:border-white/10 transition-colors"
              >
                View Email Logs
              </button>
            </div>
          )}
        </div>

        {/* Identity card — avatar, name, email, 2FA status, quick sign-out */}
        <div className="relative ml-1.5">
          <div className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-full bg-purple-500/5 dark:bg-purple-400/10 border border-purple-500/15">
            <button
              onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
              className="flex items-center gap-2 min-w-0"
              aria-label="Account menu"
            >
              <span className="relative w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {admin?.name?.charAt(0).toUpperCase() || 'A'}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-neutral-900" />
              </span>
              <span className="hidden lg:block text-left min-w-0">
                <span className="block text-[11px] font-bold text-gray-900 dark:text-white truncate leading-tight max-w-[130px]">
                  {admin?.name || 'Super Admin'}
                </span>
                <span className="block text-[9px] text-gray-500 dark:text-gray-400 font-mono truncate max-w-[130px]">
                  {admin?.email || 'admin@doccraft.app'}
                </span>
              </span>
            </button>
            <span className="hidden lg:flex text-emerald-500 shrink-0" title="2FA Active">
              <ShieldCheck size={13} />
            </span>
            <button
              onClick={() => setShowLogoutModal(true)}
              className="p-1.5 rounded-full text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
              title="Log Out of Control Plane"
              aria-label="Log out"
            >
              <LogOut size={14} />
            </button>
          </div>

          {openMenu === 'profile' && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 rounded-md shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200/60 dark:border-white/10">
                <Badge variant={admin?.isSuperAdmin ? 'danger' : 'primary'}>
                  {admin?.isSuperAdmin ? 'Super Admin' : 'Staff Admin'}
                </Badge>
              </div>

              <div className="p-1.5">
                <TopbarMenuItem icon={<UserRound size={14} />} label="My Profile" onClick={() => goTo('set_profile')} />
                <TopbarMenuItem icon={<Settings size={14} />} label="Account Settings" onClick={() => goTo('set_preferences')} />
                <TopbarMenuItem icon={<ShieldCheck size={14} />} label="2FA Settings" onClick={() => goTo('set_2fa')} />
                <TopbarMenuItem icon={<History size={14} />} label="My Audit Log" onClick={() => goTo('sec_audit')} />
              </div>

              <div className="p-1.5 border-t border-gray-200/60 dark:border-white/10">

              </div>

              <div className="p-1.5 border-t border-gray-200/60 dark:border-white/10">
                <TopbarMenuItem
                  icon={<LogOut size={14} />}
                  label="Sign Out"
                  onClick={() => {
                    setOpenMenu(null);
                    setShowLogoutModal(true);
                  }}
                  danger
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <SystemDialogModal
        isOpen={showLogoutModal}
        title="Confirm Log Out"
        message="Are you sure you want to end your administrative session and log out of DocCraft Control Plane?"
        type="warning"
        confirmText="Log Out"
        cancelText="Cancel"
        onConfirm={() => {
          setShowLogoutModal(false);
          logout();
        }}
        onClose={() => setShowLogoutModal(false)}
      />

      {/* Compose announcement modal */}
      {showComposeModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowComposeModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 rounded-md shadow-2xl p-5 space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-200/60 dark:border-white/10">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Bell size={16} className="text-purple-600 dark:text-purple-400" />
                New System Announcement
              </h3>
              <button
                onClick={() => setShowComposeModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleComposeSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={composeTitle}
                  onChange={(e) => setComposeTitle(e.target.value)}
                  placeholder="e.g. Scheduled Maintenance"
                  required
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-md focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Message
                </label>
                <textarea
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. Brief downtime expected Sunday 02:00 UTC for infra upgrades."
                  required
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-md focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Severity
                </label>
                <select
                  value={composeSeverity}
                  onChange={(e) => setComposeSeverity(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-md focus:outline-none focus:border-purple-500"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowComposeModal(false)} className="flex-1 flex items-center justify-center gap-1.5">
                  <X size={12} /> Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isComposing} className="flex-1 flex items-center justify-center gap-1.5">
                  <Send size={12} /> {isComposing ? 'Publishing...' : 'Publish'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SystemDialogModal
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        onConfirm={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
        onClose={() => setDialogState((prev) => ({ ...prev, isOpen: false }))}
      />
    </header>
  );
};

const TopbarMenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors text-left ${
      danger
        ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
    }`}
  >
    {icon}
    {label}
  </button>
);

export default AdminTopbar;
