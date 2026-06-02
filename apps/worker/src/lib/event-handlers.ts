import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyDeliveryFailure } from './bounce-classifier';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function incCampaign(db: SupabaseClient, campaignId: string, field: string): Promise<void> {
  const { data } = await db.from('campaigns').select(field).eq('id', campaignId).single();
  if (data) {
    const current = ((data as unknown as Record<string, unknown>)[field] as number | null) ?? 0;
    await db.from('campaigns').update({ [field]: current + 1 }).eq('id', campaignId);
  }
}

async function incContact(db: SupabaseClient, contactId: string, field: string): Promise<void> {
  const { data } = await db.from('contacts').select(field).eq('id', contactId).single();
  if (data) {
    const current = ((data as unknown as Record<string, unknown>)[field] as number | null) ?? 0;
    await db.from('contacts').update({ [field]: current + 1 }).eq('id', contactId);
  }
}

interface RecipientRow {
  id: string;
  campaign_id: string;
  contact_id: string;
  email: string;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  open_count: number;
  click_count: number;
}

// ─── Delivered ───────────────────────────────────────────────────────────────

export async function handleDeliveredEvent(
  db: SupabaseClient,
  recipient: RecipientRow,
  source = 'provider_webhook',
): Promise<void> {
  const now = new Date().toISOString();
  const { data: r } = await db.from('campaign_recipients')
    .select('delivered_at').eq('id', recipient.id).single();
  if ((r as { delivered_at: string | null } | null)?.delivered_at) return; // already delivered

  await db.from('campaign_recipients').update({ delivered_at: now, status: 'delivered' }).eq('id', recipient.id);
  await incCampaign(db, recipient.campaign_id, 'delivered_count');
  await db.from('campaign_events').insert({
    campaign_id: recipient.campaign_id,
    recipient_id: recipient.id,
    contact_id: recipient.contact_id,
    event_type: 'delivered',
    metadata: { source },
  });
}

// ─── Opened ───────────────────────────────────────────────────────────────────

export async function handleOpenedEvent(
  db: SupabaseClient,
  recipient: RecipientRow,
  opts: { ip?: string; userAgent?: string; source?: string } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const isFirst = !recipient.opened_at;

  // Always record raw event
  await db.from('open_events').insert({
    campaign_id: recipient.campaign_id,
    campaign_recipient_id: recipient.id,
    contact_id: recipient.contact_id,
    ip: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
    opened_at: now,
  });

  // Increment open_count
  await db.from('campaign_recipients').update({
    open_count: (recipient.open_count ?? 0) + 1,
    ...(isFirst ? { opened_at: now, status: 'opened' } : {}),
  }).eq('id', recipient.id);

  if (isFirst) {
    await incCampaign(db, recipient.campaign_id, 'opened_count');
    await db.from('contacts').update({ last_opened_at: now }).eq('id', recipient.contact_id);
    await db.from('campaign_events').insert({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      contact_id: recipient.contact_id,
      event_type: 'opened',
      metadata: { source: opts.source ?? 'tracking_pixel' },
    });
  }
}

// ─── Clicked ──────────────────────────────────────────────────────────────────

export async function handleClickedEvent(
  db: SupabaseClient,
  recipient: RecipientRow,
  trackedLink: { id: string; original_url: string },
  opts: { ip?: string; userAgent?: string; source?: string } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const isFirst = !recipient.clicked_at;

  await db.from('click_events').insert({
    campaign_id: recipient.campaign_id,
    campaign_recipient_id: recipient.id,
    contact_id: recipient.contact_id,
    tracked_link_id: trackedLink.id,
    original_url: trackedLink.original_url,
    ip: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
    clicked_at: now,
  });

  await db.from('campaign_recipients').update({
    click_count: (recipient.click_count ?? 0) + 1,
    ...(isFirst ? { clicked_at: now, status: 'clicked' } : {}),
  }).eq('id', recipient.id);

  if (isFirst) {
    await incCampaign(db, recipient.campaign_id, 'clicked_count');
    await db.from('contacts').update({ last_clicked_at: now }).eq('id', recipient.contact_id);
    await db.from('campaign_events').insert({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      contact_id: recipient.contact_id,
      event_type: 'clicked',
      metadata: { source: opts.source ?? 'click_redirect', url: trackedLink.original_url },
    });
  }
}

// ─── Bounce ───────────────────────────────────────────────────────────────────

