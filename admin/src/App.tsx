import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useThemeStore } from './store/themeStore';
import { useAdminAuthStore } from './store/adminAuthStore';
import AdminSidebar from './components/AdminSidebar';
import DashboardPage from './pages/DashboardPage';
import UserDetailPage from './pages/UserDetailPage';
import AdminNavbar from './components/common/AdminNavbar';
import AdminTopbar from './components/common/AdminTopbar';
import ToastContainer from './components/common/ToastContainer';
import TotpPromptModal from './components/ui/TotpPromptModal';
import { toast } from './store/toastStore';
import SplitAuthLayout from './components/layout/SplitAuthLayout';
import Card from './components/ui/Card';
import Button from './components/ui/Button';
import Input from './components/ui/Input';
import {
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowLeft,
  Key,
  AlertTriangle
} from 'lucide-react';

const fieldClass =
  'w-full pl-10 pr-4 py-2.5 bg-white dark:bg-white/5 border border-purple-500/30 dark:border-white/10 rounded-md text-sm text-gray-900 dark:text-white ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all shadow-sm';

// Sidebar + topbar shell, shared by both the section-browsing route and the
// user-detail route so navigation and chrome stay identical either way.
const AuthenticatedShell: React.FC = () => {
  const navigate = useNavigate();
  const { section, userId } = useParams();
  const activeSection = userId ? 'users_all' : (section || 'home_dashboard');
  const onSelect = (id: string) => navigate(`/${id}`);

  return (
    <div className="h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white flex flex-col overflow-hidden transition-colors duration-200 font-sans">
      <AdminTopbar onSelect={onSelect} />
      <div className="flex-1 flex overflow-hidden">
        <AdminSidebar activeItem={activeSection} onSelect={onSelect} />
        {userId ? (
          <UserDetailPage userId={userId} onBack={() => navigate('/users_all')} />
        ) : (
          <DashboardPage activeSection={activeSection} />
        )}
      </div>
    </div>
  );
};

