import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Printer, AlertTriangle, ExternalLink, Sparkles, RefreshCw, RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Button } from '../../components/ui/Button';
import { STATUS_LABELS } from './CampaignsPage';
import type { CampaignReport, CampaignStatus, CampaignReportAIText } from '../../types';

// ─── Print CSS injected into <head> ──────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  [data-app-layout="root"] { display: block !important; height: auto !important; overflow: visible !important; }
  [data-app-layout="main"] { overflow: visible !important; height: auto !important; }
  aside { display: none !important; }
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  @page { size: A4; margin: 15mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .report-section { page-break-inside: avoid; break-inside: avoid; }
  .report-page-break { page-break-before: always; break-before: page; }
  h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
  body, html { background: white !important; }
}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pctStr(r: number): string { return `${(r * 100).toFixed(1)}%`; }

function rateColor(r: number, good: number, warn: number): string {
  if (r >= good) return '#5db872';
  if (r >= warn) return '#d4a017';
  return '#c64545';
}

function inverseColor(r: number, bad: number, warn: number): string {
  if (r <= bad) return '#5db872';
  if (r <= warn) return '#d4a017';
  return '#c64545';
}

function fmt(n: number): string { return n.toLocaleString('pt-BR'); }

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`report-section space-y-4 ${className}`}>
      <div className="border-b-2 border-ink pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MetCard({ label, value, sub, color = '#141413' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-hairline rounded-xl p-4">
      <p className="text-xl font-bold" style={{ color }}>{typeof value === 'number' ? fmt(value) : value}</p>
      <p className="text-xs font-medium text-body-strong mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function RateRow({ label, rate, good, warn, isInverse = false }: {
  label: string; rate: number; good: number; warn: number; isInverse?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, rate * 100));
  const color = isInverse ? inverseColor(rate, good, warn) : rateColor(rate, good, warn);
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm text-muted w-48 shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-surface-card rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold w-14 text-right" style={{ color }}>{pctStr(rate)}</span>
    </div>
  );
}

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? value / total : 0;
  const width = Math.max(5, Math.round(pct * 100));
  return (
    <div className="flex items-center gap-4 py-1">
      <div className="flex-1">
        <div
          className="h-10 flex items-center px-3 rounded-lg text-sm font-semibold text-white"
          style={{ width: `${width}%`, minWidth: 100, backgroundColor: color }}
        >
          {fmt(value)}
        </div>
      </div>
      <div className="w-56 shrink-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-muted">{pctStr(pct)} dos elegíveis</p>
      </div>
    </div>
  );
}

