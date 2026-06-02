import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, UserX, Upload } from 'lucide-react';
import { useContacts } from '../../hooks/useContacts';
import { useClients } from '../../hooks/useClients';
import { useLists } from '../../hooks/useLists';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import type { BadgeProps } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ContactForm } from './ContactForm';
import type { Contact, ContactStatus } from '../../types';

// Exported so ListDetailPage can reuse them
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  active: 'Ativo',
  unsubscribed: 'Descadastrado',
  bounced: 'Bounce',
  complained: 'Reclamação',
  suppressed: 'Suprimido',
};

export const CONTACT_STATUS_BADGE: Record<ContactStatus, BadgeProps['variant']> = {
  active: 'success',
  unsubscribed: 'neutral',
  bounced: 'warning',
  complained: 'error',
  suppressed: 'error',
};

export function ContactsPage() {
  const { clients } = useClients();
  const [clientFilter, setClientFilter] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const { lists } = useLists(clientFilter || undefined);
  const { contacts, total, loading, error, reload, createContact, deleteContact, suppressContact } = useContacts(
    { client_id: clientFilter || undefined, list_id: listFilter || undefined, status: statusFilter || undefined, search: search || undefined, page, limit }
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [suppressTarget, setSuppressTarget] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [actionError, setActionError] = useState('');

  async function handleCreate(data: Record<string, unknown>) {
    try { await createContact(data); await reload(); setModalOpen(false); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Erro ao criar contato'); }
  }

  async function handleSuppress() {
    if (!suppressTarget) return;
    try { await suppressContact(suppressTarget.id, 'manual'); setSuppressTarget(null); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Erro'); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try { await deleteContact(deleteTarget.id); setDeleteTarget(null); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Erro'); }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Contatos</h1>
          <p className="text-sm text-muted mt-0.5">{total.toLocaleString('pt-BR')} encontrado{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/imports/new${clientFilter ? `?client_id=${clientFilter}${listFilter ? `&list_id=${listFilter}` : ''}` : ''}`}>
            <Button variant="secondary"><Upload size={16} />Importar contatos</Button>
          </Link>
          <Button onClick={() => setModalOpen(true)}><Plus size={16} />Novo contato</Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setListFilter(''); setPage(1); }} className="w-48">
          <option value="">Todos os clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={listFilter} onChange={e => { setListFilter(e.target.value); setPage(1); }} className="w-48" disabled={!clientFilter}>
          <option value="">Todas as listas</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
        <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="w-44">
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="unsubscribed">Descadastrado</option>
          <option value="bounced">Bounce</option>
          <option value="complained">Reclamação</option>
          <option value="suppressed">Suprimido</option>
        </Select>
        <Input
          placeholder="Buscar por e-mail..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
      </div>

      {(error || actionError) && <p className="text-sm text-error">{error ?? actionError}</p>}

      {loading ? (
        <LoadingSpinner className="h-32" />
      ) : contacts.length === 0 ? (
        <div className="bg-surface-soft rounded-xl p-12 text-center text-sm text-muted">Nenhum contato encontrado.</div>
      ) : (
        <div className="space-y-3">
          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">E-mail</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Nome</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Bounces</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {contacts.map(contact => (
                  <tr key={contact.id} className="hover:bg-surface-soft/50 transition-colors">
                    <td className="px-4 py-3 text-body font-mono text-xs">{contact.email}</td>
                    <td className="px-4 py-3 text-body">
                      {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={CONTACT_STATUS_BADGE[contact.status]}>{CONTACT_STATUS_LABELS[contact.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-body">{contact.bounce_count > 0 ? contact.bounce_count : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {contact.status === 'active' && (
                          <button onClick={() => setSuppressTarget(contact)} className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded-md" title="Suprimir">
                            <UserX size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo contato" size="md">
        <ContactForm onSubmit={handleCreate} onCancel={() => setModalOpen(false)} />
      </Modal>

      <Modal open={Boolean(suppressTarget)} onClose={() => setSuppressTarget(null)} title="Suprimir contato" size="sm">
        <p className="text-sm text-body mb-5">
          Suprimir <strong>{suppressTarget?.email}</strong>? O contato será marcado como suprimido e removido de todas as listas.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setSuppressTarget(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void handleSuppress()}>Suprimir</Button>
        </div>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Excluir contato" size="sm">
        <p className="text-sm text-body mb-5">Excluir permanentemente <strong>{deleteTarget?.email}</strong>?</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void handleDelete()}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
