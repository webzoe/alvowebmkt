import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { encrypt } from '../lib/crypto';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const mailerooCredsSchema = z.object({
  api_key: z.string().min(1),
});

const smtpCredsSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
  encryption: z.enum(['none', 'ssl', 'tls']),
});

const serverBodySchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  provider_type: z.enum(['maileroo_api', 'smtp']),
  from_email: z.string().email(),
  from_name: z.string().min(1),
  reply_to: z.string().email().optional().or(z.literal('')),
  daily_limit: z.coerce.number().int().positive().default(1000),
  hourly_limit: z.coerce.number().int().positive().default(100),
  minute_limit: z.coerce.number().int().positive().default(10),
  status: z.enum(['active', 'inactive']).default('active'),
  credentials: z.record(z.unknown()).optional(),
});

function stripCredentials<T extends Record<string, unknown>>(server: T): Omit<T, 'credentials_encrypted'> & { has_credentials: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credentials_encrypted, ...rest } = server as Record<string, unknown>;
  return { ...rest, has_credentials: Boolean(credentials_encrypted) } as Omit<T, 'credentials_encrypted'> & { has_credentials: boolean };
}

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const clientId = c.req.query('client_id');

  let query = db
    .from('sending_servers')
    .select('*, clients(name, company_name)')
    .order('name');

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  return c.json((data ?? []).map(s => stripCredentials(s as Record<string, unknown>)));
});

router.get('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('sending_servers')
    .select('*, clients(name, company_name)')
    .eq('id', c.req.param('id'))
    .single();

  if (error) return c.json({ error: 'Servidor não encontrado' }, 404);
  return c.json(stripCredentials(data as Record<string, unknown>));
});

router.post('/', async c => {
  const body = await c.req.json() as Record<string, unknown>;
  const parsed = serverBodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const { credentials, ...serverData } = parsed.data;
  if (!credentials) return c.json({ error: 'Credenciais obrigatórias na criação' }, 422);

  let credParsed: Record<string, unknown>;
  if (serverData.provider_type === 'maileroo_api') {
    const r = mailerooCredsSchema.safeParse(credentials);
    if (!r.success) return c.json({ error: r.error.flatten() }, 422);
    credParsed = r.data;
  } else {
    const r = smtpCredsSchema.safeParse(credentials);
    if (!r.success) return c.json({ error: r.error.flatten() }, 422);
    credParsed = r.data;
  }

  const credentials_encrypted = await encrypt(JSON.stringify(credParsed), c.env.ENCRYPTION_KEY);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('sending_servers')
    .insert({ ...serverData, credentials_encrypted })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(stripCredentials(data as Record<string, unknown>), 201);
});

router.put('/:id', async c => {
  const body = await c.req.json() as Record<string, unknown>;
  const parsed = serverBodySchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const { credentials, ...serverData } = parsed.data;
  const updatePayload: Record<string, unknown> = { ...serverData };

  if (credentials && Object.keys(credentials).length > 0) {
    const providerType = serverData.provider_type;
    if (!providerType) {
      // Fetch existing to get provider_type
      const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
      const { data: existing } = await db
        .from('sending_servers')
        .select('provider_type')
        .eq('id', c.req.param('id'))
        .single();

      const pt = (existing as { provider_type: string } | null)?.provider_type;
      if (!pt) return c.json({ error: 'Servidor não encontrado' }, 404);

      const schema = pt === 'maileroo_api' ? mailerooCredsSchema : smtpCredsSchema;
      const r = schema.safeParse(credentials);
      if (!r.success) return c.json({ error: r.error.flatten() }, 422);
      updatePayload.credentials_encrypted = await encrypt(JSON.stringify(r.data), c.env.ENCRYPTION_KEY);
    } else {
      const schema = providerType === 'maileroo_api' ? mailerooCredsSchema : smtpCredsSchema;
      const r = schema.safeParse(credentials);
      if (!r.success) return c.json({ error: r.error.flatten() }, 422);
      updatePayload.credentials_encrypted = await encrypt(JSON.stringify(r.data), c.env.ENCRYPTION_KEY);
    }
  }

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('sending_servers')
    .update(updatePayload)
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(stripCredentials(data as Record<string, unknown>));
});

router.delete('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { error } = await db.from('sending_servers').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export { router as serversRouter };
