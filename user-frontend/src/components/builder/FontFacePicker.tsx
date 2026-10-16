import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FONT_CATEGORIES, loadGoogleFont } from '../../utils/googleFonts';

interface FontFacePickerProps {
  label?: string;
  // undefined = "Mixed" (multi-selection spanning more than one font).
  value: string | undefined;
  onChange: (family: string) => void;
}

// Searchable, scrollable font-face combobox — replaces a plain native
// <select> because a flat dropdown of 300+ fonts has no way to filter by
// name and (on some platforms) barely scrolls usably. Mirrors the same
// outside-click/Escape-to-close pattern as CanvasContextMenu.
const FontFacePicker: React.FC<FontFacePickerProps> = ({ label = 'Font face', value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FONT_CATEGORIES;
    return FONT_CATEGORIES
      .map((cat) => ({ ...cat, fonts: cat.fonts.filter((f) => f.family.toLowerCase().includes(q)) }))
      .filter((cat) => cat.fonts.length > 0);
  }, [query]);

  const handlePick = (family: string) => {
    loadGoogleFont(family);
    onChange(family);
    setOpen(false);
  };

  return (
    <div className="block" ref={rootRef}>
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => { setQuery(''); setOpen(o => !o); }}
          className="w-full flex items-center justify-between gap-2 bg-appBg border border-appBorder rounded-[4px] pl-2 pr-2 py-1.5 text-xs text-appTextPrimary text-left"
          style={{ fontFamily: value || undefined }}
        >
          <span className="truncate">{value ?? 'Mixed'}</span>
          <ChevronDown size={12} className="flex-shrink-0 text-appTextSecondary" />
        </button>

        {open && (
          <div className="absolute z-[100] mt-1 left-0 right-0 bg-appSurface border border-appBorder rounded-[6px] shadow-2xl overflow-hidden">
            <div className="relative border-b border-appBorder">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-appTextSecondary pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search fonts…"
                className="w-full bg-transparent pl-6 pr-2 py-2 text-xs text-appTextPrimary placeholder:text-appTextSecondary/60 outline-none"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredCategories.length === 0 && (
                <p className="px-3 py-2 text-xs text-appTextSecondary">No fonts match "{query}"</p>
              )}
              {filteredCategories.map((cat) => (
                <div key={cat.label}>
                  <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary/70 sticky top-0 bg-appSurface">
                    {cat.label}
                  </div>
                  {cat.fonts.map((f) => (
                    <button
                      key={f.family}
                      type="button"
                      onClick={() => handlePick(f.family)}
                      style={{ fontFamily: f.family }}
                      className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors hover:bg-appBg ${
                        f.family === value ? 'text-brand-500 font-semibold' : 'text-appTextPrimary'
                      }`}
                    >
                      {f.family}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FontFacePicker;
