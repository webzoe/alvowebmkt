import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Eye, Send, Play, Pause, RotateCcw, XCircle,
  AlertTriangle, Copy, Zap, Trash2, List, Link as LinkIcon, BarChart2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { HtmlViewer } from '../../components/campaign/HtmlViewer';
import { STATUS_BADGE, STATUS_LABELS } from './CampaignsPage';
import type { Campaign, QueueStats, ProcessQueueResult } from '../../types';

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full h-1.5 bg-surface-card rounded-full overflow-hidden">
      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatBox({ label, value, color = 'text-ink' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-canvas border border-hairline rounded-xl p-4 text-center">
      <p className={`text-xl font-semibold ${color}`}>{value.toLocaleString('pt-BR')}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}

const CONFIRM_PHRASE = 'CANCELAR E APAGAR';

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');

  const [previewModal, setPreviewModal] = useState(false);
  const [htmlViewerOpen, setHtmlViewerOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const [testModal, setTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const [pauseModal, setPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  const [deleteModal, setDeleteModal] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const needsForce = ['queued', 'sending', 'paused'].includes(campaign?.status ?? '');

  const [queueResult, setQueueResult] = useState<ProcessQueueResult | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);

  const prepareResult = useRef<{ total_recipients: number; eligible_recipients: number } | null>(null);

  async function loadCampaign() {
    if (!id) return;
    try {
      const [data, stats] = await Promise.all([
        api.get<Campaign>(`/api/campaigns/${id}`),
        api.get<QueueStats>(`/api/campaigns/${id}/queue-stats`).catch(() => null),
      ]);
      setCampaign(data);
      if (stats) setQueueStats(stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCampaign(); }, [id]);

  async function runAction(action: string, body: Record<string, unknown> = {}) {
    if (!id) return;
    setActionLoading(action);
    setError('');
    try {
      const result = await api.post<Record<string, unknown>>(`/api/campaigns/${id}/${action}`, body);
      if (action === 'prepare') {
        prepareResult.current = result as unknown as { total_recipients: number; eligible_recipients: number };
      }
      await loadCampaign();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Erro ao executar ${action}`);
    } finally {
      setActionLoading('');
      setPauseModal(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setActionLoading('delete');
    try {
      await api.delete(`/api/campaigns/${id}${needsForce ? '?force=true' : ''}`);
      navigate('/campaigns');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao apagar');
      setDeleteModal(false);
    } finally {
      setActionLoading('');
    }
  }

  async function handleDuplicate() {
    if (!id) return;
    setActionLoading('duplicate');
    try {
      const newC = await api.post<Campaign>(`/api/campaigns/${id}/duplicate`, {});
      navigate(`/campaigns/${newC.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao duplicar');
    } finally {
      setActionLoading('');
    }
  }

  async function processQueue() {
    setProcessingQueue(true);
    setQueueResult(null);
    try {
      const result = await api.post<ProcessQueueResult>('/api/queue/process', {});
      setQueueResult(result);
      await loadCampaign();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar fila');
    } finally {
      setProcessingQueue(false);
    }
  }

  async function loadPreview() {
    if (!id) return;
    setActionLoading('preview');
    try {
      const data = await api.post<{ html: string }>(`/api/campaigns/${id}/preview`, {});
      setPreviewHtml(data.html);
      setPreviewModal(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no preview');
    } finally {
      setActionLoading('');
    }
  }

  async function sendTest() {
    if (!id || !testEmail) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      await api.post(`/api/campaigns/${id}/test`, { recipient_email: testEmail });
      setTestResult({ success: true });
    } catch (e) {
      setTestResult({ error: e instanceof Error ? e.message : 'Erro' });
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) return <LoadingSpinner className="h-64" />;
  if (!campaign) return <p className="p-8 text-error">Campanha não encontrada.</p>;

  const batchSize = campaign.batch_size ?? 250;
  const interval = campaign.batch_interval_minutes ?? 15;
  const batchCount = campaign.eligible_recipients > 0 ? Math.ceil(campaign.eligible_recipients / batchSize) : 0;
  const totalMin = batchCount * interval;
  const estimatedTime = totalMin >= 60
    ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}min`
    : `${totalMin}min`;
  const sentPct = campaign.eligible_recipients > 0
    ? Math.round((campaign.sent_count / campaign.eligible_recipients) * 100) : 0;

  const isDraft = campaign.status === 'draft';
  const isScheduled = campaign.status === 'scheduled';
  const isPaused = campaign.status === 'paused';
  const isQueued = campaign.status === 'queued';
  const isSending = campaign.status === 'sending';
  const isDone = ['completed', 'cancelled', 'failed'].includes(campaign.status);
  const canEdit = isDraft || isPaused || isScheduled;
  const canDelete = ['draft', 'scheduled', 'failed', 'cancelled', 'completed', 'queued', 'sending', 'paused'].includes(campaign.status);
  const canDuplicate = ['completed', 'failed', 'cancelled', 'draft', 'scheduled'].includes(campaign.status);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <Link to="/campaigns" className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg mt-0.5 shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink truncate">{campaign.name}</h1>
            <Badge variant={STATUS_BADGE[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>
          </div>
          <p className="text-sm text-muted mt-0.5">{campaign.clients?.name} · {campaign.sending_servers?.name}</p>
          {campaign.paused_reason && (
            <p className="text-xs text-warning mt-1 flex items-center gap-1">
              <AlertTriangle size={12} />{campaign.paused_reason}
            </p>
          )}
          {isScheduled && campaign.scheduled_at && (
            <p className="text-xs text-primary mt-1">
              Agendada para {new Date(campaign.scheduled_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={loadPreview} loading={actionLoading === 'preview'}><Eye size={14} />Preview</Button>
          <Button size="sm" variant="ghost" onClick={() => setHtmlViewerOpen(true)}><Eye size={14} />Visualizar HTML</Button>
          <Link to={`/campaigns/${campaign.id}/report`}>
            <Button size="sm" variant={campaign.sent_count > 0 ? 'primary' : 'secondary'}>
              <BarChart2 size={14} />Relatório
            </Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setTestModal(true)}><Send size={14} />Testar</Button>
          {canEdit && (
            <Link to={`/campaigns/${campaign.id}/edit`}>
              <Button size="sm" variant="secondary">Editar campanha</Button>
            </Link>
          )}
          {canDuplicate && <Button size="sm" variant="secondary" onClick={() => void handleDuplicate()} loading={actionLoading === 'duplicate'}><Copy size={14} />Duplicar</Button>}
          {canDelete && <Button size="sm" variant="danger" onClick={() => setDeleteModal(true)}><Trash2 size={14} />Apagar</Button>}
        </div>
      </div>

      {error && <p className="text-sm text-error bg-error/10 px-4 py-3 rounded-lg">{error}</p>}

      {/* Campaign actions */}
      <div className="flex gap-2 flex-wrap">
        {/* Draft/Scheduled: go to wizard step 4 to prepare + queue */}
        {(isDraft || isScheduled) && (
          <Link to={`/campaigns/${campaign.id}/edit?step=4`}>
            <Button>
              <Play size={14} />{isDraft ? 'Preparar e enviar' : 'Gerenciar envio'}
            </Button>
          </Link>
        )}
        {isScheduled && (
          <Button onClick={() => void runAction('send-now')} loading={actionLoading === 'send-now'}>
            <Zap size={14} />Enviar agora
          </Button>
        )}
        {isPaused && campaign.eligible_recipients > 0 && (
          <Button onClick={() => void runAction('resume')} loading={actionLoading === 'resume'}>
            <RotateCcw size={14} />Retomar
          </Button>
        )}
        {(isQueued || isSending) && (
          <Button variant="secondary" onClick={() => setPauseModal(true)}><Pause size={14} />Pausar</Button>
        )}
        {(isQueued || isSending || isPaused) && (
          <Button variant="secondary" onClick={() => void processQueue()} loading={processingQueue}>
            <Zap size={14} />Processar fila agora
          </Button>
        )}
        {!isDone && !isDraft && !isScheduled && (
          <Button variant="danger" onClick={() => void runAction('cancel')} loading={actionLoading === 'cancel'}>
            <XCircle size={14} />Cancelar campanha
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatBox label="Nas listas" value={campaign.total_recipients} />
        <StatBox label="Elegíveis" value={campaign.eligible_recipients} color="text-primary" />
        <StatBox label="Na fila" value={campaign.queued_count} color="text-warning" />
        <StatBox label="Enviados" value={campaign.sent_count} color="text-success" />
        <StatBox label="Falhas" value={campaign.failed_count} color={campaign.failed_count > 0 ? 'text-error' : 'text-ink'} />
      </div>

      {campaign.sent_count > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Progresso</span>
            <span className="font-medium text-ink">{sentPct}%</span>
          </div>
          <ProgressBar value={campaign.sent_count} max={campaign.eligible_recipients} />
        </div>
      )}

      {/* Draft / scheduled CTA */}
      {(isDraft || isScheduled) && campaign.sent_count === 0 && (
        <div className="bg-surface-card rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1 text-sm text-muted">
            {isDraft
              ? 'Campanha em rascunho. Use o wizard para preparar os destinatários e enfileirar o envio.'
              : `Agendada para ${campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString('pt-BR') : '—'}.`}
          </div>
          <Link to={`/campaigns/${campaign.id}/edit?step=4`}>
            <Button size="sm">
              {isDraft ? 'Preparar e enviar →' : 'Ver agendamento →'}
            </Button>
          </Link>
        </div>
      )}

      {/* Delivery metrics */}
      {campaign.sent_count > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Métricas de entrega</h2>
            <div className="flex gap-2">
              <Link to={`/campaigns/${campaign.id}/events`} className="text-xs text-primary hover:underline flex items-center gap-1">
                <List size={12} />Eventos
              </Link>
              <Link to={`/campaigns/${campaign.id}/links`} className="text-xs text-primary hover:underline flex items-center gap-1">
                <LinkIcon size={12} />Links
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatBox label="Entregues" value={campaign.delivered_count} color="text-success" />
            <StatBox label="Abertos únicos" value={campaign.opened_count} color="text-primary" />
            <StatBox label="Cliques únicos" value={campaign.clicked_count} color="text-primary" />
            <StatBox label="Bounces" value={campaign.bounced_count} color="text-error" />
            <StatBox label="Soft bounce" value={campaign.soft_bounced_count} color="text-warning" />
            <StatBox label="Bloqueados" value={campaign.blocked_policy_count} color="text-warning" />
            <StatBox label="Rejeitados" value={campaign.rejected_count} color="text-error" />
            <StatBox label="Descadastros" value={campaign.unsubscribed_count} color="text-muted" />
            <StatBox label="Reclamações" value={campaign.complained_count} color="text-error" />
          </div>
          {/* Rates */}
          <div className="flex gap-6 flex-wrap text-xs text-muted bg-surface-soft rounded-lg px-4 py-3">
            {[
              ['Entrega', campaign.delivered_count, campaign.sent_count],
              ['Abertura', campaign.opened_count, campaign.delivered_count || campaign.sent_count],
              ['Clique', campaign.clicked_count, campaign.delivered_count || campaign.sent_count],
              ['Bounce', campaign.bounced_count, campaign.sent_count],
              ['Descad.', campaign.unsubscribed_count, campaign.delivered_count || campaign.sent_count],
            ].map(([label, num, den]) => {
              const rate = (den as number) > 0 ? Math.round(((num as number) / (den as number)) * 100 * 10) / 10 : 0;
              return (
                <span key={label as string}>
                  {label as string}: <strong className="text-ink">{rate}%</strong>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue stats */}
      {queueStats && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-ink">Fila de envio</h2>
          <div className="grid grid-cols-5 gap-3">
            <StatBox label="Pendente" value={queueStats.pending} color="text-warning" />
            <StatBox label="Processando" value={queueStats.processing} color="text-primary" />
            <StatBox label="Enviado" value={queueStats.sent} color="text-success" />
            <StatBox label="Falhou" value={queueStats.failed} color="text-error" />
            <StatBox label="Ignorado" value={queueStats.skipped} color="text-muted" />
          </div>
        </div>
      )}

      {queueResult && (
        <div className="bg-surface-card rounded-xl p-4 text-sm">
          <p className="font-medium text-ink mb-2">Resultado do processamento</p>
          <div className="grid grid-cols-3 gap-3">
            <div><span className="text-muted">Processados:</span> <strong>{queueResult.processed}</strong></div>
            <div><span className="text-muted">Enviados:</span> <strong className="text-success">{queueResult.sent}</strong></div>
            <div><span className="text-muted">Falhas:</span> <strong className={queueResult.failed > 0 ? 'text-error' : ''}>{queueResult.failed}</strong></div>
          </div>
        </div>
      )}

      {prepareResult.current && (
        <div className="bg-surface-card rounded-xl p-4 text-sm">
          <p className="font-medium text-ink">Destinatários preparados</p>
          <p className="text-body mt-1">
            {prepareResult.current.total_recipients.toLocaleString('pt-BR')} nas listas →{' '}
            <strong className="text-success">{prepareResult.current.eligible_recipients.toLocaleString('pt-BR')} elegíveis</strong>
            {' '}({(prepareResult.current.total_recipients - prepareResult.current.eligible_recipients).toLocaleString('pt-BR')} excluídos)
          </p>
          {campaign.eligible_recipients > 0 && isDraft && (
            <p className="text-xs text-muted mt-1">Estimativa de envio: {estimatedTime} em {batchCount} lotes</p>
          )}
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-ink">Detalhes</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Assunto', campaign.subject],
              ['From', `${campaign.from_name} <${campaign.from_email}>`],
              ['Velocidade', campaign.send_speed_mode],
              ['Lote', `${batchSize} · ${interval} min`],
              ...(campaign.eligible_recipients > 0 ? [['Estimativa', `${estimatedTime} / ${batchCount} lotes`]] : []),
              ...(campaign.scheduled_at ? [['Agendado para', new Date(campaign.scheduled_at).toLocaleString('pt-BR')]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="text-muted w-28 shrink-0">{label}</dt>
                <dd className="text-body">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Listas</h2>
            <Link to={`/campaigns/${campaign.id}/recipients`} className="text-xs text-primary hover:underline">Ver destinatários →</Link>
          </div>
          {(campaign.campaign_lists ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nenhuma lista vinculada.</p>
          ) : (
            <ul className="space-y-1.5">
              {(campaign.campaign_lists ?? []).map(cl => (
                <li key={cl.list_id} className="text-sm text-body flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-primary shrink-0" />
                  {cl.contact_lists?.name ?? cl.list_id}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Modals */}
      <Modal open={previewModal} onClose={() => setPreviewModal(false)} title="Preview" size="lg">
        <div className="text-xs text-muted mb-3">Dados fictícios: João Silva · joao@exemplo.com</div>
        <iframe srcDoc={previewHtml} className="w-full rounded-lg border border-hairline bg-white" style={{ height: '500px' }} sandbox="allow-same-origin" title="Preview" />
        <div className="flex justify-end mt-4"><Button variant="secondary" onClick={() => setPreviewModal(false)}>Fechar</Button></div>
      </Modal>

      <Modal open={testModal} onClose={() => { setTestModal(false); setTestResult(null); }} title="Enviar teste" size="sm">
        <div className="space-y-4">
          <Input label="E-mail de destino" type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="voce@exemplo.com" />
          {testResult?.error && <p className="text-sm text-error">{testResult.error}</p>}
          {testResult?.success && <p className="text-sm text-success">Teste enviado!</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setTestModal(false)}>Cancelar</Button>
            <Button onClick={() => void sendTest()} loading={sendingTest} disabled={!testEmail}>Enviar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={pauseModal} onClose={() => setPauseModal(false)} title="Pausar campanha" size="sm">
        <div className="space-y-4">
          <Input label="Motivo (opcional)" value={pauseReason} onChange={e => setPauseReason(e.target.value)} placeholder="Aguardando revisão" />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setPauseModal(false)}>Cancelar</Button>
            <Button onClick={() => void runAction('pause', { reason: pauseReason || undefined })} loading={actionLoading === 'pause'}>Pausar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteModal} onClose={() => { setDeleteModal(false); setConfirmPhrase(''); }} title="Apagar campanha" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-error bg-error/10 px-3 py-2 rounded-lg">
            Esta ação remove a campanha e seus dados relacionados. Não pode ser desfeita.
          </p>
          {needsForce ? (
            <>
              <p className="text-sm text-body">
                A campanha está <strong>{STATUS_LABELS[campaign.status]}</strong>. Para confirmar, digite{' '}
                <strong className="text-ink">{CONFIRM_PHRASE}</strong>:
              </p>
              <Input value={confirmPhrase} onChange={e => setConfirmPhrase(e.target.value)} placeholder={CONFIRM_PHRASE} />
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => { setDeleteModal(false); setConfirmPhrase(''); }}>Cancelar</Button>
                <Button variant="danger" disabled={confirmPhrase !== CONFIRM_PHRASE} onClick={() => void handleDelete()} loading={actionLoading === 'delete'}>
                  Cancelar e Apagar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancelar</Button>
              <Button variant="danger" onClick={() => void handleDelete()} loading={actionLoading === 'delete'}>Apagar</Button>
            </div>
          )}
        </div>
      </Modal>

      {/* HTML Viewer modal */}
      <Modal open={htmlViewerOpen} onClose={() => setHtmlViewerOpen(false)} title="Visualizador de HTML" size="xl" noPadding>
        <div className="px-0 pt-0 pb-0">
          {campaign && (
            <HtmlViewer
              html={campaign.html ?? ''}
              subject={campaign.subject}
              fromEmail={campaign.from_email}
              fromName={campaign.from_name}
              plainText={campaign.plain_text ?? undefined}
              campaignId={campaign.id}
              readOnly
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
