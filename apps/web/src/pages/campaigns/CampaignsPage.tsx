import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ChevronRight, Trash2, BarChart2, Mail } from 'lucide-react';
import { api } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useCampaigns } from '../../hooks/useCampaigns';
import { useClients } from '../../hooks/useClients';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import type { BadgeProps } from '../../components/ui/Badge';
import type { CampaignStatus } from '../../types';

export const STATUS_BADGE: Record<CampaignStatus, BadgeProps['variant']> = {
  draft: 'neutral',
  scheduled: 'primary',
  queued: 'warning',
  sending: 'primary',
  paused: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'neutral',
};

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  queued: 'Na fila',
  sending: 'Enviando',
  paused: 'Pausado',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

export function CampaignsPage() {
  const { clients } = useClients();
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { campaigns, loading, error, reload } = useCampaigns(clientFilter || undefined, statusFilter || undefined);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; status: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const needsForce = ['queued', 'sending', 'paused'].includes(deleteTarget?.status ?? '');

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/campaigns/${deleteTarget.id}${needsForce ? '?force=true' : ''}`);
      setDeleteTarget(null);
      setConfirmPhrase('');
      await reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Erro ao apagar');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Campanhas"
        description={`${campaigns.length} campanha${campaigns.length !== 1 ? 's' : ''}`}
        action={
          <Link to="/campaigns/new">
            <Button><Plus size={14} />Nova campanha</Button>
          </Link>
        }
      />

      <div className="flex gap-2.5 flex-wrap">
        <Select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="w-48">
          <option value="">Todos os clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-40">
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABELS) as CampaignStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </Select>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nenhuma campanha"
          description="Crie sua primeira campanha para começar a enviar e-mails."
          action={
            <Link to="/campaigns/new">
              <Button><Plus size={14} />Criar campanha</Button>
            </Link>
          }
        />
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Nome</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Assunto</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Cliente</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Elegíveis</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Enviados</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Falhas</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {campaigns.map(c => (
                <tr key={c.id} className="hover:bg-surface-soft/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link to={`/campaigns/${c.id}`} className="hover:text-primary hover:underline">{c.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-body max-w-48 truncate">{c.subject}</td>
                  <td className="px-4 py-3 text-body">{(c.clients as { name: string } | null)?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-body">{c.eligible_recipients.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-success font-medium">{c.sent_count.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-error">{c.failed_count > 0 ? c.failed_count.toLocaleString('pt-BR') : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {c.sent_count > 0 && (
                        <Link to={`/campaigns/${c.id}/report`} className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-md" title="Relatório">
                          <BarChart2 size={15} />
                        </Link>
                      )}
                      <Link to={`/campaigns/${c.id}`} className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-md" title="Detalhes">
                        <ChevronRight size={15} />
                      </Link>
                      <button onClick={() => setDeleteTarget({ id: c.id, name: c.name, status: c.status })} className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded-md">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(deleteTarget)} onClose={() => { setDeleteTarget(null); setConfirmPhrase(''); setDeleteError(''); }} title="Apagar campanha" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-error bg-error/10 px-3 py-2 rounded-lg">
            Esta ação remove a campanha e seus dados. Não pode ser desfeita.
          </p>
          {needsForce && (
            <>
              <p className="text-sm text-body">Status: <strong>{STATUS_LABELS[deleteTarget?.status as CampaignStatus]}</strong>. Digite <strong>CANCELAR E APAGAR</strong> para confirmar:</p>
              <Input value={confirmPhrase} onChange={e => { setConfirmPhrase(e.target.value); setDeleteError(''); }} placeholder="CANCELAR E APAGAR" />
            </>
          )}
          {deleteError && <p className="text-sm text-error">{deleteError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setDeleteTarget(null); setConfirmPhrase(''); setDeleteError(''); }}>Cancelar</Button>
            <Button variant="danger" disabled={needsForce && confirmPhrase !== 'CANCELAR E APAGAR'} onClick={() => void handleDelete()} loading={deleting}>
              {needsForce ? 'Cancelar e Apagar' : 'Apagar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
