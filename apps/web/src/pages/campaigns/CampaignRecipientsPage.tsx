import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Pagination } from '../../components/ui/Pagination';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { BadgeProps } from '../../components/ui/Badge';
import type { CampaignRecipient, RecipientStatus, RecipientsPaginated } from '../../types';

const REC_BADGE: Record<RecipientStatus, BadgeProps['variant']> = {
  pending: 'neutral', queued: 'warning', sending: 'primary',
  sent: 'success', failed: 'error', skipped: 'neutral',
  unsubscribed: 'neutral', bounced: 'error', complained: 'error',
  delivered: 'success', opened: 'primary', clicked: 'primary',
  soft_bounced: 'warning', blocked_policy: 'warning', rejected: 'error',
};

const REC_LABELS: Record<RecipientStatus, string> = {
  pending: 'Pendente', queued: 'Na fila', sending: 'Enviando',
  sent: 'Enviado', failed: 'Falhou', skipped: 'Ignorado',
  unsubscribed: 'Descadastrado', bounced: 'Bounce', complained: 'Reclamação',
  delivered: 'Entregue', opened: 'Aberto', clicked: 'Clicou',
  soft_bounced: 'Soft bounce', blocked_policy: 'Bloqueado', rejected: 'Rejeitado',
};

export function CampaignRecipientsPage() {
  const { id } = useParams<{ id: string }>();
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const limit = 50;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    api.get<RecipientsPaginated>(`/api/campaigns/${id}/recipients?${params.toString()}`)
      .then(r => { setRecipients(r.data); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, page, search, status]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/campaigns/${id}`} className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Destinatários</h1>
          <p className="text-sm text-muted mt-0.5">{total.toLocaleString('pt-BR')} no total</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Buscar por e-mail..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-44">
          <option value="">Todos os status</option>
          {(Object.keys(REC_LABELS) as RecipientStatus[]).map(s => (
            <option key={s} value={s}>{REC_LABELS[s]}</option>
          ))}
        </Select>
      </div>

      {loading ? (
        <LoadingSpinner className="h-32" />
      ) : (
        <div className="space-y-3">
          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">E-mail</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Abert.</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Cliq.</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Enviado</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Aberto</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Bounce/Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {recipients.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">Nenhum destinatário.</td></tr>
                ) : recipients.map(r => (
                  <tr key={r.id} className="hover:bg-surface-soft/50">
                    <td className="px-4 py-3 font-mono text-xs text-body">{r.email}</td>
                    <td className="px-4 py-3"><Badge variant={REC_BADGE[r.status]}>{REC_LABELS[r.status]}</Badge></td>
                    <td className="px-4 py-3 text-right text-body text-xs">{r.open_count > 0 ? r.open_count : '—'}</td>
                    <td className="px-4 py-3 text-right text-body text-xs">{r.click_count > 0 ? r.click_count : '—'}</td>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                      {r.opened_at ? new Date(r.opened_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate">
                      {r.bounce_type ? <span className="text-warning">{r.bounce_type}</span>
                       : r.rejection_reason ? <span className="text-error">{r.rejection_reason}</span>
                       : r.error_message ? <span className="text-error">{r.error_message}</span>
                       : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
