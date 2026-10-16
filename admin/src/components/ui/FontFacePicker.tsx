import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FONT_CATEGORIES, loadGoogleFont } from '../../utils/googleFonts';

interface FontFacePickerProps {
  label?: string;
  value: string;
  onChange: (family: string) => void;
}

// Searchable font-face combobox for admin's branding settings — replaces a
// bare free-text "Primary Font Family" input (which had no real values to
// reference and blocked Publish with a native "Please fill out this field"
// popup whenever it was empty) with a real, browsable list of actual fonts.
// Mirrors user-frontend's builder FontFacePicker, restyled to admin's
// gray/purple Input theme.
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

  // Preview the already-saved font (if any) as soon as this control mounts,
  // not just once the admin opens the dropdown and picks something new.
  useEffect(() => {
    if (value) loadGoogleFont(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="w-full text-left" ref={rootRef}>
      {label && (
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setQuery(''); setOpen(o => !o); }}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-md focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
          style={{ fontFamily: value || undefined }}
        >
          <span className="truncate">{value || 'Select a font…'}</span>
          <ChevronDown size={14} className="flex-shrink-0 text-gray-400" />
        </button>

        {open && (
          <div className="absolute z-[100] mt-1 left-0 right-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-md shadow-2xl overflow-hidden">
            <div className="relative border-b border-gray-200 dark:border-white/10">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search fonts…"
                className="w-full bg-transparent pl-7 pr-3 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredCategories.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">No fonts match "{query}"</p>
              )}
              {filteredCategories.map((cat) => (
                <div key={cat.label}>
                  <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 sticky top-0 bg-white dark:bg-gray-900">
                    {cat.label}
                  </div>
                  {cat.fonts.map((f) => (
                    <button
                      key={f.family}
                      type="button"
                      onClick={() => handlePick(f.family)}
                      style={{ fontFamily: f.family }}
                      className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
                        f.family === value ? 'text-purple-600 dark:text-purple-400 font-semibold' : 'text-gray-900 dark:text-white'
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