function App() {
  const theme = useThemeStore((state) => state.theme);
  const { isAuthenticated, loginWithApi, forgotPasswordApi, resetPasswordApi, validateToken } = useAdminAuthStore();

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2FA Verification Step Modal state
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [forgotEmail, setForgotEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Validate token on mount / route change
  useEffect(() => {
    if (isAuthenticated && validateToken) {
      validateToken();
    }
  }, [isAuthenticated, validateToken]);

  // Sync theme to root class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setTotpError(null);
    setIsSubmitting(true);

    const result = await loginWithApi(email, password);
    setIsSubmitting(false);

    if (!result.success) {
      setLoginError(result.message || 'Invalid email or password');
    } else if (result.requiresTotp) {
      setShowTotpModal(true);
    }
  };

  const handleVerify2FACode = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError(null);
    setIsSubmitting(true);

    const result = await loginWithApi(email, password, totpCode);
    setIsSubmitting(false);

    if (result.success) {
      setShowTotpModal(false);
      setTotpCode('');
      setTotpError(null);
    } else {
      setTotpError(result.message || 'Invalid or expired 6-digit verification code. Please try again.');
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalMessage(null);
    setIsSubmitting(true);

    const res = await forgotPasswordApi(forgotEmail);
    setIsSubmitting(false);

    if (res.success) {
      setModalMessage(res.message);
      setForgotStep('reset');
    } else {
      setModalError(res.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalMessage(null);
    setIsSubmitting(true);

    const res = await resetPasswordApi(forgotEmail, verificationCode, newPassword);
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Password Reset', 'You can now log in with your new password.');
      setShowForgotModal(false);
      setPassword(newPassword);
      setEmail(forgotEmail);
      setForgotStep('request');
      setVerificationCode('');
      setNewPassword('');
    } else {
      setModalError(res.message);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white relative font-sans">
        <ToastContainer />
        <AdminNavbar />

        <SplitAuthLayout
          id="admin-login-page"
          leftHeading="Welcome back!"
          rightHeading={<><span className="text-purple-600 dark:text-purple-400">Log In</span> to continue</>}
          rightSubheading="Enter your details to manage platform documents & infrastructure."
          footer={
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              Need administrator access?{' '}
              <button
                type="button"
                onClick={() => toast.info('Need Administrator Access?', 'Contact tech@senyxsoftware.com for role assignment.')}
                className="text-purple-600 dark:text-purple-400 hover:underline font-bold"
              >
                Contact Super Admin
              </button>
            </p>
          }
        >
          {loginError && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5 rounded-md font-medium">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">{loginError}</div>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className={`${fieldClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setShowForgotModal(true);
                  }}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              id="admin-login-submit"
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-md
                         transition-colors flex items-center justify-center gap-2
                         disabled:opacity-80 disabled:cursor-not-allowed shadow-md"
            >
              {isSubmitting ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </SplitAuthLayout>

        {/* 2FA Verification Modal */}
        {showTotpModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-6 text-left border-gray-200 dark:border-white/10 relative shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between mb-4 border-b border-gray-200/60 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Key size={20} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">2FA Security Validation</h3>
                </div>
                <button
                  onClick={() => setShowTotpModal(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                Two-Factor Authentication is enabled for your account. Please enter the 6-digit code from your authenticator app.
              </p>

              {totpError && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 rounded-md font-medium animate-fade-in">
                  <AlertTriangle size={16} className="shrink-0 text-rose-500" />
                  <span>{totpError}</span>
                </div>
              )}

              <form onSubmit={handleVerify2FACode} className="space-y-4">
                <div>
                  <label className="block text-[10px] text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wider mb-1.5">
                    Enter 6-Digit Code
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                    maxLength={6}
                    placeholder="e.g. 123456"
                    className="input-field text-center font-mono text-base tracking-widest"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-1/3"
                    onClick={() => setShowTotpModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="violet" className="w-2/3" disabled={isSubmitting}>
                    {isSubmitting ? 'Verifying...' : 'Verify Code & Sign In'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Forgot Password Modal */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-6 text-left border-gray-200 dark:border-white/10 relative shadow-2xl animate-fade-in">
              <div className="flex items-center justify-between mb-4 border-b border-gray-200/60 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound size={18} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Password Recovery</h3>
                </div>
                <button
                  onClick={() => setShowForgotModal(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-md mb-4 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {modalError}
                </div>
              )}

              {modalMessage && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md mb-4 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-2">
                  <CheckCircle size={14} />
                  <span>{modalMessage}</span>
                </div>
              )}

              {forgotStep === 'request' ? (
                <form onSubmit={handleRequestCode} className="space-y-4">
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Enter your administrator email address below. A 6-digit email verification code will be dispatched to reset your password.
                  </p>
                  <Input
                    label="Administrator Email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    placeholder="admin@doccraft.app"
                  />
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-1/2"
                      onClick={() => setShowForgotModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="violet" className="w-1/2" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending...' : 'Send Code'}
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    Enter the 6-digit verification code sent to <strong className="text-gray-900 dark:text-white">{forgotEmail}</strong> and your new password.
                  </p>
                  <Input
                    label="6-Digit Verification Code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    required
                    maxLength={6}
                    placeholder="e.g. 654321"
                  />
                  <Input
                    label="New Account Password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Minimum 6 characters"
                  />
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-1/3 flex items-center justify-center gap-1"
                      onClick={() => setForgotStep('request')}
                    >
                      <ArrowLeft size={12} /> Back
                    </Button>
                    <Button type="submit" variant="violet" className="w-2/3" disabled={isSubmitting}>
                      {isSubmitting ? 'Resetting...' : 'Reset Password'}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      <TotpPromptModal />
      <Routes>
        <Route path="/users/:userId" element={<AuthenticatedShell />} />
        <Route path="/:section?" element={<AuthenticatedShell />} />
      </Routes>
    </>
  );
}

export default App;
