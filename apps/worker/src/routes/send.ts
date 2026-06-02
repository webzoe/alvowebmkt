import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { decrypt } from '../lib/crypto';
import { createProvider } from '../providers/factory';
import type { Env, RawCredentials, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const sendTestSchema = z.object({
  to: z.string().email('E-mail de destino inválido'),
  subject: z.string().min(1, 'Assunto obrigatório'),
  body: z.string().min(1, 'Mensagem obrigatória'),
});

router.post('/:serverId', async c => {
  const body = await c.req.json();
  const parsed = sendTestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: server, error: serverErr } = await db
    .from('sending_servers')
    .select('*')
    .eq('id', c.req.param('serverId'))
    .single();

  if (serverErr || !server) return c.json({ error: 'Servidor não encontrado' }, 404);

  if (server.status !== 'active') {
    return c.json({ error: 'Servidor inativo' }, 400);
  }

  let providerResponse: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;
  let status: 'success' | 'error' = 'success';

  try {
    const rawCreds = JSON.parse(
      await decrypt(server.credentials_encrypted as string, c.env.ENCRYPTION_KEY),
    ) as RawCredentials;

    const provider = createProvider(server.provider_type as string, rawCreds, { mailerooBodyMode: c.env.MAILEROO_BODY_MODE });

    const result = await provider.sendEmail({
      from_email: server.from_email as string,
      from_name: server.from_name as string,
      reply_to: (server.reply_to as string | null) ?? undefined,
      to_email: parsed.data.to,
      subject: parsed.data.subject,
      plain_text: parsed.data.body,
    });

    providerResponse = result.response ?? null;
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await db.from('send_logs').insert({
    sending_server_id: server.id,
    client_id: server.client_id,
    provider_type: server.provider_type,
    status,
    recipient_email: parsed.data.to,
    subject: parsed.data.subject,
    provider_response: providerResponse,
    error_message: errorMessage,
  });

  if (status === 'error') {
    return c.json({ error: errorMessage }, 500);
  }

  return c.json({ success: true, response: providerResponse });
});

export { router as sendRouter };
