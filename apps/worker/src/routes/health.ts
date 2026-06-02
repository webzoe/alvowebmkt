import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /health – público
router.get('/', c =>
  c.json({
    ok: true,
    service: 'alvowebmkt-worker',
    timestamp: new Date().toISOString(),
    environment: (c.env.APP_URL ?? '').includes('localhost') ? 'development' : 'production',
  }),
);

// GET /api/diagnostics – protegido
router.get('/diagnostics', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const [pendingCampaigns, pendingQueue, supabaseCheck, unprocessedWebhooks, recentWebhookErrors] = await Promise.all([
    db.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
    db.from('send_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('clients').select('id', { count: 'exact', head: true }).limit(1)
      .then(r => ({ ok: !r.error })),
    db.from('webhook_events').select('id', { count: 'exact', head: true }).eq('processed', false),
    db.from('webhook_events')
      .select('id, provider_type, event_type, error_message, created_at')
      .not('error_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const appUrl = c.env.APP_URL ?? '';

  return c.json({
    supabase_ok: supabaseCheck.ok,
    pending_scheduled_campaigns: pendingCampaigns.count ?? 0,
    pending_queue_items: pendingQueue.count ?? 0,
    unprocessed_webhooks: unprocessedWebhooks.count ?? 0,
    recent_webhook_errors: recentWebhookErrors.data ?? [],
    env_configured: {
      SUPABASE_URL: Boolean(c.env.SUPABASE_URL),
      SUPABASE_SERVICE_KEY: Boolean(c.env.SUPABASE_SERVICE_KEY),
      ENCRYPTION_KEY: Boolean(c.env.ENCRYPTION_KEY) && c.env.ENCRYPTION_KEY !== '0'.repeat(64),
      APP_URL: Boolean(appUrl),
      CRON_SECRET: Boolean(c.env.CRON_SECRET),
      WEBHOOK_SECRET: Boolean(c.env.WEBHOOK_SECRET),
      MAILEROO_BODY_MODE: c.env.MAILEROO_BODY_MODE ?? '(default: formdata)',
    },
    public_routes: {
      tracking_pixel: appUrl ? `${appUrl}/open/{token}.gif` : 'APP_URL não configurado',
      click_redirect: appUrl ? `${appUrl}/click/{token}/{linkId}` : 'APP_URL não configurado',
      unsubscribe: appUrl ? `${appUrl}/unsubscribe/{token}` : 'APP_URL não configurado',
      webhook_maileroo: `${c.req.url.replace('/api/diagnostics', '')}/webhooks/maileroo`,
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
