import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Server, List, Contact, ShieldOff, Mail, CheckCircle, XCircle, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { PageHeader } from '../../components/ui/PageHeader';

import type { DashboardStats, ImportStatus } from '../../types';

function StatCard({ label, value, icon: Icon, to, color = 'text-primary' }: {
  label: string; value: number; icon: React.ElementType; to?: string; color?: string;
}) {
  const inner = (
    <div className="bg-canvas border border-hairline rounded-xl p-5 flex items-center gap-4 hover:border-primary/30 transition-colors">
      <div className="size-10 rounded-lg bg-surface-card flex items-center justify-center shrink-0">
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-2xl font-semibold text-ink">{value.toLocaleString('pt-BR')}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-error' : pct >= 70 ? 'bg-warning' : 'bg-success';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="text-body">{used.toLocaleString('pt-BR')} / {limit.toLocaleString('pt-BR')}</span>
      </div>
      <div className="h-1.5 bg-surface-card rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const IMPORT_BADGE: Record<ImportStatus, React.ComponentProps<typeof Badge>['variant']> = {
  pending: 'neutral', processing: 'primary', completed: 'success', failed: 'error',
};
const IMPORT_LABELS: Record<ImportStatus, string> = {
  pending: 'Pendente', processing: 'Processando', completed: 'Concluído', failed: 'Falhou',
};

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DashboardStats>('/api/dashboard')
      .then(setStats)
      .catch(e => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner className="h-64" />;
  if (error) return <p className="p-8 text-error">{error}</p>;
  if (!stats) return null;

  return (
    <div className="p-8 space-y-8">
      <PageHeader title="Dashboard" description="Resumo operacional da plataforma" />

      {/* Base stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Clientes" value={stats.clients_count} icon={Users} to="/clients" />
        <StatCard label="Servidores" value={stats.servers_count} icon={Server} to="/servers" />
        <StatCard label="Listas" value={stats.lists_count} icon={List} to="/lists" />
        <StatCard label="Contatos totais" value={stats.contacts_count} icon={Contact} to="/contacts" />
        <StatCard label="Contatos ativos" value={stats.active_contacts_count} icon={Contact} />
        <StatCard label="Suprimidos" value={stats.suppressed_contacts_count} icon={ShieldOff} to="/suppressions" color="text-error" />
      </div>

      {/* Campaign stats */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium text-ink">Campanhas</h2>
          <Link to="/campaigns" className="text-xs text-primary hover:underline">Ver todas →</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Rascunhos" value={stats.campaigns_draft} icon={Mail} color="text-muted" />
          <StatCard label="Na fila" value={stats.campaigns_queued} icon={Mail} color="text-warning" />
          <StatCard label="Enviando" value={stats.campaigns_sending} icon={Send} color="text-primary" />
          <StatCard label="Pausadas" value={stats.campaigns_paused} icon={Mail} color="text-warning" />
          <StatCard label="Enviados/mês" value={stats.sent_this_month} icon={CheckCircle} color="text-success" />
        </div>
      </div>

      {/* Servers usage */}
      {stats.servers_usage.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-medium text-ink">Uso dos servidores</h2>
          <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-4">
            {stats.servers_usage.map(srv => (
              <div key={srv.id} className="space-y-2">
                <p className="text-sm font-medium text-ink">{srv.name}</p>
                <UsageBar used={srv.monthly_used} limit={srv.monthly_limit} label="Mensal" />
                <UsageBar used={srv.daily_used} limit={srv.daily_limit} label="Diário" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent send logs */}
        <div className="space-y-3">
          <h2 className="text-base font-medium text-ink">Últimos envios</h2>
          {stats.recent_logs.length === 0 ? (
            <div className="bg-surface-soft rounded-xl p-6 text-center text-sm text-muted">
              Nenhum envio.{' '}<Link to="/servers" className="text-primary hover:underline">Configure um servidor</Link>.
            </div>
          ) : (
            <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-hairline bg-surface-soft">
                  <th className="px-3 py-2 text-left font-medium text-muted">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Destinatário</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Data</th>
                </tr></thead>
                <tbody className="divide-y divide-hairline">
                  {stats.recent_logs.map(log => (
                    <tr key={log.id} className="hover:bg-surface-soft/50">
                      <td className="px-3 py-2">
                        {log.status === 'success' ? <CheckCircle size={14} className="text-success" /> : <XCircle size={14} className="text-error" />}
                      </td>
                      <td className="px-3 py-2 text-body text-xs font-mono truncate max-w-36">{log.recipient_email}</td>
                      <td className="px-3 py-2 text-muted text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent imports */}
        <div className="space-y-3">
          <h2 className="text-base font-medium text-ink">Últimas importações</h2>
          {stats.recent_imports.length === 0 ? (
            <div className="bg-surface-soft rounded-xl p-6 text-center text-sm text-muted">
              Nenhuma importação.{' '}<Link to="/imports/new" className="text-primary hover:underline">Importar CSV</Link>.
            </div>
          ) : (
            <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-hairline bg-surface-soft">
                  <th className="px-3 py-2 text-left font-medium text-muted">Arquivo</th>
                  <th className="px-3 py-2 text-left font-medium text-muted">Status</th>
                  <th className="px-3 py-2 text-right font-medium text-muted">Importados</th>
                </tr></thead>
                <tbody className="divide-y divide-hairline">
                  {stats.recent_imports.map(imp => (
                    <tr key={imp.id} className="hover:bg-surface-soft/50">
                      <td className="px-3 py-2 text-body text-xs truncate max-w-36">{imp.file_name ?? '—'}</td>
                      <td className="px-3 py-2"><Badge variant={IMPORT_BADGE[imp.status]}>{IMPORT_LABELS[imp.status]}</Badge></td>
                      <td className="px-3 py-2 text-right text-success font-medium">{imp.imported_count.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent cleanups */}
      {stats.recent_cleanups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-medium text-ink">Últimas limpezas</h2>
          <div className="space-y-2">
            {stats.recent_cleanups.map(cl => (
              <div key={cl.id} className="bg-canvas border border-hairline rounded-lg px-4 py-3 text-sm flex items-center gap-4 flex-wrap">
                <span className="font-medium text-ink">{cl.contact_lists?.name ?? '—'}</span>
                <span className="text-muted">{cl.total_analyzed.toLocaleString('pt-BR')} analisados</span>
                <span className="text-error">−{(cl.removed_bounced + cl.removed_unsubscribed + cl.removed_complained + cl.removed_suppressed).toLocaleString('pt-BR')} removidos</span>
                <span className="text-muted ml-auto text-xs">{new Date(cl.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
