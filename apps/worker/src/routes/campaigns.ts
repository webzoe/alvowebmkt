import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { decrypt } from '../lib/crypto';
import { extractTrackableUrls, fakeVars, processHtml } from '../lib/email-html';
import { autoPrepare, autoQueue } from '../lib/scheduler';
import { generateReportData } from '../lib/report-generator';
import { createAIProvider } from '../lib/ai-providers/factory';
import { buildAIInput } from '../lib/ai-prompt';
import { createProvider } from '../providers/factory';
import type { Env, RawCredentials, SendSpeedMode, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Speed presets ───────────────────────────────────────────────────────────

const SPEED_PRESETS: Record<Exclude<SendSpeedMode, 'custom'>, {
  batch_size: number;
  batch_interval_minutes: number;
  max_send_per_hour: number;
  max_send_per_day: number;
}> = {
  safe:   { batch_size: 150, batch_interval_minutes: 20, max_send_per_hour: 450,  max_send_per_day: 1000 },
  normal: { batch_size: 250, batch_interval_minutes: 15, max_send_per_hour: 1000, max_send_per_day: 2000 },
  fast:   { batch_size: 500, batch_interval_minutes: 10, max_send_per_hour: 2000, max_send_per_day: 4000 },
};

// ─── Schema ──────────────────────────────────────────────────────────────────

const campaignSchema = z.object({
  client_id: z.string().uuid(),
  sending_server_id: z.string().uuid(),
  name: z.string().min(1, 'Nome obrigatório'),
  subject: z.string().min(1, 'Assunto obrigatório'),
  preheader: z.string().optional(),
  from_name: z.string().min(1, 'From name obrigatório'),
  from_email: z.string().email('E-mail inválido'),
  reply_to: z.string().email().optional().or(z.literal('')),
  html: z.string().min(1, 'HTML obrigatório'),
  plain_text: z.string().optional(),
  list_ids: z.array(z.string().uuid()).min(1, 'Selecione ao menos uma lista'),
  send_speed_mode: z.enum(['safe', 'normal', 'fast', 'custom']).default('normal'),
  batch_size: z.coerce.number().int().positive().optional(),
  batch_interval_minutes: z.coerce.number().int().positive().optional(),
  max_send_per_hour: z.coerce.number().int().positive().optional(),
  max_send_per_day: z.coerce.number().int().positive().optional(),
  scheduled_at: z.string().optional(),
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const clientId = c.req.query('client_id');
  const status = c.req.query('status');
  const search = c.req.query('search');

  let q = db
    .from('campaigns')
    .select('id, name, subject, status, send_speed_mode, total_recipients, eligible_recipients, queued_count, sent_count, failed_count, paused_reason, scheduled_at, created_at, clients(name), sending_servers(name, provider_type)')
    .order('created_at', { ascending: false });

  if (clientId) q = q.eq('client_id', clientId);
  if (status)   q = q.eq('status', status);
  if (search)   q = q.ilike('name', `%${search}%`);

  const { data, error } = await q.limit(100);
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

router.get('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('campaigns')
    .select('*, clients(name), sending_servers(name, provider_type, verified_domain), campaign_lists(list_id, contact_lists(name))')
    .eq('id', c.req.param('id'))
    .single();

  if (error) return c.json({ error: 'Campanha não encontrada' }, 404);
  return c.json(data);
});

router.post('/', async c => {
  const body = await c.req.json();
  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const { list_ids, send_speed_mode, ...base } = parsed.data;
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  // Validate from_email vs verified_domain
  const { data: server } = await db.from('sending_servers').select('verified_domain').eq('id', base.sending_server_id).single();
  if (server) {
    const s = server as { verified_domain: string | null };
    if (s.verified_domain) {
      const domain = base.from_email.split('@')[1];
      if (domain !== s.verified_domain) {
        return c.json({ error: `from_email deve usar o domínio verificado: ${s.verified_domain}` }, 422);
      }
    }
  }

  // Resolve speed preset
  let speedConfig = {};
  if (send_speed_mode !== 'custom') {
    speedConfig = SPEED_PRESETS[send_speed_mode];
  }

  // If scheduled_at provided, create as 'scheduled'; otherwise 'draft'
  const initialStatus = base.scheduled_at ? 'scheduled' : 'draft';

  const { data: campaign, error } = await db
    .from('campaigns')
    .insert({ ...base, ...speedConfig, send_speed_mode, status: initialStatus })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  const cid = (campaign as { id: string }).id;

  // Save campaign_lists
  await db.from('campaign_lists').insert(list_ids.map(lid => ({ campaign_id: cid, list_id: lid })));

  return c.json(campaign, 201);
});

router.put('/:id', async c => {
  const body = await c.req.json();
  const parsed = campaignSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const campaignId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: existing } = await db.from('campaigns').select('status').eq('id', campaignId).single();
  const status = (existing as { status: string } | null)?.status ?? '';
  if (!['draft', 'paused', 'scheduled'].includes(status)) {
    return c.json({ error: `Campanha com status "${status}" não pode ser editada` }, 400);
  }

  const { list_ids, send_speed_mode, ...base } = parsed.data;
  let speedConfig = {};
  if (send_speed_mode && send_speed_mode !== 'custom') {
    speedConfig = SPEED_PRESETS[send_speed_mode];
  }

  const { data, error } = await db
    .from('campaigns')
    .update({ ...base, ...speedConfig, ...(send_speed_mode ? { send_speed_mode } : {}) })
    .eq('id', campaignId)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  if (list_ids?.length) {
    await db.from('campaign_lists').delete().eq('campaign_id', campaignId);
    await db.from('campaign_lists').insert(list_ids.map(lid => ({ campaign_id: campaignId, list_id: lid })));
  }

  // Invalidate pending recipients/queue when key fields change
  // Only remove PENDING — never touch already-sent/delivered events
  const INVALIDATING = ['html', 'list_ids', 'sending_server_id', 'from_email'];
  const hasInvalidatingChange = list_ids?.length ||
    Object.keys(base).some(k => INVALIDATING.includes(k));

  let recipientsInvalidated = false;
  if (hasInvalidatingChange) {
    const [{ count: pendingRec }, { count: pendingQ }] = await Promise.all([
      db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'pending'),
      db.from('send_queue').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'pending'),
    ]);

    if ((pendingRec ?? 0) + (pendingQ ?? 0) > 0) {
      await Promise.all([
        db.from('campaign_recipients').delete()
          .eq('campaign_id', campaignId).eq('status', 'pending'),
        db.from('send_queue').delete()
          .eq('campaign_id', campaignId).eq('status', 'pending'),
        db.from('campaigns').update({ eligible_recipients: 0, queued_count: 0 })
          .eq('id', campaignId),
      ]);
      recipientsInvalidated = true;
    }
  }

  return c.json({ ...data as Record<string, unknown>, recipients_invalidated: recipientsInvalidated });
});

