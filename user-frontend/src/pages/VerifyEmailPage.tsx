import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle, AlertTriangle, ArrowLeft, RefreshCw, KeyRound } from 'lucide-react';
import * as authApi from '../api/auth';
import LoadingSpinner from '../components/ui/Spinner';
import SplitAuthLayout from '../components/layout/SplitAuthLayout';

const fieldClass =
  'w-full pl-10 pr-4 py-2.5 bg-appBg border border-brand-400/50 rounded-none text-sm text-appTextPrimary ' +
  'placeholder:text-appTextSecondary/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-colors shadow-sm dark:shadow-none';

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const initialEmail = searchParams.get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');



  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setInfoMessage('');

    if (!email) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!code || code.trim().length < 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.verifyEmail(email.trim(), code.trim());
      setSuccessMessage(res.message || 'Email successfully verified. You can now log in!');

      // Automatically redirect to login page after 2.5 seconds
      setTimeout(() => {
        navigate(`/login?email=${encodeURIComponent(email)}`, { state: location.state });
      }, 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed. Please check your code and try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setErrorMessage('Please enter your email address to resend the code.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setInfoMessage('');
    setIsResending(true);

    try {
      const res = await authApi.resendVerification(email.trim());
      setInfoMessage(res.message || 'A new 6-digit verification code has been sent to your email.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SplitAuthLayout
      id="verify-email-page"
      leftHeading="Verify Your Email"
      rightHeading={<><span className="text-brand-400">Verify</span> Code</>}
      rightSubheading="Enter the 6-digit verification code sent to your email address."
      footer={
        <p className="text-center text-body-sm text-appTextSecondary/70">
          <Link to="/login" state={location.state} className="text-brand-400 hover:text-brand-300 font-medium transition-colors flex items-center justify-center gap-1.5">
            <ArrowLeft size={14} /> Back to Sign In
          </Link>
        </p>
      }
    >
      {/* Success Alert */}
      {successMessage && (
        <div className="mb-5 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-body-sm flex items-start gap-2.5 rounded-none" id="verify-success">
          <CheckCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{successMessage}</p>
            <p className="text-xs mt-1 opacity-90">Redirecting you to the sign-in page in a moment...</p>
          </div>
        </div>
      )}

      {/* Info Alert (Resend success) */}
      {infoMessage && (
        <div className="mb-5 p-3 bg-brand-400/10 border border-brand-400/30 text-brand-400 text-body-sm flex items-start gap-2 rounded-none" id="verify-info">
          <Mail size={16} className="mt-0.5 shrink-0" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-5 p-3.5 bg-danger/10 border border-danger/20 text-danger text-body-sm flex items-start gap-2.5 rounded-none" id="verify-error">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="mt-2 text-xs font-semibold underline hover:no-underline flex items-center gap-1"
            >
              {isResending ? <LoadingSpinner size="sm" /> : <><RefreshCw size={12} /> Resend verification code</>}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label htmlFor="verify-email-input" className="field-label">Email Address</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Mail size={16} className="text-appTextSecondary/70" />
            </div>
            <input
              id="verify-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="verify-code-input" className="field-label">6-Digit Verification Code</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <KeyRound size={16} className="text-appTextSecondary/70" />
            </div>
            <input
              id="verify-code-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              required
              maxLength={6}
              className={`${fieldClass} tracking-widest font-mono text-base font-semibold`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !!successMessage}
          id="verify-submit"
          className="w-full py-2.5 bg-appPrimary text-white text-sm font-semibold rounded-none
                     hover:bg-appPrimary/90 transition-colors flex items-center justify-center gap-2
                     disabled:opacity-50 disabled:cursor-not-allowed shadow-md dark:shadow-none"
        >
          {isLoading ? <LoadingSpinner size="sm" /> : 'Verify Code'}
        </button>

        <div className="pt-2 flex items-center justify-between text-xs text-appTextSecondary/80">
          <span>Didn't receive the code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="text-brand-400 hover:text-brand-300 font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {isResending ? <LoadingSpinner size="sm" /> : <><RefreshCw size={12} /> Resend Code</>}
          </button>
        </div>
      </form>
    </SplitAuthLayout>
  );
};

export default VerifyEmailPage;
