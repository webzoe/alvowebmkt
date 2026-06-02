import { getSupabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportMetrics {
  total_recipients: number;
  eligible_recipients: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  soft_bounced_count: number;
  blocked_policy_count: number;
  rejected_count: number;
  unsubscribed_count: number;
  complained_count: number;
  failed_count: number;
  total_open_events: number;
  total_click_events: number;
}

interface ReportRates {
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  ctor: number;
  bounce_rate: number;
  soft_bounce_rate: number;
  rejection_rate: number;
  unsubscribe_rate: number;
  complaint_rate: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function num(n: number): string {
  return n.toLocaleString('pt-BR');
}

function pct(r: number): string {
  return `${(r * 100).toFixed(1)}%`;
}

function aggregateByHour(
  events: Record<string, string>[],
  field: string,
): { hour: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (!ev[field]) continue;
    const dt = new Date(ev[field]);
    const h = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:00`;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

// ─── Text generators ──────────────────────────────────────────────────────────

function generateSummary(name: string, m: ReportMetrics, r: ReportRates): string {
  let t = `A campanha "${name}" foi enviada para ${num(m.eligible_recipients)} contato${m.eligible_recipients !== 1 ? 's' : ''} elegíve${m.eligible_recipients !== 1 ? 'is' : 'l'}. `;

  if (m.sent_count === 0) return t + 'Nenhum envio foi processado ainda.';

  t += `Do total processado, ${num(m.sent_count)} e-mail${m.sent_count !== 1 ? 's' : ''} fo${m.sent_count !== 1 ? 'ram' : 'i'} enviado${m.sent_count !== 1 ? 's' : ''} com sucesso. `;

  if (m.delivered_count > 0) {
    const dr = r.delivery_rate;
    if (dr >= 0.97) t += `A entregabilidade foi excelente, com taxa de entrega de ${pct(dr)}. `;
    else if (dr >= 0.90) t += `A taxa de entrega foi de ${pct(dr)}. `;
    else t += `A taxa de entrega foi de ${pct(dr)}, abaixo do esperado. `;
  }

  if (r.open_rate >= 0.25) t += `A taxa de abertura foi excelente, atingindo ${pct(r.open_rate)}. `;
  else if (r.open_rate >= 0.15) t += `A taxa de abertura ficou em ${pct(r.open_rate)}, dentro do esperado. `;
  else if (r.open_rate > 0) t += `A taxa de abertura foi de ${pct(r.open_rate)}, abaixo da média esperada. `;

  if (r.click_rate >= 0.03) t += `O engajamento com links foi bom, com ${pct(r.click_rate)} de taxa de cliques. `;
  else if (r.click_rate > 0) t += `A taxa de cliques foi de ${pct(r.click_rate)}. `;

  if (m.bounced_count > 0) t += `Foram registrados ${num(m.bounced_count)} bounce${m.bounced_count !== 1 ? 's' : ''} definitivo${m.bounced_count !== 1 ? 's' : ''}. `;
  if (m.unsubscribed_count > 0) t += `${num(m.unsubscribed_count)} contato${m.unsubscribed_count !== 1 ? 's' : ''} solicitou${m.unsubscribed_count !== 1 ? 'ram' : ''} descadastro. `;
  if (m.complained_count > 0) t += `${num(m.complained_count)} reclamação${m.complained_count !== 1 ? 'ões' : ''} de spam fo${m.complained_count !== 1 ? 'ram' : 'i'} registrada${m.complained_count !== 1 ? 's' : ''}. `;

  return t.trim();
}

function generateDiagnosis(m: ReportMetrics, r: ReportRates): string[] {
  const items: string[] = [];

  // Deliverability
  if (m.sent_count > 0) {
    if (r.delivery_rate >= 0.97) items.push(`Entregabilidade excelente (${pct(r.delivery_rate)}). O servidor de envio mantém boa reputação junto aos provedores.`);
    else if (r.delivery_rate >= 0.90) items.push(`Entregabilidade boa (${pct(r.delivery_rate)}), com margem de melhoria. Verifique endereços que retornaram erros.`);
    else if (r.delivery_rate > 0) items.push(`Entregabilidade abaixo do esperado (${pct(r.delivery_rate)}). Recomenda-se revisar a qualidade da base e a configuração do servidor.`);
  }

  // Hard bounces
  if (r.bounce_rate <= 0.02) items.push(`Bounces definitivos dentro do nível aceitável (${pct(r.bounce_rate)}).`);
  else if (r.bounce_rate <= 0.05) items.push(`Bounces definitivos em nível moderado (${pct(r.bounce_rate)}). Considere remover os endereços inválidos antes do próximo envio.`);
  else items.push(`Volume elevado de bounces definitivos (${pct(r.bounce_rate)}, acima de 5%). Recomenda-se limpeza urgente da base.`);

  // Soft bounces
  if (m.soft_bounced_count > 0) {
    if (r.soft_bounce_rate <= 0.03) items.push(`Soft bounces em nível normal (${pct(r.soft_bounce_rate)}). Esses endereços podem ser tentados novamente.`);
    else items.push(`Soft bounces em volume relevante (${pct(r.soft_bounce_rate)}). Pode indicar caixas de entrada lotadas ou servidores temporariamente indisponíveis.`);
  }

  // Blocked by policy
  if (m.blocked_policy_count > 0) {
    const bp = safe(m.blocked_policy_count, m.sent_count);
    if (bp > 0.05) items.push(`Volume relevante de bloqueios por política (${pct(bp)} dos envios). Pode indicar filtros corporativos, links sinalizados ou velocidade de envio muito alta.`);
    else items.push(`Alguns bloqueios por política foram registrados (${num(m.blocked_policy_count)} ocorrências), dentro do esperado para bases mistas.`);
  }

  // Complaints
  if (m.complained_count > 0) {
    if (r.complaint_rate > 0.001) items.push(`Taxa de reclamações acima do recomendado (${pct(r.complaint_rate)}, ideal < 0,1%). Isso pode impactar a reputação do servidor.`);
    else items.push(`Taxa de reclamações dentro do aceitável (${pct(r.complaint_rate)}).`);
  }

  // Unsubscribes
  if (m.unsubscribed_count > 0) {
    if (r.unsubscribe_rate > 0.02) items.push(`Taxa de descadastros elevada (${pct(r.unsubscribe_rate)}). Pode indicar desalinhamento entre conteúdo e expectativa da audiência.`);
    else items.push(`Taxa de descadastros dentro do esperado (${pct(r.unsubscribe_rate)}).`);
  }

  items.push('A taxa de abertura deve ser interpretada como estimativa. Provedores como Apple Mail com Privacy Protection pré-carregam imagens, podendo inflar as aberturas registradas. Cliques são geralmente a métrica mais confiável de engajamento real.');

  return items;
}

function generateRecommendations(m: ReportMetrics, r: ReportRates): string[] {
  const recs: string[] = [];

  if (r.bounce_rate > 0.03) {
    recs.push('Realizar limpeza da base de contatos antes da próxima campanha. Muitos bounces definitivos foram identificados. Use a funcionalidade de limpeza de lista para remover endereços inválidos.');
  }

  if (r.complaint_rate > 0.001) {
    recs.push('Revisar a origem e qualidade da lista. Taxa de reclamações elevada pode levar ao bloqueio do servidor pelos principais provedores (Gmail, Outlook, Yahoo).');
  }

  if (r.open_rate < 0.15 && m.sent_count > 0) {
    recs.push('Testar diferentes linhas de assunto na próxima campanha. Assuntos mais personalizados, com curiosidade ou urgência tendem a aumentar significativamente a taxa de abertura.');
  }

  if (r.click_rate < 0.02 && r.open_rate >= 0.15) {
    recs.push('A abertura foi satisfatória, mas o engajamento com links foi baixo. Revise o call-to-action, a oferta e o layout para estimular mais cliques.');
  }

  const bp = safe(m.blocked_policy_count, m.sent_count);
  if (bp > 0.05) {
    recs.push('Reduzir a velocidade de envio e revisar o conteúdo do e-mail. Bloqueios por política podem ser causados por links suspeitos, muitas imagens, velocidade muito alta ou conteúdo sinalizado por filtros antispam.');
  }

  if (r.unsubscribe_rate > 0.01) {
    recs.push('Segmentar melhor a lista e considerar reduzir a frequência de envio. Descadastros em volume indicam possível excesso de comunicação ou conteúdo fora do interesse do público-alvo.');
  }

  if (recs.length === 0 || (r.bounce_rate <= 0.02 && r.complaint_rate <= 0.001 && r.open_rate >= 0.20)) {
    recs.push('As métricas gerais da campanha foram positivas. Mantenha a estratégia atual e considere testes A/B (assunto, horário, segmentação) para otimizar os resultados nas próximas campanhas.');
  }

  return recs;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateReportData(campaignId: string, supabaseUrl: string, serviceKey: string) {
  const db = getSupabase(supabaseUrl, serviceKey);

  const { data: campaign } = await db
    .from('campaigns')
    .select('*, clients(*), sending_servers(name, provider_type), campaign_lists(list_id, contact_lists(name))')
    .eq('id', campaignId)
    .single();

  if (!campaign) return null;

  const c = campaign as Record<string, unknown>;

  // Parallel: links, open events, click events
  const [linksData, openEventsData, clickEventsData] = await Promise.all([
    db.from('tracked_links').select('id, original_url, label').eq('campaign_id', campaignId),
    db.from('open_events').select('opened_at').eq('campaign_id', campaignId),
    db.from('click_events').select('clicked_at').eq('campaign_id', campaignId),
  ]);

  // Top links with click counts
  const topLinks = await Promise.all((linksData.data ?? []).map(async link => {
    const l = link as { id: string; original_url: string; label: string | null };
    const [{ count: totalC }, { data: uniqueD }] = await Promise.all([
      db.from('click_events').select('id', { count: 'exact', head: true }).eq('tracked_link_id', l.id),
      db.from('click_events').select('campaign_recipient_id').eq('tracked_link_id', l.id),
    ]);
    const uniqueC = new Set((uniqueD ?? []).map(r => (r as { campaign_recipient_id: string }).campaign_recipient_id)).size;
    return { original_url: l.original_url, label: l.label, total_clicks: totalC ?? 0, unique_clicks: uniqueC };
  }));

  const totalAllClicks = topLinks.reduce((s, l) => s + l.total_clicks, 0);
  const sortedLinks = topLinks
    .sort((a, b) => b.total_clicks - a.total_clicks)
    .slice(0, 10)
    .map(l => ({
      ...l,
      percentage: totalAllClicks > 0 ? Math.round(l.total_clicks / totalAllClicks * 1000) / 10 : 0,
    }));

  const metrics: ReportMetrics = {
    total_recipients: (c.total_recipients as number) ?? 0,
    eligible_recipients: (c.eligible_recipients as number) ?? 0,
    sent_count: (c.sent_count as number) ?? 0,
    delivered_count: (c.delivered_count as number) ?? 0,
    opened_count: (c.opened_count as number) ?? 0,
    clicked_count: (c.clicked_count as number) ?? 0,
    bounced_count: (c.bounced_count as number) ?? 0,
    soft_bounced_count: (c.soft_bounced_count as number) ?? 0,
    blocked_policy_count: (c.blocked_policy_count as number) ?? 0,
    rejected_count: (c.rejected_count as number) ?? 0,
    unsubscribed_count: (c.unsubscribed_count as number) ?? 0,
    complained_count: (c.complained_count as number) ?? 0,
    failed_count: (c.failed_count as number) ?? 0,
    total_open_events: openEventsData.data?.length ?? 0,
    total_click_events: clickEventsData.data?.length ?? 0,
  };

  const delivered = metrics.delivered_count || metrics.sent_count;
  const rates: ReportRates = {
    delivery_rate: safe(metrics.delivered_count, metrics.sent_count),
    open_rate: safe(metrics.opened_count, delivered),
    click_rate: safe(metrics.clicked_count, delivered),
    ctor: safe(metrics.clicked_count, metrics.opened_count),
    bounce_rate: safe(metrics.bounced_count, metrics.sent_count),
    soft_bounce_rate: safe(metrics.soft_bounced_count, metrics.sent_count),
    rejection_rate: safe(metrics.rejected_count, metrics.sent_count),
    unsubscribe_rate: safe(metrics.unsubscribed_count, delivered),
    complaint_rate: safe(metrics.complained_count, delivered),
  };

  const campaignLists = (c.campaign_lists as { contact_lists: { name: string } | null }[] | null) ?? [];

  return {
    campaign: c,
    client: c.clients,
    sending_server: c.sending_servers,
    lists_used: campaignLists.map(cl => ({ name: cl.contact_lists?.name ?? '—' })),
    metrics,
    rates,
    top_links: sortedLinks,
    opens_by_hour: aggregateByHour((openEventsData.data ?? []) as Record<string, string>[], 'opened_at'),
    clicks_by_hour: aggregateByHour((clickEventsData.data ?? []) as Record<string, string>[], 'clicked_at'),
    summary_text: generateSummary((c.name as string) ?? '', metrics, rates),
    technical_diagnosis: generateDiagnosis(metrics, rates),
    recommendations: generateRecommendations(metrics, rates),
    generated_at: new Date().toISOString(),
  };
}
