import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, CheckCircle, AlertTriangle, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { HtmlViewer } from '../../components/campaign/HtmlViewer';
import { useClients } from '../../hooks/useClients';
import { useServers } from '../../hooks/useServers';
import { useLists } from '../../hooks/useLists';
import { SPEED_PRESETS, type Campaign, type SendSpeedMode } from '../../types';

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Dados', 'HTML', 'Revisão', 'Envio'] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 no-print">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`size-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                done ? 'bg-success text-white' : active ? 'bg-primary text-white' : 'bg-surface-card text-muted'
              }`}>
                {done ? <CheckCircle size={16} /> : n}
              </div>
              <span className={`text-xs mt-1 ${active ? 'text-ink font-medium' : 'text-muted'}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-16 mx-1 mb-4 ${done ? 'bg-success' : 'bg-hairline'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  sending_server_id: string;
  name: string;
  subject: string;
  preheader: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  html: string;
  plain_text: string;
  send_speed_mode: SendSpeedMode;
  batch_size: string;
  batch_interval_minutes: string;
  max_send_per_hour: string;
  max_send_per_day: string;
}

const EMPTY_FORM: FormState = {
  sending_server_id: '', name: '', subject: '', preheader: '',
  from_name: '', from_email: '', reply_to: '',
  html: '', plain_text: '',
  send_speed_mode: 'normal',
  batch_size: '', batch_interval_minutes: '', max_send_per_hour: '', max_send_per_day: '',
};

const SPEED_OPTIONS: { value: SendSpeedMode; label: string; desc: string }[] = [
  { value: 'safe',   label: 'Seguro',      desc: '150 por lote · 20 min · 450/h · 1.000/dia' },
  { value: 'normal', label: 'Normal',      desc: '250 por lote · 15 min · 1.000/h · 2.000/dia' },
  { value: 'fast',   label: 'Rápido',      desc: '500 por lote · 10 min · 2.000/h · 4.000/dia' },
  { value: 'custom', label: 'Customizado', desc: 'Configure manualmente' },
];

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { mode: 'create' | 'edit' }

