import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  // Sharp corners throughout — deliberate app-wide zero-radius style.
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 rounded-none hover:scale-[1.02]';

  // Variant classes mapping to the design system tokens
  const variants = {
    primary: 'bg-appPrimary text-white hover:bg-appPrimary/90 active:bg-appPrimary/95 shadow-lg shadow-appPrimary/25 border border-transparent',
    secondary: 'bg-appSurface text-appTextPrimary hover:bg-appSurface/80 active:bg-appSurface/90 border border-appBorder',
    ghost: 'text-appTextSecondary hover:text-appTextPrimary hover:bg-appSurface/50 border border-transparent',
    danger: 'bg-appError text-white hover:bg-appError/90 active:bg-appError/95 border border-transparent',
  };

  // Size classes
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