router.delete('/:id', async c => {
  const campaignId = c.req.param('id');
  const force = c.req.query('force') === 'true';
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: existing } = await db
    .from('campaigns').select('status, client_id, name').eq('id', campaignId).single();
  if (!existing) return c.json({ error: 'Campanha não encontrada' }, 404);

  const status = (existing as { status: string }).status;
  const SIMPLE_DELETE = ['draft', 'scheduled', 'failed', 'cancelled', 'completed'];
  const FORCE_REQUIRED = ['queued', 'sending', 'paused'];

  if (!SIMPLE_DELETE.includes(status) && !FORCE_REQUIRED.includes(status)) {
    return c.json({ error: `Status "${status}" não permite exclusão` }, 400);
  }

  if (FORCE_REQUIRED.includes(status)) {
    // Check for items currently processing
    const { count: processing } = await db
      .from('send_queue').select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId).eq('status', 'processing');

    if ((processing ?? 0) > 0) {
      return c.json({
        error: 'A campanha possui envios em processamento. Aguarde finalizar ou pause antes de apagar.',
        code: 'HAS_PROCESSING',
      }, 409);
    }

    if (!force) {
      return c.json({
        error: 'Campanha ativa requer confirmação avançada.',
        code: 'REQUIRES_FORCE',
        status,
      }, 400);
    }

    // Cancel pending queue items
    await db.from('send_queue').update({ status: 'skipped' })
      .eq('campaign_id', campaignId).eq('status', 'pending');
  }

  // Delete campaign (cascade handles related tables)
  const { error } = await db.from('campaigns').delete().eq('id', campaignId);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// ─── Preview ─────────────────────────────────────────────────────────────────

