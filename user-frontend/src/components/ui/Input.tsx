import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  className = '',
  id,
  type = 'text',
  ...props
}) => {
  return (
    <div className="w-full text-left">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-appTextSecondary mb-1.5">
          {label}
        </label>
      )}
      <input
        type={type}
        id={id}
        className={`w-full px-4 py-2.5 bg-appSurface/50 text-appTextPrimary border border-appBorder placeholder:text-appTextSecondary/60 focus:outline-none focus:border-appPrimary focus:ring-2 focus:ring-appPrimary/25 transition-all duration-200 rounded-full ${
          error ? 'border-appError focus:ring-appError/25' : ''
        } ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-appError font-medium">{error}</p>
      )}
      {!error && helperText && (
        <p className="mt-1 text-xs text-appTextSecondary">{helperText}</p>
      )}
    </div>
  );
};

export default Input;
