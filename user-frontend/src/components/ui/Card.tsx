import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'solid';
  interactive?: boolean;
  children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({
  variant = 'glass',
  interactive = false,
  className = '',
  children,
  ...props
}) => {
  const variants = {
    glass: 'glass-card',
    solid: 'card',
  };

  return (
    <div
      className={`${variants[variant]} ${interactive ? 'transition-all duration-200 hover:border-brand-500/50 hover:-translate-y-0.5 cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardHeader: React.FC<CardSectionProps> = ({ className = '', children, ...props }) => (
  <div className={`flex items-center justify-between mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<CardSectionProps> = ({ className = '', children, ...props }) => (
  <h3 className={`text-heading-h6 font-semibold text-appTextPrimary ${className}`} {...props}>
    {children}
  </h3>
);

export default Card;