router.post('/:id/preview', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: campaign } = await db
    .from('campaigns')
    .select('html, clients(name)')
    .eq('id', c.req.param('id'))
    .single();

  if (!campaign) return c.json({ error: 'Campanha não encontrada' }, 404);
  const c3 = campaign as unknown as { html: string; clients: { name: string } | null };

  const vars = fakeVars(c3.clients?.name ?? 'Cliente Exemplo');
  const { html, plainText } = processHtml({
    html: c3.html,
    vars,
    unsubscribeUrl: 'https://app.exemplo.com/unsubscribe/preview-token',
    urlToTracking: new Map(),
  });

  return c.json({
    html,
    plain_text: plainText,
    has_unsubscribe: c3.html.includes('{{unsubscribe_url}}'),
  });
});

// ─── AI report text ──────────────────────────────────────────────────────────

// GET /:id/report/ai-text — last saved AI text for a campaign
router.get('/:id/report/ai-text', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data } = await db
    .from('campaign_report_texts')
    .select('*')
    .eq('campaign_id', c.req.param('id'))
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return c.json({ error: 'Nenhum texto gerado ainda' }, 404);
  return c.json(data);
});

// POST /:id/report/generate-ai-text — generate + save AI report text
router.post('/:id/report/generate-ai-text', async c => {
  const campaignId = c.req.param('id');

  // Check AI provider configured
  let aiProvider;
  try {
    aiProvider = createAIProvider(c.env);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Erro ao criar provider de IA' }, 500);
  }

  if (!aiProvider) {
    return c.json({
      error: 'IA não configurada',
      code: 'AI_DISABLED',
      hint: 'Configure AI_PROVIDER e a API key correspondente nas variáveis de ambiente do Worker.',
    }, 503);
  }

  // Load consolidated report data
  const reportData = await generateReportData(campaignId, c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  if (!reportData) return c.json({ error: 'Campanha não encontrada' }, 404);

  const { metrics, rates, top_links, campaign, client, sending_server } = reportData;

  // Build sanitized AI input (NO personal data, NO credentials)
  const aiInput = buildAIInput(
    campaign as Record<string, unknown>,
    client as Record<string, unknown> | null,
    sending_server as Record<string, unknown> | null,
    metrics,
    rates,
    top_links,
  );

  // Call AI provider
  let result;
  try {
    result = await aiProvider.generateCampaignReportText(aiInput);
  } catch (err) {
    console.error('[ai-report] provider error:', err);
    return c.json({
      error: err instanceof Error ? err.message : 'Erro ao chamar provider de IA',
      provider: aiProvider.getProviderName(),
    }, 502);
  }

  // Save to DB (never save API key — input_snapshot has only aggregated metrics)
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: saved, error: saveErr } = await db
    .from('campaign_report_texts')
    .insert({
      campaign_id: campaignId,
      provider: result.provider,
      model: result.model,
      executive_summary: result.executive_summary,
      performance_analysis: result.performance_analysis,
      technical_diagnosis: result.technical_diagnosis,
      recommendations: result.recommendations,
      final_notes: result.final_notes,
      input_snapshot: aiInput, // only aggregated data, no personal info
    })
    .select()
    .single();

  if (saveErr) {
    console.error('[ai-report] save error:', saveErr);
    // Return result even if save failed
    return c.json({ ...result, saved: false });
  }

  return c.json({ ...saved, saved: true });
});

