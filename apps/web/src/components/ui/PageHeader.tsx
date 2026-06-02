import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}

/**
 * Consistent page-level header used across all main pages.
 * Shows title + optional description on the left, optional action slot on the right.
 */
export function PageHeader({ title, description, action, breadcrumb, className = '' }: PageHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      {breadcrumb && (
        <div className="mb-2 text-sm text-muted">{breadcrumb}</div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink leading-tight">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted">{description}</p>
          )}
        </div>
        {action && (
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
