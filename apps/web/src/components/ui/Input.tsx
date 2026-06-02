import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-body-strong">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'h-9 px-3 rounded-lg text-sm',
            'bg-canvas text-ink',
            'border transition-colors duration-100',
            'placeholder:text-muted-soft',
            'focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60',
            error
              ? 'border-error/60 focus:ring-error/20 focus:border-error/80'
              : 'border-hairline hover:border-muted-soft',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <span className="text-xs text-error">{error}</span>}
        {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
