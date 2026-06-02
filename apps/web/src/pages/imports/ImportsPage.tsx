import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CheckCircle, XCircle, Loader } from 'lucide-react';
import { useImports } from '../../hooks/useImports';
import { useClients } from '../../hooks/useClients';
import { useLists } from '../../hooks/useLists';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { ImportStatus } from '../../types';

const STATUS_BADGE: Record<ImportStatus, React.ComponentProps<typeof Badge>['variant']> = {
  pending: 'neutral',
  processing: 'primary',
  completed: 'success',
  failed: 'error',
};

const STATUS_LABELS: Record<ImportStatus, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  completed: 'Concluído',
  failed: 'Falhou',
};

function StatusIcon({ status }: { status: ImportStatus }) {
  if (status === 'completed') return <CheckCircle size={14} className="text-success" />;
  if (status === 'failed') return <XCircle size={14} className="text-error" />;
  if (status === 'processing') return <Loader size={14} className="text-primary animate-spin" />;
  return null;
}

export function ImportsPage() {
  const { clients } = useClients();
  const [clientFilter, setClientFilter] = useState('');
  const [listFilter, setListFilter] = useState('');
  const { lists } = useLists(clientFilter || undefined);
  const { imports, loading, error } = useImports(clientFilter || undefined, listFilter || undefined);

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Importações</h1>
          <p className="text-sm text-muted mt-0.5">{imports.length} registro{imports.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/imports/new">
          <Button><Plus size={16} />Nova importação</Button>
        </Link>
      </div>

      <div className="flex gap-3">
        <Select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setListFilter(''); }} className="w-52">
          <option value="">Todos os clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={listFilter} onChange={e => setListFilter(e.target.value)} className="w-52" disabled={!clientFilter}>
          <option value="">Todas as listas</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {imports.length === 0 ? (
        <div className="bg-surface-soft rounded-xl p-12 text-center">
          <p className="text-muted text-sm">Nenhuma importação realizada.</p>
          <Link to="/imports/new"><Button className="mt-4"><Plus size={16} />Importar CSV</Button></Link>
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Arquivo</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Lista</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Importados</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Duplic.</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Inválidos</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Suprim.</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {imports.map(imp => (
                <tr key={imp.id} className="hover:bg-surface-soft/50 transition-colors">
                  <td className="px-4 py-3 text-body max-w-xs truncate">{imp.file_name ?? 'sem nome'}</td>
                  <td className="px-4 py-3 text-body">{imp.contact_lists?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={imp.status} />
                      <Badge variant={STATUS_BADGE[imp.status]}>{STATUS_LABELS[imp.status]}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-body">{imp.total_rows.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-success font-medium">{imp.imported_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-muted">{imp.duplicate_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-warning">{imp.invalid_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-error">{imp.suppressed_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {new Date(imp.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
