import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, Check, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/ui/Spinner';
import SplitAuthLayout from '../components/layout/SplitAuthLayout';
import * as authApi from '../api/auth';
import { postAuthDestination } from '../utils/authRedirect';

const fieldClass =
  'w-full pl-10 pr-4 py-2.5 bg-appBg border border-brand-400/50 rounded-none text-sm text-appTextPrimary ' +
  'placeholder:text-appTextSecondary/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-colors shadow-sm dark:shadow-none';

const RegisterPage: React.FC = () => {
  const { register, googleAuth, isLoading, error, clearError, isAuthenticated, isGuest } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = postAuthDestination(location.state);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogle = async () => {
    setLocalError('');
    const result = await googleAuth();
    if (result.requires2FA) navigate('/login', { state: location.state });
  };

  useEffect(() => {
    clearError();
    if (isAuthenticated && !isGuest) {
      navigate(from, { replace: true });
    }
  }, [clearError, isAuthenticated, isGuest, navigate, from]);

  // UI Password Complexity Checks
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!fullName.trim()) {
      setLocalError('Please enter your full name.');
      return;
    }
    if (!hasMinLength) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }
    if (!hasUpper || !hasLower || !hasNumberOrSymbol) {
      setLocalError('Password must contain uppercase, lowercase, and numbers/symbols.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(email.trim(), password, fullName.trim());
      navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`, { state: location.state });
    } catch (err: unknown) {
      setIsSubmitting(false);
      const errMsg = err instanceof Error ? err.message.toLowerCase() : '';
      if (errMsg.includes('already exists') || errMsg.includes('already registered')) {
        authApi.resendVerification(email.trim()).catch(() => {});
        navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`, { state: location.state });
      }
    }
  };

  const displayError = localError || error;

  return (
    <SplitAuthLayout
      id="register-page"
      leftHeading="Join DocCraft"
      rightHeading={<><span className="text-brand-400">Sign Up</span> to continue</>}
      rightSubheading="Start creating professional documents for free."
      footer={
        <p className="text-center text-body-sm text-appTextSecondary/70">
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      }
    >
      {displayError && (
        <div className="mb-5 p-3.5 bg-danger/10 border border-danger/20 text-danger text-body-sm flex items-start gap-2.5 rounded-none" id="register-error">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name Field */}
        <div>
          <label htmlFor="register-fullname" className="field-label">Full Name</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <User size={16} className="text-appTextSecondary/70" />
            </div>
            <input
              id="register-fullname"
              type="text"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); clearError(); setLocalError(''); }}
              placeholder="Eranda Abewardhana"
              required
              className={fieldClass}
            />
          </div>
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="register-email" className="field-label">Email Address</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Mail size={16} className="text-appTextSecondary/70" />
            </div>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); setLocalError(''); }}
              placeholder="you@email.com"
              required
              className={fieldClass}
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="register-password" className="field-label">Password</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Lock size={16} className="text-appTextSecondary/70" />
            </div>
            <input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLocalError(''); }}
              placeholder="Min. 8 characters with Aa & 123"
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

          {/* Password Strength Validation Rules Indicator */}
          {password.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-appTextSecondary/80">
              <span className={`flex items-center gap-1 ${hasMinLength ? 'text-emerald-500 font-medium' : ''}`}>
                {hasMinLength ? <Check size={12} /> : '•'} At least 8 characters
              </span>
              <span className={`flex items-center gap-1 ${hasUpper ? 'text-emerald-500 font-medium' : ''}`}>
                {hasUpper ? <Check size={12} /> : '•'} Uppercase letter (A-Z)
              </span>
              <span className={`flex items-center gap-1 ${hasLower ? 'text-emerald-500 font-medium' : ''}`}>
                {hasLower ? <Check size={12} /> : '•'} Lowercase letter (a-z)
              </span>
              <span className={`flex items-center gap-1 ${hasNumberOrSymbol ? 'text-emerald-500 font-medium' : ''}`}>
                {hasNumberOrSymbol ? <Check size={12} /> : '•'} Number or symbol
              </span>
            </div>
          )}
        </div>

        {/* Confirm Password Field */}
        <div>
          <label htmlFor="register-confirm" className="field-label">Confirm Password</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Lock size={16} className="text-appTextSecondary/70" />
            </div>
            <input
              id="register-confirm"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setLocalError(''); }}
              placeholder="••••••••"
              required
              className={`${fieldClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-appTextSecondary/70 hover:text-appTextSecondary"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Password Comparison Indicator */}
          {confirmPassword.length > 0 && (
            <div className="mt-1 flex items-center gap-1 text-[11px]">
              {passwordsMatch ? (
                <span className="text-emerald-500 font-medium flex items-center gap-1">
                  <Check size={12} /> Passwords match
                </span>
              ) : (
                <span className="text-danger flex items-center gap-1">
                  • Passwords do not match
                </span>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || isSubmitting}
          id="register-submit"
          className="w-full py-2.5 bg-appPrimary text-white text-sm font-semibold rounded-none
                     hover:bg-appPrimary/90 transition-colors flex items-center justify-center gap-2
                     disabled:opacity-80 disabled:cursor-not-allowed shadow-md dark:shadow-none"
        >
          {isLoading || isSubmitting ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Creating Account...</span>
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </form>

      <div className="relative flex items-center justify-center my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-appBorder" />
        </div>
        <span className="relative bg-appBg px-3 text-body-xs text-appTextSecondary/70 uppercase tracking-wider">
          Or continue with
        </span>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        id="register-google"
        className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold
                   rounded-none hover:bg-gray-50 transition-colors flex items-center justify-center gap-2.5"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign up with Google
      </button>
    </SplitAuthLayout>
  );
};

export default RegisterPage;
