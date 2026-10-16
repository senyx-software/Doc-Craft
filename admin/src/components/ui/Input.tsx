import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    const generatedId = React.useId();
    const id = props.id || generatedId;
    return (
      <div className="w-full text-left">
        {label && (
          <label htmlFor={id} className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-4 py-2.5 text-xs bg-white dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-md placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all ${
            error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''
          } ${className}`}
          {...props}
          id={id}
        />
        {error && (
          <p className="mt-1 text-[10px] text-rose-500 font-semibold">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
