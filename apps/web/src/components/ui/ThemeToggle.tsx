import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface ThemeToggleProps {
  /** When 'sidebar', uses sidebar-appropriate colors; otherwise uses surface colors */
  context?: 'sidebar' | 'surface';
  className?: string;
}

export function ThemeToggle({ context = 'sidebar', className = '' }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();

  const baseClasses =
    context === 'sidebar'
      ? 'text-on-dark-soft hover:text-on-dark hover:bg-surface-dark-elevated'
      : 'text-muted hover:text-ink hover:bg-surface-soft';

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      className={`
        p-2 rounded-lg transition-colors focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-primary/50
        ${baseClasses} ${className}
      `}
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
