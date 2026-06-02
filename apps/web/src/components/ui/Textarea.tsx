import { type TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={fieldId} className="text-sm font-medium text-body-strong">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          className={[
            'px-3 py-2 rounded-lg text-sm',
            'bg-canvas text-ink',
            'border transition-colors duration-100 resize-none',
            'placeholder:text-muted-soft',
            'focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60',
            error
              ? 'border-error/60'
              : 'border-hairline hover:border-muted-soft',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <span className="text-xs text-error">{error}</span>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
