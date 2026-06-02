import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { decrypt } from './crypto';
import { processHtml } from './email-html';
import { createProvider } from '../providers/factory';
import type { Env, RawCredentials } from '../types';

const LOCK_BATCH = 20; // Items per cron tick
const MAX_ATTEMPTS = 3;

// ─── Limit checker ──────────────────────────────────────────────────────────

interface ServerRow {
  id: string;
  monthly_limit: number;
  daily_limit: number;
  hourly_limit: number;
  minute_limit: number;
  monthly_used: number;
  daily_used: number;
  hourly_used: number;
  last_monthly_reset_at: string | null;
  last_daily_reset_at: string | null;
  last_hourly_reset_at: string | null;
  credentials_encrypted: string;
  provider_type: string;
  from_email: string;
  from_name: string;
  reply_to: string | null;
}

async function checkAndUpdateLimits(
  server: ServerRow,
  db: SupabaseClient,
): Promise<{ canSend: boolean; reason?: string }> {
  const now = new Date();
  const updates: Record<string, unknown> = {};

  // Monthly reset
  if (server.last_monthly_reset_at) {
    const r = new Date(server.last_monthly_reset_at);
    if (r.getFullYear() !== now.getFullYear() || r.getMonth() !== now.getMonth()) {
      updates.monthly_used = 0;
      updates.last_monthly_reset_at = now.toISOString();
      server.monthly_used = 0;
    }
  } else {
    updates.last_monthly_reset_at = now.toISOString();
  }

  // Daily reset
  if (server.last_daily_reset_at) {
    const r = new Date(server.last_daily_reset_at);
    if (r.toDateString() !== now.toDateString()) {
      updates.daily_used = 0;
      updates.last_daily_reset_at = now.toISOString();
      server.daily_used = 0;
    }
  } else {
    updates.last_daily_reset_at = now.toISOString();
  }

  // Hourly reset
  if (server.last_hourly_reset_at) {
    const r = new Date(server.last_hourly_reset_at);
    if (r.getFullYear() !== now.getFullYear() ||
        r.getMonth() !== now.getMonth() ||
        r.getDate() !== now.getDate() ||
        r.getHours() !== now.getHours()) {
      updates.hourly_used = 0;
      updates.last_hourly_reset_at = now.toISOString();
      server.hourly_used = 0;
    }
  } else {
    updates.last_hourly_reset_at = now.toISOString();
  }

  if (Object.keys(updates).length > 0) {
    await db.from('sending_servers').update(updates).eq('id', server.id);
  }

  if (server.monthly_used >= server.monthly_limit)
    return { canSend: false, reason: 'Limite mensal atingido' };
  if (server.daily_used >= server.daily_limit)
    return { canSend: false, reason: 'Limite diário atingido' };
  if (server.hourly_used >= server.hourly_limit)
    return { canSend: false, reason: 'Limite por hora atingido' };

  return { canSend: true };
}

async function incrementServerUsage(serverId: string, db: SupabaseClient) {
  const { data } = await db
    .from('sending_servers')
    .select('monthly_used, daily_used, hourly_used')
    .eq('id', serverId)
    .single();
  if (!data) return;
  const s = data as { monthly_used: number; daily_used: number; hourly_used: number };
  await db.from('sending_servers').update({
    monthly_used: s.monthly_used + 1,
    daily_used: s.daily_used + 1,
    hourly_used: s.hourly_used + 1,
  }).eq('id', serverId);
}

// ─── Main processor ─────────────────────────────────────────────────────────

