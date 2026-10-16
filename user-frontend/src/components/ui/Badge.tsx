import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'free' | 'pro' | 'success' | 'warning' | 'danger' | 'neutral';
  children: React.ReactNode;
}

const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', className = '', children, ...props }) => {
  const variants = {
    free: 'badge-free',
    pro: 'badge-pro',
    success: 'badge bg-appSuccess/10 text-appSuccess border border-appSuccess/20',
    warning: 'badge bg-appWarning/10 text-appWarning border border-appWarning/20',
    danger: 'badge bg-appError/10 text-appError border border-appError/20',
    neutral: 'badge bg-appBorder/50 text-appTextSecondary',
  };

  return (
    <span className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};

export default Badge;
