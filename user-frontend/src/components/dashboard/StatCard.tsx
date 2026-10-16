import React from 'react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: 'primary' | 'success' | 'accent';
}

const toneClasses = {
  primary: 'bg-appPrimary/10 border-appPrimary/25 text-appPrimary',
  success: 'bg-appSuccess/10 border-appSuccess/25 text-appSuccess',
  accent: 'bg-accent-purple-500/10 border-accent-purple-500/25 text-accent-purple-500',
};

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, tone = 'primary' }) => (
  <div className="p-4 bg-appSurface border border-appBorder rounded-none flex items-center gap-3">
    <div className={`w-9 h-9 rounded-none border flex items-center justify-center flex-shrink-0 ${toneClasses[tone]}`}>
      {icon}
    </div>
    <div>
      <span className="text-body-sm text-appTextSecondary font-semibold">{label}</span>
      <p className="text-heading-h3 font-bold text-appTextPrimary mt-0.5">{value}</p>
    </div>
  </div>
);

export default StatCard;
