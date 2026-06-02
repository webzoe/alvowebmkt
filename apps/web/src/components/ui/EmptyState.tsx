import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        'bg-surface-soft rounded-xl border border-hairline',
        compact ? 'py-10 px-6' : 'py-16 px-8',
      ].join(' ')}
    >
      {Icon && (
        <div className="size-12 rounded-xl bg-surface-card border border-hairline flex items-center justify-center mb-4">
          <Icon size={22} className="text-muted" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
