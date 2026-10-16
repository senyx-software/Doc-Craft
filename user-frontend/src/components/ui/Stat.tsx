import React from 'react';

interface StatProps {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

/** Small muted-label / bold-value pair, used across quota, subscription and billing summaries. */
const Stat: React.FC<StatProps> = ({ label, value, valueClassName = '' }) => (
  <div>
    <p className="text-body-xs text-appTextSecondary mb-1">{label}</p>
    <p className={`text-body-sm font-semibold text-appTextPrimary capitalize ${valueClassName}`}>{value}</p>
  </div>
);

export default Stat;
