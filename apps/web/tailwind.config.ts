import type { Config } from 'tailwindcss';

// All semantic colors are CSS variables — dark mode is handled by swapping variable values.
// The `<alpha-value>` placeholder allows Tailwind opacity modifiers (bg-primary/10 etc.).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Page surfaces ──────────────────────────────────────────────────
        canvas:           v('canvas'),
        'surface-soft':   v('surface-soft'),
        'surface-card':   v('surface-card'),
        // ── Text ───────────────────────────────────────────────────────────
        ink:              v('ink'),
        body:             v('body'),
        'body-strong':    v('body-strong'),
        muted:            v('muted'),
        'muted-soft':     v('muted-soft'),
        // ── Borders ────────────────────────────────────────────────────────
        hairline:         v('hairline'),
        // ── Brand ──────────────────────────────────────────────────────────
        primary:          v('primary'),
        'primary-active': v('primary-active'),
        'primary-disabled': v('primary-disabled'),
        // ── Semantic ───────────────────────────────────────────────────────
        success:          v('success'),
        warning:          v('warning'),
        error:            v('error'),
        // ── Sidebar surfaces (always dark, just different depths per mode) ─
        'surface-dark':          v('sidebar-bg'),
        'surface-dark-elevated': v('sidebar-hover'),
        // ── On-dark text (for sidebar text) ────────────────────────────────
        'on-dark':      v('on-dark'),
        'on-dark-soft': v('on-dark-soft'),
        // ── Legacy aliases kept for backward compatibility ──────────────────
        'surface-dark-soft': v('sidebar-hover'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'xl':  '10px',
        '2xl': '14px',
      },
      boxShadow: {
        card: '0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)',
        'card-md': '0 4px 12px rgb(0 0 0 / 0.08)',
        'modal': '0 8px 32px rgb(0 0 0 / 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;