export async function handleBounceEvent(
  db: SupabaseClient,
  recipient: RecipientRow & { client_id?: string },
  reason: string,
  source = 'provider_webhook',
): Promise<void> {
  const classification = classifyDeliveryFailure(reason);
  const now = new Date().toISOString();
  const isFirst = !recipient.bounced_at;

  if (classification.type === 'soft_bounce') {
    await db.from('campaign_recipients').update({
      status: 'soft_bounced',
      bounced_at: now,
      bounce_type: 'soft_bounce',
      rejection_reason: reason,
    }).eq('id', recipient.id);

    await incContact(db, recipient.contact_id, 'soft_bounce_count');
    await db.from('contacts').update({ last_bounce_at: now }).eq('id', recipient.contact_id);

    // Check if soft_bounce_count >= 3 → auto-suppress
    const { data: contact } = await db.from('contacts')
      .select('soft_bounce_count').eq('id', recipient.contact_id).single();
    const sbCount = ((contact as unknown as { soft_bounce_count: number } | null)?.soft_bounce_count ?? 0);
    if (sbCount >= 3) {
      await db.from('contacts').update({ status: 'bounced' }).eq('id', recipient.contact_id);
      if (recipient.client_id) {
        await db.from('suppressions').upsert(
          { client_id: recipient.client_id, email: recipient.email, reason: 'hard_bounce', source: 'auto_soft_bounce_limit' },
          { onConflict: 'client_id,email' },
        );
      }
    }

    if (isFirst) {
      await incCampaign(db, recipient.campaign_id, 'soft_bounced_count');
      await db.from('campaign_events').insert({
        campaign_id: recipient.campaign_id, recipient_id: recipient.id,
        contact_id: recipient.contact_id, event_type: 'soft_bounced',
        metadata: { source, reason },
      });
    }

  } else if (classification.type === 'hard_bounce') {
    await db.from('campaign_recipients').update({
      status: 'bounced', bounced_at: now, bounce_type: 'hard_bounce', rejection_reason: reason,
    }).eq('id', recipient.id);

    await incContact(db, recipient.contact_id, 'bounce_count');
    await db.from('contacts').update({ status: 'bounced', last_bounce_at: now }).eq('id', recipient.contact_id);

    if (recipient.client_id) {
      await db.from('suppressions').upsert(
        { client_id: recipient.client_id, email: recipient.email, reason: 'hard_bounce', source: 'provider_webhook' },
        { onConflict: 'client_id,email' },
      );
    }

    if (isFirst) {
      await incCampaign(db, recipient.campaign_id, 'bounced_count');
      await db.from('campaign_events').insert({
        campaign_id: recipient.campaign_id, recipient_id: recipient.id,
        contact_id: recipient.contact_id, event_type: 'bounced',
        metadata: { source, reason, type: 'hard_bounce' },
      });
    }

  } else if (classification.type === 'blocked_policy') {
    await db.from('campaign_recipients').update({
      status: 'blocked_policy', bounced_at: now, rejection_reason: reason,
    }).eq('id', recipient.id);

    if (isFirst) {
      await incCampaign(db, recipient.campaign_id, 'blocked_policy_count');
      await db.from('campaign_events').insert({
        campaign_id: recipient.campaign_id, recipient_id: recipient.id,
        contact_id: recipient.contact_id, event_type: 'blocked_policy',
        metadata: { source, reason },
      });
    }

  } else {
    // Generic rejected
    await db.from('campaign_recipients').update({
      status: 'rejected', rejection_reason: reason,
    }).eq('id', recipient.id);

    if (isFirst) {
      await incCampaign(db, recipient.campaign_id, 'rejected_count');
      await db.from('campaign_events').insert({
        campaign_id: recipient.campaign_id, recipient_id: recipient.id,
        contact_id: recipient.contact_id, event_type: 'rejected',
        metadata: { source, reason },
      });
    }
  }
}

// ─── Complaint ────────────────────────────────────────────────────────────────

export async function handleComplaintEvent(
  db: SupabaseClient,
  recipient: RecipientRow & { client_id?: string },
  source = 'provider_webhook',
): Promise<void> {
  const now = new Date().toISOString();
  const { data: r } = await db.from('campaign_recipients')
    .select('complained_at').eq('id', recipient.id).single();
  if ((r as { complained_at: string | null } | null)?.complained_at) return;

  await db.from('campaign_recipients').update({ status: 'complained', complained_at: now }).eq('id', recipient.id);
  await db.from('contacts').update({ status: 'complained' }).eq('id', recipient.contact_id);

  if (recipient.client_id) {
    await db.from('suppressions').upsert(
      { client_id: recipient.client_id, email: recipient.email, reason: 'complaint', source: 'provider_webhook' },
      { onConflict: 'client_id,email' },
    );
  }

  await incCampaign(db, recipient.campaign_id, 'complained_count');
  await db.from('campaign_events').insert({
    campaign_id: recipient.campaign_id, recipient_id: recipient.id,
    contact_id: recipient.contact_id, event_type: 'complained',
    metadata: { source },
  });
}

// ─── Unsubscribe ──────────────────────────────────────────────────────────────

export async function handleUnsubscribeEvent(
  db: SupabaseClient,
  recipient: RecipientRow & { client_id: string; unsubscribe_token?: string },
  opts: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const { data: r } = await db.from('campaign_recipients')
    .select('unsubscribed_at').eq('id', recipient.id).single();
  if ((r as { unsubscribed_at: string | null } | null)?.unsubscribed_at) return;

  await db.from('campaign_recipients').update({ status: 'unsubscribed', unsubscribed_at: now }).eq('id', recipient.id);
  await db.from('contacts').update({ status: 'unsubscribed' }).eq('id', recipient.contact_id);

  await db.from('suppressions').upsert(
    { client_id: recipient.client_id, email: recipient.email, reason: 'unsubscribe', source: 'campaign_unsubscribe' },
    { onConflict: 'client_id,email' },
  );

  await db.from('unsubscribe_events').insert({
    campaign_id: recipient.campaign_id,
    campaign_recipient_id: recipient.id,
    contact_id: recipient.contact_id,
    client_id: recipient.client_id,
    email: recipient.email,
    reason: 'unsubscribe',
    ip: opts.ip ?? null,
    user_agent: opts.userAgent ?? null,
  });

  await incCampaign(db, recipient.campaign_id, 'unsubscribed_count');
  await db.from('campaign_events').insert({
    campaign_id: recipient.campaign_id, recipient_id: recipient.id,
    contact_id: recipient.contact_id, event_type: 'unsubscribed',
    metadata: { source: 'self_unsubscribe' },
  });
}
