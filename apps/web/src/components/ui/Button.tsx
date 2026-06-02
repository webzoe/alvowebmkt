import { type ButtonHTMLAttributes, forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-primary text-white',
    'hover:bg-primary-active',
    'disabled:bg-primary-disabled disabled:text-muted disabled:cursor-not-allowed',
    'focus-visible:ring-primary/40',
  ].join(' '),
  secondary: [
    'bg-canvas text-ink border border-hairline',
    'hover:bg-surface-soft',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'focus-visible:ring-primary/30',
  ].join(' '),
  danger: [
    'bg-error text-white',
    'hover:opacity-90',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'focus-visible:ring-error/40',
  ].join(' '),
  ghost: [
    'text-muted',
    'hover:text-ink hover:bg-surface-soft',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'focus-visible:ring-primary/30',
  ].join(' '),
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg',
        'transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading && (
        <span className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
