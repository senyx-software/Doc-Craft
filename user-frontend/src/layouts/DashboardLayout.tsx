import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Layout, User, History, CreditCard, HelpCircle, Plus } from 'lucide-react';
import Button from '../components/ui/Button';
import UpgradeModal from '../components/shared/UpgradeModal';
import { startNewDocument } from '../utils/dashboardActions';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: <Layout size={16} strokeWidth={2} />, end: true },
  { to: '/dashboard/profile', label: 'Profile & Settings', icon: <User size={16} strokeWidth={2} /> },
  { to: '/dashboard/document-history', label: 'Document History', icon: <History size={16} strokeWidth={2} /> },
  { to: '/dashboard/billing', label: 'Billing & Quota', icon: <CreditCard size={16} strokeWidth={2} /> },
  { to: '/dashboard/support', label: 'Help & Support', icon: <HelpCircle size={16} strokeWidth={2} /> },
];

const DashboardLayout: React.FC = () => {
  // Subtle tint + a left accent bar for the active item, not a solid filled
  // pill — closer to how macOS sidebars (Finder, Mail, System Settings)
  // indicate selection than a saturated button-style state.
  const linkClasses = (active: boolean) =>
    `flex items-center gap-2.5 pl-3 pr-3 py-2 border-l-2 text-[13px] transition-colors ${
      active
        ? 'border-appPrimary bg-appPrimary/[0.06] text-appPrimary font-semibold'
        : 'border-transparent text-appTextSecondary hover:bg-appTextPrimary/[0.04] hover:text-appTextPrimary font-medium'
    }`;

  return (
    <div className="min-h-screen bg-appBg text-appTextPrimary pt-14 flex">
      <aside className="hidden md:flex w-56 flex-shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] border-r border-appBorder flex-col justify-between">
        <div className="py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              id={`sidebar-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={({ isActive }) => linkClasses(isActive)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="p-3 border-t border-appBorder">
          <Button variant="primary" size="sm" onClick={startNewDocument} className="w-full justify-center !rounded-none shadow-none">
            <Plus size={14} />
            Create Document
          </Button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile-only section nav — desktop reaches these via the sidebar,
            so this strip (plus its own compact Create Document action)
            only needs to exist below the md breakpoint. */}
        <div className="md:hidden flex items-center gap-1 px-4 py-2.5 border-b border-appBorder overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-appPrimary/[0.08] text-appPrimary' : 'text-appTextSecondary hover:text-appTextPrimary'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <Button
            variant="primary"
            size="sm"
            onClick={startNewDocument}
            id="dash-create-doc"
            className="flex items-center gap-1 !rounded-none shadow-none flex-shrink-0 ml-auto"
          >
            <Plus size={14} />
          </Button>
        </div>

        <main className="flex-1 w-full px-6 py-5">
          <Outlet />
        </main>
      </div>

      <UpgradeModal />
    </div>
  );
};

export default DashboardLayout;
