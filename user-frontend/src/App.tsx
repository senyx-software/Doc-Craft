import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import { useChatStore } from './store/chatStore';
import { useDocumentStore } from './store/documentStore';
import Navbar from './components/common/Navbar';
import Announcements from './components/common/Announcements';
import ProtectedRoute from './middleware/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PasswordResetPage from './pages/PasswordResetPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import BuilderPage from './pages/BuilderPage';
import PricingPage from './pages/PricingPage';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardOverviewPage from './pages/dashboard/DashboardOverviewPage';
import DashboardProfileSettingsPage from './pages/dashboard/DashboardProfileSettingsPage';
import DashboardHistoryPage from './pages/dashboard/DashboardHistoryPage';
import DashboardBillingPage from './pages/dashboard/DashboardBillingPage';
import DashboardSupportPage from './pages/dashboard/DashboardSupportPage';
import BackgroundEffects from './components/common/BackgroundEffects';

import GuestRoute from './middleware/GuestRoute';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import { usePageDurationTracking } from './hooks/usePageDurationTracking';

function App() {
  const { checkAuth } = useAuthStore();
  const location = useLocation();
  usePageDurationTracking();

  useEffect(() => useAuthStore.subscribe((next, previous) => {
    if (next.user?.user_id !== previous.user?.user_id) {
      useChatStore.getState().resetChat();
      useDocumentStore.getState().resetDocument();
    }
  }), []);

  // Check for existing auth token on mount
  useEffect(() => {
    if(window.location.pathname!=='/oauth-callback') void checkAuth();
  }, [checkAuth]);


  return (
    <div className="min-h-screen bg-appBg text-appTextPrimary relative transition-colors duration-200">
      <BackgroundEffects />
      <Navbar />
      <Announcements />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />
          <Route path="/verify-email" element={<VerifyEmailPage key={location.search} />} />
          <Route path="/password-reset" element={<PasswordResetPage key={location.search} />} />
          <Route path="/reset-password" element={<PasswordResetPage key={location.search} />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route
            path="/builder"
            element={
              <ProtectedRoute>
                <BuilderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardOverviewPage />} />
            <Route path="profile" element={<DashboardProfileSettingsPage />} />
            <Route path="document-history" element={<DashboardHistoryPage />} />
            <Route path="billing" element={<DashboardBillingPage />} />
            <Route path="support" element={<DashboardSupportPage />} />
          </Route>
          {/* Profile & Settings now lives at /dashboard/profile instead of
              its own top-level route — redirect any old links here. */}
          <Route path="/profile" element={<Navigate to="/dashboard/profile" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}

export default App;
