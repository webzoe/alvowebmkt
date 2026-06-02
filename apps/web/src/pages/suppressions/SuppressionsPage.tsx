import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSuppressions } from '../../hooks/useSuppressions';
import { useClients } from '../../hooks/useClients';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { SuppressionReason } from '../../types';

const REASON_LABELS: Record<SuppressionReason, string> = {
  unsubscribe: 'Descadastro',
  hard_bounce: 'Hard Bounce',
  complaint: 'Reclamação',
  manual: 'Manual',
  import: 'Importação',
  validation_invalid: 'Email inválido',
  validation_risky: 'Email arriscado',
};

export function SuppressionsPage() {
  const { clients } = useClients();
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch] = useState('');
  const { suppressions, loading, error, addSuppression, deleteSuppression } = useSuppressions(clientFilter || undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [form, setForm] = useState({ client_id: '', email: '', reason: 'manual' as SuppressionReason });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = search
    ? suppressions.filter(s => s.email.toLowerCase().includes(search.toLowerCase()))
    : suppressions;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id) { setFormError('Selecione um cliente'); return; }
    if (!form.email.trim()) { setFormError('E-mail obrigatório'); return; }
    setSubmitting(true);
    setFormError('');
    try {
      await addSuppression({ ...form, email: form.email.trim().toLowerCase() });
      setModalOpen(false);
      setForm({ client_id: '', email: '', reason: 'manual' });
    } catch (e2) {
      setFormError(e2 instanceof Error ? e2.message : 'Erro');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteSuppression(deleteTarget.id);
    setDeleteTarget(null);
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Lista de Supressão</h1>
          <p className="text-sm text-muted mt-0.5">{suppressions.length.toLocaleString('pt-BR')} registros</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus size={16} />Adicionar</Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="w-52">
          <option value="">Todos os clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input
          placeholder="Buscar por e-mail..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {filtered.length === 0 ? (
        <div className="bg-surface-soft rounded-xl p-12 text-center text-sm text-muted">
          Nenhum registro de supressão.
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">E-mail</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Motivo</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Origem</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Data</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-surface-soft/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-body">{s.email}</td>
                  <td className="px-4 py-3"><Badge variant="error">{REASON_LABELS[s.reason] ?? s.reason}</Badge></td>
                  <td className="px-4 py-3 text-muted">{s.source ?? '—'}</td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {new Date(s.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button onClick={() => setDeleteTarget({ id: s.id, email: s.email })} className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded-md">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Adicionar supressão">
        <form onSubmit={e => { void handleAdd(e); }} className="space-y-4">
          <Select label="Cliente *" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
            <option value="">Selecione...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="E-mail *" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <Select label="Motivo *" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value as SuppressionReason }))}>
            {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {formError && <p className="text-sm text-error">{formError}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={submitting}>Adicionar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Remover supressão" size="sm">
        <p className="text-sm text-body mb-5">
          Remover <strong>{deleteTarget?.email}</strong> da lista de supressão? O e-mail poderá receber mensagens novamente.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void handleDelete()}>Remover</Button>
        </div>
      </Modal>
    </div>
  );
}
