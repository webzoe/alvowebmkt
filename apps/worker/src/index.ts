import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import { clientsRouter } from './routes/clients';
import { serversRouter } from './routes/servers';
import { sendRouter } from './routes/send';
import { dashboardRouter } from './routes/dashboard';
import { listsRouter } from './routes/lists';
import { contactsRouter } from './routes/contacts';
import { suppressionsRouter } from './routes/suppressions';
import { importsRouter } from './routes/imports';
import { campaignsRouter } from './routes/campaigns';
import { queueRouter } from './routes/queue';
import { schedulerRouter } from './routes/scheduler';
import { healthRouter } from './routes/health';
import { trackingRouter } from './routes/tracking';
import { webhooksRouter } from './routes/webhooks';
import { processQueueBatch } from './lib/queue-processor';
import { runScheduler } from './lib/scheduler';
import { getSupabase } from './lib/supabase';
import { decrypt } from './lib/crypto';
import { MailerooProvider, type MailerooBodyMode } from './providers/maileroo';
import type { Env, MailerooCredentials, RawCredentials, Variables } from './types';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type', 'X-Cron-Secret'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
);

// ─── Public routes (no auth) ─────────────────────────────────────────────────
app.get('/health', c => healthRouter.fetch(new Request(c.req.url.replace('/health', '/'), { method: 'GET', headers: c.req.raw.headers }), c.env, c.executionCtx));

// Tracking (no auth — pixel, click redirect, unsubscribe)
app.route('/open', trackingRouter);
app.route('/click', trackingRouter);
app.route('/unsubscribe', trackingRouter);

// Webhooks (protected by WEBHOOK_SECRET, not by JWT)
app.route('/webhooks', webhooksRouter);

// ─── Authenticated API routes ────────────────────────────────────────────────
app.use('/api/*', authMiddleware);

app.route('/api/clients', clientsRouter);
app.route('/api/servers', serversRouter);
app.route('/api/send', sendRouter);
app.route('/api/dashboard', dashboardRouter);
app.route('/api/lists', listsRouter);
app.route('/api/contacts', contactsRouter);
app.route('/api/suppressions', suppressionsRouter);
app.route('/api/imports', importsRouter);
app.route('/api/campaigns', campaignsRouter);
app.route('/api/queue', queueRouter);
app.route('/api/scheduler', schedulerRouter);
app.get('/api/diagnostics', async c => {
  const req = new Request(c.req.url.replace('/api/diagnostics', '/diagnostics'), { method: 'GET', headers: c.req.raw.headers });
  return healthRouter.fetch(req, c.env, c.executionCtx);
});

app.get('/', c => c.text('AlvoWebMkt Worker OK'));

// ─── Internal endpoints (CRON_SECRET, sem JWT) ───────────────────────────────

function cronGuard(secret: string | undefined, expected: string): boolean {
  return !secret || secret !== expected;
}

app.post('/internal/queue/process', async c => {
  if (cronGuard(c.req.header('X-Cron-Secret'), c.env.CRON_SECRET)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  try {
    return c.json(await processQueueBatch(c.env));
  } catch (err) {
    console.error('[queue:process]', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/internal/scheduler/run', async c => {
  if (cronGuard(c.req.header('X-Cron-Secret'), c.env.CRON_SECRET)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  try {
    return c.json(await runScheduler(c.env));
  } catch (err) {
    console.error('[scheduler:run]', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/internal/debug/maileroo-send', async c => {
  if (cronGuard(c.req.header('X-Cron-Secret'), c.env.CRON_SECRET)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = (await c.req.json()) as {
    sending_server_id?: string;
    to_email?: string;
    subject?: string;
    html?: string;
    plain_text?: string;
    body_mode?: MailerooBodyMode;
  };

  if (!body.sending_server_id) return c.json({ error: 'sending_server_id obrigatório' }, 422);
  if (!body.to_email) return c.json({ error: 'to_email obrigatório' }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: server } = await db
    .from('sending_servers')
    .select('credentials_encrypted, provider_type, from_email, from_name, reply_to')
    .eq('id', body.sending_server_id)
    .single();

  if (!server) return c.json({ error: 'Servidor não encontrado' }, 404);

  const s = server as {
    credentials_encrypted: string; provider_type: string;
    from_email: string; from_name: string; reply_to: string | null;
  };

  if (s.provider_type !== 'maileroo_api') {
    return c.json({ error: 'Este endpoint só suporta maileroo_api' }, 400);
  }

  try {
    const rawCreds = JSON.parse(await decrypt(s.credentials_encrypted, c.env.ENCRYPTION_KEY)) as RawCredentials;
    const { api_key } = rawCreds as MailerooCredentials;
    const mode: MailerooBodyMode = body.body_mode ?? 'formdata';
    const provider = new MailerooProvider(api_key, mode);

    const result = await provider.sendEmail({
      from_email: s.from_email, from_name: s.from_name,
      reply_to: s.reply_to ?? undefined, to_email: body.to_email,
      subject: body.subject ?? 'Teste debug AlvoWebMkt',
      plain_text: body.plain_text ?? 'Teste.',
      html: body.html ?? '<p>Teste.</p>',
    });
    return c.json({ success: true, body_mode: mode, response: result.response });
  } catch (err) {
    console.error('[debug:maileroo-send]', err);
    return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ─── Scheduled event (Cloudflare Cron Trigger) ───────────────────────────────
export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduler(env));
  },
};