// ─── Test email ───────────────────────────────────────────────────────────────

router.post('/:id/test', async c => {
  const body = (await c.req.json()) as { recipient_email?: string };
  if (!body.recipient_email) return c.json({ error: 'recipient_email obrigatório' }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: campaign } = await db
    .from('campaigns')
    .select('*, clients(name), sending_servers(credentials_encrypted, provider_type, from_email, from_name, reply_to)')
    .eq('id', c.req.param('id'))
    .single();

  if (!campaign) return c.json({ error: 'Campanha não encontrada' }, 404);

  const c4 = campaign as {
    id: string; html: string; subject: string; client_id: string;
    clients: { name: string } | null;
    sending_servers: { credentials_encrypted: string; provider_type: string; from_email: string; from_name: string; reply_to: string | null } | null;
  };
  const server = c4.sending_servers;
  if (!server) return c.json({ error: 'Servidor de envio não encontrado' }, 400);

  const vars = fakeVars(c4.clients?.name ?? 'Empresa');
  const { html: processedHtml, plainText } = processHtml({
    html: c4.html,
    vars,
    unsubscribeUrl: '#preview-unsubscribe',
    urlToTracking: new Map(),
  });

  try {
    const rawCreds = JSON.parse(await decrypt(server.credentials_encrypted, c.env.ENCRYPTION_KEY)) as RawCredentials;
    const provider = createProvider(server.provider_type, rawCreds, { mailerooBodyMode: c.env.MAILEROO_BODY_MODE });

    const result = await provider.sendEmail({
      from_email: server.from_email,
      from_name: server.from_name,
      reply_to: server.reply_to ?? undefined,
      to_email: body.recipient_email,
      subject: `[TESTE] ${c4.subject}`,
      plain_text: plainText,
      html: processedHtml,
    });

    await db.from('send_logs').insert({
      sending_server_id: (campaign as { sending_server_id: string }).sending_server_id,
      client_id: c4.client_id,
      provider_type: server.provider_type,
      status: 'success',
      recipient_email: body.recipient_email,
      subject: `[TESTE] ${c4.subject}`,
      provider_response: result.response ?? null,
    });

    return c.json({ success: true, response: result.response });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[campaign:test] provider error:', err);
    await db.from('send_logs').insert({
      sending_server_id: (campaign as { sending_server_id: string }).sending_server_id,
      client_id: c4.client_id,
      provider_type: server.provider_type,
      status: 'error',
      recipient_email: body.recipient_email,
      subject: `[TESTE] ${c4.subject}`,
      error_message: msg,
    });
    return c.json({ error: msg }, 500);
  }
});

// ─── Prepare recipients ───────────────────────────────────────────────────────

