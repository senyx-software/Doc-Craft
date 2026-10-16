import { getErrorMessage } from '../../store/toastStore';
import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X, Mail } from 'lucide-react';
import Button from './Button';
import Input from './Input';
import { useTotpPromptStore } from '../../store/totpPromptStore';
import { adminApiClient } from '../../api/adminApiClient';

/**
 * TotpPromptModal — mounted once (App.tsx). Renders whenever any sensitive
 * admin action gets a 403 TOTP_REQUIRED back from the API, collects the
 * 6-digit code, and hands it to adminApiClient to retry the original request.
 * On a wrong/expired code the request comes back with TOTP_REQUIRED again,
 * which re-opens this same modal with an error shown — no extra wiring
 * needed at the call site either way.
 *
 * The code can come from either an authenticator app OR an emailed code
 * (the "Send code via email" button here) — the backend's require_totp_2fa
 * accepts either, mirroring how /login already accepts either alongside a
 * password. This matters for any admin who hasn't set up (or doesn't want)
 * an authenticator app.
 */
const TotpPromptModal: React.FC = () => {
  const { isOpen, errorMessage, submit, cancel } = useTotpPromptStore();
  const [code, setCode] = useState('');
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [emailSentMessage, setEmailSentMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timeout);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 6) return;
    submit(trimmed);
  };

  const handleSendEmailCode = async () => {
    setIsSendingEmailCode(true);
    setEmailSentMessage(null);
    try {
      const res = await adminApiClient.requestActionCode();
      setEmailSentMessage(res?.message || 'A 6-digit code has been sent to your email.');
    } catch (err) {
      setEmailSentMessage(getErrorMessage(err) || 'Failed to send email code. Please try again.');
    } finally {
      setIsSendingEmailCode(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fadeIn bg-black/40" onClick={cancel}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#181a20] border border-gray-200 dark:border-white/10 rounded-md p-6 shadow-2xl space-y-4 text-left"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-purple-50 dark:bg-purple-500/10 border border-purple-200/50 dark:border-purple-500/20">
              <ShieldCheck className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                2FA Verification Required
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sensitive operation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
          This action requires a fresh code from your authenticator app, or an emailed code.
        </p>

        <Input
          ref={inputRef}
          label="6-Digit Code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          error={errorMessage || undefined}
        />

        <div>
          <button
            type="button"
            onClick={handleSendEmailCode}
            disabled={isSendingEmailCode}
            className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mail size={13} /> {isSendingEmailCode ? 'Sending...' : "Don't have an authenticator app? Send code via email"}
          </button>
          {emailSentMessage && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{emailSentMessage}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={code.trim().length < 6}>
            Verify & Continue
          </Button>
        </div>
      </form>
    </div>
  );
};

export default function TotpPrompt() {
  const isOpen = useTotpPromptStore(state => state.isOpen);
  return isOpen ? <TotpPromptModal /> : null;
}
