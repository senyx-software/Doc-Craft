import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export type ContextMenuEntry = ContextMenuItem | { divider: true };

interface CanvasContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

// Right-click menu for canvas elements — Canva/Figma-style: appears at the
// cursor, closes on outside click, Escape, or scroll (its position would
// otherwise drift from whatever it was anchored to).
const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  // Keep the menu on-screen — a right-click near the right/bottom edge of
  // the viewport would otherwise render mostly off-screen.
  const menuWidth = 216;
  const estimatedHeight = items.length * 32 + 16;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - estimatedHeight - 8);

  return (
    <div
      ref={ref}
      style={{ left, top, width: menuWidth }}
      className="fixed z-[200] bg-appSurface border border-appBorder rounded-[8px] shadow-2xl py-1.5 text-left"
    >
      {items.map((entry, i) =>
        'divider' in entry ? (
          <div key={`div-${i}`} className="h-px bg-appBorder my-1.5 mx-2" />
        ) : (
          <button
            key={entry.label}
            disabled={entry.disabled}
            onClick={() => { entry.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              entry.danger ? 'text-appError hover:bg-appError/10' : 'text-appTextPrimary hover:bg-appBg'
            }`}
          >
            {entry.icon && <span className="w-3.5 h-3.5 flex items-center justify-center text-appTextSecondary flex-shrink-0">{entry.icon}</span>}
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut && <span className="text-[10px] font-mono text-appTextSecondary/70">{entry.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
};

export default CanvasContextMenu;
