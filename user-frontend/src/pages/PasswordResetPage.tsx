import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/ui/Spinner';
import SplitAuthLayout from '../components/layout/SplitAuthLayout';

// Same compact, sharp-cornered field treatment as Login/Register.
const fieldClass =
  'w-full pl-10 pr-4 py-2.5 bg-appBg border border-brand-400/50 rounded-none text-sm text-appTextPrimary ' +
  'placeholder:text-appTextSecondary/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-colors shadow-sm dark:shadow-none';

const PasswordResetPage: React.FC = () => {
  const { passwordReset, confirmPasswordReset, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  // Reset password token form state
  const [token] = useState(() => new URLSearchParams(location.search).get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isResetStep] = useState(() => Boolean(new URLSearchParams(location.search).get('token')));
  const [localError, setLocalError] = useState<string | null>(null);



  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const msg = await passwordReset(email);
      setMessage(msg);
      setSent(true);
    } catch {
      // Error displayed via store
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setLocalError('Invalid or missing password reset token. Please request a new link from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    setLocalError(null);

    try {
      await confirmPasswordReset(token, newPassword);
      navigate('/login', { replace: true });
    } catch {
      // Fall back to login page on success or error
      navigate('/login', { replace: true });
    }
  };

  return (
    <SplitAuthLayout
      id="password-reset-page"
      leftHeading="Forgot your password?"
      rightHeading={
        isResetStep ? (
          <><span className="text-brand-400">Set New</span> Password</>
        ) : sent ? (
          'Check your email'
        ) : (
          <><span className="text-brand-400">Reset</span> password</>
        )
      }
      rightSubheading={
        isResetStep
          ? "Create a new secure password for your account."
          : sent
          ? undefined
          : "Enter your email and we'll send you a reset link."
      }
      footer={
        <Link
          to="/login"
          className="flex items-center justify-center gap-1.5 text-body-sm text-appTextSecondary/70 hover:text-appTextSecondary transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Sign In
        </Link>
      }
    >
      {isResetStep ? (
        <form onSubmit={handleNewPasswordSubmit} className="space-y-4">
          {(error || localError) && (
            <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-body-sm flex items-start gap-2 rounded-none">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{localError || error}</span>
            </div>
          )}

          <div>
            <label className="field-label">New Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock size={16} className="text-appTextSecondary/70" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); clearError(); setLocalError(null); }}
                placeholder="••••••••"
                required
                minLength={8}
                className={`${fieldClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-appTextSecondary/70 hover:text-appTextSecondary"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="field-label">Confirm New Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock size={16} className="text-appTextSecondary/70" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setLocalError(null); }}
                placeholder="••••••••"
                required
                minLength={8}
                className={fieldClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            id="update-password-submit"
            className="w-full py-2.5 bg-appPrimary text-white text-sm font-semibold rounded-none
                       hover:bg-appPrimary/90 transition-colors flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-md dark:shadow-none"
          >
            {isLoading ? <LoadingSpinner size="sm" /> : 'Save New Password & Sign In'}
          </button>
        </form>
      ) : sent ? (
        <div className="space-y-5 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-success" />
          </div>
          <p className="text-body-sm text-appTextSecondary leading-relaxed">
            {message || 'A password reset link has been sent to your email address. Please check your inbox and click the link to reset your password.'}
          </p>
        </div>
      ) : (
        <form onSubmit={handleRequestSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-body-sm flex items-start gap-2 rounded-none">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="reset-email" className="field-label">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail size={16} className="text-appTextSecondary/70" />
              </div>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                placeholder="you@email.com"
                required
                className={fieldClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            id="reset-submit"
            className="w-full py-2.5 bg-appPrimary text-white text-sm font-semibold rounded-none
                       hover:bg-appPrimary/90 transition-colors flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-md dark:shadow-none"
          >
            {isLoading ? <LoadingSpinner size="sm" /> : 'Send Reset Link'}
          </button>
        </form>
      )}
    </SplitAuthLayout>
  );
};

export default PasswordResetPage;
