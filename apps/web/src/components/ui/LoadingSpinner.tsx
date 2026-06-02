interface LoadingSpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeMap = {
  sm: 'size-5 border-2',
  md: 'size-7 border-2',
  lg: 'size-10 border-2',
};

export function LoadingSpinner({ className = '', size = 'md', label = 'Carregando…' }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <span
        className={`${sizeMap[size]} border-hairline border-t-primary rounded-full animate-spin`}
      />
      {size !== 'sm' && (
        <span className="text-xs text-muted">{label}</span>
      )}
    </div>
  );
}
