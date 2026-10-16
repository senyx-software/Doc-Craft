import React from 'react';
import Card from './Card';

// Every combo is written out fully so Tailwind's compiler can see it —
// building class names via `bg-${color}-500/10` template strings (the
// pattern this replaces) never gets picked up, so those tiles render with
// no icon background at all.
const TONES = {
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
} as const;

export type StatCardTone = keyof typeof TONES;

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ size?: number }>;
  tone?: StatCardTone;
  trend?: React.ReactNode;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, tone = 'purple', trend, className = '' }) => (
  <Card className={`flex flex-col justify-between ${className}`}>
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`p-2 rounded-full shrink-0 ${TONES[tone]}`}>
        <Icon size={16} />
      </span>
    </div>
    <div className="mt-3">
      <span className="text-2xl font-extrabold text-gray-900 dark:text-white">{value}</span>
      {trend && <div className="mt-1">{trend}</div>}
    </div>
  </Card>
);

export default StatCard;
