import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { isValidEmail } from '../lib/csv';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const contactSchema = z.object({
  client_id: z.string().uuid(),
  email: z.string().email('E-mail inválido'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'unsubscribed', 'bounced', 'complained', 'suppressed']).optional(),
});

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const clientId = c.req.query('client_id');
  const listId = c.req.query('list_id');
  const status = c.req.query('status');
  const search = c.req.query('search');
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
  const from = (page - 1) * limit;

  let query = db
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('email');

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('email', `%${search}%`);

  // Filter by list: get contact IDs first
  if (listId) {
    const { data: lcData } = await db
      .from('list_contacts')
      .select('contact_id')
      .eq('list_id', listId);

    const ids = (lcData ?? []).map(r => (r as { contact_id: string }).contact_id);
    if (ids.length === 0) return c.json({ data: [], total: 0, page, limit });
    query = query.in('id', ids);
  }

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ data: data ?? [], total: count ?? 0, page, limit });
});

router.get('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db.from('contacts').select('*').eq('id', c.req.param('id')).single();
  if (error) return c.json({ error: 'Contato não encontrado' }, 404);
  return c.json(data);
});

router.post('/', async c => {
  const body = await c.req.json();
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const email = parsed.data.email.toLowerCase().trim();

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('contacts')
    .insert({ ...parsed.data, email })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return c.json({ error: 'Contato já cadastrado para este cliente' }, 409);
    return c.json({ error: error.message }, 500);
  }

  // Optionally add to a list
  const listId = (body as Record<string, unknown>).list_id as string | undefined;
  if (listId && data) {
    await db.from('list_contacts').insert({ list_id: listId, contact_id: (data as { id: string }).id });
  }

  return c.json(data, 201);
});

router.put('/:id', async c => {
  const body = await c.req.json();
  const parsed = contactSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const patch: Record<string, unknown> = { ...parsed.data };
  if (patch.email) patch.email = (patch.email as string).toLowerCase().trim();

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('contacts')
    .update(patch)
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

router.delete('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { error } = await db.from('contacts').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// ─── List membership ──────────────────────────────────────────────────────────

router.post('/:id/add-to-list', async c => {
  const body = (await c.req.json()) as { list_id: string };
  if (!body.list_id) return c.json({ error: 'list_id obrigatório' }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { error } = await db
    .from('list_contacts')
    .upsert({ list_id: body.list_id, contact_id: c.req.param('id') }, { onConflict: 'list_id,contact_id' });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

router.post('/:id/remove-from-list', async c => {
  const body = (await c.req.json()) as { list_id: string };
  if (!body.list_id) return c.json({ error: 'list_id obrigatório' }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { error } = await db
    .from('list_contacts')
    .delete()
    .eq('list_id', body.list_id)
    .eq('contact_id', c.req.param('id'));

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// ─── Suppress ────────────────────────────────────────────────────────────────

const suppressSchema = z.object({
  reason: z.enum(['unsubscribe', 'hard_bounce', 'complaint', 'manual', 'import', 'validation_invalid', 'validation_risky']),
});

const reasonToStatus: Record<string, string> = {
  unsubscribe: 'unsubscribed',
  hard_bounce: 'bounced',
  complaint: 'complained',
  manual: 'suppressed',
  import: 'suppressed',
  validation_invalid: 'suppressed',
  validation_risky: 'suppressed',
};

router.post('/:id/suppress', async c => {
  const body = await c.req.json();
  const parsed = suppressSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: contact } = await db.from('contacts').select('*').eq('id', c.req.param('id')).single();
  if (!contact) return c.json({ error: 'Contato não encontrado' }, 404);

  const c2 = contact as { id: string; email: string; client_id: string };
  const newStatus = reasonToStatus[parsed.data.reason] ?? 'suppressed';

  if (!isValidEmail(c2.email)) return c.json({ error: 'E-mail inválido' }, 422);

  await db.from('contacts').update({ status: newStatus }).eq('id', c2.id);
  await db.from('suppressions').upsert(
    { client_id: c2.client_id, email: c2.email, reason: parsed.data.reason, source: 'manual' },
    { onConflict: 'client_id,email' },
  );
  // Remove from all active lists (non-destructive – contacts row is kept)
  await db.from('list_contacts').delete().eq('contact_id', c2.id);

  const { data: updated } = await db.from('contacts').select('*').eq('id', c2.id).single();
  return c.json(updated);
});

export { router as contactsRouter };