function HourBars({ data, color, label }: { data: { hour: string; count: number }[]; color: string; label: string }) {
  if (data.length === 0) return <p className="text-sm text-muted">Sem dados de {label}.</p>;
  const maxC = Math.max(...data.map(d => d.count));
  const barW = Math.max(6, Math.floor(480 / data.length) - 2);
  const totalW = data.length * (barW + 2);

  return (
    <div>
      <p className="text-xs font-medium text-muted mb-2">{label}</p>
      <svg viewBox={`0 0 ${totalW} 100`} className="w-full" style={{ height: 90 }}>
        {data.map((d, i) => {
          const barH = maxC > 0 ? Math.max(2, Math.round((d.count / maxC) * 70)) : 0;
          const x = i * (barW + 2);
          const y = 80 - barH;
          return (
            <g key={d.hour}>
              <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" />
              {i % Math.max(1, Math.ceil(data.length / 8)) === 0 && (
                <text x={x + barW / 2} y={95} textAnchor="middle" fontSize="7" fill="#6c6a64">
                  {d.hour.slice(11, 16)}
                </text>
              )}
              <title>{`${d.hour}: ${d.count}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main report page ─────────────────────────────────────────────────────────

export function CampaignReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // AI state
  const [aiText, setAiText] = useState<CampaignReportAIText | null>(null);
  const [useAI, setUseAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<CampaignReport>(`/api/campaigns/${id}/report`).then(setReport),
      // Silently load any existing AI text
      api.get<CampaignReportAIText>(`/api/campaigns/${id}/report/ai-text`)
        .then(t => { setAiText(t); setUseAI(true); })
        .catch(() => { /* no AI text yet — that's fine */ }),
    ]).catch(e => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false));

    const style = document.createElement('style');
    style.id = 'report-print-styles';
    style.textContent = PRINT_STYLES;
    document.head.appendChild(style);
    return () => { document.getElementById('report-print-styles')?.remove(); };
  }, [id]);

  async function generateAIText() {
    if (!id) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await api.post<CampaignReportAIText>(
        `/api/campaigns/${id}/report/generate-ai-text`, {},
      );
      setAiText(result);
      setUseAI(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar análise';
      if (msg.includes('AI_DISABLED') || msg.includes('não configurada')) {
        setAiError('IA não configurada. Configure AI_PROVIDER e a chave da API nas variáveis de ambiente do Worker.');
      } else {
        setAiError(msg);
      }
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) return <LoadingSpinner className="h-64" />;
  if (error || !report) return <p className="p-8 text-error">{error || 'Relatório não disponível'}</p>;

  const { campaign, client, sending_server, lists_used, metrics, rates, top_links, opens_by_hour, clicks_by_hour, summary_text, technical_diagnosis, recommendations, generated_at } = report;
  const isPartial = !['completed'].includes(campaign.status);
  const hasSends = metrics.sent_count > 0;

  const FUNNEL_STEPS = [
    { label: 'Elegíveis', value: metrics.eligible_recipients, color: '#8e8b82' },
    { label: 'Enviados', value: metrics.sent_count, color: '#141413' },
    ...(metrics.delivered_count > 0 ? [{ label: 'Entregues', value: metrics.delivered_count, color: '#5db872' }] : []),
    ...(metrics.opened_count > 0 ? [{ label: 'Abertos únicos', value: metrics.opened_count, color: '#cc785c' }] : []),
    ...(metrics.clicked_count > 0 ? [{ label: 'Clicados únicos', value: metrics.clicked_count, color: '#a9583e' }] : []),
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Action bar — hidden in print */}
      <div className="no-print sticky top-0 z-10 bg-canvas border-b border-hairline px-8 py-3 flex items-center gap-3">
        <Link to={`/campaigns/${id}`} className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <span className="text-sm font-medium text-ink flex-1">Relatório: {campaign.name}</span>
        {isPartial && (
          <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-3 py-1 rounded-full">
            <AlertTriangle size={12} />Relatório parcial — campanha em andamento
          </div>
        )}
        {!hasSends && (
          <div className="text-xs text-muted bg-surface-card px-3 py-1 rounded-full">
            Relatório estará completo após o primeiro envio
          </div>
        )}
        {/* AI generation controls */}
        <div className="flex items-center gap-2">
          {aiText && useAI && (
            <button
              onClick={() => setUseAI(false)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink px-2 py-1.5 rounded-md hover:bg-surface-card"
              title="Usar texto automático"
            >
              <RotateCcw size={12} />Auto
            </button>
          )}
          {aiText && !useAI && (
            <button
              onClick={() => setUseAI(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-active px-2 py-1.5 rounded-md hover:bg-primary/5"
            >
              <Sparkles size={12} />Usar IA
            </button>
          )}
          <Button
            size="sm"
            variant={aiText ? 'secondary' : 'primary'}
            onClick={() => void generateAIText()}
            loading={aiLoading}
          >
            {aiText ? <RefreshCw size={13} /> : <Sparkles size={13} />}
            {aiText ? 'Regenerar IA' : 'Gerar análise com IA'}
          </Button>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-ink text-canvas text-sm font-medium rounded-lg hover:bg-body-strong transition-colors"
        >
          <Printer size={15} />
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* Report content */}
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-10">

        {/* Print-only generation date */}
        <div className="print-only hidden text-right text-xs text-muted">
          Gerado em {new Date(generated_at).toLocaleString('pt-BR')}
        </div>

        {/* ── Cover ─────────────────────────────────────────────────────── */}
        <div className="report-section space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Relatório de Campanha</p>
            <h1 className="text-3xl font-bold text-ink leading-tight">{campaign.name}</h1>
            <p className="text-lg text-body">{client?.name ?? '—'}{client?.company_name ? ` — ${client.company_name}` : ''}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border border-hairline rounded-xl p-5">
            {[
              ['Assunto', campaign.subject],
              ['Status', STATUS_LABELS[campaign.status as CampaignStatus]],
              ['Remetente', `${campaign.from_name} <${campaign.from_email}>`],
              ['Servidor', `${(sending_server as { name: string } | null)?.name ?? '—'} (${(sending_server as { provider_type: string } | null)?.provider_type ?? '—'})`],
              ['Modo de envio', campaign.send_speed_mode],
              ['Lote / Intervalo', `${campaign.batch_size ?? '—'} e-mails / ${campaign.batch_interval_minutes ?? '—'} min`],
              ['Início', campaign.started_at ? new Date(campaign.started_at).toLocaleString('pt-BR') : '—'],
              ['Conclusão', campaign.completed_at ? new Date(campaign.completed_at).toLocaleString('pt-BR') : '—'],
              ['Listas', lists_used.map(l => l.name).join(', ') || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted w-32 shrink-0">{label}</dt>
                <dd className="text-ink font-medium">{value}</dd>
              </div>
            ))}
          </div>
        </div>

        {/* AI error */}
        {aiError && (
          <div className="no-print bg-error/10 text-error text-sm px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{aiError}</span>
          </div>
        )}

        {/* AI badge */}
        {useAI && aiText && (
          <div className="no-print flex items-center gap-2 text-xs text-muted bg-surface-card rounded-lg px-4 py-2">
            <Sparkles size={12} className="text-primary" />
            Análise textual gerada com apoio de IA ({aiText.provider} / {aiText.model}) a partir das métricas da campanha.
            <span className="ml-auto text-muted-soft">
              {new Date(aiText.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* ── Executive Summary ─────────────────────────────────────────── */}
        <Section title="Resumo Executivo">
          <div className="bg-surface-card rounded-xl p-6">
            <p className="text-base text-body leading-relaxed">
              {useAI && aiText ? aiText.executive_summary : summary_text}
            </p>
          </div>
          {useAI && aiText?.performance_analysis && (
            <div className="bg-white border border-hairline rounded-xl p-6 mt-3">
              <p className="text-sm font-medium text-muted uppercase tracking-wide mb-2">Análise de Desempenho</p>
              <p className="text-base text-body leading-relaxed">{aiText.performance_analysis}</p>
            </div>
          )}
        </Section>

        {/* ── Key Metrics ───────────────────────────────────────────────── */}
        <Section title="Indicadores Principais">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <MetCard label="Nas listas" value={metrics.total_recipients} />
            <MetCard label="Elegíveis" value={metrics.eligible_recipients} />
            <MetCard label="Enviados" value={metrics.sent_count} color="#141413" />
            <MetCard label="Entregues" value={metrics.delivered_count} color="#5db872" sub={pctStr(rates.delivery_rate)} />
            <MetCard label="Abertos únicos" value={metrics.opened_count} color="#cc785c" sub={pctStr(rates.open_rate)} />
            <MetCard label="Cliques únicos" value={metrics.clicked_count} color="#cc785c" sub={pctStr(rates.click_rate)} />
            <MetCard label="Bounces" value={metrics.bounced_count} color="#c64545" sub={pctStr(rates.bounce_rate)} />
            <MetCard label="Soft bounces" value={metrics.soft_bounced_count} color="#d4a017" />
            <MetCard label="Bloqueados" value={metrics.blocked_policy_count} color="#d4a017" />
            <MetCard label="Rejeitados" value={metrics.rejected_count} color="#c64545" />
            <MetCard label="Descadastros" value={metrics.unsubscribed_count} color="#6c6a64" sub={pctStr(rates.unsubscribe_rate)} />
            <MetCard label="Reclamações" value={metrics.complained_count} color="#c64545" sub={pctStr(rates.complaint_rate)} />
            <MetCard label="Falhas" value={metrics.failed_count} />
            <MetCard label="Total aberturas" value={metrics.total_open_events} sub="incluindo repetições" />
            <MetCard label="Total de cliques" value={metrics.total_click_events} sub="incluindo repetições" />
          </div>
        </Section>

        {/* ── Rates ─────────────────────────────────────────────────────── */}
        <Section title="Taxas de Desempenho">
          <div className="space-y-1">
            <RateRow label="Taxa de entrega"      rate={rates.delivery_rate}    good={0.97} warn={0.90} />
            <RateRow label="Taxa de abertura"     rate={rates.open_rate}        good={0.25} warn={0.15} />
            <RateRow label="Taxa de cliques"      rate={rates.click_rate}       good={0.03} warn={0.01} />
            <RateRow label="CTOR (clique/abertura)" rate={rates.ctor}           good={0.15} warn={0.05} />
            <RateRow label="Bounce rate"          rate={rates.bounce_rate}      good={0.01} warn={0.03} isInverse />
            <RateRow label="Soft bounce rate"     rate={rates.soft_bounce_rate} good={0.02} warn={0.05} isInverse />
            <RateRow label="Rejection rate"       rate={rates.rejection_rate}   good={0.01} warn={0.03} isInverse />
            <RateRow label="Unsubscribe rate"     rate={rates.unsubscribe_rate} good={0.005} warn={0.01} isInverse />
            <RateRow label="Complaint rate"       rate={rates.complaint_rate}   good={0.0005} warn={0.001} isInverse />
          </div>
          <p className="text-xs text-muted mt-2">Verde = bom · Âmbar = atenção · Vermelho = crítico</p>
        </Section>

        {/* ── Funnel ────────────────────────────────────────────────────── */}
        {hasSends && (
          <Section title="Funil da Campanha">
            <div className="space-y-2">
              {FUNNEL_STEPS.map(step => (
                <FunnelBar
                  key={step.label}
                  label={step.label}
                  value={step.value}
                  total={metrics.eligible_recipients}
                  color={step.color}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── Time series ───────────────────────────────────────────────── */}
        {(opens_by_hour.length > 0 || clicks_by_hour.length > 0) && (
          <Section title="Evolução Temporal">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {opens_by_hour.length > 0 && (
                <HourBars data={opens_by_hour} color="#cc785c" label="Aberturas por hora" />
              )}
              {clicks_by_hour.length > 0 && (
                <HourBars data={clicks_by_hour} color="#141413" label="Cliques por hora" />
              )}
            </div>
          </Section>
        )}

        {/* ── Top links ─────────────────────────────────────────────────── */}
        {top_links.length > 0 && (
          <Section title="Links Mais Clicados">
            <div className="border border-hairline rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-soft border-b border-hairline">
                    <th className="px-4 py-2 text-left font-medium text-muted">URL</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Total</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Únicos</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">%</th>
                    <th className="px-3 py-2 no-print"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {top_links.map((link, i) => (
                    <tr key={i} className="hover:bg-surface-soft/50">
                      <td className="px-4 py-2 font-mono text-xs text-body max-w-xs truncate">
                        {link.label ? <><span className="font-medium text-ink">{link.label}</span><span className="text-muted ml-1">({link.original_url.slice(0, 50)}…)</span></> : link.original_url}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-ink">{fmt(link.total_clicks)}</td>
                      <td className="px-3 py-2 text-right text-success">{fmt(link.unique_clicks)}</td>
                      <td className="px-3 py-2 text-right text-muted">{link.percentage.toFixed(1)}%</td>
                      <td className="px-3 py-2 no-print">
                        <a href={link.original_url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-primary">
                          <ExternalLink size={13} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ── Technical diagnosis ──────────────────────────────────────── */}
        <Section title="Diagnóstico Técnico">
          <ul className="space-y-3">
            {(useAI && aiText ? aiText.technical_diagnosis : technical_diagnosis).map((item, i) => (
              <li key={i} className="flex gap-3 text-sm text-body">
                <span className="text-muted shrink-0 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Recommendations ──────────────────────────────────────────── */}
        <Section title="Recomendações">
          <ul className="space-y-3">
            {(useAI && aiText ? aiText.recommendations : recommendations).map((rec, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                <span className="text-body">{rec}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── Final notes ──────────────────────────────────────────────── */}
        <Section title="Observações Finais" className="report-section">
          <div className="bg-surface-soft rounded-xl p-5 space-y-2">
            {useAI && aiText?.final_notes && (
              <p className="text-sm text-body leading-relaxed mb-3">{aiText.final_notes}</p>
            )}
            {[
              'Métricas de abertura podem variar conforme bloqueio de imagens, Apple Mail Privacy Protection, cache de proxy e filtros de segurança corporativos.',
              'Cliques são geralmente mais confiáveis que aberturas para avaliar engajamento real.',
              'Descadastros e bounces foram tratados automaticamente pela plataforma: endereços problemáticos são adicionados à lista de supressão e excluídos de futuras campanhas.',
              ...(useAI && aiText
                ? ['Análise textual gerada com apoio de IA a partir das métricas da campanha. A IA não inventa dados — todos os números são exatamente os registrados pela plataforma.']
                : ['Este relatório foi gerado automaticamente pela plataforma AlvoWebMkt a partir dos dados de envio e tracking.']),
            ].map((note, i) => (
              <p key={i} className="text-xs text-muted leading-relaxed">• {note}</p>
            ))}
          </div>
        </Section>

        {/* Print footer */}
        <div className="print-only hidden border-t border-hairline pt-4 text-center">
          <p className="text-xs text-muted">
            AlvoWebMkt · Relatório gerado em {new Date(generated_at).toLocaleString('pt-BR')}
          </p>
        </div>

      </div>
    </div>
  );
}
