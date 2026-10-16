import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, ShieldCheck, ShieldAlert, QrCode, Key, Copy, Check, Lock, X
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import * as authApi from '../../api/auth';
import Card from '../ui/Card';
import Button from '../ui/Button';

interface ProfileSecurityCardProps {
  // See ProfileIdentityCard — 'flat' matches the dashboard Overview page's
  // sharp-cornered, bordered panel style instead of ProfilePage's rounded
  // Card design, so the two don't clash when shown together on Overview.
  variant?: 'card' | 'flat';
}

// Extracted from ProfilePage so the exact same 2FA setup/disable card (with
// its modals) can be reused inside the dashboard Overview page without
// duplicating the TOTP enroll/verify/disable logic in two places.
const ProfileSecurityCard: React.FC<ProfileSecurityCardProps> = ({ variant = 'card' }) => {
  const isFlat = variant === 'flat';
  const { user, setUser } = useAuthStore();

  const [is2FASetupOpen, setIs2FASetupOpen] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpInput, setTotpInput] = useState('');
  const [is2FAProcessing, setIs2FAProcessing] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState(false);

  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [disableTotpInput, setDisableTotpInput] = useState('');

  const is2FAEnabled = Boolean(user?.twoFactorEnabled);

  const handleInitiate2FA = async () => {
    setIs2FAProcessing(true);
    setTwoFactorMessage(null);
    try {
      const res = await authApi.enable2FA();
      setTotpSecret(res.secret);
      setQrCodeUrl(res.qrCodeUrl || res.qrCode || '');
      setIs2FASetupOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate 2FA secret.';
      setTwoFactorMessage({ text: msg, type: 'error' });
    } finally {
      setIs2FAProcessing(false);
    }
  };

  const handleVerifyAndEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpInput.trim()) return;

    setIs2FAProcessing(true);
    setTwoFactorMessage(null);
    try {
      await authApi.verify2FA(totpInput.trim());
      setUser({ ...user!, twoFactorEnabled: true });
      setIs2FASetupOpen(false);
      setTotpInput('');
      setTwoFactorMessage({ text: 'Two-Factor Authentication enabled successfully!', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid verification code.';
      setTwoFactorMessage({ text: msg, type: 'error' });
    } finally {
      setIs2FAProcessing(false);
    }
  };

  const handleConfirmDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableTotpInput.trim()) return;

    setIs2FAProcessing(true);
    setTwoFactorMessage(null);
    try {
      await authApi.disable2FA(disableTotpInput.trim());
      setUser({ ...user!, twoFactorEnabled: false });
      setIsDisableOpen(false);
      setDisableTotpInput('');
      setTwoFactorMessage({ text: 'Two-Factor Authentication disabled.', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid TOTP code. Could not disable 2FA.';
      setTwoFactorMessage({ text: msg, type: 'error' });
    } finally {
      setIs2FAProcessing(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const headingClass = isFlat ? 'text-sm font-bold text-appTextPrimary' : 'text-body-md font-bold text-appTextPrimary';
  const subTextClass = isFlat ? 'text-xs text-appTextSecondary' : 'text-body-xs text-appTextSecondary';
  const bodyTextClass = isFlat ? 'text-xs text-appTextSecondary/80 mb-4' : 'text-body-xs text-appTextSecondary/80 mb-4';
  const statusPillClass = isFlat
    ? `px-2.5 py-1 text-[10px] font-semibold rounded-none flex items-center gap-1.5 ${
        is2FAEnabled ? 'bg-appSuccess/15 text-appSuccess border border-appSuccess/30' : 'bg-appBg text-appTextSecondary border border-appBorder'
      }`
    : `px-3 py-1 text-body-xs font-semibold rounded-full flex items-center gap-1.5 ${
        is2FAEnabled ? 'bg-appSuccess/15 text-appSuccess border border-appSuccess/30' : 'bg-appSurface text-appTextSecondary border border-appBorder'
      }`;

  const cardBody = (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {is2FAEnabled ? (
            <ShieldCheck size={isFlat ? 18 : 22} className="text-appSuccess" />
          ) : (
            <ShieldAlert size={isFlat ? 18 : 22} className="text-warning" />
          )}
          <div>
            <h3 className={headingClass}>Two-Factor Authentication (2FA)</h3>
            <p className={subTextClass}>
              Secure your account using TOTP apps like Google Authenticator or 1Password.
            </p>
          </div>
        </div>

        <span className={statusPillClass}>
          <span className={`w-2 h-2 rounded-full ${is2FAEnabled ? 'bg-appSuccess animate-pulse' : 'bg-appTextSecondary/50'}`} />
          {is2FAEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {twoFactorMessage && (
        <div
          className={`mb-4 p-3 ${isFlat ? 'rounded-none' : 'rounded-lg'} text-xs font-medium border ${
            twoFactorMessage.type === 'success'
              ? 'bg-appSuccess/10 border-appSuccess/25 text-appSuccess'
              : 'bg-danger/10 border-danger/25 text-danger'
          }`}
        >
          {twoFactorMessage.text}
        </div>
      )}

      {!is2FAEnabled ? (
        <div>
          <p className={bodyTextClass}>
            Two-Factor Authentication adds an extra layer of security to your account by requiring a 6-digit code from an authenticator app when signing in.
          </p>

          {isFlat ? (
            <Button variant="primary" size="sm" onClick={handleInitiate2FA} disabled={is2FAProcessing} id="enable-2fa-btn">
              {is2FAProcessing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Setup 2FA Authenticator
            </Button>
          ) : (
            <button
              onClick={handleInitiate2FA}
              disabled={is2FAProcessing}
              id="enable-2fa-btn"
              className="btn-primary flex items-center gap-2 text-body-sm"
            >
              {is2FAProcessing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Setup 2FA Authenticator
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className={bodyTextClass}>
            2FA is currently active. Every time you log in, you will be prompted to enter a verification code generated by your authenticator app.
          </p>

          {isFlat ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setIsDisableOpen(true); setTwoFactorMessage(null); }}
              id="disable-2fa-btn"
              className="!text-danger !border-danger/30 hover:!bg-danger/10"
            >
              <Lock size={14} />
              Disable 2FA Security
            </Button>
          ) : (
            <button
              onClick={() => { setIsDisableOpen(true); setTwoFactorMessage(null); }}
              id="disable-2fa-btn"
              className="btn-secondary text-danger border-danger/30 hover:bg-danger/10 text-body-sm flex items-center gap-2"
            >
              <Lock size={14} />
              Disable 2FA Security
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {isFlat ? (
        <div className="bg-appSurface border border-appBorder rounded-none p-4">{cardBody}</div>
      ) : (
        <Card className="p-6">{cardBody}</Card>
      )}

      {/* ─── 2FA SETUP MODAL ─────────────────────────── */}
      <AnimatePresence>
        {is2FASetupOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIs2FASetupOpen(false)}
              className="absolute inset-0 bg-appBg/60 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-appSurface border border-appBorder rounded-2xl shadow-2xl p-6 z-10 text-left space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-body-md font-bold text-appTextPrimary flex items-center gap-2">
                  <QrCode size={18} className="text-brand-400" />
                  Set Up Authenticator App
                </h3>
                <button
                  onClick={() => setIs2FASetupOpen(false)}
                  className="p-1 rounded-full text-appTextSecondary hover:text-appTextPrimary hover:bg-appBg"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-body-xs text-appTextSecondary">
                Scan the QR code below with your authenticator app (Google Authenticator, Authy, or 1Password).
              </p>

              {qrCodeUrl && (
                <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-gray-200">
                  <img src={qrCodeUrl} alt="2FA QR Code" className="w-44 h-44 object-contain" />
                </div>
              )}

              <div>
                <label className="text-body-xs font-semibold text-appTextSecondary mb-1 block">
                  Can't scan? Enter secret key manually:
                </label>
                <div className="flex items-center gap-2 bg-appBg p-2.5 rounded-xl border border-appBorder font-mono text-xs text-appTextPrimary select-all">
                  <Key size={14} className="text-appTextSecondary shrink-0" />
                  <span className="flex-1 break-all tracking-wider font-bold">{totpSecret}</span>
                  <button
                    onClick={copySecret}
                    className="p-1.5 rounded-md hover:bg-appSurface text-appTextSecondary hover:text-appTextPrimary transition-colors shrink-0"
                    title="Copy Secret"
                  >
                    {copied ? <Check size={14} className="text-appSuccess" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <form onSubmit={handleVerifyAndEnable2FA} className="space-y-3 pt-2">
                <div>
                  <label className="text-body-xs font-semibold text-appTextPrimary mb-1 block">
                    Enter 6-Digit Authenticator Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={totpInput}
                    onChange={(e) => setTotpInput(e.target.value.replace(/[^0-9]/g, ''))}
                    className="input-field text-center font-mono text-lg tracking-widest"
                    placeholder="000000"
                    required
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIs2FASetupOpen(false)}
                    className="btn-secondary text-body-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={is2FAProcessing || totpInput.length < 6}
                    className="btn-primary text-body-xs flex items-center gap-1.5"
                  >
                    {is2FAProcessing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Verify &amp; Enable 2FA
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── 2FA DISABLE CONFIRM MODAL ───────────────────────── */}
      <AnimatePresence>
        {isDisableOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDisableOpen(false)}
              className="absolute inset-0 bg-appBg/60 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-sm bg-appSurface border border-appBorder rounded-2xl shadow-2xl p-6 z-10 text-left space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-body-md font-bold text-danger flex items-center gap-2">
                  <Lock size={18} />
                  Disable 2FA Protection
                </h3>
                <button
                  onClick={() => setIsDisableOpen(false)}
                  className="p-1 rounded-full text-appTextSecondary hover:text-appTextPrimary hover:bg-appBg"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-body-xs text-appTextSecondary">
                Enter your current 6-digit authenticator code to confirm disabling Two-Factor Authentication.
              </p>

              <form onSubmit={handleConfirmDisable2FA} className="space-y-3">
                <input
                  type="text"
                  maxLength={6}
                  value={disableTotpInput}
                  onChange={(e) => setDisableTotpInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className="input-field text-center font-mono text-lg tracking-widest"
                  placeholder="000000"
                  required
                />

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDisableOpen(false)}
                    className="btn-secondary text-body-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={is2FAProcessing || disableTotpInput.length < 6}
                    className="btn-primary bg-danger hover:bg-danger/90 text-body-xs flex items-center gap-1.5"
                  >
                    {is2FAProcessing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                    Confirm &amp; Disable
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ProfileSecurityCard;
