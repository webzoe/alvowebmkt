import { type SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', id, children, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-body-strong">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={[
            'h-9 px-3 rounded-lg text-sm',
            'bg-canvas text-ink',
            'border transition-colors duration-100',
            'focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-error/60'
              : 'border-hairline hover:border-muted-soft',
            className,
          ].join(' ')}
          {...props}
        >
          {children}
        </select>
        {error && <span className="text-xs text-error">{error}</span>}
      </div>
    );
  },
);
Select.displayName = 'Select';
