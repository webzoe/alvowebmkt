export type BadgeVariant =
  | 'success' | 'error' | 'warning' | 'neutral' | 'primary'
  | 'info';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success/12 text-success ring-success/20',
  error:   'bg-error/12 text-error ring-error/20',
  warning: 'bg-warning/12 text-warning ring-warning/20',
  neutral: 'bg-surface-soft text-muted ring-hairline',
  primary: 'bg-primary/12 text-primary ring-primary/20',
  info:    'bg-surface-soft text-body-strong ring-hairline',
};

const dotClasses: Record<BadgeVariant, string> = {
  success: 'bg-success',
  error:   'bg-error',
  warning: 'bg-warning',
  neutral: 'bg-muted-soft',
  primary: 'bg-primary',
  info:    'bg-muted',
};

export function Badge({ children, variant = 'neutral', dot = false }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5',
        'px-2 py-0.5 rounded-full',
        'text-xs font-medium',
        'ring-1 ring-inset',
        variantClasses[variant],
      ].join(' ')}
    >
      {dot && (
        <span className={`size-1.5 rounded-full shrink-0 ${dotClasses[variant]}`} />
      )}
      {children}
    </span>
  );
}
