import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export type DateRangePreset = '24h' | '7d' | '30d' | '90d' | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  from: string;
  to: string;
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  custom: 'Custom Range',
};

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

const todayISO = () => new Date().toISOString().substring(0, 10);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().substring(0, 10);

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const selectPreset = (preset: DateRangePreset) => {
    if (preset === 'custom') {
      onChange({ preset, from: value.from || daysAgoISO(30), to: value.to || todayISO() });
    } else {
      const days = preset === '24h' ? 1 : preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
      onChange({ preset, from: daysAgoISO(days), to: todayISO() });
    }
    if (preset !== 'custom') setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-md border bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-purple-400 transition-colors"
      >
        <Calendar size={12} className="text-purple-500" />
        {PRESET_LABELS[value.preset]}
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 rounded-md shadow-xl z-50 overflow-hidden">
            {(Object.keys(PRESET_LABELS) as DateRangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => selectPreset(p)}
                className={`w-full text-left px-3 py-2 text-[11px] font-semibold transition-colors ${
                  value.preset === p
                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
            {value.preset === 'custom' && (
              <div className="p-3 border-t border-gray-200 dark:border-white/10 space-y-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">From</label>
                  <input
                    type="date"
                    value={value.from}
                    max={value.to || todayISO()}
                    onChange={(e) => onChange({ ...value, from: e.target.value })}
                    className="w-full px-2 py-1 text-[11px] bg-white dark:bg-neutral-800 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">To</label>
                  <input
                    type="date"
                    value={value.to}
                    min={value.from}
                    max={todayISO()}
                    onChange={(e) => onChange({ ...value, to: e.target.value })}
                    className="w-full px-2 py-1 text-[11px] bg-white dark:bg-neutral-800 border border-gray-200 dark:border-white/10 rounded-md text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DateRangeFilter;
