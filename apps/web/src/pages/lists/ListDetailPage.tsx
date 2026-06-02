import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useContacts } from '../../hooks/useContacts';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { ContactList, ListCleanup } from '../../types';
import { CONTACT_STATUS_LABELS, CONTACT_STATUS_BADGE } from '../contacts/ContactsPage';

export function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [list, setList] = useState<ContactList | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [cleanups, setCleanups] = useState<ListCleanup[]>([]);
  const [cleanupModal, setCleanupModal] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<Record<string, unknown> | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const { contacts, total, loading: contactsLoading, reload } = useContacts(
    id ? { list_id: id, status: statusFilter || undefined, search: search || undefined, page, limit } : {},
  );

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<ContactList>(`/api/lists/${id}`).then(setList).catch(() => setList(null)),
      api.get<ListCleanup[]>(`/api/lists/${id}/cleanups`).then(setCleanups).catch(() => []),
    ]).finally(() => setListLoading(false));
  }, [id]);

  async function runCleanup() {
    if (!id) return;
    setCleanupRunning(true);
    try {
      const result = await api.post<Record<string, unknown>>(`/api/lists/${id}/cleanup`, {});
      setCleanupResult(result);
      // Refresh contacts and list
      await reload();
      const updated = await api.get<ContactList>(`/api/lists/${id}`);
      setList(updated);
      const updatedCleanups = await api.get<ListCleanup[]>(`/api/lists/${id}/cleanups`);
      setCleanups(updatedCleanups);
    } catch (e) {
      setCleanupResult({ error: e instanceof Error ? e.message : 'Erro' });
    } finally {
      setCleanupRunning(false);
    }
  }

  if (listLoading) return <LoadingSpinner className="h-64" />;
  if (!list) return <p className="p-8 text-error">Lista não encontrada.</p>;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/lists')} className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-ink">{list.name}</h1>
          <p className="text-sm text-muted mt-0.5">{list.clients?.name} · {list.contact_count.toLocaleString('pt-BR')} contatos</p>
          {list.description && <p className="text-sm text-body mt-1">{list.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCleanupModal(true)}>
            <Sparkles size={16} />Limpar lista
          </Button>
          <Link to={`/imports/new?list_id=${list.id}&client_id=${list.client_id}`}>
            <Button><Upload size={16} />Importar CSV</Button>
          </Link>
        </div>
      </div>

      {/* Contacts */}
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap">
          <Input
            placeholder="Buscar por e-mail..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-64"
          />
          <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="w-44">
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="unsubscribed">Descadastrado</option>
            <option value="bounced">Bounce</option>
            <option value="complained">Reclamação</option>
            <option value="suppressed">Suprimido</option>
          </Select>
        </div>

        {contactsLoading ? (
          <LoadingSpinner className="h-32" />
        ) : contacts.length === 0 ? (
          <div className="bg-surface-soft rounded-xl p-10 text-center text-sm text-muted">
            Nenhum contato encontrado.{' '}
            <Link to={`/imports/new?list_id=${list.id}&client_id=${list.client_id}`} className="text-primary hover:underline">
              Importar CSV
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface-soft">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">E-mail</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Nome</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {contacts.map(contact => (
                    <tr key={contact.id} className="hover:bg-surface-soft/50 transition-colors">
                      <td className="px-4 py-3 text-body">{contact.email}</td>
                      <td className="px-4 py-3 text-body">
                        {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={CONTACT_STATUS_BADGE[contact.status]}>
                          {CONTACT_STATUS_LABELS[contact.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} limit={limit} onChange={setPage} />
          </>
        )}
      </div>

      {/* Cleanup History */}
      {cleanups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-medium text-ink">Histórico de limpeza</h2>
          <div className="space-y-2">
            {cleanups.map(cl => (
              <div key={cl.id} className="bg-canvas border border-hairline rounded-lg px-4 py-3 text-sm flex items-center gap-6 flex-wrap">
                <span className="text-muted">{new Date(cl.created_at).toLocaleString('pt-BR')}</span>
                <span className="text-body"><strong>{cl.total_analyzed}</strong> analisados</span>
                <span className="text-error">−{cl.removed_bounced + cl.removed_unsubscribed + cl.removed_complained + cl.removed_suppressed} removidos</span>
                {cl.removed_bounced > 0 && <span className="text-muted">{cl.removed_bounced} bounce</span>}
                {cl.removed_unsubscribed > 0 && <span className="text-muted">{cl.removed_unsubscribed} descad.</span>}
                {cl.removed_complained > 0 && <span className="text-muted">{cl.removed_complained} reclam.</span>}
                {cl.removed_suppressed > 0 && <span className="text-muted">{cl.removed_suppressed} suprim.</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cleanup Modal */}
      <Modal open={cleanupModal} onClose={() => { setCleanupModal(false); setCleanupResult(null); }} title="Limpar lista" size="sm">
        {cleanupResult ? (
          <div className="space-y-4">
            {(cleanupResult as { error?: string }).error ? (
              <div className="flex gap-2 text-error items-center"><XCircle size={18} /><span>{(cleanupResult as { error: string }).error}</span></div>
            ) : (
              <>
                <div className="flex gap-2 text-success items-center"><CheckCircle size={18} /><span className="font-medium">Limpeza concluída</span></div>
                <div className="text-sm space-y-1 text-body">
                  <p>{(cleanupResult as { total_analyzed: number }).total_analyzed} contatos analisados</p>
                  <p className="text-error">{
                    ((cleanupResult as { removed_bounced: number }).removed_bounced ?? 0) +
                    ((cleanupResult as { removed_unsubscribed: number }).removed_unsubscribed ?? 0) +
                    ((cleanupResult as { removed_complained: number }).removed_complained ?? 0) +
                    ((cleanupResult as { removed_suppressed: number }).removed_suppressed ?? 0)
                  } vínculos removidos da lista</p>
                  <p className="text-muted text-xs mt-2">Os contatos foram mantidos no banco — apenas desvinculados desta lista.</p>
                </div>
              </>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => { setCleanupModal(false); setCleanupResult(null); }}>Fechar</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-body mb-4">
              Remove desta lista os contatos com status <strong>bounced</strong>, <strong>unsubscribed</strong>, <strong>complained</strong>, <strong>suppressed</strong> ou presentes na lista de supressão. Os contatos <strong>não são excluídos</strong> do banco.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setCleanupModal(false)}>Cancelar</Button>
              <Button onClick={() => void runCleanup()} loading={cleanupRunning}>Limpar agora</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
