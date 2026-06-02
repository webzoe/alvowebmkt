import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useClients } from '../../hooks/useClients';
import { useServers } from '../../hooks/useServers';
import { useLists } from '../../hooks/useLists';
import { HtmlViewer } from '../../components/campaign/HtmlViewer';
import { SPEED_PRESETS, type SendSpeedMode } from '../../types';

const SPEED_OPTIONS: { value: SendSpeedMode; label: string; desc: string }[] = [
  { value: 'safe',   label: 'Seguro',   desc: '150 por lote · 20 min intervalo · 450/h · 1.000/dia' },
  { value: 'normal', label: 'Normal',   desc: '250 por lote · 15 min intervalo · 1.000/h · 2.000/dia' },
  { value: 'fast',   label: 'Rápido',   desc: '500 por lote · 10 min intervalo · 2.000/h · 4.000/dia' },
  { value: 'custom', label: 'Customizado', desc: 'Defina manualmente' },
];

export function NewCampaignPage() {
  const navigate = useNavigate();
  const { clients } = useClients();
  const [clientId, setClientId] = useState('');
  const { servers } = useServers(clientId || undefined);
  const { lists } = useLists(clientId || undefined);

  const [form, setForm] = useState({
    sending_server_id: '',
    name: '',
    subject: '',
    preheader: '',
    from_name: '',
    from_email: '',
    reply_to: '',
    html: '',
    plain_text: '',
    send_speed_mode: 'normal' as SendSpeedMode,
    batch_size: '',
    batch_interval_minutes: '',
    max_send_per_hour: '',
    max_send_per_day: '',
  });
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');


  // Derived speed config
  const speedPreset = form.send_speed_mode !== 'custom'
    ? SPEED_PRESETS[form.send_speed_mode]
    : null;

  function toggleList(id: string) {
    setSelectedListIds(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError('Selecione um cliente'); return; }
    if (!form.sending_server_id) { setError('Selecione um servidor'); return; }
    if (selectedListIds.length === 0) { setError('Selecione ao menos uma lista'); return; }
    if (!form.html.trim()) { setError('HTML obrigatório'); return; }
    if (sendMode === 'schedule' && !scheduledAt) { setError('Informe a data e hora de agendamento'); return; }

    setError('');
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: clientId,
        ...form,
        list_ids: selectedListIds,
      };
      if (sendMode === 'schedule' && scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString();
      }
      if (form.send_speed_mode !== 'custom') {
        delete payload.batch_size;
        delete payload.batch_interval_minutes;
        delete payload.max_send_per_hour;
        delete payload.max_send_per_day;
      } else {
        payload.batch_size = form.batch_size ? parseInt(form.batch_size) : undefined;
        payload.batch_interval_minutes = form.batch_interval_minutes ? parseInt(form.batch_interval_minutes) : undefined;
        payload.max_send_per_hour = form.max_send_per_hour ? parseInt(form.max_send_per_hour) : undefined;
        payload.max_send_per_day = form.max_send_per_day ? parseInt(form.max_send_per_day) : undefined;
      }

      const campaign = await api.post<{ id: string }>('/api/campaigns', payload);
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar campanha');
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <div className="p-8 max-w-4xl space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/campaigns" className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Nova campanha</h1>
          <p className="text-sm text-muted mt-0.5">Preencha todos os campos e salve como rascunho</p>
        </div>
      </div>

      <form onSubmit={e => { void handleSubmit(e); }} className="space-y-8">

        {/* Targeting */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">1. Segmentação</h2>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Cliente *" value={clientId} onChange={e => { setClientId(e.target.value); setForm(p => ({ ...p, sending_server_id: '' })); setSelectedListIds([]); }}>
              <option value="">Selecione...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Servidor de envio *" value={form.sending_server_id} onChange={e => setForm(p => ({ ...p, sending_server_id: e.target.value }))} disabled={!clientId}>
              <option value="">Selecione...</option>
              {servers.filter(s => s.status === 'active').map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.provider_type})</option>
              ))}
            </Select>
          </div>

          {clientId && lists.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-body-strong">Listas * (selecione uma ou mais)</label>
              <div className="grid grid-cols-2 gap-2">
                {lists.map(l => (
                  <label key={l.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${selectedListIds.includes(l.id) ? 'border-primary bg-primary/5' : 'border-hairline hover:bg-surface-soft'}`}>
                    <input type="checkbox" checked={selectedListIds.includes(l.id)} onChange={() => toggleList(l.id)} className="accent-primary" />
                    <span className="text-sm text-ink">{l.name}</span>
                    <span className="text-xs text-muted ml-auto">{l.contact_count.toLocaleString('pt-BR')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Content */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">2. Conteúdo</h2>
          <Input label="Nome da campanha *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Newsletter Junho 2026" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Assunto *" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Confira as novidades de junho!" />
            <Input label="Preheader" value={form.preheader} onChange={e => setForm(p => ({ ...p, preheader: e.target.value }))} placeholder="Prévia do e-mail no inbox" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="From Name *" value={form.from_name} onChange={e => setForm(p => ({ ...p, from_name: e.target.value }))} placeholder="Equipe Alvo" />
            <Input label="From Email *" type="email" value={form.from_email} onChange={e => setForm(p => ({ ...p, from_email: e.target.value }))} placeholder="noreply@seudominio.com" />
          </div>
          <Input label="Reply-To" type="email" value={form.reply_to} onChange={e => setForm(p => ({ ...p, reply_to: e.target.value }))} placeholder="contato@seudominio.com" />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-body-strong">HTML do e-mail *</label>
            <HtmlViewer
              html={form.html}
              subject={form.subject}
              fromEmail={form.from_email}
              fromName={form.from_name}
              plainText={form.plain_text}
              onChange={html => setForm(p => ({ ...p, html }))}
              onPlainTextChange={pt => setForm(p => ({ ...p, plain_text: pt }))}
            />
          </div>
        </section>

        {/* Speed */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">3. Velocidade de envio</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {SPEED_OPTIONS.map(opt => (
              <label key={opt.value} className={`p-3 rounded-xl border cursor-pointer transition-colors ${form.send_speed_mode === opt.value ? 'border-primary bg-primary/5' : 'border-hairline hover:bg-surface-soft'}`}>
                <input type="radio" name="speed" value={opt.value} checked={form.send_speed_mode === opt.value} onChange={() => setForm(p => ({ ...p, send_speed_mode: opt.value }))} className="hidden" />
                <p className="text-sm font-medium text-ink">{opt.label}</p>
                <p className="text-xs text-muted mt-0.5">{opt.desc}</p>
              </label>
            ))}
          </div>

          {speedPreset && (
            <div className="bg-surface-card rounded-lg px-4 py-3 text-xs text-muted flex gap-6 flex-wrap">
              <span>Lote: <strong className="text-ink">{speedPreset.batch_size}</strong></span>
              <span>Intervalo: <strong className="text-ink">{speedPreset.batch_interval_minutes} min</strong></span>
              <span>Máx/hora: <strong className="text-ink">{speedPreset.max_send_per_hour.toLocaleString('pt-BR')}</strong></span>
              <span>Máx/dia: <strong className="text-ink">{speedPreset.max_send_per_day.toLocaleString('pt-BR')}</strong></span>
            </div>
          )}

          {form.send_speed_mode === 'custom' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Input label="Tamanho do lote" type="number" value={form.batch_size} onChange={e => setForm(p => ({ ...p, batch_size: e.target.value }))} placeholder="250" />
              <Input label="Intervalo (min)" type="number" value={form.batch_interval_minutes} onChange={e => setForm(p => ({ ...p, batch_interval_minutes: e.target.value }))} placeholder="15" />
              <Input label="Máx. por hora" type="number" value={form.max_send_per_hour} onChange={e => setForm(p => ({ ...p, max_send_per_hour: e.target.value }))} placeholder="1000" />
              <Input label="Máx. por dia" type="number" value={form.max_send_per_day} onChange={e => setForm(p => ({ ...p, max_send_per_day: e.target.value }))} placeholder="2000" />
            </div>
          )}
        </section>

        {/* Scheduling */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">4. Envio</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['now','schedule'] as const).map(mode => (
              <label key={mode} className={`p-3 rounded-xl border cursor-pointer transition-colors ${sendMode === mode ? 'border-primary bg-primary/5' : 'border-hairline hover:bg-surface-soft'}`}>
                <input type="radio" name="sendMode" value={mode} checked={sendMode === mode} onChange={() => setSendMode(mode)} className="hidden" />
                <p className="text-sm font-medium text-ink">{mode === 'now' ? 'Enviar agora' : 'Agendar envio'}</p>
                <p className="text-xs text-muted mt-0.5">
                  {mode === 'now' ? 'Salvar como rascunho e disparar manualmente' : 'Definir data/hora para envio automático'}
                </p>
              </label>
            ))}
          </div>
          {sendMode === 'schedule' && (
            <Input
              label="Data e hora do envio *"
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
          )}
        </section>

        {error && <p className="text-sm text-error bg-error/10 px-4 py-3 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pb-8">
          <Link to="/campaigns"><Button type="button" variant="secondary">Cancelar</Button></Link>
          <Button type="submit" loading={submitting}>
            {sendMode === 'schedule' ? 'Agendar campanha' : 'Salvar como rascunho'}
          </Button>
        </div>
      </form>

    </div>
  );
}