router.post('/:id/prepare', async c => {
  const campaignId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: campaign } = await db
    .from('campaigns')
    .select('*, campaign_lists(list_id)')
    .eq('id', campaignId)
    .single();

  if (!campaign) return c.json({ error: 'Campanha não encontrada' }, 404);
  const c5 = campaign as { client_id: string; status: string; campaign_lists: { list_id: string }[] };

  if (!['draft', 'scheduled', 'paused'].includes(c5.status)) {
    return c.json({ error: `Status "${c5.status}" não permite preparação` }, 400);
  }

  const listIds = c5.campaign_lists.map(cl => cl.list_id);
  if (listIds.length === 0) return c.json({ error: 'Adicione ao menos uma lista' }, 400);

  // Get all unique contact IDs in selected lists
  const { data: lcData } = await db
    .from('list_contacts')
    .select('contact_id')
    .in('list_id', listIds);

  const allContactIds = [...new Set((lcData ?? []).map(r => (r as { contact_id: string }).contact_id))];
  const totalInLists = allContactIds.length;

  if (allContactIds.length === 0) {
    return c.json({ total_recipients: 0, eligible_recipients: 0 });
  }

  // Get contacts (filter by status)
  const { data: eligibleContacts } = await db
    .from('contacts')
    .select('id, email, first_name, last_name')
    .in('id', allContactIds)
    .eq('client_id', c5.client_id)
    .not('status', 'in', '(unsubscribed,bounced,complained,suppressed)');

  // Get suppressions
  const { data: suppData } = await db
    .from('suppressions')
    .select('email')
    .eq('client_id', c5.client_id);

  const suppressedEmails = new Set((suppData ?? []).map(s => (s as { email: string }).email));

  const eligible = (eligibleContacts ?? []).filter(
    c6 => !suppressedEmails.has((c6 as { email: string }).email),
  ) as { id: string; email: string; first_name: string | null; last_name: string | null }[];

  // Delete existing recipients (re-prepare)
  await db.from('campaign_recipients').delete().eq('campaign_id', campaignId);
  // Also delete existing tracked_links
  await db.from('tracked_links').delete().eq('campaign_id', campaignId);

  // Create recipients with unique unsubscribe tokens
  const recipients = eligible.map(contact => ({
    campaign_id: campaignId,
    contact_id: contact.id,
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    status: 'pending',
    unsubscribe_token: crypto.randomUUID(),
  }));

  const CHUNK = 500;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    await db.from('campaign_recipients').insert(recipients.slice(i, i + CHUNK));
  }

  // Create tracked_links for unique URLs in HTML
  const html = (campaign as { html: string }).html;
  const urls = extractTrackableUrls(html);
  if (urls.length > 0) {
    await db.from('tracked_links').insert(
      urls.map(url => ({ campaign_id: campaignId, original_url: url })),
    );
  }

  // Update campaign counts
  await db.from('campaigns').update({
    total_recipients: totalInLists,
    eligible_recipients: eligible.length,
  }).eq('id', campaignId);

  return c.json({ total_recipients: totalInLists, eligible_recipients: eligible.length, link_count: urls.length });
});

// ─── Queue ────────────────────────────────────────────────────────────────────

router.post('/:id/queue', async c => {
  const campaignId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: campaign } = await db
    .from('campaigns')
    .select('*, sending_servers(id)')
    .eq('id', campaignId)
    .single();

  if (!campaign) return c.json({ error: 'Campanha não encontrada' }, 404);
  const c7 = campaign as {
    client_id: string; status: string; sending_server_id: string;
    batch_size: number | null; batch_interval_minutes: number | null;
    send_speed_mode: string;
  };

  if (!['draft', 'scheduled', 'paused'].includes(c7.status)) {
    return c.json({ error: `Status "${c7.status}" não pode ser enfileirado` }, 400);
  }

  const { data: recipients } = await db
    .from('campaign_recipients')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  if (!recipients?.length) {
    return c.json({ error: 'Execute "Preparar destinatários" primeiro' }, 400);
  }

  const batchSize = c7.batch_size ?? 250;
  const batchInterval = c7.batch_interval_minutes ?? 15;
  const now = Date.now();

  const queueItems = (recipients as { id: string }[]).map((r, i) => ({
    campaign_id: campaignId,
    campaign_recipient_id: r.id,
    sending_server_id: c7.sending_server_id,
    status: 'pending',
    scheduled_at: new Date(now + Math.floor(i / batchSize) * batchInterval * 60 * 1000).toISOString(),
  }));

  const CHUNK = 500;
  for (let i = 0; i < queueItems.length; i += CHUNK) {
    await db.from('send_queue').insert(queueItems.slice(i, i + CHUNK));
  }

  const queuedAt = new Date().toISOString();
  await db.from('campaigns').update({
    status: 'queued',
    queued_count: recipients.length,
    queued_at: queuedAt,
  }).eq('id', campaignId);

  await db.from('campaign_events').insert({
    client_id: c7.client_id,
    campaign_id: campaignId,
    event_type: 'queued',
  });

  return c.json({ queued: recipients.length });
});

// ─── Pause ────────────────────────────────────────────────────────────────────

