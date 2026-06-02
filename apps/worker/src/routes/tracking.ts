import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import { handleOpenedEvent, handleClickedEvent, handleUnsubscribeEvent } from '../lib/event-handlers';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

// 1×1 transparent GIF bytes
const PIXEL = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xFF,0xFF,0xFF,0x00,0x00,0x00,0x21,0xF9,0x04,0x00,0x00,0x00,0x00,
  0x00,0x2C,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3B,
]);

// ─── Tracking pixel ──────────────────────────────────────────────────────────
// GET /open/:token  (client appends .gif → token includes it)
app.get('/open/:token', async c => {
  const rawToken = c.req.param('token');
  const token = rawToken.replace(/\.gif$/i, '');

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: recipient } = await db
    .from('campaign_recipients')
    .select('id, campaign_id, contact_id, opened_at, open_count, email, bounced_at, clicked_at, client_id:campaigns(client_id)')
    .eq('unsubscribe_token', token)
    .single();

  if (recipient) {
    void handleOpenedEvent(db, recipient as unknown as Parameters<typeof handleOpenedEvent>[1], {
      ip: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
      source: 'tracking_pixel',
    });
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
});

// ─── Click redirect ───────────────────────────────────────────────────────────
// GET /click/:token/:linkId
app.get('/click/:token/:linkId', async c => {
  const { token, linkId } = c.req.param();
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const [recipientRes, linkRes] = await Promise.all([
    db.from('campaign_recipients')
      .select('id, campaign_id, contact_id, clicked_at, click_count, email, bounced_at, opened_at, client_id:campaigns(client_id)')
      .eq('unsubscribe_token', token)
      .single(),
    db.from('tracked_links').select('id, original_url, campaign_id').eq('id', linkId).single(),
  ]);

  if (!linkRes.data) {
    return new Response('Link not found', { status: 404 });
  }

  const originalUrl = (linkRes.data as { original_url: string }).original_url;

  if (recipientRes.data) {
    void handleClickedEvent(db, recipientRes.data as unknown as Parameters<typeof handleClickedEvent>[1], {
      id: linkId,
      original_url: originalUrl,
    }, {
      ip: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
      source: 'click_redirect',
    });
  }

  return Response.redirect(originalUrl, 302);
});

// ─── Unsubscribe page ─────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const masked = local.length > 2
    ? local[0] + '*'.repeat(Math.min(local.length - 2, 6)) + local[local.length - 1]
    : '***';
  return `${masked}@${domain}`;
}

function unsubscribePage(token: string, email: string, campaignName: string, confirmed = false): string {
  const title = confirmed ? 'Descadastro confirmado' : 'Cancelar inscrição';
  const body = confirmed
    ? `<div class="card success">
        <h1>✓ Descadastro confirmado</h1>
        <p>O endereço <strong>${maskEmail(email)}</strong> foi removido da lista.</p>
        <p class="note">Você não receberá mais mensagens desta campanha.</p>
       </div>`
    : `<div class="card">
        <h1>Cancelar inscrição</h1>
        <p>Você está prestes a cancelar a inscrição de:</p>
        <p class="email">${maskEmail(email)}</p>
        ${campaignName ? `<p class="campaign">Campanha: <strong>${campaignName}</strong></p>` : ''}
        <form method="POST" action="/unsubscribe/${token}">
          <button type="submit">Confirmar descadastro</button>
        </form>
        <p class="note">Se não solicitou o descadastro, simplesmente ignore esta página.</p>
       </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Inter, -apple-system, sans-serif; background: #faf9f5; color: #3d3d3a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border: 1px solid #e6dfd8; border-radius: 16px; padding: 40px; max-width: 440px; width: 100%; text-align: center; }
    .card.success { background: #f0fdf4; border-color: #5db872; }
    h1 { font-size: 22px; font-weight: 600; color: #141413; margin-bottom: 16px; }
    p { font-size: 15px; color: #6c6a64; margin-bottom: 12px; line-height: 1.5; }
    .email { font-size: 17px; font-weight: 600; color: #141413; }
    .campaign { font-size: 13px; }
    .note { font-size: 13px; margin-top: 16px; }
    button { background: #cc785c; color: #fff; border: none; border-radius: 8px; padding: 12px 32px; font-size: 15px; font-weight: 500; cursor: pointer; width: 100%; margin-top: 16px; }
    button:hover { background: #a9583e; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

app.get('/unsubscribe/:token', async c => {
  const token = c.req.param('token');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: recipient } = await db
    .from('campaign_recipients')
    .select('email, campaigns(name)')
    .eq('unsubscribe_token', token)
    .single();

  const email = (recipient as { email: string } | null)?.email ?? '';
  const campaignName = (recipient as { campaigns?: { name: string } | null } | null)?.campaigns?.name ?? '';

  return c.html(unsubscribePage(token, email, campaignName));
});

app.post('/unsubscribe/:token', async c => {
  const token = c.req.param('token');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: recipient } = await db
    .from('campaign_recipients')
    .select('id, campaign_id, contact_id, email, opened_at, clicked_at, bounced_at, open_count, click_count, campaigns(client_id)')
    .eq('unsubscribe_token', token)
    .single();

  if (!recipient) {
    return c.html('<p>Token inválido ou expirado.</p>', 404);
  }

  const r = recipient as unknown as {
    id: string; campaign_id: string; contact_id: string; email: string;
    opened_at: string | null; clicked_at: string | null; bounced_at: string | null;
    open_count: number; click_count: number;
    campaigns: { client_id: string } | null;
  };

  await handleUnsubscribeEvent(db, {
    ...r,
    client_id: r.campaigns?.client_id ?? '',
  }, {
    ip: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
    userAgent: c.req.header('User-Agent') ?? undefined,
  });

  return c.html(unsubscribePage(token, r.email, '', true));
});

export { app as trackingRouter };
