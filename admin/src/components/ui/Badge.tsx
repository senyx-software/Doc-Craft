import React from 'react';

interface BadgeProps {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  children: React.ReactNode;
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({ variant = 'secondary', children, className = '' }) => {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-semibold border transition-all duration-200';
  
  const variants = {
    primary: 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20',
    secondary: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300 border-gray-200 dark:border-white/10',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/20',
    info: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20',
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;
