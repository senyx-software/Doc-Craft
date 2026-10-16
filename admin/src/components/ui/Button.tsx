import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'violet';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-md active:scale-[0.98]';
  
  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-xs font-semibold gap-2',
    lg: 'px-5 py-2.5 text-sm font-semibold gap-2.5',
  };

  const variants = {
    primary: 'bg-purple-600 hover:bg-purple-700 text-white focus:ring-purple-500/50 shadow-sm shadow-purple-500/20',
    violet: 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white focus:ring-purple-500/50 shadow-sm shadow-purple-500/25',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200/80 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white dark:border-white/10 focus:ring-purple-500/20',
    ghost: 'bg-transparent hover:bg-gray-100/80 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:ring-purple-500/20',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500/50 shadow-sm shadow-rose-500/20',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500/50 shadow-sm shadow-emerald-500/20',
    outline: 'bg-transparent hover:bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/30 hover:border-purple-500/60 focus:ring-purple-500/25',
  };

  return (
    <button
      className={`${baseStyles} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
