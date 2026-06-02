import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import {
  handleDeliveredEvent, handleOpenedEvent,
  handleBounceEvent, handleComplaintEvent,
} from '../lib/event-handlers';
import type { Env } from '../types';

const router = new Hono<{ Bindings: Env }>();

// ─── Maileroo webhook normalizer ─────────────────────────────────────────────

interface NormalizedEvent {
  eventType: string;
  messageId: string;
  referenceId: string;
  recipientEmail: string;
  reason: string;
}

function mapEventType(raw: string): string {
  const t = raw.toLowerCase();
  if (['delivered','delivery'].includes(t)) return 'delivered';
  if (['open','opened','click_open'].includes(t)) return 'opened';
  if (['click','clicked','link_click'].includes(t)) return 'clicked';
  if (['bounce','bounced','hard_bounce','soft_bounce','bounce_permanent','bounce_temporary'].includes(t)) return 'bounced';
  if (['complaint','spam','spam_complaint','complained'].includes(t)) return 'complained';
  if (['failed','rejected','error'].includes(t)) return 'failed';
  if (['unsubscribe','unsubscribed'].includes(t)) return 'unsubscribed';
  return raw;
}

function normalizeMailerooWebhook(raw: unknown): NormalizedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  const eventType = mapEventType(
    (p.status ?? p.event ?? p.type ?? p.event_type ?? '') as string,
  );
  if (!eventType) return null;

  const messageId = (p.id ?? p.message_id ?? p.messageId ?? p.msg_id ?? '') as string;
  const referenceId = (p.reference_id ?? p.referenceId ?? p.ref_id ?? '') as string;
  const recipientEmail = (p.to ?? p.recipient ?? p.email ?? p.address ?? '') as string;
  const reason = (p.reason ?? p.bounce_reason ?? p.error ?? p.description ?? '') as string;

  return { eventType, messageId, referenceId, recipientEmail, reason };
}

// ─── Recipient resolver ───────────────────────────────────────────────────────

async function findRecipient(
  db: ReturnType<typeof getSupabase>,
  event: NormalizedEvent,
) {
  type RecipientRow = {
    id: string; campaign_id: string; contact_id: string; email: string;
    opened_at: string | null; clicked_at: string | null; bounced_at: string | null;
    open_count: number; click_count: number;
    campaigns: { client_id: string } | null;
  };

  // 1. By reference_id
  if (event.referenceId) {
    const { data } = await db
      .from('campaign_recipients')
      .select('id, campaign_id, contact_id, email, opened_at, clicked_at, bounced_at, open_count, click_count, campaigns(client_id)')
      .eq('provider_reference_id', event.referenceId)
      .single();
    if (data) return data as unknown as RecipientRow;
  }

  // 2. By message_id
  if (event.messageId) {
    const { data } = await db
      .from('campaign_recipients')
      .select('id, campaign_id, contact_id, email, opened_at, clicked_at, bounced_at, open_count, click_count, campaigns(client_id)')
      .eq('provider_message_id', event.messageId)
      .single();
    if (data) return data as unknown as RecipientRow;
  }

  return null;
}

// ─── POST /webhooks/:provider ─────────────────────────────────────────────────

router.post('/:provider', async c => {
  const provider = c.req.param('provider');

  // Optional secret check
  const secret = c.env.WEBHOOK_SECRET;
  if (secret) {
    const incomingSecret =
      c.req.header('X-Webhook-Secret') ??
      c.req.query('secret') ??
      '';
    if (incomingSecret !== secret) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const payloads: unknown[] = Array.isArray(body) ? body : [body];
  let processed = 0;

  for (const rawPayload of payloads) {
    // Always save raw webhook event
    const { data: webhookEvent } = await db
      .from('webhook_events')
      .insert({
        provider_type: provider,
        payload: rawPayload as Record<string, unknown>,
      })
      .select('id')
      .single();

    const webhookId = (webhookEvent as { id: string } | null)?.id;

    try {
      const event = normalizeMailerooWebhook(rawPayload);
      if (!event) continue;

      // Update webhook_events with parsed fields
      if (webhookId) {
        await db.from('webhook_events').update({
          event_type: event.eventType,
          provider_message_id: event.messageId || null,
          provider_reference_id: event.referenceId || null,
        }).eq('id', webhookId);
      }

      const recipient = await findRecipient(db, event);
      if (!recipient) {
        if (webhookId) {
          await db.from('webhook_events').update({
            processed: true,
            processed_at: new Date().toISOString(),
            error_message: 'recipient not found',
          }).eq('id', webhookId);
        }
        continue;
      }

      const recipientWithClient = {
        ...recipient,
        client_id: (recipient.campaigns as { client_id: string } | null)?.client_id ?? '',
      };

      switch (event.eventType) {
        case 'delivered':
          await handleDeliveredEvent(db, recipient, 'provider_webhook');
          break;
        case 'opened':
          await handleOpenedEvent(db, recipient, { source: 'provider_webhook' });
          break;
        case 'clicked':
          // No tracked_link available from webhook — just update status
          await handleOpenedEvent(db, recipient, { source: 'provider_webhook' });
          break;
        case 'bounced':
        case 'failed':
          await handleBounceEvent(db, recipientWithClient, event.reason || event.eventType, 'provider_webhook');
          break;
        case 'complained':
          await handleComplaintEvent(db, recipientWithClient, 'provider_webhook');
          break;
      }

      if (webhookId) {
        await db.from('webhook_events').update({
          campaign_id: recipient.campaign_id,
          campaign_recipient_id: recipient.id,
          processed: true,
          processed_at: new Date().toISOString(),
        }).eq('id', webhookId);
      }

      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[webhook]', msg);
      if (webhookId) {
        await db.from('webhook_events').update({
          error_message: msg,
          processed: false,
        }).eq('id', webhookId);
      }
    }
  }

  return c.json({ received: payloads.length, processed });
});

export { router as webhooksRouter };
