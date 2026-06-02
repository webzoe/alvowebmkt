import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { SchedulerResult } from '../../types';

interface HealthData { ok: boolean; service: string; timestamp: string; environment: string }
interface DiagData {
  supabase_ok: boolean;
  pending_scheduled_campaigns: number;
  pending_queue_items: number;
  unprocessed_webhooks: number;
  recent_webhook_errors: { id: string; provider_type: string; event_type: string | null; error_message: string; created_at: string }[];
  env_configured: Record<string, boolean | string>;
  public_routes: Record<string, string>;
  timestamp: string;
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
      <span className="text-sm text-body">{label}</span>
      {ok ? <CheckCircle size={16} className="text-success" /> : <XCircle size={16} className="text-error" />}
    </div>
  );
}

export function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [diag, setDiag] = useState<DiagData | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);

  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerResult, setSchedulerResult] = useState<SchedulerResult | null>(null);
  const [schedulerError, setSchedulerError] = useState('');

  useEffect(() => {
    const workerUrl = (import.meta.env.VITE_WORKER_URL as string) || 'http://localhost:8787';
    fetch(`${workerUrl}/health`)
      .then(r => r.json() as Promise<HealthData>)
      .then(setHealth)
      .catch(() => setHealth(null));

    api.get<DiagData>('/api/diagnostics')
      .then(setDiag)
      .catch(() => setDiag(null))
      .finally(() => setLoadingDiag(false));
  }, []);

  async function runScheduler() {
    setSchedulerRunning(true);
    setSchedulerResult(null);
    setSchedulerError('');
    try {
      const result = await api.post<SchedulerResult>('/api/scheduler/run', {});
      setSchedulerResult(result);
    } catch (e) {
      setSchedulerError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSchedulerRunning(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Configurações</h1>
        <p className="text-sm text-muted mt-0.5">Diagnóstico e operação manual da plataforma</p>
      </div>

      {/* Health */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Health check</h2>
        <div className="bg-canvas border border-hairline rounded-xl p-4">
          {health ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-success" />
                <span className="font-medium text-ink">Worker online</span>
                <span className="text-muted ml-auto">{health.environment}</span>
              </div>
              <p className="text-xs text-muted">{new Date(health.timestamp).toLocaleString('pt-BR')}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-error">
              <XCircle size={16} /> Worker não respondeu em /health
            </div>
          )}
        </div>
      </section>

      {/* Diagnostics */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Diagnóstico</h2>
        {loadingDiag ? (
          <LoadingSpinner className="h-24" />
        ) : diag ? (
          <div className="bg-canvas border border-hairline rounded-xl p-4 space-y-3">
            <StatusRow label="Supabase conectado" ok={diag.supabase_ok} />
            <div className="py-2 border-b border-hairline">
              <div className="flex items-center justify-between">
                <span className="text-sm text-body">Campanhas agendadas pendentes</span>
                <span className="text-sm font-medium text-ink">{diag.pending_scheduled_campaigns}</span>
              </div>
            </div>
            <div className="py-2 border-b border-hairline">
              <div className="flex items-center justify-between">
                <span className="text-sm text-body">Itens pendentes na fila</span>
                <span className="text-sm font-medium text-ink">{diag.pending_queue_items}</span>
              </div>
            </div>
            <div className="py-2 border-b border-hairline">
              <div className="flex items-center justify-between">
                <span className="text-sm text-body">Webhooks não processados</span>
                <span className={`text-sm font-medium ${diag.unprocessed_webhooks > 0 ? 'text-warning' : 'text-ink'}`}>{diag.unprocessed_webhooks}</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Variáveis configuradas</p>
              {Object.entries(diag.env_configured).map(([key, val]) => (
                <StatusRow key={key} label={key} ok={typeof val === 'boolean' ? val : true} />
              ))}
            </div>
            {diag.public_routes && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Rotas públicas de tracking</p>
                {Object.entries(diag.public_routes).map(([key, url]) => (
                  <div key={key} className="flex items-start gap-2 py-1">
                    <span className="text-xs text-muted w-40 shrink-0">{key.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-mono text-body break-all">{url}</span>
                  </div>
                ))}
              </div>
            )}
            {diag.recent_webhook_errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-error uppercase tracking-wide mb-2">Erros recentes de webhook</p>
                {diag.recent_webhook_errors.map(e => (
                  <div key={e.id} className="text-xs bg-error/5 px-3 py-2 rounded-lg">
                    <span className="text-muted">{new Date(e.created_at).toLocaleString('pt-BR')}</span>
                    <span className="mx-2 text-ink">{e.provider_type} / {e.event_type}</span>
                    <span className="text-error">{e.error_message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-error">Não foi possível carregar diagnóstico.</p>
        )}
      </section>

      {/* Scheduler */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Agendador manual</h2>
        <div className="bg-canvas border border-hairline rounded-xl p-5 space-y-4">
          <p className="text-sm text-body">
            Processa campanhas agendadas vencidas e a fila de envio pendente. Em produção isso é feito automaticamente pelo Cron Trigger a cada 5 minutos.
          </p>
          <Button onClick={() => void runScheduler()} loading={schedulerRunning}>
            <RefreshCw size={15} />
            Executar agendador agora
          </Button>

          {schedulerError && <p className="text-sm text-error">{schedulerError}</p>}

          {schedulerResult && (
            <div className="bg-surface-card rounded-lg p-4 text-sm space-y-1.5">
              <p className="font-medium text-ink mb-2">Resultado da execução</p>
              {[
                ['Campanhas agendadas processadas', schedulerResult.campaigns_scheduled_processed],
                ['Destinatários enfileirados', schedulerResult.queued_created],
                ['Itens da fila processados', schedulerResult.queue_processed],
                ['E-mails enviados', schedulerResult.sent],
                ['Falhas', schedulerResult.failed],
                ['Ignorados', schedulerResult.skipped],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-muted">{label as string}</span>
                  <span className="font-medium text-ink">{value as number}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
