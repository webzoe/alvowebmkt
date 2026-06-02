import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronRight, Upload } from 'lucide-react';
import { useLists } from '../../hooks/useLists';
import { useClients } from '../../hooks/useClients';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { ContactList } from '../../types';

interface ListFormData { client_id: string; name: string; description: string }

function ListModal({ initial, clients, onSubmit, onClose }: {
  initial?: ContactList | null;
  clients: { id: string; name: string }[];
  onSubmit: (d: ListFormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ListFormData>({
    client_id: initial?.client_id ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id) { setErr('Selecione um cliente'); return; }
    if (!form.name.trim()) { setErr('Nome obrigatório'); return; }
    setSubmitting(true);
    try { await onSubmit(form); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Erro'); }
    setSubmitting(false);
  }

  return (
    <form onSubmit={e => { void handle(e); }} className="space-y-4">
      <Select label="Cliente *" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
        <option value="">Selecione...</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Input label="Nome da lista *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
      <Input label="Descrição" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      {err && <p className="text-sm text-error">{err}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" loading={submitting}>{initial ? 'Salvar' : 'Criar lista'}</Button>
      </div>
    </form>
  );
}

export function ListsPage() {
  const { clients } = useClients();
  const [clientFilter, setClientFilter] = useState('');
  const { lists, loading, error, createList, updateList, deleteList } = useLists(clientFilter || undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContactList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactList | null>(null);
  const [actionError, setActionError] = useState('');

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(l: ContactList) { setEditing(l); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); setActionError(''); }

  async function handleSubmit(data: ListFormData) {
    if (editing) { await updateList(editing.id, data); } else { await createList(data); }
    closeModal();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try { await deleteList(deleteTarget.id); setDeleteTarget(null); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Erro'); }
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Listas</h1>
          <p className="text-sm text-muted mt-0.5">{lists.length} lista{lists.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}><Plus size={16} />Nova lista</Button>
      </div>

      <div className="flex gap-3">
        <Select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="w-60">
          <option value="">Todos os clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      {(error || actionError) && <p className="text-sm text-error">{error ?? actionError}</p>}

      {lists.length === 0 ? (
        <div className="bg-surface-soft rounded-xl p-12 text-center">
          <p className="text-muted text-sm">Nenhuma lista criada.</p>
          <Button className="mt-4" onClick={openCreate}><Plus size={16} />Criar lista</Button>
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Lista</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Cliente</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Descrição</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Contatos</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {lists.map(list => (
                <tr key={list.id} className="hover:bg-surface-soft/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link to={`/lists/${list.id}`} className="hover:text-primary hover:underline flex items-center gap-1">
                      {list.name}<ChevronRight size={13} className="text-muted" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body">{list.clients?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted max-w-xs truncate">{list.description ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{(list.contact_count ?? 0).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/imports/new?client_id=${list.client_id}&list_id=${list.id}`}
                        className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-md"
                        title="Importar contatos"
                      >
                        <Upload size={15} />
                      </Link>
                      <Link to={`/lists/${list.id}`} className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-md" title="Ver detalhes">
                        <ChevronRight size={15} />
                      </Link>
                      <button onClick={() => openEdit(list)} className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-md"><Pencil size={15} /></button>
                      <button onClick={() => setDeleteTarget(list)} className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded-md"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar lista' : 'Nova lista'}>
        <ListModal initial={editing} clients={clients} onSubmit={handleSubmit} onClose={closeModal} />
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Excluir lista" size="sm">
        <p className="text-sm text-body mb-5">
          Excluir <strong>{deleteTarget?.name}</strong>? Os contatos vinculados serão desvinculados mas não excluídos.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void handleDelete()}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