export function CampaignFormPage({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const { clients } = useClients();
  const [clientId, setClientId] = useState('');
  const { servers } = useServers(clientId || undefined);
  const { lists }   = useLists(clientId || undefined);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');

  const [campaignId, setCampaignId] = useState<string | undefined>(id);
  const [loadingCampaign, setLoadingCampaign] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invalidatedWarning, setInvalidatedWarning] = useState(false);

  // Step state: 1-4
  const initialStep = (() => {
    const t = searchParams.get('tab');
    if (t === 'html') return 2;
    const s = parseInt(searchParams.get('step') ?? '1', 10);
    return s >= 1 && s <= 4 ? s : 1;
  })();
  const [step, setStep] = useState(initialStep);

  // Step 3: test email
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string } | null>(null);

  // Step 4: prepare + queue
  const [prepareResult, setPrepareResult] = useState<{ eligible_recipients: number; total_recipients: number } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [queueing, setQueueing] = useState(false);

  // Load existing campaign for edit mode
  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    api.get<Campaign & { campaign_lists?: { list_id: string }[] }>(`/api/campaigns/${id}`)
      .then(c => {
        setClientId(c.client_id);
        setSelectedListIds((c.campaign_lists ?? []).map(cl => cl.list_id));
        setForm({
          sending_server_id: c.sending_server_id,
          name: c.name,
          subject: c.subject,
          preheader: c.preheader ?? '',
          from_name: c.from_name,
          from_email: c.from_email,
          reply_to: c.reply_to ?? '',
          html: c.html ?? '',
          plain_text: c.plain_text ?? '',
          send_speed_mode: c.send_speed_mode,
          batch_size: c.batch_size?.toString() ?? '',
          batch_interval_minutes: c.batch_interval_minutes?.toString() ?? '',
          max_send_per_hour: c.max_send_per_hour?.toString() ?? '',
          max_send_per_day: c.max_send_per_day?.toString() ?? '',
        });
        if (c.scheduled_at) { setSendMode('schedule'); setScheduledAt(c.scheduled_at.slice(0, 16)); }
        if (c.eligible_recipients > 0) {
          setPrepareResult({ eligible_recipients: c.eligible_recipients, total_recipients: c.total_recipients });
        }
      })
      .catch(() => setError('Não foi possível carregar a campanha.'))
      .finally(() => setLoadingCampaign(false));
  }, [id, mode]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function validateStep1(): string | null {
    if (!clientId) return 'Selecione um cliente';
    if (!form.sending_server_id) return 'Selecione um servidor de envio';
    if (selectedListIds.length === 0) return 'Selecione ao menos uma lista';
    if (!form.name.trim()) return 'Nome da campanha é obrigatório';
    if (!form.subject.trim()) return 'Assunto é obrigatório';
    if (!form.from_name.trim()) return 'From Name é obrigatório';
    if (!form.from_email.trim()) return 'From Email é obrigatório';
    return null;
  }

  function validateStep2(): string | null {
    if (!form.html.trim()) return 'Cole o HTML da campanha';
    return null;
  }

  function buildPayload() {
    const speedConfig = form.send_speed_mode !== 'custom'
      ? SPEED_PRESETS[form.send_speed_mode]
      : {
        batch_size: form.batch_size ? parseInt(form.batch_size) : undefined,
        batch_interval_minutes: form.batch_interval_minutes ? parseInt(form.batch_interval_minutes) : undefined,
        max_send_per_hour: form.max_send_per_hour ? parseInt(form.max_send_per_hour) : undefined,
        max_send_per_day: form.max_send_per_day ? parseInt(form.max_send_per_day) : undefined,
      };

    return {
      client_id: clientId,
      sending_server_id: form.sending_server_id,
      list_ids: selectedListIds,
      name: form.name,
      subject: form.subject,
      preheader: form.preheader || undefined,
      from_name: form.from_name,
      from_email: form.from_email,
      reply_to: form.reply_to || undefined,
      html: form.html,
      plain_text: form.plain_text || undefined,
      send_speed_mode: form.send_speed_mode,
      ...speedConfig,
      ...(sendMode === 'schedule' && scheduledAt
        ? { scheduled_at: new Date(scheduledAt).toISOString() }
        : { scheduled_at: null }),
    };
  }

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    setError('');
    try {
      if (campaignId) {
        const res = await api.put<{ id: string; recipients_invalidated: boolean }>(
          `/api/campaigns/${campaignId}`, buildPayload(),
        );
        if (res.recipients_invalidated) {
          setInvalidatedWarning(true);
          setPrepareResult(null);
        }
        return res.id;
      } else {
        const res = await api.post<{ id: string }>('/api/campaigns', buildPayload());
        setCampaignId(res.id);
        return res.id;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    setError('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      const savedId = await saveDraft();
      if (!savedId) return;
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
      const savedId = await saveDraft();
      if (!savedId) return;
    }
    if (step === 3) {
      // Save if speed/schedule was changed
      if (campaignId) await saveDraft();
    }
    setStep(s => Math.min(4, s + 1));
  }

  async function sendTest() {
    if (!campaignId || !testEmail) return;
    setTestSending(true);
    setTestResult(null);
    try {
      await api.post(`/api/campaigns/${campaignId}/test`, { recipient_email: testEmail });
      setTestResult({ success: true });
    } catch (e) {
      setTestResult({ error: e instanceof Error ? e.message : 'Erro' });
    } finally {
      setTestSending(false);
    }
  }

  async function prepareRecipients() {
    if (!campaignId) return;
    setPreparing(true);
    setError('');
    try {
      const res = await api.post<{ eligible_recipients: number; total_recipients: number }>(
        `/api/campaigns/${campaignId}/prepare`, {},
      );
      setPrepareResult(res);
      setInvalidatedWarning(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao preparar');
    } finally {
      setPreparing(false);
    }
  }

  async function queueCampaign() {
    if (!campaignId) return;
    setQueueing(true);
    setConfirmModal(false);
    setError('');
    try {
      await api.post(`/api/campaigns/${campaignId}/queue`, {});
      navigate(`/campaigns/${campaignId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enfileirar');
    } finally {
      setQueueing(false);
    }
  }

  async function scheduleCampaign() {
    if (!campaignId || !scheduledAt) return;
    const savedId = await saveDraft();
    if (savedId) navigate(`/campaigns/${campaignId}`);
  }

  const speedPreset = form.send_speed_mode !== 'custom' ? SPEED_PRESETS[form.send_speed_mode] : null;
  const batchSize = speedPreset ? speedPreset.batch_size : parseInt(form.batch_size) || 250;
  const batchInterval = speedPreset ? speedPreset.batch_interval_minutes : parseInt(form.batch_interval_minutes) || 15;
  const eligibleCount = prepareResult?.eligible_recipients ?? 0;
  const batchCount = eligibleCount > 0 ? Math.ceil(eligibleCount / batchSize) : 0;
  const totalMin = batchCount * batchInterval;
  const timeEst = totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}min` : `${totalMin}min`;

  const pageTitle = mode === 'create' ? 'Nova campanha' : 'Editar campanha';
  const backLink = campaignId ? `/campaigns/${campaignId}` : '/campaigns';

  if (loadingCampaign) return <LoadingSpinner className="h-64" />;

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={backLink} className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-ink">{pageTitle}</h1>
          {campaignId && <p className="text-xs text-muted mt-0.5">ID: {campaignId}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => void saveDraft()} loading={saving}>
          Salvar rascunho
        </Button>
      </div>

      <StepIndicator current={step} />

      {/* Global error */}
      {error && (
        <div className="bg-error/10 text-error text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={15} />{error}
        </div>
      )}
      {invalidatedWarning && (
        <div className="bg-warning/10 text-warning text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={15} />
          A campanha foi alterada. Prepare os destinatários novamente antes de enviar.
        </div>
      )}

      {/* ── Step 1: Campaign Data ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Segmentação</h2>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Cliente *" value={clientId} onChange={e => {
                setClientId(e.target.value);
                setForm(p => ({ ...p, sending_server_id: '' }));
                setSelectedListIds([]);
              }}>
                <option value="">Selecione...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label="Servidor de envio *" value={form.sending_server_id}
                onChange={e => setForm(p => ({ ...p, sending_server_id: e.target.value }))}
                disabled={!clientId}>
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
                      <input type="checkbox" checked={selectedListIds.includes(l.id)}
                        onChange={() => setSelectedListIds(prev =>
                          prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id]
                        )}
                        className="accent-primary" />
                      <span className="text-sm text-ink">{l.name}</span>
                      <span className="text-xs text-muted ml-auto">{(l.contact_count ?? 0).toLocaleString('pt-BR')}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Conteúdo</h2>
            <Input label="Nome da campanha *" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Assunto *" value={form.subject}
                onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
              <Input label="Preheader" value={form.preheader}
                onChange={e => setForm(p => ({ ...p, preheader: e.target.value }))}
                placeholder="Texto de prévia no inbox" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="From Name *" value={form.from_name}
                onChange={e => setForm(p => ({ ...p, from_name: e.target.value }))} />
              <Input label="From Email *" type="email" value={form.from_email}
                onChange={e => setForm(p => ({ ...p, from_email: e.target.value }))} />
            </div>
            <Input label="Reply-To" type="email" value={form.reply_to}
              onChange={e => setForm(p => ({ ...p, reply_to: e.target.value }))} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Velocidade de envio</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {SPEED_OPTIONS.map(opt => (
                <label key={opt.value} className={`p-3 rounded-xl border cursor-pointer transition-colors ${form.send_speed_mode === opt.value ? 'border-primary bg-primary/5' : 'border-hairline hover:bg-surface-soft'}`}>
                  <input type="radio" name="speed" value={opt.value} checked={form.send_speed_mode === opt.value}
                    onChange={() => setForm(p => ({ ...p, send_speed_mode: opt.value }))} className="hidden" />
                  <p className="text-sm font-medium text-ink">{opt.label}</p>
                  <p className="text-xs text-muted mt-0.5">{opt.desc}</p>
                </label>
              ))}
            </div>
            {form.send_speed_mode === 'custom' && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Input label="Tamanho do lote" type="number" value={form.batch_size}
                  onChange={e => setForm(p => ({ ...p, batch_size: e.target.value }))} placeholder="250" />
                <Input label="Intervalo (min)" type="number" value={form.batch_interval_minutes}
                  onChange={e => setForm(p => ({ ...p, batch_interval_minutes: e.target.value }))} placeholder="15" />
                <Input label="Máx. por hora" type="number" value={form.max_send_per_hour}
                  onChange={e => setForm(p => ({ ...p, max_send_per_hour: e.target.value }))} placeholder="1000" />
                <Input label="Máx. por dia" type="number" value={form.max_send_per_day}
                  onChange={e => setForm(p => ({ ...p, max_send_per_day: e.target.value }))} placeholder="2000" />
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Step 2: HTML Editor ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">HTML da campanha</h2>
            <p className="text-xs text-muted">Cole, edite e visualize. Nenhum envio é feito aqui.</p>
          </div>
          {/* HtmlViewer in local mode — no campaignId passed, no API calls on paste */}
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
      )}

      {/* ── Step 3: Review ───────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Revisão da campanha</h2>

          {/* Summary */}
          <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-2 text-sm">
            {[
              ['Campanha', form.name],
              ['Assunto', form.subject],
              ['Preheader', form.preheader || '—'],
              ['Remetente', `${form.from_name} <${form.from_email}>`],
              ['Servidor', servers.find(s => s.id === form.sending_server_id)?.name ?? '—'],
              ['Listas', lists.filter(l => selectedListIds.includes(l.id)).map(l => l.name).join(', ') || '—'],
              ['Velocidade', form.send_speed_mode],
              ['Lote / Intervalo', speedPreset ? `${speedPreset.batch_size} e-mails / ${speedPreset.batch_interval_minutes} min` : `${form.batch_size || '—'} / ${form.batch_interval_minutes || '—'} min`],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="text-muted w-28 shrink-0">{label}</dt>
                <dd className="text-ink">{value}</dd>
              </div>
            ))}
          </div>

          {/* HTML quick checks */}
          <div className="bg-surface-soft rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Checklist HTML</p>
            {[
              ['HTML preenchido', form.html.trim().length > 0],
              ['Assunto preenchido', form.subject.trim().length > 0],
              ['From preenchido', Boolean(form.from_name && form.from_email)],
              ['Link de descadastro', form.html.includes('{{unsubscribe_url}}'), true],
            ].map(([label, ok, warn]) => (
              <div key={label as string} className="flex items-center gap-2 text-sm">
                {ok
                  ? <CheckCircle size={14} className="text-success" />
                  : warn
                    ? <AlertTriangle size={14} className="text-warning" />
                    : <AlertTriangle size={14} className="text-error" />}
                <span className={ok ? 'text-body' : warn ? 'text-warning' : 'text-error'}>
                  {label as string}
                  {label === 'Link de descadastro' && !ok && ' — rodapé automático será inserido'}
                </span>
              </div>
            ))}
          </div>

          {/* Test email */}
          <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-3">
            <p className="text-sm font-medium text-ink">Enviar e-mail de teste</p>
            <p className="text-xs text-muted">Envie para conferir renderização antes de disparar para a lista.</p>
            {!campaignId ? (
              <p className="text-xs text-warning">Salve o rascunho primeiro para poder enviar teste.</p>
            ) : (
              <>
                <div className="flex gap-3">
                  <Input placeholder="email@teste.com" type="email" value={testEmail}
                    onChange={e => setTestEmail(e.target.value)} className="flex-1" />
                  <Button size="sm" variant="secondary" onClick={() => void sendTest()}
                    loading={testSending} disabled={!testEmail}>
                    <Send size={13} />Enviar teste
                  </Button>
                </div>
                {testResult?.success && <p className="text-xs text-success">Teste enviado com sucesso!</p>}
                {testResult?.error && <p className="text-xs text-error">{testResult.error}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Launch ───────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-6">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Preparar e enviar</h2>

          {/* Prepare */}
          <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-ink">1. Preparar destinatários</p>
              <p className="text-xs text-muted mt-1">
                Calcula os contatos elegíveis das listas selecionadas, excluindo bounces, descadastrados e suprimidos.
              </p>
            </div>

            {prepareResult ? (
              <div className="bg-surface-card rounded-lg px-4 py-3 text-sm">
                <p className="font-medium text-ink">Destinatários preparados</p>
                <p className="text-body mt-1">
                  {prepareResult.total_recipients.toLocaleString('pt-BR')} nas listas →{' '}
                  <strong className="text-success">{prepareResult.eligible_recipients.toLocaleString('pt-BR')} elegíveis</strong>
                  {' '}({(prepareResult.total_recipients - prepareResult.eligible_recipients).toLocaleString('pt-BR')} excluídos)
                </p>
                {eligibleCount > 0 && (
                  <p className="text-xs text-muted mt-1">
                    Estimativa: {timeEst} em {batchCount} lote{batchCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            ) : (
              <Button onClick={() => void prepareRecipients()} loading={preparing}>
                Preparar destinatários
              </Button>
            )}

            {prepareResult && (
              <Button variant="secondary" size="sm" onClick={() => void prepareRecipients()} loading={preparing}>
                Preparar novamente
              </Button>
            )}
          </div>

          {/* Scheduling */}
          <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-4">
            <p className="text-sm font-medium text-ink">2. Modo de envio</p>
            <div className="grid grid-cols-2 gap-3">
              {(['now', 'schedule'] as const).map(m => (
                <label key={m} className={`p-3 rounded-xl border cursor-pointer transition-colors ${sendMode === m ? 'border-primary bg-primary/5' : 'border-hairline hover:bg-surface-soft'}`}>
                  <input type="radio" name="sendMode" value={m} checked={sendMode === m}
                    onChange={() => setSendMode(m)} className="hidden" />
                  <p className="text-sm font-medium text-ink">{m === 'now' ? 'Enfileirar agora' : 'Agendar envio'}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {m === 'now' ? 'Envio inicia imediatamente após confirmar' : 'Definir data e hora'}
                  </p>
                </label>
              ))}
            </div>
            {sendMode === 'schedule' && (
              <Input label="Data e hora *" type="datetime-local" value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)} />
            )}
          </div>

          {/* Launch buttons */}
          {sendMode === 'now' && (
            <Button
              disabled={!prepareResult || prepareResult.eligible_recipients === 0}
              onClick={() => setConfirmModal(true)}
              className="w-full"
            >
              Confirmar e enfileirar campanha →
            </Button>
          )}
          {sendMode === 'schedule' && scheduledAt && (
            <Button
              disabled={!prepareResult || prepareResult.eligible_recipients === 0}
              onClick={() => void scheduleCampaign()}
              loading={saving}
              className="w-full"
            >
              Agendar para {new Date(scheduledAt).toLocaleString('pt-BR')}
            </Button>
          )}
          {prepareResult?.eligible_recipients === 0 && (
            <p className="text-xs text-error text-center">Nenhum destinatário elegível. Verifique as listas e supressões.</p>
          )}
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-4 border-t border-hairline">
        <div className="flex gap-2">
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep(s => s - 1)}>
              ← Voltar
            </Button>
          )}
          {step === 2 && (
            <Link to={campaignId ? `/campaigns/${campaignId}/edit?step=1` : '#'}
              onClick={() => setStep(1)}
              className="text-sm text-primary hover:underline flex items-center gap-1">
              Voltar para dados
            </Link>
          )}
        </div>

        <div className="flex gap-2">
          {step < 4 && (
            <Button onClick={() => void goNext()} loading={saving}>
              {step === 3 ? 'Ir para envio' : 'Próximo'} <ChevronRight size={15} />
            </Button>
          )}
          {step === 4 && campaignId && (
            <Link to={`/campaigns/${campaignId}`}>
              <Button variant="secondary">Ver campanha</Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Confirmation modal ───────────────────────────────────────────── */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Confirmar envio" size="md">
        <div className="space-y-4">
          <p className="text-sm text-body">Confirme os detalhes antes de enfileirar a campanha:</p>
          <div className="bg-surface-card rounded-xl p-4 text-sm space-y-2">
            {[
              ['Campanha', form.name],
              ['Assunto', form.subject],
              ['Cliente', clients.find(c => c.id === clientId)?.name ?? '—'],
              ['Servidor', servers.find(s => s.id === form.sending_server_id)?.name ?? '—'],
              ['Elegíveis', prepareResult?.eligible_recipients.toLocaleString('pt-BR') ?? '—'],
              ['Velocidade', form.send_speed_mode],
              ['Estimativa', timeEst],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="text-muted w-28 shrink-0">{label}</dt>
                <dd className="text-ink font-medium">{value}</dd>
              </div>
            ))}
          </div>
          <p className="text-xs text-warning flex items-center gap-1.5">
            <AlertTriangle size={12} />
            Após enfileirar, o envio será iniciado automaticamente pelo processador de fila.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmModal(false)}>Cancelar</Button>
            <Button onClick={() => void queueCampaign()} loading={queueing}>
              Confirmar e enfileirar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
