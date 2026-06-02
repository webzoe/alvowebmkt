import { useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useClients } from '../../hooks/useClients';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { ClientForm } from './ClientForm';
import type { Client } from '../../types';

export function ClientsPage() {
  const { clients, loading, error, createClient, updateClient, deleteClient } = useClients();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [actionError, setActionError] = useState('');

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(c: Client) { setEditing(c); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); setActionError(''); }

  async function handleSubmit(data: Partial<Client>) {
    setActionError('');
    try {
      if (editing) {
        await updateClient(editing.id, data);
      } else {
        await createClient(data);
      }
      closeModal();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteClient(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Clientes"
        description={`${clients.length} cadastrado${clients.length !== 1 ? 's' : ''}`}
        action={<Button onClick={openCreate}><Plus size={14} />Novo cliente</Button>}
      />

      {error && <p className="text-sm text-error">{error}</p>}
      {actionError && <p className="text-sm text-error">{actionError}</p>}

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente cadastrado"
          description="Adicione um cliente para começar a gerenciar campanhas."
          action={<Button onClick={openCreate}><Plus size={14} />Criar primeiro cliente</Button>}
        />
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Nome</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Empresa</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">E-mail</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Telefone</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-surface-soft/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{client.name}</td>
                  <td className="px-4 py-3 text-body">{client.company_name ?? '—'}</td>
                  <td className="px-4 py-3 text-body">{client.email}</td>
                  <td className="px-4 py-3 text-body">{client.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(client)}
                        className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-md transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(client)}
                        className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded-md transition-colors"
                      >
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

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar cliente' : 'Novo cliente'}
        size="lg"
      >
        <ClientForm
          initial={editing}
          onSubmit={d => handleSubmit(d)}
          onCancel={closeModal}
        />
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Excluir cliente"
        size="sm"
      >
        <p className="text-sm text-body mb-5">
          Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void handleDelete()}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