router.post('/:id/pause', async c => {
  const body = (await c.req.json()) as { reason?: string };
  const campaignId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: existing } = await db.from('campaigns').select('status, client_id').eq('id', campaignId).single();
  const c8 = existing as { status: string; client_id: string } | null;
  if (!c8 || !['queued', 'sending'].includes(c8.status)) {
    return c.json({ error: 'Campanha não está em estado pausável' }, 400);
  }

  await db.from('campaigns').update({ status: 'paused', paused_reason: body.reason ?? null }).eq('id', campaignId);
  await db.from('campaign_events').insert({ client_id: c8.client_id, campaign_id: campaignId, event_type: 'paused', metadata: { reason: body.reason } });

  return c.json({ success: true });
});

// ─── Resume ───────────────────────────────────────────────────────────────────

router.post('/:id/resume', async c => {
  const campaignId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: existing } = await db.from('campaigns').select('status, client_id').eq('id', campaignId).single();
  const c9 = existing as { status: string; client_id: string } | null;
  if (!c9 || c9.status !== 'paused') return c.json({ error: 'Campanha não está pausada' }, 400);

  // Re-unlock stuck queue items
  await db.from('send_queue')
    .update({ locked_at: null, status: 'pending' })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  await db.from('campaigns').update({ status: 'queued', paused_reason: null }).eq('id', campaignId);
  await db.from('campaign_events').insert({ client_id: c9.client_id, campaign_id: campaignId, event_type: 'resumed' });

  return c.json({ success: true });
});

// ─── Cancel ───────────────────────────────────────────────────────────────────

router.post('/:id/cancel', async c => {
  const campaignId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: existing } = await db.from('campaigns').select('status, client_id').eq('id', campaignId).single();
  const c10 = existing as { status: string; client_id: string } | null;
  if (!c10 || ['completed', 'cancelled', 'draft'].includes(c10.status)) {
    return c.json({ error: `Campanha com status "${c10?.status}" não pode ser cancelada` }, 400);
  }

  await db.from('send_queue').update({ status: 'skipped' }).eq('campaign_id', campaignId).eq('status', 'pending');
  await db.from('campaigns').update({ status: 'cancelled' }).eq('id', campaignId);
  await db.from('campaign_events').insert({ client_id: c10.client_id, campaign_id: campaignId, event_type: 'cancelled' });

  return c.json({ success: true });
});

// ─── Recipients ────────────────────────────────────────────────────────────────

router.get('/:id/recipients', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const status = c.req.query('status');
  const search = c.req.query('search');
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));

  let q = db
    .from('campaign_recipients')
    .select('id, email, first_name, last_name, status, sent_at, failed_at, error_message, created_at', { count: 'exact' })
    .eq('campaign_id', c.req.param('id'))
    .order('created_at');

  if (status) q = q.eq('status', status);
  if (search) q = q.ilike('email', `%${search}%`);

  const from = (page - 1) * limit;
  const { data, count, error } = await q.range(from, from + limit - 1);
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ data: data ?? [], total: count ?? 0, page, limit });
});

// ─── Queue stats ─────────────────────────────────────────────────────────────

router.get('/:id/queue-stats', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data } = await db
    .from('send_queue').select('status').eq('campaign_id', c.req.param('id'));

  const stats = { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
  for (const row of data ?? []) {
    const s = (row as { status: string }).status as keyof typeof stats;
    if (s in stats) stats[s]++;
  }
  return c.json(stats);
});

// ─── Duplicate ───────────────────────────────────────────────────────────────

