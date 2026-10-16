import React from 'react';
import Button from './Button';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type DialogType = 'success' | 'warning' | 'error' | 'info';

export interface SystemDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onClose?: () => void;
}

const SystemDialogModal: React.FC<SystemDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    if (onClose) onClose();
  };

  const iconMap = {
    success: <CheckCircle2 className="w-8 h-8 text-emerald-500" />,
    warning: <AlertTriangle className="w-8 h-8 text-amber-500" />,
    error: <XCircle className="w-8 h-8 text-rose-500" />,
    info: <Info className="w-8 h-8 text-purple-500" />,
  };

  const handleClose = () => {
    if (onClose) onClose();
    else if (onConfirm) onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      <div 
        className="w-full max-w-md bg-white dark:bg-[#181a20] border border-gray-200 dark:border-white/10 rounded-md p-6 shadow-2xl space-y-4 transform transition-all text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200/50 dark:border-white/5">
              {iconMap[type]}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                {title || (type === 'error' ? 'System Notice' : type === 'success' ? 'Action Completed' : 'Notification')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Control Plane Alert
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose} 
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="py-2 text-xs text-gray-700 dark:text-gray-200 leading-relaxed font-medium">
          {message}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
          {cancelText && (
            <Button variant="ghost" size="sm" onClick={handleClose}>
              {cancelText}
            </Button>
          )}
          <Button 
            variant={type === 'error' ? 'danger' : type === 'warning' ? 'violet' : 'primary'} 
            size="sm" 
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SystemDialogModal;
