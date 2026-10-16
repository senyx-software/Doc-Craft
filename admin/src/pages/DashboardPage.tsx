import React, { useState } from 'react';
import { RefreshCw, LayoutDashboard, AlertTriangle } from 'lucide-react';

class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; viewName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; viewName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ViewErrorBoundary caught exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-lg mx-auto bg-rose-500/10 border border-rose-500/20 rounded-lg text-left shadow-lg mt-6">
          <div className="flex items-center gap-2 text-rose-500 mb-2 font-bold text-sm">
            <AlertTriangle size={18} /> View Render Error ({this.props.viewName})
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 font-mono bg-black/10 dark:bg-white/5 p-3 rounded mb-4 overflow-x-auto">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded transition-colors"
          >
            Retry View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Subview Imports
import HomeView from './subviews/HomeView';
import UsersView from './subviews/UsersView';
import SubscriptionsView from './subviews/SubscriptionsView';
import RevenueView from './subviews/RevenueView';
import GenerationsView from './subviews/GenerationsView';
import AnalyticsView from './subviews/AnalyticsView';
import SecurityView from './subviews/SecurityView';
import PromotionsView from './subviews/PromotionsView';
import PackagesView from './subviews/PackagesView';
import NotificationsView from './subviews/NotificationsView';
import DocumentsView from './subviews/DocumentsView';
import InfrastructureView from './subviews/InfrastructureView';
import SupportView from './subviews/SupportView';
import SettingsView from './subviews/SettingsView';
import CostLedgerView from './subviews/CostLedgerView';
import ConfigView from './subviews/ConfigView';
import AutomationsView from './subviews/AutomationsView';

interface DashboardPageProps {
  activeSection: string;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ activeSection }) => {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const formatSectionName = (sec: string) => {
    if (sec === 'home_dashboard') return 'Dashboard';
    if (sec === 'inf_api_usage') return 'API Usage & Provider Limits';
    const prefixMap: Record<string, string> = {
      'not': 'Notification',
      'subs': 'Subscription',
      'rev': 'Revenue',
      'gen': 'Generation',
      'an': 'Analytics',
      'sec': 'Security',
      'promo': 'Promotions',
      'pack': 'Package',
      'doc': 'Document',
      'inf': 'Infrastructure',
      'sup': 'Support',
      'set': 'Settings'
    };
    return sec.split('_').map(word => prefixMap[word] || (word.charAt(0).toUpperCase() + word.slice(1))).join(' ');
  };

  const renderContent = () => {
    if (activeSection === 'rev_cost_ledger') {
      return <CostLedgerView activeSubItem={activeSection} />;
    }
    if (activeSection === 'set_dynamic_config') {
      return <ConfigView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('home_')) {
      return <HomeView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('users_')) {
      return <UsersView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('subs_')) {
      return <SubscriptionsView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('rev_')) {
      return <RevenueView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('gen_')) {
      return <GenerationsView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('an_')) {
      return <AnalyticsView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('sec_')) {
      return <SecurityView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('promo_')) {
      return <PromotionsView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('pack_')) {
      return <PackagesView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('not_')) {
      // Automation subviews are served by AutomationsView
      if (
        activeSection === 'not_automation' ||
        activeSection === 'not_execution_logs' ||
        activeSection === 'not_emit_events'
      ) {
        return <AutomationsView activeSubItem={activeSection} />;
      }
      return <NotificationsView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('doc_')) {
      return <DocumentsView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('inf_')) {
      return <InfrastructureView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('sup_')) {
      return <SupportView activeSubItem={activeSection} />;
    }
    if (activeSection.startsWith('set_')) {
      return <SettingsView activeSubItem={activeSection} />;
    }
    return <HomeView activeSubItem="home_dashboard" />;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-neutral-950">
      {/* Top Header Bar */}
      <header className="h-12 border-b border-gray-200/60 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl flex items-center justify-between px-6 z-10 flex-shrink-0 text-left">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider">
            Control Plane
          </span>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
            <LayoutDashboard size={14} className="text-purple-600 dark:text-purple-400" />
            {formatSectionName(activeSection)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {activeSection !== 'inf_api_usage' && <button
            onClick={() => setRefreshVersion(version => version + 1)}
            className="px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 transition-colors flex items-center gap-1.5 font-semibold text-[11px]"
          >
            <RefreshCw size={12} className="text-purple-600 dark:text-purple-400" />
            Refresh Telemetry
          </button>}
        </div>
      </header>

      {/* Main Page Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {formatSectionName(activeSection)}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
              {activeSection === 'inf_api_usage' ? 'DocCraft allowances and provider-managed token and request limits.' : 'Real-time administrative telemetry and control center.'}
            </p>
          </div>
        </div>

        <div className="transition-all duration-300">
          <ViewErrorBoundary key={`${activeSection}:${refreshVersion}`} viewName={activeSection}>
            {renderContent()}
          </ViewErrorBoundary>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
