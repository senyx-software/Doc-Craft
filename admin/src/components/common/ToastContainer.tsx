import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore, type ToastType } from '../../store/toastStore';

const TONE: Record<ToastType, { icon: React.ComponentType<{ size?: number; className?: string }>; iconClass: string; barClass: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-500', barClass: 'bg-emerald-500' },
  error: { icon: XCircle, iconClass: 'text-rose-500', barClass: 'bg-rose-500' },
  warning: { icon: AlertTriangle, iconClass: 'text-amber-500', barClass: 'bg-amber-500' },
  info: { icon: Info, iconClass: 'text-cyan-500', barClass: 'bg-cyan-500' },
};

// Minimalistic, non-blocking toast stack — separate from SystemDialogModal,
// which stays reserved for actions that need an explicit acknowledgement
// (logout confirm, destructive deletes). This is for "did that save?"
// feedback that shouldn't interrupt the admin's flow.
const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const tone = TONE[t.type];
        const Icon = tone.icon;
        return (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex items-start gap-2.5 bg-white dark:bg-neutral-900 border border-gray-200/70 dark:border-white/10 rounded-md shadow-lg overflow-hidden animate-slide-in-right"
          >
            <span className={`w-1 self-stretch shrink-0 ${tone.barClass}`} />
            <Icon size={17} className={`shrink-0 mt-3 ${tone.iconClass}`} />
            <div className="flex-1 min-w-0 py-2.5 pr-1">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">{t.title}</p>
              {t.message && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 break-words">{t.message}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 mt-2.5 mr-2 p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
