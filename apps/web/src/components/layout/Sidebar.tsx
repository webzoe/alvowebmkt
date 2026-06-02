import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Mail,
  Users,
  Server,
  List,
  Contact,
  ShieldOff,
  FileUp,
  Settings,
  LogOut,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ThemeToggle } from '../ui/ThemeToggle';

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/calendar',     label: 'Calendário',   icon: CalendarDays },
  { to: '/campaigns',    label: 'Campanhas',    icon: Mail },
  { to: '/clients',      label: 'Clientes',     icon: Users },
  { to: '/servers',      label: 'Servidores',   icon: Server },
  { to: '/lists',        label: 'Listas',       icon: List },
  { to: '/contacts',     label: 'Contatos',     icon: Contact },
  { to: '/suppressions', label: 'Supressões',   icon: ShieldOff },
  { to: '/imports',      label: 'Importações',  icon: FileUp },
  { to: '/settings',     label: 'Configurações',icon: Settings },
];

const NAV_GROUPS = [
  {
    label: '',
    items: NAV.slice(0, 3),
  },
  {
    label: 'Dados',
    items: NAV.slice(3, 9),
  },
  {
    label: 'Sistema',
    items: NAV.slice(9),
  },
];

export function Sidebar() {
  const { signOut } = useAuth();

  return (
    <aside
      className="w-56 shrink-0 h-screen flex flex-col bg-surface-dark border-r border-surface-dark-elevated print:hidden select-none"
      aria-label="Navegação principal"
    >
      {/* Logo */}
      <div className="px-5 py-4 border-b border-surface-dark-elevated flex items-center gap-2.5">
        <div className="size-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Zap size={14} className="text-primary" />
        </div>
        <div>
          <span className="text-sm font-semibold text-on-dark tracking-tight block leading-tight">
            AlvoWebMkt
          </span>
          <span className="text-[10px] text-on-dark-soft leading-tight">
            Email Marketing
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            {group.label && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-on-dark-soft/60 uppercase">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-100 ${
                      isActive
                        ? 'bg-primary text-white font-medium'
                        : 'text-on-dark-soft hover:text-on-dark hover:bg-surface-dark-elevated'
                    }`
                  }
                >
                  <Icon size={15} className="shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: theme toggle + sign out */}
      <div className="px-3 py-3 border-t border-surface-dark-elevated space-y-0.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => void signOut()}
            className="flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-on-dark-soft hover:text-on-dark hover:bg-surface-dark-elevated transition-colors"
          >
            <LogOut size={15} className="shrink-0" />
            <span>Sair</span>
          </button>
          <ThemeToggle context="sidebar" />
        </div>
      </div>
    </aside>
  );
}
