import type { AIReportInput } from './ai-providers/interface';

export const SYSTEM_PROMPT = `Você é um analista profissional de email marketing. Sua tarefa é analisar métricas de desempenho de campanhas e gerar textos para relatórios executivos.

REGRAS OBRIGATÓRIAS:
1. Use SOMENTE os números fornecidos no JSON. NUNCA invente métricas, porcentagens ou dados.
2. Se uma métrica for zero, reconheça isso diretamente em vez de ignorar.
3. NÃO prometa resultados futuros. NÃO use afirmações como "certamente melhorará".
4. NÃO use linguagem exagerada: evite "extraordinário", "incrível", "impressionante".
5. Escreva em português brasileiro formal, claro e consultivo.
6. O relatório será entregue ao cliente final — seja profissional.
7. NÃO mencione nomes internos da plataforma, ferramentas ou sistemas utilizados.
8. NÃO mencione contatos individuais, e-mails ou dados pessoais.
9. Responda APENAS com JSON válido, sem texto antes ou depois do JSON.
10. As taxas no JSON são frações (0.0 a 1.0); converta para percentual ao escrever.`;

export function buildUserMessage(input: AIReportInput): string {
  return `Analise a campanha de email marketing abaixo e gere os textos do relatório executivo.

DADOS DA CAMPANHA:
\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`

Responda com exatamente este JSON (sem texto antes ou depois):
{
  "executive_summary": "Parágrafo único de 3 a 5 frases com o resumo executivo da campanha, citando os números reais.",
  "performance_analysis": "Parágrafo único de 3 a 5 frases analisando o desempenho em detalhe, comparando métricas entre si.",
  "technical_diagnosis": [
    "Item 1 de diagnóstico técnico",
    "Item 2 de diagnóstico técnico",
    "... (entre 3 e 7 itens)"
  ],
  "recommendations": [
    "Recomendação 1 clara e acionável",
    "Recomendação 2",
    "... (entre 2 e 5 recomendações)"
  ],
  "final_notes": "Parágrafo curto de 2 a 3 frases com observações finais e sugestão de próximos passos."
}`;
}

export function extractJson(text: string): Record<string, unknown> | null {
  // Direct parse
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* continue */ }

  // Extract from markdown code block
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1]) as Record<string, unknown>; } catch { /* continue */ }
  }

  // Extract between first { and last }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { /* continue */ }
  }

  return null;
}

export function validateAIResult(
  data: Record<string, unknown>,
  provider: string,
  model: string,
): import('./ai-providers/interface').AIReportTextResult | null {
  if (!data.executive_summary || typeof data.executive_summary !== 'string') return null;
  if (!Array.isArray(data.technical_diagnosis)) return null;
  if (!Array.isArray(data.recommendations)) return null;

  return {
    executive_summary: String(data.executive_summary),
    performance_analysis: typeof data.performance_analysis === 'string' ? data.performance_analysis : '',
    technical_diagnosis: (data.technical_diagnosis as unknown[]).map(String),
    recommendations: (data.recommendations as unknown[]).map(String),
    final_notes: typeof data.final_notes === 'string' ? data.final_notes : '',
    provider,
    model,
  };
}

export function buildAIInput(
  campaign: Record<string, unknown>,
  client: Record<string, unknown> | null,
  sendingServer: Record<string, unknown> | null,
  metrics: AIReportInput['metrics'],
  rates: AIReportInput['rates'],
  topLinks: AIReportInput['top_links'],
): AIReportInput {
  const delivery_issues: string[] = [];
  if (rates.bounce_rate > 0.03) delivery_issues.push(`Hard bounce rate elevado: ${(rates.bounce_rate * 100).toFixed(1)}%`);
  if (rates.complaint_rate > 0.001) delivery_issues.push(`Taxa de reclamações acima do recomendado: ${(rates.complaint_rate * 100).toFixed(2)}%`);
  if (rates.unsubscribe_rate > 0.01) delivery_issues.push(`Taxa de descadastros relevante: ${(rates.unsubscribe_rate * 100).toFixed(1)}%`);

  const warnings: string[] = [];
  if (metrics.blocked_policy_count > metrics.sent_count * 0.05) {
    warnings.push('Volume relevante de bloqueios por política — pode indicar filtros corporativos ou conteúdo sinalizado');
  }
  if (rates.soft_bounce_rate > 0.03) {
    warnings.push('Soft bounce rate elevado — verifique qualidade dos endereços');
  }

  return {
    campaign: {
      name: String(campaign.name ?? ''),
      subject: String(campaign.subject ?? ''),
      status: String(campaign.status ?? ''),
      from_name: String(campaign.from_name ?? ''),
      send_speed_mode: String(campaign.send_speed_mode ?? ''),
      started_at: (campaign.started_at as string | null) ?? null,
      completed_at: (campaign.completed_at as string | null) ?? null,
    },
    client: { name: String((client as { name: string } | null)?.name ?? 'não informado') },
    metrics,
    rates,
    // Only top 5 links, original URL only (no tracking params)
    top_links: topLinks.slice(0, 5).map(l => ({
      original_url: l.original_url,
      total_clicks: l.total_clicks,
      unique_clicks: l.unique_clicks,
    })),
    provider_summary: sendingServer
      ? `${(sendingServer as { name: string }).name} (${(sendingServer as { provider_type: string }).provider_type})`
      : 'não informado',
    delivery_issues,
    warnings,
  };
}
