import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import { decrypt } from '../lib/crypto';
import { MailerooProvider, type MailerooBodyMode } from '../providers/maileroo';
import type { Env, RawCredentials, MailerooCredentials, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /api/debug/maileroo-send
 * Testa o envio Maileroo com um body_mode específico.
 *
 * Body: {
 *   sending_server_id: string,
 *   to_email: string,
 *   subject?: string,
 *   html?: string,
 *   plain_text?: string,
 *   body_mode?: 'json' | 'formdata' | 'urlencoded'
 * }
 */
router.post('/maileroo-send', async c => {
  const body = (await c.req.json()) as {
    sending_server_id: string;
    to_email: string;
    subject?: string;
    html?: string;
    plain_text?: string;
    body_mode?: MailerooBodyMode;
  };

  if (!body.sending_server_id) return c.json({ error: 'sending_server_id obrigatório' }, 422);
  if (!body.to_email)          return c.json({ error: 'to_email obrigatório' }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: server } = await db
    .from('sending_servers')
    .select('credentials_encrypted, provider_type, from_email, from_name, reply_to')
    .eq('id', body.sending_server_id)
    .single();

  if (!server) return c.json({ error: 'Servidor não encontrado' }, 404);

  const s = server as {
    credentials_encrypted: string;
    provider_type: string;
    from_email: string;
    from_name: string;
    reply_to: string | null;
  };

  if (s.provider_type !== 'maileroo_api') {
    return c.json({ error: 'Este endpoint só suporta maileroo_api' }, 400);
  }

  const rawCreds = JSON.parse(
    await decrypt(s.credentials_encrypted, c.env.ENCRYPTION_KEY),
  ) as RawCredentials;
  const { api_key } = rawCreds as MailerooCredentials;

  const mode: MailerooBodyMode = body.body_mode ?? 'formdata';
  const provider = new MailerooProvider(api_key, mode);

  try {
    const result = await provider.sendEmail({
      from_email: s.from_email,
      from_name: s.from_name,
      reply_to: s.reply_to ?? undefined,
      to_email: body.to_email,
      subject: body.subject ?? 'Teste debug AlvoWebMkt',
      plain_text: body.plain_text ?? 'Teste de envio direto.',
      html: body.html ?? '<p>Teste de envio direto.</p>',
    });
    return c.json({ success: true, body_mode: mode, response: result.response });
  } catch (err) {
    return c.json({ success: false, body_mode: mode, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export { router as debugRouter };
