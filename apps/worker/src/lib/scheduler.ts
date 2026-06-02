import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { processQueueBatch } from './queue-processor';
import { extractTrackableUrls } from './email-html';
import type { Env } from '../types';

export interface SchedulerResult {
  campaigns_scheduled_processed: number;
  queued_created: number;
  queue_processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

type CampaignRow = {
  id: string;
  client_id: string;
  sending_server_id: string;
  html: string;
  batch_size: number | null;
  batch_interval_minutes: number | null;
  campaign_lists: { list_id: string }[];
};

export async function autoPrepare(
  campaign: CampaignRow,
  db: SupabaseClient,
): Promise<{ total: number; eligible: number }> {
  const listIds = campaign.campaign_lists.map(cl => cl.list_id);
  if (!listIds.length) return { total: 0, eligible: 0 };

  const { data: lcData } = await db
    .from('list_contacts').select('contact_id').in('list_id', listIds);
  const allIds = [...new Set((lcData ?? []).map(r => (r as { contact_id: string }).contact_id))];
  if (!allIds.length) return { total: 0, eligible: 0 };

  const { data: contacts } = await db
    .from('contacts').select('id, email, first_name, last_name')
    .in('id', allIds).eq('client_id', campaign.client_id)
    .not('status', 'in', '(unsubscribed,bounced,complained,suppressed)');

  const { data: suppData } = await db
    .from('suppressions').select('email').eq('client_id', campaign.client_id);
  const suppressed = new Set((suppData ?? []).map(s => (s as { email: string }).email));

  const eligible = (contacts ?? []).filter(
    c => !suppressed.has((c as { email: string }).email),
  ) as { id: string; email: string; first_name: string | null; last_name: string | null }[];

  await db.from('campaign_recipients').delete().eq('campaign_id', campaign.id);
  await db.from('tracked_links').delete().eq('campaign_id', campaign.id);

  if (eligible.length > 0) {
    const recipients = eligible.map(c => ({
      campaign_id: campaign.id,
      contact_id: c.id,
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      status: 'pending',
      unsubscribe_token: crypto.randomUUID(),
    }));

    for (let i = 0; i < recipients.length; i += 500) {
      await db.from('campaign_recipients').insert(recipients.slice(i, i + 500));
    }
  }

  const urls = extractTrackableUrls(campaign.html);
  if (urls.length > 0) {
    await db.from('tracked_links').insert(
      urls.map(url => ({ campaign_id: campaign.id, original_url: url })),
    );
  }

  await db.from('campaigns').update({
    total_recipients: allIds.length,
    eligible_recipients: eligible.length,
  }).eq('id', campaign.id);

  return { total: allIds.length, eligible: eligible.length };
}

export async function autoQueue(
  campaign: CampaignRow,
  db: SupabaseClient,
): Promise<number> {
  const { data: recipients } = await db
    .from('campaign_recipients').select('id')
    .eq('campaign_id', campaign.id).eq('status', 'pending');

  if (!recipients?.length) return 0;

  const batchSize = campaign.batch_size ?? 250;
  const interval = campaign.batch_interval_minutes ?? 15;
  const now = Date.now();

  const items = (recipients as { id: string }[]).map((r, i) => ({
    campaign_id: campaign.id,
    campaign_recipient_id: r.id,
    sending_server_id: campaign.sending_server_id,
    status: 'pending',
    scheduled_at: new Date(now + Math.floor(i / batchSize) * interval * 60 * 1000).toISOString(),
  }));

  for (let i = 0; i < items.length; i += 500) {
    await db.from('send_queue').insert(items.slice(i, i + 500));
  }

  await db.from('campaigns').update({
    status: 'queued',
    queued_count: recipients.length,
    queued_at: new Date().toISOString(),
  }).eq('id', campaign.id);

  await db.from('campaign_events').insert({
    client_id: campaign.client_id,
    campaign_id: campaign.id,
    event_type: 'queued',
  });

  return recipients.length;
}

export async function runScheduler(env: Env): Promise<SchedulerResult> {
  const db = getSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const now = new Date().toISOString();

  const { data: due } = await db
    .from('campaigns')
    .select('*, campaign_lists(list_id)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);

  let campaignsProcessed = 0;
  let queuedCreated = 0;

  for (const raw of due ?? []) {
    const campaign = raw as unknown as CampaignRow;
    try {
      const { count } = await db
        .from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id).eq('status', 'pending');

      if ((count ?? 0) === 0) await autoPrepare(campaign, db);

      const queued = await autoQueue(campaign, db);
      queuedCreated += queued;
      campaignsProcessed++;
    } catch (err) {
      console.error(`[scheduler] campaign ${campaign.id}:`, err);
    }
  }

  const queueResult = await processQueueBatch(env);

  return {
    campaigns_scheduled_processed: campaignsProcessed,
    queued_created: queuedCreated,
    queue_processed: queueResult.processed,
    sent: queueResult.sent,
    failed: queueResult.failed,
    skipped: queueResult.skipped,
  };
}
