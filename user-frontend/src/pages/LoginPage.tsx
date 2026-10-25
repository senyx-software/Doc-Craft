import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/ui/Spinner';
import SplitAuthLayout from '../components/layout/SplitAuthLayout';
import { postAuthDestination } from '../utils/authRedirect';

// Compact, sharp-cornered field — deliberately not the app's usual
// fully-rounded `.input-field` pill, per the "Esri login form" reference:
// zero border-radius and a shorter height than the rest of the app's inputs.
const fieldClass =
  'w-full pl-10 pr-4 py-2.5 bg-appBg border border-brand-400/50 rounded-none text-sm text-appTextPrimary ' +
  'placeholder:text-appTextSecondary/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-colors shadow-sm dark:shadow-none';

import * as authApi from '../api/auth';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

import { useLocation } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const { login, login2FA, guestLogin, googleAuth, isLoading, error, clearError, isAuthenticated, isInitializing, isGuest } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = postAuthDestination(location.state);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [step, setStep] = useState<'credentials' | '2fa'>(() => useAuthStore.getState().mfaToken ? '2fa' : 'credentials');
  const [expiredNotice] = useState(() => new URLSearchParams(location.search).get('expired') === 'true');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);

  const handleGoogle = async () => {
    const result = await googleAuth();
    if (result.requires2FA) setStep('2fa');
  };

  useEffect(() => {
    clearError();
  }, [clearError]);

  // Navigate away as soon as auth state becomes true (handles login + 2FA)
  useEffect(() => {
    if (isAuthenticated && !isInitializing && !isGuest) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isInitializing, isGuest, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    try {
      if (step === '2fa') {
        await login2FA(totpCode);
        return;
      }

      const res = await login(email, password);
      if (res?.requires2FA) {
        setStep('2fa');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message.toLowerCase() : '';
      if (errMsg.includes('verify') || errMsg.includes('verification')) {
        authApi.resendVerification(email).catch(() => {});
        navigate(`/verify-email?email=${encodeURIComponent(email)}`, { state: location.state });
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGuest = async () => {
    setIsGuestSubmitting(true);
    try {
      await guestLogin();
    } catch {
      // Guest authentication failures remain visible; never silently create a demo identity.
    } finally {
      setIsGuestSubmitting(false);
    }
  };

  return (
    <SplitAuthLayout
      id="login-page"
      leftHeading="Welcome back!"
      rightHeading={<><span className="text-brand-400">Log In</span> to continue</>}
      rightSubheading="Enter your details to keep building documents."
      footer={
        <p className="text-center text-body-sm text-appTextSecondary/70">
          Don't have an account?{' '}
          <Link to="/register" state={location.state} className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            Sign up
          </Link>
        </p>
      }
    >
      {expiredNotice && (
        <div className="mb-5 p-3.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-body-sm flex items-start gap-2.5 rounded-none">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Your session has expired.</p>
            <p className="text-xs opacity-90">Please sign in again to continue working on your documents.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 p-3.5 bg-danger/10 border border-danger/20 text-danger text-body-sm flex items-start gap-2.5 rounded-none">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            {error.toLowerCase().includes('verify') && (
              <button
                type="button"
                onClick={() => navigate(`/verify-email?email=${encodeURIComponent(email)}`, { state: location.state })}
                className="mt-2 text-xs font-semibold text-brand-400 hover:underline flex items-center gap-1"
              >
                Go to Email Verification Page &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {step === '2fa' ? (
          <div className="space-y-4">
            <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-none text-body-xs text-brand-300 flex items-center gap-2">
              <ShieldCheck size={18} className="shrink-0" />
              <span>Two-Factor Authentication is enabled for your account. Please enter your 6-digit TOTP code.</span>
            </div>

            <div>
              <label className="field-label">Authenticator Code</label>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => {
                  setTotpCode(e.target.value.replace(/[^0-9]/g, ''));
                  if (error) clearError();
                }}
                className={`${fieldClass} text-center font-mono text-lg tracking-widest pl-4`}
                placeholder="000000"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length < 6}
              id="login-2fa-submit"
              className="w-full py-2.5 bg-appPrimary text-white text-sm font-semibold rounded-none
                         hover:bg-appPrimary/90 transition-colors flex items-center justify-center gap-2
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-md dark:shadow-none"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : 'Verify Code & Sign In'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setTotpCode(''); clearError(); }}
              className="w-full py-1.5 text-xs text-appTextSecondary hover:text-appTextPrimary transition-colors flex items-center justify-center gap-1"
            >
              <ArrowLeft size={12} /> Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <div>
              <label className="field-label">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail size={16} className="text-appTextSecondary/70" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) clearError();
                  }}
                  className={fieldClass}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="field-label">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={16} className="text-appTextSecondary/70" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) clearError();
                  }}
                  className={`${fieldClass} pr-10`}
                  placeholder="••••••••"
                  required
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
              <div className="flex justify-end mt-1.5">
                <Link to="/password-reset" className="text-body-xs text-brand-400 hover:text-brand-300">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || isSigningIn || isGuestSubmitting}
              id="login-submit"
              className="w-full py-2.5 bg-appPrimary text-white text-sm font-semibold rounded-none
                         hover:bg-appPrimary/90 transition-colors flex items-center justify-center gap-2
                         disabled:opacity-80 disabled:cursor-not-allowed shadow-md dark:shadow-none"
            >
              {isLoading || isSigningIn ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </>
        )}
      </form>

      <div className="relative flex items-center justify-center my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-appBorder" />
        </div>
        <span className="relative bg-appBg px-3 text-body-xs text-appTextSecondary/70 uppercase tracking-wider">
          Or continue with
        </span>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading || isSigningIn || isGuestSubmitting}
          className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold
                     rounded-none hover:bg-gray-50 transition-colors flex items-center justify-center gap-2.5 disabled:opacity-75"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <button
          type="button"
          onClick={handleGuest}
          disabled={isLoading || isSigningIn || isGuestSubmitting}
          id="login-guest"
          className="w-full py-2.5 bg-appSurface border border-appBorder text-appTextPrimary text-sm font-semibold
                     rounded-none hover:bg-appBorder/40 transition-colors flex items-center justify-center gap-2.5 disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {isGuestSubmitting ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Connecting as Guest...</span>
            </>
          ) : (
            <>
              <User size={16} />
              Continue as Guest
            </>
          )}
        </button>
      </div>
    </SplitAuthLayout>
  );
};

export default LoginPage;