router.post('/:id/duplicate', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: orig } = await db
    .from('campaigns')
    .select('*, campaign_lists(list_id)')
    .eq('id', c.req.param('id'))
    .single();

  if (!orig) return c.json({ error: 'Campanha não encontrada' }, 404);

  const o = orig as Record<string, unknown>;

  const { data: newCampaign, error } = await db
    .from('campaigns')
    .insert({
      client_id: o.client_id,
      sending_server_id: o.sending_server_id,
      name: `Cópia de ${o.name as string}`,
      subject: o.subject,
      preheader: o.preheader,
      from_name: o.from_name,
      from_email: o.from_email,
      reply_to: o.reply_to,
      html: o.html,
      plain_text: o.plain_text,
      send_speed_mode: o.send_speed_mode,
      batch_size: o.batch_size,
      batch_interval_minutes: o.batch_interval_minutes,
      max_send_per_hour: o.max_send_per_hour,
      max_send_per_day: o.max_send_per_day,
      status: 'draft',
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  const newId = (newCampaign as { id: string }).id;
  const lists = (o.campaign_lists as { list_id: string }[]) ?? [];
  if (lists.length > 0) {
    await db.from('campaign_lists').insert(lists.map(l => ({ campaign_id: newId, list_id: l.list_id })));
  }

  return c.json(newCampaign, 201);
});

// ─── Send now (scheduled → queue immediately) ─────────────────────────────────

router.post('/:id/send-now', async c => {
  const campaignId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: raw } = await db
    .from('campaigns')
    .select('*, campaign_lists(list_id)')
    .eq('id', campaignId)
    .single();

  if (!raw) return c.json({ error: 'Campanha não encontrada' }, 404);

  const campaign = raw as unknown as {
    id: string; client_id: string; sending_server_id: string;
    html: string; batch_size: number | null; batch_interval_minutes: number | null;
    status: string; campaign_lists: { list_id: string }[];
  };

  if (!['draft', 'scheduled'].includes(campaign.status)) {
    return c.json({ error: 'Apenas campanhas draft ou scheduled podem ser enviadas agora' }, 400);
  }

  const { count } = await db
    .from('campaign_recipients').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('status', 'pending');

  if ((count ?? 0) === 0) await autoPrepare(campaign, db);

  const queued = await autoQueue(campaign, db);
  return c.json({ success: true, queued });
});

// ─── Report ───────────────────────────────────────────────────────────────────

router.get('/:id/report', async c => {
  const data = await generateReportData(c.req.param('id'), c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  if (!data) return c.json({ error: 'Campanha não encontrada' }, 404);
  return c.json(data);
});

// ─── Campaign events ──────────────────────────────────────────────────────────

router.get('/:id/events', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const eventType = c.req.query('event_type');
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, parseInt(c.req.query('limit') ?? '50', 10));
  const from = (page - 1) * limit;

  let q = db.from('campaign_events')
    .select('id, event_type, event_time, created_at, provider_type, provider_payload, metadata, recipient_id, contact_id', { count: 'exact' })
    .eq('campaign_id', c.req.param('id'))
    .order('created_at', { ascending: false });

  if (eventType) q = q.eq('event_type', eventType);

  const { data, count, error } = await q.range(from, from + limit - 1);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ data: data ?? [], total: count ?? 0, page, limit });
});

// ─── Campaign tracked links ────────────────────────────────────────────────────

router.get('/:id/links', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: links, error } = await db
    .from('tracked_links')
    .select('id, original_url, label, created_at')
    .eq('campaign_id', c.req.param('id'))
    .order('created_at');

  if (error) return c.json({ error: error.message }, 500);

  // Enrich with click counts
  const enriched = await Promise.all((links ?? []).map(async link => {
    const l = link as { id: string; original_url: string; label: string | null; created_at: string };
    const { count: totalClicks } = await db
      .from('click_events').select('id', { count: 'exact', head: true })
      .eq('tracked_link_id', l.id);

    // Unique clicks = distinct campaign_recipient_ids
    const { data: uniqueData } = await db
      .from('click_events').select('campaign_recipient_id')
      .eq('tracked_link_id', l.id);

    const uniqueClicks = new Set((uniqueData ?? []).map(r => (r as { campaign_recipient_id: string }).campaign_recipient_id)).size;

    return { ...l, total_clicks: totalClicks ?? 0, unique_clicks: uniqueClicks };
  }));

  return c.json(enriched);
});

export { router as campaignsRouter };