export async function processQueueBatch(env: Env): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const db = getSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const now = new Date().toISOString();

  // 1. Select pending items eligible for processing
  const { data: candidates } = await db
    .from('send_queue')
    .select('id, campaign_id, campaign_recipient_id, sending_server_id, attempts')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .is('locked_at', null)
    .order('scheduled_at')
    .limit(LOCK_BATCH);

  if (!candidates?.length) return { processed: 0, sent: 0, failed: 0, skipped: 0 };

  const itemIds = candidates.map(i => (i as { id: string }).id);

  // 2. Lock them
  await db.from('send_queue').update({ locked_at: now }).in('id', itemIds);

  // 3. Load full data for locked items
  type QueueRow = {
    id: string;
    campaign_id: string;
    campaign_recipient_id: string;
    sending_server_id: string;
    attempts: number;
    campaigns: {
      id: string;
      client_id: string;
      html: string;
      subject: string;
      status: string;
      clients: { name: string } | null;
    } | null;
    campaign_recipients: {
      id: string;
      contact_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      unsubscribe_token: string;
    } | null;
    sending_servers: ServerRow | null;
  };

  const { data: items } = await db
    .from('send_queue')
    .select(`
      id, campaign_id, campaign_recipient_id, sending_server_id, attempts,
      campaigns(id, client_id, html, subject, status, clients(name)),
      campaign_recipients(id, contact_id, email, first_name, last_name, unsubscribe_token),
      sending_servers(id, monthly_limit, daily_limit, hourly_limit, minute_limit,
        monthly_used, daily_used, hourly_used,
        last_monthly_reset_at, last_daily_reset_at, last_hourly_reset_at,
        credentials_encrypted, provider_type, from_email, from_name, reply_to)
    `)
    .in('id', itemIds)
    .eq('locked_at', now) as { data: QueueRow[] | null };

  if (!items?.length) return { processed: 0, sent: 0, failed: 0, skipped: 0 };

  let sent = 0, failed = 0, skipped = 0;

  // Load tracked links per campaign (grouped)
  const campaignIds = [...new Set(items.map(i => i.campaign_id))];
  const { data: trackedLinksData } = await db
    .from('tracked_links')
    .select('id, campaign_id, original_url')
    .in('campaign_id', campaignIds);

  const linksByCampaign = new Map<string, Map<string, string>>();
  (trackedLinksData ?? []).forEach(l => {
    const row = l as { id: string; campaign_id: string; original_url: string };
    if (!linksByCampaign.has(row.campaign_id)) linksByCampaign.set(row.campaign_id, new Map());
    linksByCampaign.get(row.campaign_id)!.set(row.original_url, row.id);
  });

  for (const item of items) {
    // Supabase may return joins as arrays or objects depending on version/config
    const campaign = Array.isArray(item.campaigns) ? item.campaigns[0] : item.campaigns;
    const recipient = Array.isArray(item.campaign_recipients) ? item.campaign_recipients[0] : item.campaign_recipients;
    const server = Array.isArray(item.sending_servers) ? item.sending_servers[0] : item.sending_servers;

    // Skip if data missing or campaign cancelled/failed
    if (!campaign || !recipient || !server ||
        ['cancelled', 'failed'].includes(campaign.status)) {
      await db.from('send_queue').update({ status: 'skipped', processed_at: now }).eq('id', item.id);
      skipped++;
      continue;
    }

    // Check limits
    const limitCheck = await checkAndUpdateLimits(server, db);
    if (!limitCheck.canSend) {
      // Pause campaign and skip remaining
      await db.from('campaigns').update({
        status: 'paused',
        paused_reason: limitCheck.reason,
      }).eq('id', campaign.id).eq('status', 'sending');

      await db.from('send_queue').update({ status: 'skipped', processed_at: now }).eq('id', item.id);
      await db.from('campaign_events').insert({
        client_id: campaign.client_id,
        campaign_id: campaign.id,
        event_type: 'paused',
        metadata: { reason: limitCheck.reason },
      });
      skipped++;
      continue;
    }

    // Mark campaign as sending (first item)
    if (campaign.status === 'queued') {
      await db.from('campaigns').update({
        status: 'sending',
        started_at: now,
      }).eq('id', campaign.id).eq('status', 'queued');
    }

    // Build tracking URL map
    const urlMap = linksByCampaign.get(campaign.id) ?? new Map<string, string>();
    const appUrl = env.APP_URL ?? '';
    const trackingMap = new Map<string, string>();
    urlMap.forEach((linkId, originalUrl) => {
      trackingMap.set(originalUrl, `${appUrl}/click/${recipient.unsubscribe_token}/${linkId}`);
    });

    // Build vars
    const unsubscribeUrl = `${appUrl}/unsubscribe/${recipient.unsubscribe_token}`;
    const vars: Record<string, string> = {
      first_name: recipient.first_name ?? '',
      last_name: recipient.last_name ?? '',
      email: recipient.email,
      client_name: campaign.clients?.name ?? '',
      unsubscribe_url: unsubscribeUrl,
      current_date: new Date().toLocaleDateString('pt-BR'),
    };

    const trackingPixelUrl = appUrl
      ? `${appUrl}/open/${recipient.unsubscribe_token}.gif`
      : undefined;

    const { html: finalHtml, plainText } = processHtml({
      html: campaign.html,
      vars,
      unsubscribeUrl,
      urlToTracking: trackingMap,
      trackingPixelUrl,
    });

    // Send via provider
    try {
      const rawCreds = JSON.parse(
        await decrypt(server.credentials_encrypted, env.ENCRYPTION_KEY),
      ) as RawCredentials;

      const provider = createProvider(server.provider_type, rawCreds, { mailerooBodyMode: env.MAILEROO_BODY_MODE });

      const result = await provider.sendEmail({
        from_email: server.from_email,
        from_name: server.from_name,
        reply_to: server.reply_to ?? undefined,
        to_email: recipient.email,
        to_name: recipient.first_name ?? undefined,
        subject: campaign.subject,
        plain_text: plainText,
        html: finalHtml,
      });

      const sentAt = new Date().toISOString();

      await Promise.all([
        db.from('send_queue').update({ status: 'sent', processed_at: sentAt }).eq('id', item.id),
        db.from('campaign_recipients').update({
          status: 'sent',
          sent_at: sentAt,
          provider_message_id: (result.response?.message_id as string) ?? null,
        }).eq('id', recipient.id),
        db.from('campaigns').update({
          sent_count: campaign.id, // We use RPC-like pattern below
        }),
        db.from('campaign_events').insert({
          client_id: campaign.client_id,
          campaign_id: campaign.id,
          recipient_id: recipient.id,
          contact_id: recipient.contact_id,
          event_type: 'sent',
          provider_type: server.provider_type,
        }),
        db.from('contacts').update({ last_sent_at: sentAt }).eq('id', recipient.contact_id),
      ]);

      // Increment counters manually (no-RPC fallback)
      await db.from('campaigns')
        .select('sent_count')
        .eq('id', campaign.id)
        .single()
        .then(async ({ data }) => {
          if (data) {
            await db.from('campaigns')
              .update({ sent_count: (data as { sent_count: number }).sent_count + 1 })
              .eq('id', campaign.id);
          }
        });

      await incrementServerUsage(server.id, db);

      // Save send log
      await db.from('send_logs').insert({
        sending_server_id: server.id,
        client_id: campaign.client_id,
        provider_type: server.provider_type,
        status: 'success',
        recipient_email: recipient.email,
        subject: campaign.subject,
        provider_response: result.response ?? null,
      });

      sent++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[queue] FALHA recipient=${recipient.email} server=${server.provider_type}:`, errorMsg);
      const newAttempts = item.attempts + 1;
      const isFinal = newAttempts >= MAX_ATTEMPTS;
      const failedAt = new Date().toISOString();

      await db.from('send_queue').update({
        status: isFinal ? 'failed' : 'pending',
        attempts: newAttempts,
        last_error: errorMsg,
        locked_at: null,
        // Exponential backoff: 5min, 15min
        scheduled_at: isFinal
          ? failedAt
          : new Date(Date.now() + Math.pow(3, newAttempts) * 5 * 60 * 1000).toISOString(),
        processed_at: isFinal ? failedAt : null,
      }).eq('id', item.id);

      if (isFinal) {
        await Promise.all([
          db.from('campaign_recipients').update({
            status: 'failed',
            failed_at: failedAt,
            error_message: errorMsg,
          }).eq('id', recipient.id),
          db.from('campaign_events').insert({
            client_id: campaign.client_id,
            campaign_id: campaign.id,
            recipient_id: recipient.id,
            contact_id: recipient.contact_id,
            event_type: 'failed',
            metadata: { error: errorMsg },
          }),
          db.from('campaigns')
            .select('failed_count')
            .eq('id', campaign.id)
            .single()
            .then(async ({ data }) => {
              if (data) {
                await db.from('campaigns')
                  .update({ failed_count: (data as { failed_count: number }).failed_count + 1 })
                  .eq('id', campaign.id);
              }
            }),
        ]);
      }

      failed++;
    }
  }

  // Mark campaigns completed if no pending/processing queue items remain
  for (const cid of campaignIds) {
    const { count } = await db
      .from('send_queue')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', cid)
      .in('status', ['pending', 'processing']);

    if ((count ?? 1) === 0) {
      await db.from('campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', cid)
        .eq('status', 'sending');
    }
  }

  return { processed: items.length, sent, failed, skipped };
}
