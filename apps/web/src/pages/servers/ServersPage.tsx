import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Send, KeyRound } from 'lucide-react';
import { useServers } from '../../hooks/useServers';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ServerForm } from './ServerForm';
import type { SendingServer } from '../../types';

const PROVIDER_LABELS: Record<string, string> = {
  maileroo_api: 'Maileroo API',
  smtp: 'SMTP',
};

export function ServersPage() {
  const { servers, loading, error, createServer, updateServer, deleteServer } = useServers();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SendingServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SendingServer | null>(null);
  const [actionError, setActionError] = useState('');

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(s: SendingServer) { setEditing(s); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); setActionError(''); }

  async function handleSubmit(data: Record<string, unknown>) {
    setActionError('');
    try {
      if (editing) {
        await updateServer(editing.id, data);
      } else {
        await createServer(data);
      }
      closeModal();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteServer(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Servidores de Envio</h1>
          <p className="text-sm text-muted mt-0.5">{servers.length} configurado{servers.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          Novo servidor
        </Button>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      {actionError && <p className="text-sm text-error">{actionError}</p>}

      {servers.length === 0 ? (
        <div className="bg-surface-soft rounded-xl p-12 text-center">
          <p className="text-muted text-sm">Nenhum servidor configurado.</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus size={16} /> Criar primeiro servidor
          </Button>
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Servidor</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Cliente</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Provider</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">From</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Creds</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {servers.map(server => (
                <tr key={server.id} className="hover:bg-surface-soft/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{server.name}</td>
                  <td className="px-4 py-3 text-body">{server.clients?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral">{PROVIDER_LABELS[server.provider_type] ?? server.provider_type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-body text-xs">{server.from_email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={server.status === 'active' ? 'success' : 'neutral'}>
                      {server.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <KeyRound size={14} className={server.has_credentials ? 'text-success' : 'text-error'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/servers/${server.id}/test`}
                        className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                        title="Testar envio"
                      >
                        <Send size={15} />
                      </Link>
                      <button
                        onClick={() => openEdit(server)}
                        className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-md transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(server)}
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
        title={editing ? 'Editar servidor' : 'Novo servidor'}
        size="lg"
      >
        <ServerForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={closeModal}
        />
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Excluir servidor"
        size="sm"
      >
        <p className="text-sm text-body mb-5">
          Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Todos os logs associados serão mantidos.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void handleDelete()}>Excluir</Button>
        </div>
      </Modal>
    </div>
  );
}
